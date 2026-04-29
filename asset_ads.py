#!/usr/bin/env python3
"""Asset Ads — multi-brand sequential ad generator.

Usage:
  python3 asset_ads.py --brand <slug> <ref_image_path>
  python3 asset_ads.py --brand <slug> --pool

Brand configs live at brands/<slug>.json. Default brand is `island-splash`.

Pipeline (per ref):
  1. Pick product(s) from per-brand tally (count matches ref product count)
  2. Reverse-engineer analysis (subject, composition, decorative elements)
  3. Vibe shift analysis (cinematic aesthetic — camera, lighting, color grade)
  4. Composer (gemini-2.5-pro) builds final image-gen prompt from brand config
  5. Pre-gen forbidden-text scan (errors abort, warnings flag)
  6. gemini-3-pro-image-preview generates the image
  7. Save sidecar (ref + analyses + final prompt) + update tally
  8. Print output image path on last line (for the Hermes thin-trigger skill)
"""

import argparse
import base64
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

from PIL import Image

ENV_PATH = Path(__file__).resolve().parent / ".env"
with ENV_PATH.open() as f:
    for line in f:
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k, v)

from google.genai import Client
from google.genai.types import Blob, ImageConfig, Part

REPO_ROOT = Path(__file__).resolve().parent
BRANDS_DIR = REPO_ROOT / "brands"
OUTPUT_DIR = REPO_ROOT / "output"

POOL_PROCESSED_DIRNAME = "used"
POOL_EXTS = (".jpg", ".jpeg", ".png", ".webp")
POOL_PACING_SECONDS = 20

TEXT_MODEL = "gemini-2.5-pro"
VISION_MODEL = "gemini-2.5-pro"
IMAGE_MODEL = "gemini-3-pro-image-preview"

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OR_TEXT_MODEL = "google/gemini-2.5-pro"
OR_IMAGE_MODEL = "google/gemini-3.1-flash-image-preview"

DEFAULT_BRAND = "island-splash"


# ── Brand config loading ─────────────────────────────────────────────────────

def load_brand(slug: str) -> dict:
    path = BRANDS_DIR / f"{slug}.json"
    if not path.exists():
        raise RuntimeError(f"brand config not found: {path}")
    cfg = json.loads(path.read_text())
    cfg.setdefault("paths", {})
    cfg.setdefault("identity", {})
    cfg.setdefault("global_forbidden_text", [])
    cfg.setdefault("ad_creative_rules", [])
    cfg.setdefault("products", [])
    return cfg


def log(brand: dict, msg: str) -> None:
    print(f"[{brand['slug']}] {msg}", file=sys.stderr)


# ── Gemini client + retry/fallback ───────────────────────────────────────────

def _client() -> Client:
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("GEMINI_API_KEY not loaded from profile .env")
    return Client(api_key=key)


RETRY_BACKOFFS = [5, 15, 45, 90]
TRANSIENT_MARKERS = ("503", "429", "UNAVAILABLE", "RESOURCE_EXHAUSTED", "DEADLINE_EXCEEDED", "high demand", "quota")


def _is_transient(err: Exception) -> bool:
    msg = str(err)
    return any(m.lower() in msg.lower() for m in TRANSIENT_MARKERS)


def _with_retry(fn, label: str):
    last_err: Exception | None = None
    for i, delay in enumerate([0] + RETRY_BACKOFFS):
        if delay:
            print(f"[asset-ads] {label} retry {i}/{len(RETRY_BACKOFFS)} after {delay}s…", file=sys.stderr)
            time.sleep(delay)
        try:
            return fn()
        except Exception as e:
            last_err = e
            if not _is_transient(e):
                raise
            print(f"[asset-ads] {label} transient: {e}", file=sys.stderr)
    raise RuntimeError(f"{label} failed after {len(RETRY_BACKOFFS)} retries: {last_err}")


def _with_fallback(label: str, primary, fallback):
    try:
        return _with_retry(primary, f"{label}/gemini")
    except Exception as e:
        print(f"[asset-ads] {label} gemini failed ({e}) — falling back to OpenRouter", file=sys.stderr)
        try:
            return _with_retry(fallback, f"{label}/openrouter")
        except Exception as e2:
            raise RuntimeError(f"{label} BOTH providers failed. gemini: {e}; openrouter: {e2}")


# ── OpenRouter helpers ───────────────────────────────────────────────────────

def _or_key() -> str:
    k = os.environ.get("OPENROUTER_API_KEY")
    if not k:
        raise RuntimeError("OPENROUTER_API_KEY not loaded from profile .env")
    return k


def _or_datauri(path: str) -> str:
    with open(path, "rb") as f:
        data = f.read()
    mime = "image/png" if path.lower().endswith(".png") else "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(data).decode()}"


