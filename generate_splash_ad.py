#!/usr/bin/env python3
"""Generate an Island Splash branded ad from a reference image.

Usage:
    python3 generate_splash_ad.py <path_to_reference_image>
    python3 generate_splash_ad.py /home/drewp/hermes-11/references/web_xxx.jpg

Output goes to /home/drewp/hermes-11/generated/splash_{timestamp}.png
"""

import sys
import os
import random
import json
import re
from pathlib import Path
from datetime import datetime

# Load env
ENV_PATH = "/home/drewp/.hermes/profiles/hermes-11/.env"
with open(ENV_PATH) as f:
    for line in f:
        line = line.strip()
        if '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1)
            os.environ[k] = v

sys.path.insert(0, '/home/drewp/asset-ads/src')
from gemini import analyze_image, generate_image_v2, audit_image

BRAND = "Island Splash"
COLORS = "#243C3C (dark teal), #F0A86C (warm golden orange), #E4843C (deep coral orange), #A89078 (warm sand/tan)"
VIBE = "Key West meets Caribbean -- fun, laid-back, colorful, island time"
OUTPUT_DIR = Path("/home/drewp/hermes-11/generated")
LEARNING_FILE = Path("/home/drewp/asset-ads/formula_learning.json")
LOGO_PATH = "/home/drewp/.hermes/profiles/hermes-11/logos/island-splash/logo.png"
PRODUCTS_DIR = Path("/home/drewp/splash-website/assets/products")
PROCESSED_DIR = Path("/home/drewp/hermes-11/references/processed")
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

FLAVORS = [
    ("Mango Passion", ["mango", "passion fruit"]),
    ("Mauby", ["mauby", "bark"]),
    ("Peanut Punch", ["peanut", "peanuts"]),
    ("Lime", ["lime", "citrus"]),
    ("Guava Pine", ["guava", "pineapple"]),
    ("Sorrel", ["sorrel", "hibiscus"]),
    ("Pine Ginger", ["pineapple", "ginger"]),
]

CTA_OPTIONS = [
    "Tropical Vibes, Pure Flavor",
    "Shop Now",
    "Get Yours Today",
    "Taste the Tropics",
    "Sip the Island Life",
    "Real Fruit. Real Flavor.",
    "Island Time",
    "Pure Tropical Goodness",
]

SUBHEADLINE_OPTIONS = [
    "Tropical Vibes, Pure Flavor",
    "Taste the Tropics",
    "Sip the Island Life",
    "Real Fruit. Real Flavor.",
]


# ── Learning System ──────────────────────────────────────────────────────────

def load_learning():
    if LEARNING_FILE.exists():
        with open(LEARNING_FILE) as f:
            return json.load(f)
    return {
        "enforcement_additions": [],
        "prompt_additions": [],
        "known_issues": [],
        "total_audits": 0,
        "last_audit": None,
    }

def save_learning(learning):
    with open(LEARNING_FILE, "w") as f:
        json.dump(learning, f, indent=2)


# ── Product Selection ─────────────────────────────────────────────────────────

def pick_products(ref_product_count, ref_produce=None):
    """Pick N different flavors matching reference product count.
    If ref produce is described, match flavors to those tropical ingredients.
    """
    ref_produce = ref_produce or []
    ref_produce_lower = [p.lower() for p in ref_produce]

    # Try to match flavors to produce
    matched = []
    for flavor_name, keywords in FLAVORS:
        for keyword in keywords:
            for produce in ref_produce_lower:
                if keyword.lower() in produce or produce in keyword.lower():
                    if flavor_name not in [m[0] for m in matched]:
                        matched.append((flavor_name, keyword))
                        break

    # Fill remaining slots with random different flavors
    used = set(m[0] for m in matched)
    remaining_slots = max(0, ref_product_count - len(matched))
    remaining = [f for f in FLAVORS if f[0] not in used]
    random.shuffle(remaining)
    for name, _ in remaining[:remaining_slots]:
        matched.append((name, None))

    # If we still don't have enough, just pick random
    while len(matched) < ref_product_count:
        name, _ = random.choice(FLAVORS)
        if name not in [m[0] for m in matched]:
            matched.append((name, None))

    # Get product image paths
    product_images = list(PRODUCTS_DIR.glob("*.png")) + list(PRODUCTS_DIR.glob("*.jpg"))
    results = []
    for flavor_name, _ in matched[:ref_product_count]:
        path = None
        for img in product_images:
            if flavor_name.lower().replace(" ", "") in img.stem.lower().replace(" ", ""):
                path = str(img)
                break
        if not path and product_images:
            available = [img for img in product_images if img.stem not in [Path(r[1]).stem if r[1] else "" for r in results]]
            if available:
                path = str(random.choice(available))
        results.append((flavor_name, path))

    return results


