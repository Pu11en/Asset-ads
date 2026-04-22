#!/usr/bin/env python3
"""Island Splash ad generator — sequential pipeline.

Usage: python3 splash_run.py <ref_image_path>

Pipeline:
  1. Pick flavor(s) from tally (count matches ref product count)
  2. Reverse-engineer analysis (subject, composition, decorative elements)
  3. Vibe shift analysis (cinematic aesthetic — camera, lighting, color grade)
  4. Composer (gemini-2.5-pro) builds final image-gen prompt
  5. gemini-3-pro-image-preview generates the image
  6. Save sidecar (all three analyses + final prompt) + update tally
  7. Print output image path on last line (for the Hermes thin-trigger skill to post)
"""

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

BRAND = "Island Splash"
BRAND_PALETTE = (
    "dark teal #243C3C, warm golden orange #F0A86C, "
    "deep coral orange #E4843C, warm sand/tan #A89078"
)
BRAND_VIBE = "Florida Caribbean juice — fun, laid-back, tropical, island time"

OUTPUT_DIR = Path("/home/drewp/asset-ads/output")
PRODUCTS_DIR = Path("/home/drewp/splash-website/assets/products")
LOGO_PATH = Path("/home/drewp/.hermes/profiles/hermes-11/logos/island-splash/logo.png")
TALLY_PATH = Path("/home/drewp/asset-ads/flavor_usage.json")
RULES_PATH = Path("/home/drewp/asset-ads/formula_learning.json")
POOL_DIR = Path("/home/drewp/hermes-11/references")
POOL_PROCESSED_DIR = POOL_DIR / "processed"
POOL_EXTS = (".jpg", ".jpeg", ".png", ".webp")

FLAVOR_TO_FILE = {
    "Mango Passion": "MangoPassion.png",
    "Mauby": "Mauby.png",
    "Peanut Punch": "peanutpunch.png",
    "Lime": "Lime.png",
    "Guava Pine": "GuavaPine.png",
    "Sorrel": "sorrel.png",
    "Pine Ginger": "pineginger.png",
}

FLAVOR_KEYWORDS = {
    "Mango Passion": ["mango", "passion fruit", "passionfruit"],
    "Mauby": ["mauby", "bark"],
    "Peanut Punch": ["peanut"],
    "Lime": ["lime", "citrus"],
    "Guava Pine": ["guava", "pineapple"],
    "Sorrel": ["sorrel", "hibiscus"],
    "Pine Ginger": ["pineapple", "ginger"],
}

TEXT_MODEL = "gemini-2.5-pro"
VISION_MODEL = "gemini-2.5-pro"
IMAGE_MODEL = "gemini-3-pro-image-preview"

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OR_TEXT_MODEL = "google/gemini-2.5-pro"
OR_IMAGE_MODEL = "google/gemini-3.1-flash-image-preview"
POOL_PACING_SECONDS = 20


def _client() -> Client:
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("GEMINI_API_KEY not loaded from profile .env")
    return Client(api_key=key)


RETRY_BACKOFFS = [5, 15, 45, 90]  # seconds between retries; total ~2.5 min of retrying
TRANSIENT_MARKERS = ("503", "429", "UNAVAILABLE", "RESOURCE_EXHAUSTED", "DEADLINE_EXCEEDED", "high demand", "quota")


def _is_transient(err: Exception) -> bool:
    msg = str(err)
    return any(m.lower() in msg.lower() for m in TRANSIENT_MARKERS)


def _with_retry(fn, label: str):
    """Call fn() with retry on transient Gemini errors (503/429/quota/timeout)."""
    last_err: Exception | None = None
    for i, delay in enumerate([0] + RETRY_BACKOFFS):
        if delay:
            print(f"[splash] {label} retry {i}/{len(RETRY_BACKOFFS)} after {delay}s…", file=sys.stderr)
            time.sleep(delay)
        try:
            return fn()
        except Exception as e:
            last_err = e
            if not _is_transient(e):
                raise
            print(f"[splash] {label} transient: {e}", file=sys.stderr)
    raise RuntimeError(f"{label} failed after {len(RETRY_BACKOFFS)} retries: {last_err}")


def _with_fallback(label: str, primary, fallback):
    """Try Gemini direct (primary) with retry. If it exhausts, try OpenRouter (fallback)
    once with a small retry. Only fall back on transient errors or exhausted retries."""
    try:
        return _with_retry(primary, f"{label}/gemini")
    except Exception as e:
        print(f"[splash] {label} gemini failed ({e}) — falling back to OpenRouter", file=sys.stderr)
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
            "X-Title": "island-splash-ads",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        raise RuntimeError(f"HTTP {e.code}: {body}")