def _or_post(payload: dict, timeout: int = 300) -> dict:
    req = urllib.request.Request(
        OPENROUTER_URL,
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {_or_key()}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:4003",
            "X-Title": "asset-ads",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        raise RuntimeError(f"HTTP {e.code}: {body}")


def _or_text_call(model: str, system: str | None, user_parts: list) -> str:
    content = []
    for p in user_parts:
        if isinstance(p, str):
            content.append({"type": "text", "text": p})
        elif isinstance(p, dict) and "path" in p:
            content.append({"type": "image_url", "image_url": {"url": _or_datauri(p["path"])}})
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": content})
    data = _or_post({"model": model, "messages": messages}, timeout=300)
    return data["choices"][0]["message"]["content"].strip()


def _or_image_call(model: str, prompt: str, image_paths: list[str]) -> bytes:
    content = []
    for p in image_paths:
        content.append({"type": "image_url", "image_url": {"url": _or_datauri(p)}})
    content.append({"type": "text", "text": prompt})
    data = _or_post(
        {
            "model": model,
            "messages": [{"role": "user", "content": content}],
            "modalities": ["image", "text"],
        },
        timeout=600,
    )
    msg = data["choices"][0]["message"]
    for img in (msg.get("images") or []):
        url = (img.get("image_url") or {}).get("url") or img.get("url") or ""
        if url.startswith("data:"):
            return base64.b64decode(url.split(",", 1)[1])
    if isinstance(msg.get("content"), list):
        for part in msg["content"]:
            if part.get("type") == "image_url":
                url = (part.get("image_url") or {}).get("url", "")
                if url.startswith("data:"):
                    return base64.b64decode(url.split(",", 1)[1])
    raise RuntimeError(f"OpenRouter returned no image: keys={list(msg.keys())}")


def _image_part(path: str) -> Part:
    img = Image.open(path)
    buf = io.BytesIO()
    fmt = "PNG" if str(path).lower().endswith(".png") else "JPEG"
    img.save(buf, format=fmt)
    mime = "image/png" if fmt == "PNG" else "image/jpeg"
    return Part(inline_data=Blob(data=buf.getvalue(), mime_type=mime))


# ── Tally + product picking ──────────────────────────────────────────────────

def load_tally(brand: dict) -> dict:
    path = Path(brand["paths"]["tally_path"])
    if path.exists():
        return json.loads(path.read_text())
    return {p["name"]: 0 for p in brand["products"]}


def save_tally(brand: dict, tally: dict) -> None:
    path = Path(brand["paths"]["tally_path"])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(tally, indent=2))


def pick_products(brand: dict, count: int, produce_hints: list[str], tally: dict) -> list[dict]:
    """Pick `count` products from brand — pure least-used rotation.
    Produce hints used only as tiebreaker when usage counts are equal."""
    hints_lower = " ".join(produce_hints).lower()

    def keyword_score(prod: dict) -> int:
        return -sum(1 for kw in prod.get("keywords", []) if kw in hints_lower)

    ordered = sorted(
        brand["products"],
        key=lambda p: (tally.get(p["name"], 0), keyword_score(p), p["name"]),
    )
    return ordered[:count]


def find_product(brand: dict, name_or_trigger: str) -> dict | None:
    """Resolve a product by exact name (case-insensitive) or by trigger keyword."""
    needle = name_or_trigger.strip().lower()
    for p in brand["products"]:
        if p["name"].lower() == needle:
            return p
    for p in brand["products"]:
        if needle in [t.lower() for t in p.get("triggers", [])]:
            return p
    return None


def lock_products(brand: dict, count: int, locked_name: str) -> list[dict]:
    """Resolve `locked_name` to a product, then return it cloned `count` times."""
    p = find_product(brand, locked_name)
    if not p:
        avail = ", ".join(prod["name"] for prod in brand["products"])
        raise RuntimeError(f"product '{locked_name}' not found in brand '{brand['slug']}'. Available: {avail}")
    return [p] * count


# ── Prompts ──────────────────────────────────────────────────────────────────

REVERSE_PROMPT = """You are reverse-engineering this reference ad so someone can recreate its composition. Describe what IS in the image — do NOT invent or add anything.

Report in these sections:

SUBJECT: The main focus of the ad. Person, animal, object, scene — whatever drives the eye. Describe pose, expression, positioning.

PRODUCT COUNT: Exact integer number of distinct product containers (bottles, cans, jars, boxes) visible. Just the number.

PRODUCT DETAILS: For each product — container type, position in frame, angle, size relative to image, cap/lid state (on/off/open).

COMPOSITION: 3x3 grid description. What's in each zone. Framing (tight/wide). Visual hierarchy.

PRODUCE / INGREDIENTS: Every visible fruit, vegetable, herb, or raw ingredient. If none, say NONE.

TEXT: Every word visible — headline, subheadline, fine print, body copy, CTA, labels. Note font feel (sans/serif/script/display, thin/heavy, clean/grungy) and color. Note text zones (top banner, center, bottom strip, etc.). If no text, say NONE.

DECORATIVE ELEMENTS: Splashes, sparkles, bubbles, borders, frames, arrows, badges, icons, lines, shapes — anything decorative that isn't product, produce, subject, or text. If none, say NONE EXPLICITLY.

BACKGROUND: Structure (solid, gradient, photo scene, abstract). Exact appearance.

LIGHTING: Direction, quality (hard/soft), highlight behavior, shadow characteristics.

MOOD: 3–5 keywords.

Be literal. Do NOT add clichés ("juicy splashes" unless they're actually there). Absence is as important as presence — if there are no splashes, SAY SO."""