# ── Analysis ─────────────────────────────────────────────────────────────────

ANALYSIS_PROMPT = """You are reverse-engineering this ad for pixel-perfect recreation. Analyze every structural detail as if you're writing a blueprint someone could build from.

SPATIAL GRID: Divide the image into a 3x3 grid (top/middle/bottom × left/center/right). Describe what occupies each zone.

PRODUCTS: [count] — For EACH product: container type, shape (round/square/tapered), cap/lid state (on/open/removed), angle (tilted/straight/facing), position in frame (which grid zone), size relative to image, shadow direction, surface it sits on.

PRODUCE: List every fruit/ingredient/leaf. For each: position, state (whole/sliced/splashing/floating/scattered), size, direction of movement if any.

TEXT LAYOUT: List ALL text in order of visual hierarchy:
  - H1 (biggest): exact words, font style (bold/script/sans/serif), color, position
  - H2 (medium): same detail
  - H3/fine print: same detail
  - Any text ON products (labels)

COLOR MAP: Describe the background color by zone (top-left is X, center is Y, bottom-right is Z). Note any gradients (direction, start/end colors), color blocking, or solid zones. Approximate hex values where possible.

BACKGROUND: Structure (solid color / gradient / photo scene / abstract). Any textures, patterns, or overlays visible.

SURFACE/TABLE: What is under the products? (marble, wood, water, ice, nothing/floating). Color and texture.

DECORATIVE ELEMENTS: List anything decorative that isn't product, produce, or text — arrows, badges, icons, borders, shapes, splashes, bubbles, sparkles, lines, frames. Position and style of each.

CTA: Call-to-action element — text, button style, color, position.

LIGHTING: Direction (left/right/center/top/bottom), quality (hard/soft/natural/artificial), highlights on products, shadow characteristics.

DEPTH: What's in the foreground vs background? Any blur/depth-of-field? Layer order of elements.

NEGATIVE SPACE: Where is empty space? How much of the image is "breathing room" vs filled?

MOOD KEYWORDS: 3-5 words capturing the overall feeling.

Be exhaustive — assume the reader has never seen this image and needs to recreate it from your description alone."""


