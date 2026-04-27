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

ENV_PATH = Path("/home/drewp/.hermes/profiles/hermes-11/.env")
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

POOL_PROCESSED_DIRNAME = "used-refs"
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

VIBE_SHIFT_PROMPT = """You are a professional cinematographer and color grading expert. Extract ONLY the visual aesthetic and technical characteristics of this image — ignore all subject matter, people, objects, or story elements.

Create a detailed technical description that captures the pure visual treatment. Focus on:

FILM/CAMERA: What film stock or digital equivalent would create this look? Camera type and lens characteristics (35mm, medium format, digital). Depth of field, focus qualities. Any lens effects (vignetting, distortion, bokeh).

COLOR SCIENCE: Dominant color palette and temperature. Saturation levels and color relationships. Warm/cool biases. Shadow and highlight color characteristics.

LIGHTING: Light source type and quality (natural, artificial, mixed). Shadow characteristics (soft, hard, direction). Highlight behavior and exposure style. Overall contrast and dynamic range.

POST-PROCESSING: Color grading characteristics. Film grain or digital noise structure. Contrast curve and exposure tendencies. Distinctive processing effects.

OUTPUT: Write a single paragraph starting with "Shot with..." using specific technical terms. End with a 5–6 keyword summary. Detailed enough to recreate this exact visual aesthetic on any subject matter."""


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
    vibe_examples = ", ".join(f'"{p}"' for p in brand["identity"].get("allowed_vibe_phrases", [])) or '"Brand", "Vibe"'
    voice_block = _brand_voice_block(selected, brand)

    cap_lines = []
    for p in selected:
        cap_lines.append(f"    - {name} {p['name']} ({p['container']}): {p['cap_rule']}")
    cap_block = "\n".join(cap_lines) if cap_lines else f"    - All {name} products: see product config"

    # Collect all forbidden text patterns for the composer
    forbidden_patterns = list(brand.get("global_forbidden_text", []))
    selected_names = {p["name"] for p in selected}
    for p in brand.get("products", []):
        if p["name"] in selected_names:
            forbidden_patterns.extend(p.get("forbidden_text", []))
    # Deduplicate by pattern string
    seen = set()
    unique_forbidden = []
    for item in forbidden_patterns:
        pat = item.get("pattern", "")
        if pat and pat.lower() not in seen:
            seen.add(pat.lower())
            unique_forbidden.append(item)
    if unique_forbidden:
        forbidden_lines = "\n".join(f"    - '{item['pattern']}' — {item['reason']}" for item in unique_forbidden)
        forbidden_block = f"""FORBIDDEN WORDS — NEVER use these in the TEXT STRATEGY, STRICT CONSTRAINTS, or any instruction that tells the image model what TO render. You may list them in the FORBIDDEN IN OUTPUT section (rule 2b) but nowhere else:
{forbidden_lines}"""
    else:
        forbidden_block = ""

    return f"""You are a senior art director writing a final image-generation prompt for gemini-3-pro-image-preview. You will receive:
  - a REVERSE ANALYSIS of a reference ad (what's in it, verbatim)
  - a VIBE SHIFT analysis (the reference's pure cinematic aesthetic)
  - the {name} brand rules
  - the selected {name} product(s) to substitute into the ad

Your job: write the final prompt. The goal is to RECREATE the reference ad's subject, composition, and decorative elements faithfully, swapping ONLY the product for {name} product(s), and apply a color-grade overlay that shifts the palette toward the brand.

NON-NEGOTIABLE RULES WHEN WRITING THE PROMPT:
  1. Keep the reference's SUBJECT. If the ref has a snow leopard, keep the snow leopard. If it has a person holding a fruit, keep the person and the fruit. Do not drop the subject.
  2. Do NOT invent elements absent from the reference. If the reverse analysis says "NO splashes, NO produce, NO decorative elements," your prompt MUST forbid splashes/produce/decorative. No adding generic clichés like bursting fruit, ice crystals, or juice droplets unless the reference had them.
  2a. NEVER instruct to preserve, keep, or render any of the reference's: text, headlines, taglines, body copy, URLs, phone numbers, logos, wordmarks, brand marks, watermarks, ghosted/repeated text patterns, or decorative typography. These are the reference brand's identity and do NOT belong in the {name} ad. Only the reference's SUBJECT (person, pose, product-grip, scene) and COMPOSITION (camera framing, text-zone positions) transfer. All text and logos in the output come from the {name} TEXT STRATEGY and LOGO blocks you write — nothing else.
  2b. FIRST SECTION OF YOUR OUTPUT is a FORBIDDEN IN OUTPUT bullet list. Read the REVERSE ANALYSIS and extract every single text string, headline, tagline, logo name, wordmark, brand name, URL, phone number, social handle, event badge, date string, booth number, decorative-type element, ghosted pattern, and watermark mentioned. Quote them verbatim in quotes. Be exhaustive — if the reverse analysis names 10 text strings, your list has at least 10 bullets. This list is the first thing the image model reads. Missing strings is a failure.
  3. The style overlay is a COLOR GRADE + LIGHTING + GRAIN + LENS FEEL on top of the recreated scene — NOT a repaint of the background. Take the Vibe Shift's lighting/grain/lens/contrast characteristics verbatim; replace its color-palette description with the {name} brand palette ({palette}). The scene keeps its structure; colors shift.
  3a. KEEP the product subject (the advertised item itself). DROP all produce/ingredient/raw-material elements shown alongside the product in the reference — these are the reference brand's ingredient showcase and do not transfer. For example: if a juice brand shows a half-cut orange next to the bottle, do NOT include an orange in the {name} ad; if a sunscreen shows papaya leaves or fruit as ingredients, do NOT include papaya in the {name} ad. Only the product itself and the scene backdrop/setting transfer.
  4. Text: match the reference's font feel (thin sans-serif -> thin sans-serif, heavy serif -> heavy serif). Colors from brand palette. Do NOT invent URLs, hashtags, pricing, phone numbers, social handles. Write text that matches the brand voice guidance — plain, honest, ranch-real. If the reference has minimal/no text, keep the ad minimal/no text.
  4b. {forbidden_block}
  5. Product replacement: swap the reference's product(s) for {name} product(s). The product images are provided as NUMBERED INPUTS. INPUT 1 is always the reference. INPUTS 2..N+1 are the {name} product images in the same order as the SELECTED PRODUCTS list you receive. Reference them by input index in your PRODUCT REPLACEMENT block (e.g., "Bottle in the front-right position: paste INPUT 2 ({name} <product name>) as the bottle label, pixel-faithful, do not redraw"). Do NOT say "using the provided image" generically — always say the INPUT number. Do NOT redraw the label design; the INPUT image IS the label.
  5a. CONTAINER + CAP RULES (brand fact, by selected product):
{cap_block}
  Apply each product's container/cap rule literally. Do NOT inherit cap colors or container styles from the reference image.
  6. Logo: a separate INPUT image (the LAST input). Render it as a SMALL badge, roughly 8% of frame width, in ONE bottom corner. NOT a banner. NOT a lockup. NOT oversized. No background box. One placement.
  7. Aspect ratio: 4:5 (Instagram portrait).

OUTPUT FORMAT — emit ONLY the final prompt as plain text, structured with these headers:

FORBIDDEN IN OUTPUT (from reference — MUST NOT appear in the final image):
(A concrete bullet list of EVERY text string, headline, tagline, wordmark, logo, brand name, URL, phone number, social handle, event badge, watermark, and ghosted/repeated text pattern that appears in the reference ad. Pull them verbatim from the REVERSE ANALYSIS. Quote exact strings. Example:
  - The wordmark "JB'fresh" (red-and-black script)
  - The headline "Smoothie" in rounded sans-serif
  - The "SIAL Interfood Jakarta" event badge with "INSPIRE FOOD BUSINESS" and dates "12 - 15 Nov 2025" and booth "B2-F202"
  - The URL "@jbfresh.com.vn" and its globe icon
  - The bottle-label strings "JUICE DRINK", "YELLOW SMOOTHIE", "RED SMOOTHIE", "Mutti Vintamin", "16.9 fl oz (500mL)"
  - Any farmhouse/barn line-art on labels
  - Any sparkle/star decorative typography
None of these may appear in the output. The reference brand does not exist in the {name} ad.)

STRICT CONSTRAINTS:
(brand rules — palette, label preservation, no mascots/forbidden props, no hashtags/URLs, no medical claims)
- The product label is pasted PIXEL-FAITHFUL from the INPUT image — do NOT redraw or recreate the label
- Product lighting MUST match the scene's lighting direction and quality — never preserve "original product lighting"
- Product must cast a natural shadow on the scene surface — no floating, no hard-edged pasted shadow
- Use upgraded product images when available (`upgraded_*.png` — opaque, higher quality)

REFERENCE SUBJECT & COMPOSITION:
(paragraph — keep subject X, keep composition Y, DO NOT add Z absent elements)

PRODUCT REPLACEMENT:
(the N products in ref → N {name} products. For each, specify its scene position and the exact INPUT index whose label to paste pixel-faithful. Apply the per-product cap/container rule from rule 5a. Do not inherit container or cap styles from the reference.)

LIGHTING & SHADOW MATCH (CRITICAL — prevents "pasted-in" look):
- Analyze the reference's lighting: direction (overhead, side, backlit), quality (hard/soft), and color temperature (warm/cool/neutral)
- State the product's lighting as a constraint: "The product catches highlights consistent with the scene's [direction] [quality] [temperature] lighting"
- State the shadow constraint: "A soft, diffuse shadow grounds the product on [surface], consistent with the scene's shadow direction and softness"
- If the scene has rim lighting, say "no highlight on the product that contradicts the scene's rim light"
- Never write "preserve original lighting" or "match the product's original lighting" — always reference the SCENE's lighting

TEXT CONTENT GUIDANCE:
{voice_block}

TEXT STRATEGY:
- Write a headline matching the brand voice. Follow the reference font feel (serif headline -> serif, sans-serif -> sans-serif).
- Write body copy lines matching the reference text density. Keep each line short and honest.
- Render all text in brand palette colors — Island Splash: #243C3C (dark teal), #F0A86C (warm orange), #E4843C (deep coral), #A89078 (warm sand); Cinco H Ranch: use brand palette. Pick ONE color that contrasts well with the scene.
- Write freely using the brand voice. Do NOT invent clinical, corporate, or spa-fluff language.

LOGO:
(the LAST INPUT image — render small, ~8% of frame width, single bottom corner, no banner, no box, no lockup text added.)

STYLE OVERLAY (FINAL UNIFYING PASS — apply LAST, over everything above):
(the modified Vibe Shift paragraph with brand palette swapped in. This is the final color grade + lighting + lens + grain treatment that ties the composed scene, the pasted product labels, and the text into one cohesive image. Even if an individual element looks slightly off, this unifying pass blends it into the final shot. Phrase it as "applied as the final pass over the entire image.")

Do not wrap in markdown code fences. Do not add headings beyond those listed. Do not explain your reasoning — output the prompt only."""


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