def _brand_voice_block(selected: list[dict], brand: dict) -> str:
    """Build brand voice guidance for freeform text generation."""
    lines = []
    lines.append("  Brand voice: " + brand.get('identity', {}).get('voice', 'plain and honest, no fluff'))
    for p in selected:
        note = p.get("voice_note", "")
        if note:
            lines.append("  " + p['name'] + ": " + note)
        else:
            lines.append("  " + p['name'] + ": use brand voice, keep it plain and honest")
    return "\n".join(lines)



def build_composer_system(brand: dict, selected: list[dict]) -> str:
    """Templated composer system prompt — substitutes brand identity throughout."""
    name = brand["display_name"]
    palette = brand["identity"]["palette"]["description"]
    voice_block = _brand_voice_block(selected, brand)

    cap_lines = []
    for p in selected:
        cap_lines.append(f"    - {name} {p['name']} ({p['container']}): {p['cap_rule']}")
    cap_block = "\n".join(cap_lines) if cap_lines else f"    - All {name} products: see product config"

    # Collect forbidden text patterns
    forbidden_patterns = list(brand.get("global_forbidden_text", []))
    selected_names = {p["name"] for p in selected}
    for p in brand.get("products", []):
        if p["name"] in selected_names:
            forbidden_patterns.extend(p.get("forbidden_text", []))
    seen = set()
    unique_forbidden = []
    for item in forbidden_patterns:
        pat = item.get("pattern", "")
        if pat and pat.lower() not in seen:
            seen.add(pat.lower())
            unique_forbidden.append(item)
    if unique_forbidden:
        forbidden_lines = "\n".join(f"    - '{item['pattern']}' — {item['reason']}" for item in unique_forbidden)
        forbidden_block = f"""FORBIDDEN WORDS — NEVER use these anywhere in your output prompt:
{forbidden_lines}"""
    else:
        forbidden_block = ""

    return f"""You are a senior art director executing a precise brand transfer. You receive:
  - INPUT 1: the reference ad (competitor brand — DO NOT COPY its identity)
  - INPUT 2 through N+1: the {name} product image(s), in left-to-right/top-to-bottom order matching the reference's product slots
  - LAST INPUT: the {name} logo
  - REVERSE ANALYSIS: a structured description of what's actually in INPUT 1
  - SELECTED PRODUCTS: the {name} product(s) to place into INPUT 1's product slot(s)

YOUR JOB: transfer the LAYOUT from INPUT 1 to {name}, replacing only the competitor product/label with {name} product(s). Everything else — scene, lighting, camera angle, composition geometry — transfers unchanged.

STRICT TRANSFER RULES:

FROM INPUT 1 (THE REFERENCE) — COPY AS-IS:
  ✓ Overall composition and framing (treat INPUT 1 as an EMPTY SCENE TEMPLATE — the competitor product(s) shown in INPUT 1 must be ABSENT from your output)
  ✓ Product slot geometry: exact pixel position, angle, scale, and depth ordering of each product in the scene
  ✓ Lighting: direction, quality (soft/hard), highlight behavior, shadow type and placement
  ✓ Background: environment, surface, backdrop structure — apply BRAND PALETTE COLORS only (see STRICT CONSTRAINTS)
  ✓ Camera angle and distance
  ✓ Text zone positions (top banner, bottom strip, side margins — NOT the actual text)

FROM INPUT 1 — NEVER COPY UNDER ANY CIRCUMSTANCE:
  ✗ ANY competitor product visible in INPUT 1 — it must be completely absent from your output; do NOT keep it, hide it, blur it, or include it in any form
  ✗ Any competitor brand name, logo, wordmark, or tagline
  ✗ Any competitor product label, text, or packaging design
  ✗ Any text visible in the reference (headlines, CTAs, fine print, URLs, phone numbers)
  ✗ Any competitor decorative elements (swirls, badges, icons, frames, watermarks)
  ✗ Any produce, fruit, leaves, garnishes, or raw ingredients shown with or near the competitor product
  ✗ Any splash, bubble, or decorative element unique to the competitor brand

FROM INPUT 2+ (THE {name} PRODUCT) — USE EXACTLY:
  ✓ The product label image IS the label — paste it pixel-faithful, do NOT describe or redraw it
  ✓ Match the product's container/cap to the scene's camera angle and shadow
  ✓ The product must look like it belongs in the scene — adjust lighting to match the reference scene, not the product photo's original lighting

FROM INPUT (LAST) — THE {name} LOGO:
  ✓ Small standalone badge, ~8% frame width, one bottom corner, no box, no banner, no added text

FORBIDDEN WORDS — never appear in any text you write:
{forbidden_block}

CAP/CONTAINER RULES:
{cap_block}

ASPECT RATIO: 4:5 portrait

OUTPUT FORMAT — write the final image-generation prompt using this EXACT structure:

WHAT THE REFERENCE INPUT 1 GIVES YOU:
(List 3-5 concrete facts about the composition, lighting, backdrop, and product slot geometry from the REVERSE ANALYSIS. Be specific — "bottle centered, tilted 15° right, resting on white marble surface, soft frontal light with subtle upper-right catchlight" not "a bottle on a surface.")

WHAT YOU MUST NOT COPY FROM INPUT 1:
(List every competitor brand element — brand name, logo text, label design, decorative swirls, badges, watermarks, produce/ingredient props. Quote exact strings from the REVERSE ANALYSIS where possible. This list MUST be exhaustive.)

PRODUCT PLACEMENT:
(One line per product slot, in reference left-to-right order. Example: "Slot 1 (left-center, 30% from left edge, tilted 15°, fills 60% of frame height): paste INPUT 2 ({name} Mango Passion) label pixel-faithful into this exact region. Apply same angle and scale. Black cap." Repeat for each slot. Use INPUT numbers matching order: INPUT 2 = first product, INPUT 3 = second, etc.)

LIGHTING:
(Describe the scene lighting from INPUT 1 in 1-2 sentences. Write: "Match product highlights and shadows to this scene lighting — do not preserve the product photo's original lighting." Keep it locked to the reference.)

STRICT CONSTRAINTS:
- COMPETITOR PRODUCTS MUST NOT APPEAR IN YOUR OUTPUT — the scene is empty except for the {name} product(s) you place. The reference's product(s) must be completely absent, not blurred, not cropped, not hidden.
- Paste label from INPUT [N] pixel-faithful — do NOT redraw, describe, or alter the label design
- Product must cast a natural contact shadow on the scene surface — no floating, no hard-edge pasted shadow
- Adjust product brightness/contrast to match the scene's ambient light — never preserve "original product lighting"
- BACKGROUND, SETTING & COLOR GRADE: replace ALL colors from INPUT 1 with the brand palette. The 60-30-10 dynamic rule applies: identify the dominant mood/tone of INPUT 1 (e.g. warm tropical, cool moody, bright citrus), then assign brand palette colors to fill that tone — 60% dominant color, 30% secondary, 10% accent. NEVER use colors outside the brand palette.
- Brand palette: {palette}
- No mascots, cartoon characters, personified objects
- No hashtags, URLs, pricing, phone numbers, social handles, medical claims
- Aspect ratio: 4:5 portrait

TEXT STRATEGY:
(Write brand voice text for each text zone identified in WHAT THE REFERENCE GIVES YOU. Keep it plain and honest. If the reference has no text zones, write: No text. Use brand palette colors.)

LOGO:
(Paste the LAST INPUT logo small, ~8% frame width, single bottom corner, no box.)

Do not use markdown fences. Do not add headings not listed above."""