def parse_analysis(analysis_text: str) -> dict:
    """Parse structured analysis output into a dict."""
    result = {
        "products": [],
        "produce": [],
        "text": [],
        "decorative": [],
        "lighting": "",
        "mood": "",
        "full_analysis": analysis_text,
    }

    lines = analysis_text.split("\n")
    current_section = None

    section_headers = ["SPATIAL GRID:", "PRODUCTS:", "PRODUCE:", "TEXT LAYOUT:",
                       "COLOR MAP:", "BACKGROUND:", "SURFACE/TABLE:",
                       "DECORATIVE ELEMENTS:", "CTA:", "LIGHTING:",
                       "DEPTH:", "NEGATIVE SPACE:", "MOOD KEYWORDS:",
                       "TEXT:", "LAYOUT:", "MOOD:", "REFERENCE_STYLE:"]

    list_sections = {"products", "produce", "text", "decorative"}

    for line in lines:
        line = line.strip()
        if not line:
            continue

        found_header = False
        for section in section_headers:
            if line.upper().startswith(section):
                current_section = section.lower().rstrip(":").replace(" ", "_").replace("/", "_")
                # Normalize some names
                if current_section == "text_layout":
                    current_section = "text"
                if current_section == "decorative_elements":
                    current_section = "decorative"
                if current_section == "mood_keywords":
                    current_section = "mood"
                content = line[len(section):].strip()
                if current_section in list_sections:
                    if content:
                        result[current_section].append(content)
                else:
                    result[current_section] = content
                found_header = True
                break

        if not found_header and current_section:
            if current_section in list_sections:
                result[current_section].append(line)
            else:
                result[current_section] += " " + line

    # Extract product count from PRODUCTS section
    products_text = " ".join(result["products"])
    count_match = re.search(r'PRODUCTS:\s*(\d+)', products_text, re.IGNORECASE)
    if count_match:
        result["product_count"] = int(count_match.group(1))
    else:
        # Fallback: digits before product-related words
        count_match = re.search(r'\b(\d+)\s*(?:products?|items?|bottles?|cans?|flavors?|varieties?|distinct|different|separate|clear|glass|plastic)\b', products_text, re.IGNORECASE)
        if count_match:
            result["product_count"] = int(count_match.group(1))
        else:
            # Word numbers
            word_nums = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8}
            word_pattern = r'\b(' + '|'.join(word_nums.keys()) + r')\s*(?:products?|items?|bottles?|cans?|flavors?|varieties?|distinct|different|separate|clear|glass|plastic)\b'
            count_match = re.search(word_pattern, products_text, re.IGNORECASE)
            if count_match:
                result["product_count"] = word_nums[count_match.group(1).lower()]
            else:
                # Count explicit "Bottle N:" or "Product N:" patterns
                bottle_patterns = re.findall(r'(?:Bottle|Product|Container)\s*\d', products_text, re.IGNORECASE)
                if bottle_patterns:
                    result["product_count"] = len(bottle_patterns)
                else:
                    result["product_count"] = 1

    return result


# ── Prompt Builder ────────────────────────────────────────────────────────────

def build_prompt(analysis: str, products: list, learning: dict) -> str:
    """Build the transformation prompt from forensic analysis."""
    cta = random.choice(CTA_OPTIONS)
    subheadline = random.choice(SUBHEADLINE_OPTIONS)
    flavor_names = [p[0] for p in products]
    flavor_list = ", ".join(flavor_names)

    # Use analysis to generate a dynamic style overlay description
    vibe_block = f'Based on the reference analysis above, apply a cinematic style overlay at FULL strength (100% influence) over the entire image. Use film/color/lighting terminology: describe the treatment as if grading a film scene — film stock characteristics, color temperature shifts, shadow tone, highlight behavior, grain/texture. The overlay should completely unify the mood, color grade, and visual texture of the entire image into one cohesive cinematic look.'

    base_prompt = f"""Transform this reference ad into an Island Splash branded Instagram ad (4:5).

=== BRAND ===
- Island Splash: Florida Caribbean juice brand
- Colors: {COLORS}
- Vibe: {VIBE}
- Flavors: Mango Passion, Mauby, Peanut Punch, Lime, Guava Pine, Sorrel, Pine Ginger

=== REFERENCE ANALYSIS ===
{analysis}

=== TRANSFORMATION ===

1. REPLACE PRODUCTS:
   The reference shows {len(products)} product(s): {flavor_list}.
   Show ALL {len(products)} products in the ad — match the reference's product count exactly.
   Each product uses a DIFFERENT flavor — they are provided as separate product images in this request.
   For EACH product: render it to match the REFERENCE PRODUCT STYLE — same lighting feel, same angle, same contrast, same focus quality, same presentation style.
   The product images provided ARE the products. Their labels must appear EXACTLY as shown — do NOT redraw, modify, or invent new labels. The label content, fonts, layout, and colors from the provided product image must be preserved perfectly.
   Place each product where a reference product was. Add soft shadows to ground them.
   PRODUCT SHARPNESS: Bottles/containers must be crystal clear and sharp — crisp label edges, defined cap/closure details, no blur or softness on the product itself.
   LIDS: If decorative produce/fruit is shown flowing, splashing, or emerging from the product, the lid or cap must be REMOVED or OPEN. Bottles with flowing ingredients do not have caps on.

2. REPLACE PRODUCE/DECORATIVE:
   The reference shows decorative produce/ingredients. TRANSFORM these to match the Island Splash flavors.
   Example: reference shows watermelon → replace with mango/pineapple/passion fruit for Mango Passion flavor.
   Keep the decorative feel -- tropical, fresh, healthy -- but make ingredients match what our flavors contain.

3. REPLACE TEXT:
   - Brand names/logos from reference → NEVER appear. Replace with Island Splash.
   - Pricing, phone numbers, website URLs, social handles, QR codes → REMOVE entirely. Do NOT add any URL or website name.
   - Generic quality/descriptive text (health claims, flavor descriptions, ingredient lists) → transform to describe Island Splash flavors.
   - Keep text positioning similar to reference layout.
   - Do NOT generate new text, taglines, CTAs, or URLs. Leave text areas blank if no Island Splash text fits.

4. BRAND COLORS:
   Transform background/brand colors to Island Splash palette: dark teal, warm golden orange, deep coral orange, warm sand.

5. LAYOUT & MOOD:
   Preserve the compositional layout, visual hierarchy, and mood of the reference.
   VARY THE PRODUCT ARRANGEMENT: Do NOT always place products in the same position or rotation. Mix it up:
   - Some ads: products at center, some: products at corners, some: diagonal placement
   - Rotate product angles differently per ad
   - Vary the visual weight -- sometimes one dominant product, sometimes evenly distributed
   Each ad should look visually distinct from others.

6. LOGO:
   Island Splash logo is the LAST image in this request. Place it once as a clean corner badge (top-right or bottom-right). Small, no effects, no boxes around it.

7. STYLE OVERLAY (LAST — SUBTLE):
   {vibe_block}

=== OUTPUT ===
Instagram ad (4:5) featuring {flavor_list}. Reference layout, brand colors, dynamic text. Unified by a cohesive style overlay that makes everything feel like one shot. Professional and polished."""

    # Apply any learning
    for addition in learning.get("prompt_additions", []):
        if addition.get("active"):
            base_prompt += "\n\n" + addition["text"]

    return base_prompt