def _or_text_call(model: str, system: str | None, user_parts: list) -> str:
    """user_parts: list of str (text) or {'path': str} (image)."""
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
    # Gemini image responses via OpenRouter: images[] with image_url.url data URIs
    for img in (msg.get("images") or []):
        url = (img.get("image_url") or {}).get("url") or img.get("url") or ""
        if url.startswith("data:"):
            return base64.b64decode(url.split(",", 1)[1])
    # Fallback shape: content list with image_url parts
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


# ── Flavor picking ───────────────────────────────────────────────────────────

def load_tally() -> dict:
    if TALLY_PATH.exists():
        return json.loads(TALLY_PATH.read_text())
    return {name: 0 for name in FLAVOR_TO_FILE}


def save_tally(tally: dict) -> None:
    TALLY_PATH.write_text(json.dumps(tally, indent=2))


def pick_flavors(count: int, produce_hints: list[str], tally: dict) -> list[str]:
    """Pick `count` flavors — pure least-used rotation. Produce hints used only
    to break ties when two flavors have the same usage count."""
    hints_lower = " ".join(produce_hints).lower()

    def keyword_score(flavor: str) -> int:
        # Negative score so higher match count sorts earlier as tiebreaker
        return -sum(1 for kw in FLAVOR_KEYWORDS.get(flavor, []) if kw in hints_lower)

    ordered = sorted(
        FLAVOR_TO_FILE.keys(),
        key=lambda f: (tally.get(f, 0), keyword_score(f), f),
    )
    return ordered[:count]


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

COMPOSER_SYSTEM = """You are a senior art director writing a final image-generation prompt for gemini-3-pro-image-preview. You will receive:
  - a REVERSE ANALYSIS of a reference ad (what's in it, verbatim)
  - a VIBE SHIFT analysis (the reference's pure cinematic aesthetic)
  - the Island Splash brand rules
  - the selected Island Splash flavor(s) to substitute into the ad

Your job: write the final prompt. The goal is to RECREATE the reference ad's subject, composition, and decorative elements faithfully, swapping ONLY the product for Island Splash bottle(s), and apply a color-grade overlay that shifts the palette toward the brand.

NON-NEGOTIABLE RULES WHEN WRITING THE PROMPT:
  1. Keep the reference's SUBJECT. If the ref has a snow leopard, keep the snow leopard. If it has a person holding a fruit, keep the person and the fruit. Do not drop the subject.
  2. Do NOT invent elements absent from the reference. If the reverse analysis says "NO splashes, NO produce, NO decorative elements," your prompt MUST forbid splashes/produce/decorative. No adding generic "juice-ad clichés" like bursting fruit, ice crystals, or juice droplets unless the reference had them.
  2a. NEVER instruct to preserve, keep, or render any of the reference's: text, headlines, taglines, body copy, URLs, phone numbers, logos, wordmarks, brand marks, watermarks, ghosted/repeated text patterns, or decorative typography. These are the reference brand's identity and do NOT belong in the Island Splash ad. Only the reference's SUBJECT (person, pose, product-grip, scene) and COMPOSITION (camera framing, text-zone positions) transfer. All text and logos in the output come from the Island Splash TEXT STRATEGY and LOGO blocks you write — nothing else.
  2b. FIRST SECTION OF YOUR OUTPUT is a FORBIDDEN IN OUTPUT bullet list. Read the REVERSE ANALYSIS and extract every single text string, headline, tagline, logo name, wordmark, brand name, URL, phone number, social handle, event badge, date string, booth number, decorative-type element, ghosted pattern, and watermark mentioned. Quote them verbatim in quotes. Be exhaustive — if the reverse analysis names 10 text strings, your list has at least 10 bullets. This list is the first thing the image model reads. Missing strings is a failure.
  3. The style overlay is a COLOR GRADE + LIGHTING + GRAIN + LENS FEEL on top of the recreated scene — NOT a repaint of the background. Take the Vibe Shift's lighting/grain/lens/contrast characteristics verbatim; replace its color-palette description with the Island Splash brand palette (dark teal #243C3C, warm golden orange #F0A86C, deep coral orange #E4843C, warm sand #A89078). The scene keeps its structure; colors shift.
  4. Text: match the reference's font feel (if ref has thin sans-serif, use thin sans-serif; if ref has heavy serif, use heavy serif). Colors from brand palette. Do NOT invent URLs, hashtags, pricing, phone numbers, social handles. Allowed text: flavor names from product labels, short brand vibe phrases (e.g., "Island Time," "Tropical"), short descriptors. If the reference has minimal/no text, keep the ad minimal/no text.
  5. Product replacement: swap the reference's product(s) for Island Splash bottle(s). The product images are provided as NUMBERED INPUTS. INPUT 1 is always the reference. INPUTS 2..N+1 are the Island Splash product images in the same order as the SELECTED FLAVORS list you receive. Reference them by input index in your PRODUCT REPLACEMENT block (e.g., "Bottle in the front-right position: paste INPUT 2 (Island Splash Mango Passion) as the bottle label, pixel-faithful, do not redraw"). Do NOT say "using the provided image" generically — always say the INPUT number. Do NOT redraw the label design; the INPUT image IS the label.
  5a. CAP COLOR IS A BRAND FACT: every Island Splash bottle has a matte BLACK cap — always, with no exceptions. The product INPUT images are cropped above the cap line, so do NOT infer cap color from them, and do NOT inherit the reference's cap color. Render ALL caps in the output as the SAME matte black, identical to each other. Mismatched cap colors (silver + black, white + black, etc.) are a failure.
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
  - The "PINEAPPLE - WHITE GRAPE - MANGO" and "STRAWBERRY - MANGO - GRAPEFRUIT" subtext
  - Any farmhouse/barn line-art on labels
  - Any sparkle/star decorative typography
None of these may appear in the output. The reference brand does not exist in the Island Splash ad.)

STRICT CONSTRAINTS:
(4 brand rules — palette, label preservation, no mascots/gym props, no hashtags/URLs)

REFERENCE SUBJECT & COMPOSITION:
(paragraph — keep subject X, keep composition Y, DO NOT add Z absent elements)

PRODUCT REPLACEMENT:
(the N products in ref → N Island Splash bottles. For each bottle, specify its scene position and the exact INPUT index whose label to paste pixel-faithful. Example: "Front-right bottle: paste INPUT 2 (Mango Passion) as the bottle label pixel-faithful; do not redraw." Cap/lid state matching ref (caps ON if on, OFF if off). CRITICAL: ALL caps MUST be matte BLACK — never inherit silver/white/colored caps from the reference image.)

TEXT STRATEGY:
(match ref's font feel + exact words to render in brand colors)

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


def build_brand_rules_block() -> str:
    if not RULES_PATH.exists():
        return ""
    rules = json.loads(RULES_PATH.read_text())
    parts: list[str] = []
    for r in rules.get("enforcement_additions", []):
        if r.get("active"):
            parts.append(f"- {r['text']}")
    return "\n".join(parts)


def compose_prompt(reverse: str, vibe: str, flavors: list[str]) -> str:
    rules_block = build_brand_rules_block()
    user = f"""REVERSE ANALYSIS:
{reverse}