# ── Analysis calls ───────────────────────────────────────────────────────────

def reverse_analyze(ref_path: str) -> str:
    def gemini():
        client = _client()
        resp = client.models.generate_content(
            model=VISION_MODEL,
            contents=[_image_part(ref_path), REVERSE_PROMPT],
        )
        return resp.candidates[0].content.parts[0].text.strip()

    def openrouter():
        return _or_text_call(OR_TEXT_MODEL, None, [{"path": ref_path}, REVERSE_PROMPT])

    return _with_fallback("reverse_analyze", gemini, openrouter)


# vibe_shift_analyze removed — we use the reference's own lighting/composition directly
# no separate aesthetic layer


def _strip_md(text: str) -> str:
    return re.sub(r"\*+", "", text)


def parse_product_count(reverse_text: str) -> int:
    clean = _strip_md(reverse_text)
    m = re.search(r"PRODUCT COUNT:\s*(\d+)", clean, re.IGNORECASE)
    if m:
        return max(1, min(7, int(m.group(1))))
    return 1


def parse_produce(reverse_text: str) -> list[str]:
    clean = _strip_md(reverse_text)
    m = re.search(
        r"PRODUCE\s*/?\s*INGREDIENTS:\s*(.*?)(?=\n[A-Z][A-Z ]+:|\Z)",
        clean,
        re.IGNORECASE | re.DOTALL,
    )
    if not m:
        return []
    body = m.group(1).strip()
    if body.upper().startswith("NONE"):
        return []
    return [body]