def build_enforcement(learning: dict) -> str:
    """Build enforcement block with learning rules at TOP."""
    # Learning rules go first so they take priority
    learning_rules = ""
    for addition in learning.get("enforcement_additions", []):
        if addition.get("active"):
            learning_rules += "\n" + addition["text"]

    base = """STRICT CONSTRAINTS:
1. PRESERVE PRODUCT LABELS: Island Splash product images -- keep labels EXACTLY as provided. Do NOT modify, recolor, or strip labels. The product label IS the brand.
2. PRODUCT STYLE MATCH: Render each product to match the reference product's look -- same lighting, angle, focus, quality.
3. STYLE OVERLAY: A dynamic style overlay MUST be applied as the FINAL step over the entire image — products, produce, background, text, everything. This unifies the composition and masks compositing seams.
4. PRODUCT SHARPNESS: Bottles/containers must be rendered CRYSTAL SHARP — crisp label text, defined edges, no blur or softness on the product.
5. LIDS: If produce/fruit is flowing, splashing, or emerging from the product, the lid/cap must be REMOVED or OPEN. No caps on bottles with flowing ingredients.
6. MULTIPLE PRODUCTS: If the reference shows N products, the ad MUST show N products, each with a DIFFERENT Island Splash flavor. Flavors are selected from the least-used pool to keep rotation balanced across all generations.
7. NO FOREIGN OBJECTS: Only show Island Splash products and transformed produce. No extra food/drinks/items.
8. NO REFERENCE BRANDING: Remove ALL text, logos, brand names from reference image.
9. NO URLS: Do NOT add any website URL, domain name, or "www" text. Island Splash has no website in the ads.
10. NO GENERATED LABELS: The product label MUST come EXACTLY from the provided product image. Do NOT create, modify, redraw, or invent new labels. If a product image is provided, use its label as-is.
11. LOGO: Place Island Splash logo once as small corner badge. No effects, no boxes."""

    return learning_rules + "\n" + base if learning_rules else base


# ── Audit ─────────────────────────────────────────────────────────────────────

