#!/usr/bin/env python3
"""
Generate a unique brand caption + hashtags for a carousel post.
Analyzes the actual ad images (via instruction files) to build contextually relevant copy.

Usage:
  python3 skill/scripts/generate_caption.py --brand island-splash --ad-files splash_20260420_103950.png,splash_20260421_142132.png
  python3 skill/scripts/generate_caption.py --brand island-splash --products "Mango Passion, Sorrel"  # legacy mode
"""

import argparse
import json
import random
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
ADS_DIR = REPO_ROOT / "website/public/images/ads"
OUTPUT_DIR = REPO_ROOT / "output"
OUTPUT_DIR.mkdir(exist_ok=True)


def extract_products_from_instruction_file(brand: str, filename: str) -> list[str]:
    """Read the instruction file for an ad to extract real product names.
    Handles both plain filenames (no extension) and full filenames with .png."""
    # Strip extension if present so we can construct the instruction file path reliably
    base = filename.replace('.png', '').replace('.jpg', '').replace('.jpeg', '')
    inst_path = ADS_DIR / brand / f"{base}.instructions.txt"
    if not inst_path.exists():
        return []
    try:
        content = inst_path.read_text()
        m = re.search(r"^PRODUCTS:\s*(.+)$", content, re.MULTILINE)
        if m:
            return [p.strip() for p in m.group(1).split(",")]
    except OSError:
        pass
    return []


def extract_key_themes(brand: str, filenames: list[str]) -> list[str]:
    """Pull flavor keywords and visual themes from instruction files."""
    themes = []
    keywords = ["tropical", "citrus", "spicy", "sweet", "refreshing", "caribbean",
                "fresh", "natural", "fruit", "juice", "zesty", "bold", "smooth"]
    for fname in filenames:
        inst_path = ADS_DIR / brand / f"{fname}.instructions.txt"
        if inst_path.exists():
            try:
                text = inst_path.read_text().lower()
                for kw in keywords:
                    if kw in text:
                        themes.append(kw)
            except OSError:
                pass
    return themes


def load_brand_config(brand: str) -> dict:
    path = REPO_ROOT / "brands" / f"{brand}.json"
    if not path.exists():
        return {}
    with open(path) as f:
        return json.load(f)


def hashtags_allowed(brand: str) -> bool:
    cfg = load_brand_config(brand)
    forbidden = cfg.get("global_forbidden_text", [])
    return not any(rule.get("pattern") == "#" and rule.get("severity") == "error" for rule in forbidden)


def load_state(brand: str) -> dict:
    state_path = OUTPUT_DIR / f"{brand}_caption_state.json"
    if state_path.exists():
        with open(state_path) as f:
            return json.load(f)
    return {"used_captions": [], "used_hashtags": []}


def save_state(brand: str, state: dict) -> None:
    state_path = OUTPUT_DIR / f"{brand}_caption_state.json"
    with open(state_path, "w") as f:
        json.dump(state, f)


# ----------------------------------------------------------------
# Dynamic caption generation
# ----------------------------------------------------------------

ADJECTIVES = [
    "Tropical", "Caribbean", "Island", "Fresh", "Pure", "Bold",
    "Zesty", "Sun-Kissed", "Natural", "Vibrant", "Real", "Handcrafted",
]

PHRASES = [
    "flavors straight from the island 🌴",
    "taste of the tropics 🍹",
    "sips that hit different 🌺",
    "pure island energy ✨",
    "the Caribbean in a bottle 🏝️",
    "juice with soul 🌴",
    "made with island sunshine ☀️",
    "straight from the source 🌿",
    "real fruit, real flavor 🍍",
    "escape to the islands 🌊",
    "tropical vibes in every sip 🍈",
    "the Caribbean says cheers 🥂",
    "island crafted, juice approved 🥥",
    "your daily tropical reset 🍹",
    "when the Caribbean calls, we answer 🌴",
]

CLOSINGS = [
    "What's your favorite tropical combo? 👇",
    "Which one would you reach for first? 🍹",
    "Tag someone who needs this! 🏝️",
    "Sip and share 🌴",
    "Caribbean approved ✅",
    "Tag a tropical lover 🌺",
    "Drop a 🍹 if you're thirsty",
    "Which flavor speaks to you? 👇",
]


def build_dynamic_caption(brand: str, products: list[str], themes: list[str]) -> str:
    """Build a caption that's actually informed by the products and themes."""
    adj = random.choice(ADJECTIVES)
    phrase = random.choice(PHRASES)

    if products:
        unique_products = list(dict.fromkeys(products))  # dedupe preserving order
        if len(unique_products) == 1:
            product_str = f"{unique_products[0]}"
        elif len(unique_products) == 2:
            product_str = f"{unique_products[0]} & {unique_products[1]}"
        else:
            product_str = f"{', '.join(unique_products[:-1])} & {unique_products[-1]}"

        parts = [
            f"{adj} {phrase}",
            f"({product_str})",
            random.choice(CLOSINGS),
        ]
    else:
        parts = [
            f"{adj} {phrase}",
            random.choice(CLOSINGS),
        ]

    return "  \n".join(parts)


# ----------------------------------------------------------------
# Hashtag generation — optimized for reach
# ----------------------------------------------------------------

BASE_HASHTAGS = {
    "island-splash": [
        "#IslandSplash", "#TropicalFlavors", "#CaribbeanJuice", "#NaturalIngredients",
        "#TropicalDrinks", "#CaribbeanStyle", "#IslandVibes", "#FreshJuice",
        "#TropicalJuice", "#CaribbeanMade", "#IslandLife", "#NaturalJuice",
        "#TropicalBeverage", "#CaribbeanCuisine", "#FreshTropical",
    ],
    "cinco-h-ranch": [
        "#CincoHRanch", "#TexasMade", "#NaturalSkincare", "#RanchStandard",
        "#TexasSkincare", "#RanchRemedies", "#HomesteadBeauty", "#TexasStyle",
        "#NaturalRanch", "#HeritageSkincare", "#TexasCraft", "#RanchLife",
    ],
}