def build_brand_rules_block(brand: dict) -> str:
    """Combine ad_creative_rules from the brand JSON with any legacy
    enforcement_additions from a rules_path file (Island Splash compat)."""
    parts: list[str] = [f"- {r}" for r in brand.get("ad_creative_rules", [])]

    rules_path = brand["paths"].get("rules_path")
    if rules_path:
        rp = Path(rules_path)
        if rp.exists():
            rules = json.loads(rp.read_text())
            for r in rules.get("enforcement_additions", []):
                if r.get("active"):
                    parts.append(f"- {r['text']}")
    return "\n".join(parts)


def compose_prompt(brand: dict, selected: list[dict], reverse: str) -> str:
    rules_block = build_brand_rules_block(brand)
    product_names = ", ".join(p["name"] for p in selected)
    user = f"""REVERSE ANALYSIS:
{reverse}

SELECTED PRODUCTS (in order, one per ref product): {product_names}

BRAND RULES (must be encoded in your STRICT CONSTRAINTS block):
{rules_block}

Now write the final image-generation prompt."""

    system = build_composer_system(brand, selected)

    def gemini():
        client = _client()
        resp = client.models.generate_content(
            model=TEXT_MODEL,
            contents=[system, user],
        )
        return resp.candidates[0].content.parts[0].text.strip()

    def openrouter():
        return _or_text_call(OR_TEXT_MODEL, system, [user])

    return _with_fallback("compose_prompt", gemini, openrouter)


# ── Pre-generation forbidden-text scan ───────────────────────────────────────

def collect_forbidden_patterns(brand: dict, selected: list[dict]) -> list[dict]:
    patterns: list[dict] = []
    patterns.extend(brand.get("global_forbidden_text", []))
    selected_names = {p["name"] for p in selected}
    for p in brand["products"]:
        if p["name"] in selected_names:
            patterns.extend(p.get("forbidden_text", []))
    return patterns


def _pattern_to_regex(needle: str) -> str:
    """Convert a plain-text needle to a regex that matches the needle literally,
    except '#' which is treated as a hashtag (not hex) via a lookaround.
    Pure alphabetic patterns get whitespace boundaries to avoid false positives
    inside hyphenated or compound words (e.g., 'FREE' matching 'noise-free')."""
    if needle == "#":
        # Match # only when NOT preceded or followed by a hex digit (i.e., not part of a color code like #F0E0B0)
        return r"(?<![0-9A-Fa-f])#(?![0-9A-Fa-f])"
    escaped = re.escape(needle)
    # If the pattern is purely alphabetic, enforce whitespace boundaries
    if needle.isalpha():
        return r"(?<![^\s])" + escaped + r"(?![^\s])"
    return escaped