AUDIT_PROMPT = """Audit this Island Splash ad. For each check, answer YES (correct) or NO (problem).

CHECKS:
1. BRAND COLORS: Does the ad use Island Splash colors (dark teal, golden orange, coral, sand)?
2. PRODUCTS: Are Island Splash products shown with correct labels? Describe what's shown.
3. PRODUCE: Is decorative produce tropical and matching Island Splash flavors? What produce is visible?
4. TEXT: Is text brand-appropriate (no pricing, phone numbers, website URLs, or reference brand names)?
5. LOGO: Is the Island Splash logo visible, clean, and in a corner? Describe placement.
6. BLEND QUALITY: Do products look naturally placed with proper shadows and lighting?
7. LAYOUT: Does the layout match the reference ad's compositional structure?
8. QUALITY (1-10): Overall quality rating.
9. PROBLEMS: List any specific issues you see. Be exact.

Respond in this format:
BRAND_COLORS: YES/NO
PRODUCTS: [description or NONE]
PRODUCE: [description or NONE]
TEXT_ISSUES: YES/NO [issues]
LOGO: YES/NO [description]
BLEND: YES/NO
LAYOUT: YES/NO
QUALITY: [1-10]
PROBLEMS: [list of specific issues, or NONE]"""

def run_audit(image_path: str) -> dict:
    """Run audit on generated image and return findings."""
    try:
        result = audit_image(image_path, AUDIT_PROMPT)
        if result.get("success"):
            return {"success": True, "analysis": result.get("analysis", "")}
    except Exception as e:
        pass

    # Fallback: simple file check
    if os.path.exists(image_path):
        return {"success": True, "analysis": "Audit skipped -- image exists."}
    return {"success": False, "analysis": "Audit failed."}