TRENDING_TAGS = [
    "#fyp", "#foryou", "#foryoupage", "#viral", "#trending",
    "#reels", "#reelsinstagram", "#instagramreels",
    "#foodie", "#foodporn", "#foodstagram",
    "#health", "#healthy", "#healthylifestyle", "#natural",
    "#tropical", "#tropicalvibes", "#caribbean", "#caribbeanstyle",
    "#smallbusiness", "#shoplocal", "# поддержка",
]

PRODUCT_TAGS = {
    "mango": ["#Mango", "#MangoJuice", "#MangoPassion", "#TropicalMango"],
    "passion": ["#PassionFruit", "#PassionFruitJuice", "#Passiona"],
    "sorrel": ["#Sorrel", "#SorrelDrink", "#CaribbeanSorrel", "#SorrelTea"],
    "guava": ["#Guava", "#GuavaJuice", "#TropicalGuava", "#GuavaPine"],
    "pine": ["#Pineapple", "#PineGinger", "#TropicalPine", "#PineAppleJuice"],
    "ginger": ["#Ginger", "#GingerShot", "#GingerHealth", "#GingerRoot"],
    "mauby": ["#Mauby", "#MaubyBark", "#CaribbeanMauby", "#MaubyDrink"],
    "peanut": ["#PeanutPunch", "#PeanutDrink", "#CaribbeanPeanut", "#NutMilk"],
    "lime": ["#Lime", "#LimeJuice", "#Citrus", "#KeyLime"],
    "citrus": ["#Citrus", "#CitrusJuice", "#FreshCitrus", "#OrangeCitrus"],
}


def build_hashtag_set(brand: str, products: list[str]) -> list[str]:
    """Build a diverse hashtag set: brand tags + product tags + 1 trending."""
    selected = set()
    product_lower = [p.lower() for p in products]

    # Always include brand base tags (2-3)
    brand_tags = BASE_HASHTAGS.get(brand, BASE_HASHTAGS["island-splash"])
    selected.update(random.sample(brand_tags, min(3, len(brand_tags))))

    # Add product-specific tags (1-2 per product)
    for pl in product_lower:
        for key, tags in PRODUCT_TAGS.items():
            if key in pl:
                selected.update(random.sample(tags, min(2, len(tags))))

    # Add exactly 1 trending/engagement tag to stay under the 5 cap
    trending = random.sample(TRENDING_TAGS, 1)
    selected.update(trending)

    # Cap at 5 total
    return list(selected)[:5]


def generate_unique_caption(brand: str, state: dict, products: list[str], themes: list[str]) -> str:
    """Generate a caption and track to avoid repeats."""
    for _ in range(20):
        caption = build_dynamic_caption(brand, products, themes)
        if caption not in state["used_captions"]:
            state["used_captions"].append(caption)
            return caption
    # Reset if stuck
    state["used_captions"] = []
    caption = build_dynamic_caption(brand, products, themes)
    state["used_captions"].append(caption)
    return caption


def generate_unique_hashtags(brand: str, state: dict, products: list[str]) -> str:
    """Generate a hashtag set and track to avoid repeats."""
    for _ in range(20):
        tags = build_hashtag_set(brand, products)
        tag_str = " ".join(tags)
        if tag_str not in state["used_hashtags"]:
            state["used_hashtags"].append(tag_str)
            return tag_str
    state["used_hashtags"] = []
    tags = build_hashtag_set(brand, products)
    tag_str = " ".join(tags)
    state["used_hashtags"].append(tag_str)
    return tag_str


def generate(brand: str, ad_filenames: list[str] = None, products: list[str] = None, dry_run: bool = False):
    """Main generation — reads instruction files when ad_filenames are provided."""
    if products is None:
        products = []

    # Extract real product names from instruction files
    if ad_filenames:
        for fname in ad_filenames:
            extracted = extract_products_from_instruction_file(brand, fname)
            for p in extracted:
                if p not in products:
                    products.append(p)
        themes = extract_key_themes(brand, ad_filenames)
    else:
        themes = []

    state = load_state(brand)

    caption = generate_unique_caption(brand, state, products, themes)
    hashtags = generate_unique_hashtags(brand, state, products) if hashtags_allowed(brand) else ""

    if not dry_run:
        save_state(brand, state)

    return {
        "caption": caption,
        "hashtags": hashtags,
        "brand": brand,
        "products": products,
        "themes": themes,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate unique brand caption + hashtags")
    parser.add_argument("--brand", required=True, help="Brand slug")
    parser.add_argument("--ad-files", help="Comma-separated ad filenames to analyze")
    parser.add_argument("--products", help="Comma-separated product names (fallback when no ad-files)")
    parser.add_argument("--dry-run", action="store_true", help="Don't save state")
    args = parser.parse_args()

    ad_files = [f.strip() for f in args.ad_files.split(",")] if args.ad_files else None
    products = [p.strip() for p in args.products.split(",")] if args.products else []

    result = generate(args.brand, ad_files, products, args.dry_run)

    print(f"Caption: {result['caption']}")
    print(f"Hashtags: {result['hashtags']}")
    if result.get("products"):
        print(f"Products: {', '.join(result['products'])}")

    if args.dry_run:
        print("\n(dry-run — state not saved)")