def _strip_forbidden_block(text: str) -> str:
    """Remove blocks that legitimately contain forbidden strings as negative
    instructions: FORBIDDEN IN OUTPUT, STRICT CONSTRAINTS, and TEXT CONTENT GUIDANCE."""
    # Known major section headers in the composer prompt
    section_pattern = r"(?:FORBIDDEN\s+IN\s+OUTPUT|STRICT\s+CONSTRAINTS|REFERENCE\s+SUBJECT|PRODUCT\s+REPLACEMENT|TEXT\s+CONTENT\s+GUIDANCE|TEXT\s+STRATEGY|LOGO|STYLE\s+OVERLAY)"
    # Strip FORBIDDEN IN OUTPUT block
    text = re.sub(
        r"FORBIDDEN\s+IN\s+OUTPUT.*?\n(?=\s*" + section_pattern + r")",
        "",
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    # Strip STRICT CONSTRAINTS block
    text = re.sub(
        r"STRICT\s+CONSTRAINTS:\s*.*?\n(?=\s*" + section_pattern + r")",
        "",
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    # Strip TEXT CONTENT GUIDANCE block
    text = re.sub(
        r"TEXT\s+CONTENT\s+GUIDANCE:\s*.*?\n(?=\s*" + section_pattern + r")",
        "",
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    return text


def scan_forbidden(text: str, patterns: list[dict]) -> list[dict]:
    """Return list of {pattern, severity, reason} hits found in text (case-insensitive).
    Uses regex matching; '#' is treated specially to exclude hex color codes.
    The FORBIDDEN IN OUTPUT block is excluded from scanning since it legitimately
    contains the forbidden strings as instructions to the image model."""
    haystack = _strip_forbidden_block(text).lower()
    hits: list[dict] = []
    for p in patterns:
        needle = str(p.get("pattern", ""))
        if not needle:
            continue
        regex = _pattern_to_regex(needle)
        if re.search(regex, haystack, re.IGNORECASE):
            hits.append({
                "pattern": p["pattern"],
                "severity": p.get("severity", "warning"),
                "reason": p.get("reason", ""),
            })
    return hits


# ── Image generation ─────────────────────────────────────────────────────────

def _build_input_index(brand: dict, selected: list[dict], has_logo: bool) -> str:
    name = brand["display_name"]
    lines = [
        "INPUT IMAGE INDEX (the images attached to this request, in order):",
        f"  INPUT 1 = REFERENCE ad. Use it ONLY for: subject placement, pose, composition, camera angle, lighting direction, and text-zone positions. Every product label, cap, text, logo, brand mark, and decorative element in the OUTPUT must come from the INPUT product images listed below — NOT from INPUT 1. INPUT 1 has NO labels, logos, or text that should appear in the output.",
    ]
    for i, prod in enumerate(selected):
        lines.append(
            f"  INPUT {i + 2} = {name} {prod['name']} product image ({prod['container']}). "
            f"This is the ONLY source for the product label. COPY the label artwork pixel-for-pixel onto the product. "
            f"Do NOT redraw, recreate, or reimagine the label — the label image IS the label. "
            f"Container/cap rule: {prod['cap_rule']}."
        )
    if has_logo:
        lines.append(
            f"  INPUT {len(selected) + 2} = {name} logo. Render SMALL — about 8% of the frame width — as a single discreet badge in ONE bottom corner. DO NOT render as a banner, lockup, or oversized wordmark. DO NOT add a box or background plate behind it. One placement, small, done."
        )
    return "\n".join(lines) + "\n\n"


def generate_image(
    brand: dict,
    ref_path: str,
    product_paths: list[str],
    logo_path: str,
    selected: list[dict],
    final_prompt: str,
    out_path: Path,
) -> None:
    client = _client()
    contents: list = [_image_part(ref_path)]
    for p in product_paths:
        contents.append(_image_part(p))
    has_logo = os.path.exists(logo_path)
    if has_logo:
        contents.append(_image_part(logo_path))
    index_block = _build_input_index(brand, selected, has_logo)
    full_prompt = index_block + final_prompt

    def gemini():
        resp = client.models.generate_content(
            model=IMAGE_MODEL,
            contents=contents,
            config={
                "response_modalities": ["IMAGE"],
                "image_config": ImageConfig(aspect_ratio="4:5"),
            },
        )
        for part in resp.candidates[0].content.parts:
            if part.inline_data:
                return part.inline_data.data
        raise RuntimeError("Image model returned no image")

    or_image_paths = [ref_path] + list(product_paths)
    if has_logo:
        or_image_paths.append(logo_path)

    def openrouter():
        return _or_image_call(OR_IMAGE_MODEL, full_prompt, or_image_paths)

    img_bytes = _with_fallback("generate_image", gemini, openrouter)
    img = Image.open(io.BytesIO(img_bytes))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(str(out_path))


# ── Sidecar ──────────────────────────────────────────────────────────────────

def save_sidecar(
    brand: dict,
    out_path: Path,
    ref_path: str,
    selected: list[dict],
    reverse: str,
    final_prompt: str,
    forbidden_warnings: list[dict],
) -> None:
    sidecar = out_path.with_suffix(".instructions.txt")
    warn_block = ""
    if forbidden_warnings:
        warn_block = "\n=== FORBIDDEN-TEXT WARNINGS ===\n" + "\n".join(
            f"- [{h['severity']}] '{h['pattern']}': {h['reason']}" for h in forbidden_warnings
        ) + "\n"
    sidecar.write_text(
        f"BRAND: {brand['slug']} ({brand['display_name']})\n"
        f"REF: {ref_path}\n"
        f"OUTPUT: {out_path}\n"
        f"PRODUCTS: {', '.join(p['name'] for p in selected)}\n"
        f"TIMESTAMP: {datetime.now().isoformat()}\n"
        f"{warn_block}"
        f"\n=== REVERSE ANALYSIS ===\n{reverse}\n"
        f"\n=== FINAL IMAGE-GEN PROMPT ===\n{final_prompt}\n"
    )


# ── Main pipeline ────────────────────────────────────────────────────────────

def run_one(brand: dict, ref_path: str, locked_product: str | None = None) -> Path:
    if not os.path.exists(ref_path):
        raise FileNotFoundError(f"ref not found or unreadable: {ref_path}")

    if brand.get("product_required") and not locked_product:
        avail = ", ".join(p["name"] for p in brand["products"])
        raise RuntimeError(
            f"brand '{brand['slug']}' requires --product. Available: {avail}"
        )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
    out_path = OUTPUT_DIR / f"{brand['slug']}_{ts}.png"

    log(brand, f"reverse-engineering {ref_path}")
    reverse = reverse_analyze(ref_path)
    product_count = parse_product_count(reverse)
    produce = parse_produce(reverse)
    log(brand, f"ref has {product_count} product(s)")

    tally = load_tally(brand)
    if locked_product:
        selected = lock_products(brand, product_count, locked_product)
        log(brand, f"locked product: {selected[0]['name']} (×{product_count})")
    else:
        selected = pick_products(brand, product_count, produce, tally)
        log(brand, f"products: {', '.join(p['name'] for p in selected)}")

    log(brand, "composing final prompt")
    final_prompt = compose_prompt(brand, selected, reverse)

    patterns = collect_forbidden_patterns(brand, selected)
    hits = scan_forbidden(final_prompt, patterns)
    errors = [h for h in hits if h["severity"] == "error"]
    warnings = [h for h in hits if h["severity"] != "error"]
    for h in warnings:
        log(brand, f"WARN forbidden-text in prompt: '{h['pattern']}' — {h['reason']}")
    if errors:
        msg = "; ".join(f"'{h['pattern']}' ({h['reason']})" for h in errors)
        raise RuntimeError(f"composer prompt contains FORBIDDEN text (severity=error): {msg}")

    products_dir = Path(brand["paths"]["products_dir"])
    product_paths: list[str] = []
    for prod in selected:
        p = products_dir / prod["label_file"]
        if p.exists():
            product_paths.append(str(p))
        else:
            log(brand, f"WARN: product image missing: {p}")

    log(brand, f"generating image → {out_path}")
    generate_image(brand, ref_path, product_paths, brand["paths"]["logo_path"], selected, final_prompt, out_path)

    save_sidecar(brand, out_path, ref_path, selected, reverse, final_prompt, warnings)

    for prod in selected:
        tally[prod["name"]] = tally.get(prod["name"], 0) + 1
    save_tally(brand, tally)

    # Copy to website public folder and update ads.json
    sync_ad_to_website(brand, out_path, selected)

    return out_path


def sync_ad_to_website(brand: dict, out_path: Path, selected: list[dict]) -> None:
    """Copy generated ad to website/public/images/ads/{brand}/ and append to website/public/data/{brand}.json."""
    import shutil

    slug = brand["slug"]
    brand_img_dir = REPO_ROOT / "website" / "public" / "images" / "ads" / slug
    brand_img_dir.mkdir(parents=True, exist_ok=True)

    # Copy image to brand-specific folder
    dest_path = brand_img_dir / out_path.name
    shutil.copy2(out_path, dest_path)

    # Also copy sidecar if exists
    sidecar = out_path.with_suffix(".instructions.txt")
    if sidecar.exists():
        shutil.copy2(sidecar, brand_img_dir / sidecar.name)

    # Update brand-specific JSON file
    brand_json_path = REPO_ROOT / "website" / "public" / "data" / f"{slug}.json"
    ads_data = []
    if brand_json_path.exists():
        try:
            ads_data = json.loads(brand_json_path.read_text())
        except Exception:
            ads_data = []

    product_name = selected[0]["name"] if selected else out_path.stem

    new_ad = {
        "id": out_path.name,
        "filename": out_path.name,
        "path": f"/images/ads/{slug}/{out_path.name}",
        "product_name": product_name,
        "status": "new",
        "brand": slug,
        "created_at": datetime.now().isoformat()
    }

    # Replace if already exists by id (filename), otherwise append.
    # Deduplicate on id so the same image file is never added twice.
    replaced = False
    for i, ad in enumerate(ads_data):
        if ad.get("id") == new_ad["id"] or ad.get("filename") == new_ad["filename"]:
            ads_data[i] = new_ad
            replaced = True
            break
    if not replaced:
        ads_data.append(new_ad)

    brand_json_path.write_text(json.dumps(ads_data, indent=2))
    log(brand, f"synced to website: {dest_path}")

    # Also initialize entry in ad-approval JSON so approve/bad buttons work
    _sync_ad_to_approval(slug, out_path.name)


def _sync_ad_to_approval(slug: str, ad_id: str) -> None:
    """Add or update an ad entry in the approval JSON as 'pending'."""
    import shutil
    approval_dir = REPO_ROOT / "output" / "ad-approval"
    approval_dir.mkdir(parents=True, exist_ok=True)
    approval_file = approval_dir / f"{slug}.json"

    # Build initial state if file doesn't exist
    state = {"pending_count": 0, "approved_count": 0, "bad_count": 0, "consumed_count": 0, "ads": {}}
    if approval_file.exists():
        try:
            state = json.loads(approval_file.read_text())
        except Exception:
            state = {"pending_count": 0, "approved_count": 0, "bad_count": 0, "consumed_count": 0, "ads": {}}

    # Normalize ad key — strip extension
    key = ad_id.replace(".png", "").replace(".jpg", "").replace(".jpeg", "")

    # Only add if not already tracked (don't override existing status)
    if key not in state["ads"] and ad_id not in state["ads"]:
        state["ads"][key] = {"status": "pending", "filename": ad_id, "reviewed_at": None}
        state["pending_count"] = state.get("pending_count", 0) + 1
        approval_file.write_text(json.dumps(state, indent=2))


def resolve_pool_dir(brand: dict, locked_product: str | None, category: str | None = None) -> Path:
    """Which directory to read refs from.

    For brands with product_required + a locked product, each product has its own
    sub-pool at <pool_dir>/<product.pool_slug>/. Otherwise (e.g. Island Splash rotation)
    use <pool_dir>/<category>/approved/ — never the root pool.
    """
    base = Path(brand["paths"]["pool_dir"])
    if brand.get("product_required") and locked_product:
        prod = find_product(brand, locked_product)
        if not prod:
            raise RuntimeError(f"locked product '{locked_product}' not in brand '{brand['slug']}'")
        slug = prod.get("pool_slug") or prod["name"].lower().replace(" ", "-")
        return base / slug
    if category:
        return base / category / "approved"
    return base / "approved"


def list_pool(brand: dict, locked_product: str | None = None, category: str | None = None) -> list[Path]:
    pool_dir = resolve_pool_dir(brand, locked_product, category)
    pool_dir.mkdir(parents=True, exist_ok=True)
    (pool_dir / POOL_PROCESSED_DIRNAME).mkdir(parents=True, exist_ok=True)
    refs: list[Path] = []
    for p in sorted(pool_dir.iterdir()):
        if p.is_file() and p.suffix.lower() in POOL_EXTS:
            refs.append(p)
    return refs


def run_pool(brand: dict, locked_product: str | None = None, category: str | None = None) -> int:
    refs = list_pool(brand, locked_product, category)
    pool_dir = resolve_pool_dir(brand, locked_product, category)
    if not refs:
        log(brand, f"pool is empty — nothing to do ({pool_dir})")
        return 1
    log(brand, f"pool has {len(refs)} ref(s) in {pool_dir}; processing sequentially")
    if locked_product:
        log(brand, f"all refs locked to product: {locked_product}")
    processed_dir = pool_dir / POOL_PROCESSED_DIRNAME
    successes: list[tuple[str, Path]] = []
    failures: list[tuple[str, str]] = []
    for i, ref in enumerate(refs, 1):
        if i > 1:
            log(brand, f"pacing {POOL_PACING_SECONDS}s before next ref…")
            time.sleep(POOL_PACING_SECONDS)
        log(brand, f"=== pool {i}/{len(refs)}: {ref.name} ===")
        try:
            out = run_one(brand, str(ref), locked_product=locked_product)
            ref.rename(processed_dir / ref.name)
            # Remove the approved/ copy so it never shows up in the gallery again
            # For nested layouts (island-splash), the copy lives in processed_dir
            approved_copy = processed_dir / ref.name
            if approved_copy.exists():
                approved_copy.unlink()
            successes.append((ref.name, out))
            print(str(out))
            sys.stdout.flush()
        except Exception as e:
            log(brand, f"FAIL on {ref.name}: {e}")
            failures.append((ref.name, str(e)))
    log(brand, f"pool done: {len(successes)} succeeded, {len(failures)} failed")
    for name, err in failures:
        log(brand, f"  FAIL {name}: {err}")
    return 0 if successes else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Asset Ads — multi-brand ad generator")
    parser.add_argument("--brand", default=DEFAULT_BRAND, help="Brand slug (matches brands/<slug>.json)")
    parser.add_argument("--product", default=None, help="Lock to one product (name or trigger keyword); overrides rotation")
    parser.add_argument("--pool", action="store_true", help="Drain the brand's pool dir sequentially")
    parser.add_argument("--category", default=None, help="Pool category subdirectory (e.g. drinks for island-splash)")
    parser.add_argument("ref", nargs="?", help="Reference image path (required unless --pool)")
    args = parser.parse_args()

    brand = load_brand(args.brand)

    if args.product:
        # Validate early so a bad keyword fails before any API call.
        find_or_fail = find_product(brand, args.product)
        if not find_or_fail:
            avail = ", ".join(p["name"] for p in brand["products"])
            print(f"ERROR: product '{args.product}' not found in brand '{brand['slug']}'. Available: {avail}", file=sys.stderr)
            return 2
        # Pass the canonical name so logs/sidecars are consistent.
        args.product = find_or_fail["name"]

    if args.pool:
        return run_pool(brand, locked_product=args.product, category=args.category)

    if not args.ref:
        parser.error("ref path required unless --pool is set")
    if not os.path.exists(args.ref):
        print(f"ERROR: ref not found: {args.ref}", file=sys.stderr)
        return 2

    out_path = run_one(brand, args.ref, locked_product=args.product)
    print(str(out_path))
    return 0


if __name__ == "__main__":
    sys.exit(main())