def process_audit(audit_result: dict, output_path: str, timestamp: str, learning: dict):
    """Process audit findings and update learning."""
    if not audit_result.get("success"):
        return learning

    analysis = audit_result.get("analysis", "").upper()
    issues = []

    # Detect issues from audit text
    if "BRAND_COLORS: NO" in analysis:
        issues.append("brand_colors_wrong")
    if "PRODUCTS: NONE" in analysis or "NOT SHOW" in analysis:
        issues.append("products_missing_or_wrong")
    if "TEXT_ISSUES: YES" in analysis:
        issues.append("text_brand_inappropriate")
    if "LOGO: NO" in analysis:
        issues.append("logo_missing_or_bad")
    if "BLEND: NO" in analysis:
        issues.append("blend_quality_poor")
    if "LAYOUT: NO" in analysis:
        issues.append("layout_not_preserved")

    # Quality check
    for line in analysis.split("\n"):
        if line.startswith("QUALITY:"):
            try:
                score = float(line.split(":")[1].strip())
                if score < 6:
                    issues.append(f"low_quality_{score}")
            except:
                pass

    # Update learning
    learning["total_audits"] = learning.get("total_audits", 0) + 1
    learning["last_audit"] = timestamp
    learning["known_issues"] = list(set(learning.get("known_issues", []) + issues))

    # Smart enforcement additions based on issues
    enforcement_fixes = {
        "brand_colors_wrong": "\n7. COLORS: Ensure background and color grade use ONLY Island Splash palette (dark teal, golden orange, coral, sand). Replace ALL reference colors with brand colors.",
        "products_missing_or_wrong": "\n7. PRODUCTS: Island Splash products MUST appear. Place each product clearly in the scene. Do not omit products.",
        "text_brand_inappropriate": "\n7. TEXT: All text must be brand-appropriate. No pricing, phone numbers, website URLs, social handles, or reference brand names. Replace with Island Splash messaging.",
        "logo_missing_or_bad": "\n7. LOGO: Island Splash logo MUST appear once as a clean corner badge. Small, no effects.",
        "blend_quality_poor": "\n7. BLENDING: Products must look naturally placed -- soft shadows, proper lighting integration. Not floating or pasted.",
        "layout_not_preserved": "\n7. LAYOUT: Match the reference layout structure. Products, text, and scene elements should be in the same compositional positions.",
    }

    existing_enforcement = set(e["rule"] for e in learning.get("enforcement_additions", []))
    for issue in issues:
        rule = enforcement_fixes.get(issue)
        if rule and issue not in existing_enforcement:
            learning.setdefault("enforcement_additions", []).append({
                "rule": issue,
                "text": rule,
                "active": True,
                "triggered_at": timestamp,
            })

    save_learning(learning)
    return learning


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 generate_splash_ad.py <path_to_reference_image>")
        sys.exit(1)

    ref_path = sys.argv[1]
    if not os.path.exists(ref_path):
        print(f"ERROR: Reference image not found: {ref_path}")
        sys.exit(1)

    OUTPUT_DIR.mkdir(exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_path = OUTPUT_DIR / f"splash_{timestamp}.png"

    # Load learning
    learning = load_learning()
    print(f"[Island Splash] Loaded {learning.get('total_audits', 0)} prior audits, {len(learning.get('enforcement_additions', []))} active rules")

    # Step 1: Forensic analysis
    print(f"[Island Splash] Analyzing {ref_path}...")
    analysis_result = analyze_image(ref_path, ANALYSIS_PROMPT)
    if not analysis_result.get("success"):
        print(f"ERROR analyzing image: {analysis_result.get('error')}")
        sys.exit(1)

    analysis = analysis_result.get("analysis", "")
    print(f"[Island Splash] Analysis complete")

    # Step 2: Parse structured analysis
    parsed = parse_analysis(analysis)
    ref_product_count = min(parsed.get("product_count", 1), 7)
    produce_found = parsed.get("produce", [])
    print(f"[Island Splash] Detected ~{ref_product_count} products, {len(produce_found)} produce items")

    # Step 3: Pick products
    products = pick_products(ref_product_count, produce_found)
    flavor_names = [p[0] for p in products]
    print(f"[Island Splash] Flavors: {', '.join(flavor_names)}")

    # Step 4: Build prompt with learning applied
    generation_prompt = build_prompt(analysis, products, learning)
    enforcement = build_enforcement(learning)

    print(f"[Island Splash] Generating ad...")

    # Build product image paths
    product_image_paths = []
    for name, path in products:
        if path and os.path.exists(path):
            product_image_paths.append(path)

    logo_paths = []
    if os.path.exists(LOGO_PATH):
        logo_paths.append(LOGO_PATH)

    # Logo is last
    all_paths = product_image_paths + logo_paths

    # Generate
    result = generate_image_v2(
        reference_image_path=ref_path,
        product_image_paths=all_paths,
        generation_prompt=generation_prompt,
        output_path=str(output_path),
        aspect_ratio="4:5",
        enforcement_level="stricter",
        custom_enforcement=enforcement,
    )

    if not result.get("success"):
        print(f"ERROR: {result.get('error')}")
        print("[Island Splash] Retrying generation...")
        result = generate_image_v2(
            reference_image_path=ref_path,
            product_image_paths=all_paths,
            generation_prompt=generation_prompt,
            output_path=str(output_path),
            aspect_ratio="4:5",
            enforcement_level="stricter",
            custom_enforcement=enforcement,
        )

    if result.get("success"):
        print(f"[Island Splash] SUCCESS: {output_path}")

        # Move ref to processed so it's not picked up again
        ref_path_obj = Path(ref_path)
        if ref_path_obj.exists() and str(ref_path_obj.parent) == "/home/drewp/hermes-11/references":
            processed_path = PROCESSED_DIR / ref_path_obj.name
            ref_path_obj.rename(processed_path)
            print(f"[Island Splash] Moved {ref_path_obj.name} to processed/")

        # Step 5: Audit
        print("[Island Splash] Running audit...")
        audit_result = run_audit(str(output_path))
        if audit_result.get("success"):
            print(f"[Island Splash] Audit: {audit_result.get('analysis', '')[:200]}")
            learning = process_audit(audit_result, str(output_path), timestamp, learning)
            print(f"[Island Splash] {len(learning.get('enforcement_additions', []))} active learning rules")
    else:
        print(f"ERROR on retry: {result.get('error')}")


if __name__ == "__main__":
    main()