VIBE SHIFT ANALYSIS:
{vibe}

SELECTED FLAVORS (in order, one per ref product): {", ".join(flavors)}

BRAND RULES (must be encoded in your STRICT CONSTRAINTS block):
{rules_block}

Now write the final image-generation prompt."""

    def gemini():
        client = _client()
        resp = client.models.generate_content(
            model=TEXT_MODEL,
            contents=[COMPOSER_SYSTEM, user],
        )
        return resp.candidates[0].content.parts[0].text.strip()

    def openrouter():
        return _or_text_call(OR_TEXT_MODEL, COMPOSER_SYSTEM, [user])

    return _with_fallback("compose_prompt", gemini, openrouter)


# ── Image generation ─────────────────────────────────────────────────────────

def _build_input_index(flavors: list[str], has_logo: bool) -> str:
    lines = [
        "INPUT IMAGE INDEX (the images attached to this request, in order):",
        "  INPUT 1 = REFERENCE ad. STRUCTURAL WIREFRAME ONLY — use it for subject placement, pose, composition, camera angle, and text-zone positions. DO NOT copy ANY of the following from INPUT 1 into the output: colors, background color/pattern, products, labels, caps, text, headlines, taglines, URLs, logos, wordmarks, brand marks, watermarks, ghosted/repeated text patterns, or decorative type. Every piece of text and every logo in the final image comes from Island Splash — not from INPUT 1. The reference brand does not exist in the output.",
    ]
    for i, flavor in enumerate(flavors):
        lines.append(
            f"  INPUT {i + 2} = Island Splash {flavor} product image. PASTE this label pixel-faithfully onto the corresponding bottle. Do NOT redraw, recolor, or restyle the label. If the product image is cropped above the cap, that does not matter — all caps are matte BLACK regardless."
        )
    if has_logo:
        lines.append(
            f"  INPUT {len(flavors) + 2} = Island Splash logo. Render SMALL — about 8% of the frame width — as a single discreet badge in ONE bottom corner. DO NOT render as a banner, lockup, or oversized wordmark. DO NOT add a box or background plate behind it. One placement, small, done."
        )
    return "\n".join(lines) + "\n\n"


def generate_image(
    ref_path: str,
    product_paths: list[str],
    logo_path: str,
    flavors: list[str],
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
    index_block = _build_input_index(flavors, has_logo)
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
    out_path: Path,
    ref_path: str,
    flavors: list[str],
    reverse: str,
    vibe: str,
    final_prompt: str,
) -> None:
    sidecar = out_path.with_suffix(".instructions.txt")
    sidecar.write_text(
        f"REF: {ref_path}\n"
        f"OUTPUT: {out_path}\n"
        f"FLAVORS: {', '.join(flavors)}\n"
        f"TIMESTAMP: {datetime.now().isoformat()}\n"
        f"\n=== REVERSE ANALYSIS ===\n{reverse}\n"
        f"\n=== VIBE SHIFT ANALYSIS ===\n{vibe}\n"
        f"\n=== FINAL IMAGE-GEN PROMPT ===\n{final_prompt}\n"
    )


# ── Main ─────────────────────────────────────────────────────────────────────

def run_one(ref_path: str) -> Path:
    """Run the full pipeline for a single ref. Returns output path."""
    if not os.path.exists(ref_path):
        raise FileNotFoundError(f"ref not found or unreadable: {ref_path}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]  # millisecond precision
    out_path = OUTPUT_DIR / f"splash_{ts}.png"

    print(f"[splash] reverse-engineering {ref_path}", file=sys.stderr)
    reverse = reverse_analyze(ref_path)
    product_count = parse_product_count(reverse)
    produce = parse_produce(reverse)
    print(f"[splash] ref has {product_count} product(s)", file=sys.stderr)

    tally = load_tally()
    flavors = pick_flavors(product_count, produce, tally)
    print(f"[splash] flavors: {', '.join(flavors)}", file=sys.stderr)

    print("[splash] vibe-shift analysis", file=sys.stderr)
    vibe = vibe_shift_analyze(ref_path)

    print("[splash] composing final prompt", file=sys.stderr)
    final_prompt = compose_prompt(reverse, vibe, flavors)

    product_paths: list[str] = []
    for flavor in flavors:
        p = PRODUCTS_DIR / FLAVOR_TO_FILE[flavor]
        if p.exists():
            product_paths.append(str(p))
        else:
            print(f"[splash] WARN: product image missing: {p}", file=sys.stderr)

    print(f"[splash] generating image → {out_path}", file=sys.stderr)
    generate_image(ref_path, product_paths, str(LOGO_PATH), flavors, final_prompt, out_path)

    save_sidecar(out_path, ref_path, flavors, reverse, vibe, final_prompt)

    for flavor in flavors:
        tally[flavor] = tally.get(flavor, 0) + 1
    save_tally(tally)

    return out_path


def list_pool() -> list[Path]:
    POOL_DIR.mkdir(parents=True, exist_ok=True)
    POOL_PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    refs: list[Path] = []
    for p in sorted(POOL_DIR.iterdir()):
        if p.is_file() and p.suffix.lower() in POOL_EXTS:
            refs.append(p)
    return refs


def run_pool() -> int:
    refs = list_pool()
    if not refs:
        print("[splash] pool is empty — nothing to do", file=sys.stderr)
        return 1
    print(f"[splash] pool has {len(refs)} ref(s); processing sequentially", file=sys.stderr)
    successes: list[tuple[str, Path]] = []
    failures: list[tuple[str, str]] = []
    for i, ref in enumerate(refs, 1):
        if i > 1:
            print(f"[splash] pacing {POOL_PACING_SECONDS}s before next ref…", file=sys.stderr)
            time.sleep(POOL_PACING_SECONDS)
        print(f"[splash] === pool {i}/{len(refs)}: {ref.name} ===", file=sys.stderr)
        try:
            out = run_one(str(ref))
            ref.rename(POOL_PROCESSED_DIR / ref.name)
            successes.append((ref.name, out))
            print(str(out))
            sys.stdout.flush()
        except Exception as e:
            print(f"[splash] FAIL on {ref.name}: {e}", file=sys.stderr)
            failures.append((ref.name, str(e)))
    print(
        f"[splash] pool done: {len(successes)} succeeded, {len(failures)} failed",
        file=sys.stderr,
    )
    for name, err in failures:
        print(f"[splash]   FAIL {name}: {err}", file=sys.stderr)
    return 0 if successes else 1


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: splash_run.py <ref_image_path> | --pool", file=sys.stderr)
        return 2

    if sys.argv[1] == "--pool":
        return run_pool()

    ref_path = sys.argv[1]
    if not os.path.exists(ref_path):
        print(f"ERROR: ref not found: {ref_path}", file=sys.stderr)
        return 2

    out_path = run_one(ref_path)
    print(str(out_path))
    return 0


if __name__ == "__main__":
    sys.exit(main())