def vibe_shift_analyze(ref_path: str) -> str:
    def gemini():
        client = _client()
        resp = client.models.generate_content(
            model=VISION_MODEL,
            contents=[_image_part(ref_path), VIBE_SHIFT_PROMPT],
        )
        return resp.candidates[0].content.parts[0].text.strip()

    def openrouter():
        return _or_text_call(OR_TEXT_MODEL, None, [{"path": ref_path}, VIBE_SHIFT_PROMPT])

    return _with_fallback("vibe_shift_analyze", gemini, openrouter)


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


def compose_prompt(brand: dict, selected: list[dict], reverse: str, vibe: str) -> str:
    rules_block = build_brand_rules_block(brand)
    product_names = ", ".join(p["name"] for p in selected)
    user = f"""REVERSE ANALYSIS:
{reverse}

VIBE SHIFT ANALYSIS:
{vibe}

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
        f"  INPUT 1 = REFERENCE ad. STRUCTURAL WIREFRAME ONLY — use it for subject placement, pose, composition, camera angle, and text-zone positions. DO NOT copy ANY of the following from INPUT 1 into the output: colors, background color/pattern, products, labels, caps, text, headlines, taglines, URLs, logos, wordmarks, brand marks, watermarks, ghosted/repeated text patterns, or decorative type. Every piece of text and every logo in the final image comes from {name} — not from INPUT 1. The reference brand does not exist in the output.",
    ]
    for i, prod in enumerate(selected):
        lines.append(
            f"  INPUT {i + 2} = {name} {prod['name']} product image ({prod['container']}). PASTE this label/artwork pixel-faithfully onto the corresponding product. Do NOT redraw, recolor, or restyle. Container/cap rule: {prod['cap_rule']}."
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
    vibe: str,
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
        f"\n=== VIBE SHIFT ANALYSIS ===\n{vibe}\n"
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

    log(brand, "vibe-shift analysis")
    vibe = vibe_shift_analyze(ref_path)

    log(brand, "composing final prompt")
    final_prompt = compose_prompt(brand, selected, reverse, vibe)

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

    save_sidecar(brand, out_path, ref_path, selected, reverse, vibe, final_prompt, warnings)

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


def resolve_pool_dir(brand: dict, locked_product: str | None) -> Path:
    """Which directory to read refs from.

    For brands with product_required + a locked product, each product has its own
    sub-pool at <pool_dir>/<product.pool_slug>/. Otherwise (e.g. Island Splash rotation)
    use the approved/ subdirectory — never the root pool.
    """
    base = Path(brand["paths"]["pool_dir"])
    if brand.get("product_required") and locked_product:
        prod = find_product(brand, locked_product)
        if not prod:
            raise RuntimeError(f"locked product '{locked_product}' not in brand '{brand['slug']}'")
        slug = prod.get("pool_slug") or prod["name"].lower().replace(" ", "-")
        return base / slug
    return base / "approved"


def list_pool(brand: dict, locked_product: str | None = None) -> list[Path]:
    pool_dir = resolve_pool_dir(brand, locked_product)
    pool_dir.mkdir(parents=True, exist_ok=True)
    (pool_dir / POOL_PROCESSED_DIRNAME).mkdir(parents=True, exist_ok=True)
    refs: list[Path] = []
    for p in sorted(pool_dir.iterdir()):
        if p.is_file() and p.suffix.lower() in POOL_EXTS:
            refs.append(p)
    return refs


def run_pool(brand: dict, locked_product: str | None = None) -> int:
    refs = list_pool(brand, locked_product)
    pool_dir = resolve_pool_dir(brand, locked_product)
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
        return run_pool(brand, locked_product=args.product)

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
