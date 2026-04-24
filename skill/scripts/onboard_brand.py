#!/usr/bin/env python3
"""
Onboard a new brand.

Usage:
  python3 skill/scripts/onboard_brand.py --name "Island Splash" --slug "island-splash"
  python3 skill/scripts/onboard_brand.py --interactive

This script creates:
  - brands/<slug>.json         (brand config)
  - brand_assets/<slug>/       (folder structure)
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path


def derive_slug(name: str) -> str:
    """Convert brand name to URL-safe slug."""
    slug = name.lower()
    slug = re.sub(r'[^a-z0-9\s-]', '', slug)
    slug = re.sub(r'[\s_]+', '-', slug)
    slug = slug.strip('-')
    return slug


def slugify(text: str) -> str:
    """Convert any text to URL-safe slug."""
    text = text.lower()
    text = re.sub(r'[^a-z0-9\s-]', '', text)
    text = re.sub(r'[\s_]+', '-', text)
    return text.strip('-')


def create_brand_config(args) -> dict:
    """Build the brand config dictionary."""
    
    # Ask for products if not provided
    products = []
    if args.products:
        for i, prod in enumerate(args.products):
            products.append({
                "name": prod,
                "label_file": f"{slugify(prod)}.png",
                "container": args.container or "bottle",
                "cap_rule": args.cap_rule or "match the product naturally",
                "keywords": slugify(prod).split('-'),
                "allowed_claims": [],
                "forbidden_text": []
            })
    
    # Default forbidden patterns
    default_forbidden = [
        {"pattern": "#", "severity": "error", "reason": "no hashtags in images"},
        {"pattern": "www.", "severity": "error", "reason": "no URLs in images"},
        {"pattern": ".com", "severity": "error", "reason": "no URLs in images"},
        {"pattern": "@", "severity": "error", "reason": "no social handles in images"},
        {"pattern": "FREE", "severity": "error", "reason": "no fake promotions"},
        {"pattern": "% OFF", "severity": "error", "reason": "no fake promotions"},
        {"pattern": "GIVEAWAY", "severity": "error", "reason": "no fake promotions"},
        {"pattern": "$", "severity": "warning", "reason": "no pricing"}
    ]
    
    # Add custom forbidden from args
    if args.forbidden:
        for item in args.forbidden:
            if ':' in item:
                pattern, reason = item.split(':', 1)
                default_forbidden.append({"pattern": pattern, "severity": "error", "reason": reason})
            else:
                default_forbidden.append({"pattern": item, "severity": "error", "reason": "user specified"})
    
    # Build the config
    config = {
        "schema_version": 1,
        "slug": args.slug or derive_slug(args.name),
        "display_name": args.name,
        
        "scheduling": {
            "posts_per_day": args.posts_per_day or 2,
            "time_slots": args.time_slots.split(',') if args.time_slots else ["09:00", "17:00"],
            "platforms": args.platforms.split(',') if args.platforms else ["instagram"],
            "instagram_account_id": "TODO: run blotato_list_accounts to get account ID",
            "carousel_max_slides": args.carousel_max or 10
        },
        
        "paths": {
            "logo_path": "",  # User will need to set this
            "products_dir": "",
            "ref_pool_dir": f"brand_assets/{args.slug or derive_slug(args.name)}/references",
            "output_dir": f"output/{args.slug or derive_slug(args.name)}"
        },
        
        "identity": {
            "vibe": args.vibe or "",
            "tagline": args.tagline or "",
            "palette": {
                "hex": args.colors.split(',') if args.colors else [],
                "description": args.palette_desc or ""
            },
            "prop_themes": args.prop_themes.split(',') if args.prop_themes else [],
            "forbidden_prop_themes": args.forbidden_props.split(',') if args.forbidden_props else []
        },
        
        "global_forbidden_text": default_forbidden,
        
        "ad_creative_rules": [
            args.creative_rule or "Product labels must match the provided product images exactly.",
            "No mascots, cartoon characters, or personified objects.",
            "Logo appears once, small, in a corner.",
            "Background must use ONLY brand palette colors."
        ],
        
        "products": products,
        
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat()
    }
    
    return config


def create_folder_structure(slug: str, products: list) -> list:
    """Create the brand folder structure. Returns list of created paths."""
    created = []
    base = Path("brand_assets") / slug
    
    # Main references folder
    refs_dir = base / "references"
    refs_dir.mkdir(parents=True, exist_ok=True)
    created.append(str(refs_dir))
    
    # Per-product reference folders
    for product in products:
        prod_slug = slugify(product['name'])
        prod_dir = refs_dir / prod_slug
        prod_dir.mkdir(parents=True, exist_ok=True)
        created.append(str(prod_dir))
    
    # Output folder
    output_dir = Path("output") / slug
    output_dir.mkdir(parents=True, exist_ok=True)
    created.append(str(output_dir))
    
    # Logo folder
    logo_dir = base / "logo"
    logo_dir.mkdir(parents=True, exist_ok=True)
    created.append(str(logo_dir))
    
    # Product images folder
    products_dir = base / "products"
    products_dir.mkdir(parents=True, exist_ok=True)
    created.append(str(products_dir))
    
    return created


def main():
    parser = argparse.ArgumentParser(description="Onboard a new brand")
    parser.add_argument("--name", required=True, help="Brand display name")
    parser.add_argument("--slug", help="URL-safe slug (auto-generated if not provided)")
    parser.add_argument("--tagline", help="Brand tagline/pitch")
    parser.add_argument("--vibe", help="Brand vibe (e.g. 'fun, tropical, Caribbean')")
    parser.add_argument("--palette-desc", help="Description of brand colors")
    parser.add_argument("--colors", help="Comma-separated hex colors (e.g. '#FF6B35,#00B4D8')")
    parser.add_argument("--products", nargs='+', help="Product names")
    parser.add_argument("--container", help="Product container type (default: bottle)")
    parser.add_argument("--cap-rule", help="Cap color rule for bottles")
    parser.add_argument("--prop-themes", help="Allowed prop themes (comma-separated)")
    parser.add_argument("--forbidden-props", help="Forbidden prop themes (comma-separated)")
    parser.add_argument("--platforms", help="Social platforms (default: instagram)")
    parser.add_argument("--time-slots", help="Post times (e.g. '09:00,17:00')")
    parser.add_argument("--posts-per-day", type=int, help="Posts per day (default: 2)")
    parser.add_argument("--carousel-max", type=int, help="Max carousel slides (default: 10)")
    parser.add_argument("--forbidden", nargs='+', help="Forbidden text patterns (pattern:reason)")
    parser.add_argument("--creative-rule", help="Custom creative rule")
    parser.add_argument("--dry-run", action='store_true', help="Show config without writing files")
    parser.add_argument("--skip-folders", action='store_true', help="Skip creating folders")
    
    args = parser.parse_args()
    
    # Generate slug
    slug = args.slug or derive_slug(args.name)
    args.slug = slug
    
    # Create config
    config = create_brand_config(args)
    
    # Show what we're creating
    print(f"\n=== ONBOARDING: {args.name} ({slug}) ===\n")
    
    if args.dry_run:
        print("DRY RUN - Config that would be created:")
        print(json.dumps(config, indent=2))
        return
    
    # Write brand config
    brands_dir = Path("brands")
    brands_dir.mkdir(exist_ok=True)
    config_path = brands_dir / f"{slug}.json"
    
    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2)
    print(f"✅ Created: {config_path}")
    
    # Create folder structure
    if not args.skip_folders:
        folders = create_folder_structure(slug, config['products'])
        for folder in folders:
            print(f"✅ Created: {folder}")
    
    # Update brands.json for dashboard
    brands_data_path = Path("website/public/data/brands.json")
    brands_data = []
    if brands_data_path.exists():
        with open(brands_data_path) as f:
            brands_data = json.load(f)
    
    # Remove existing entry if updating
    brands_data = [b for b in brands_data if b.get('slug') != slug]
    
    # Add new entry
    brands_data.append({
        "slug": slug,
        "name": args.name,
        "tagline": args.tagline or "",
        "products_count": len(config['products']),
        "status": "active",
        "added_at": datetime.now().isoformat()
    })
    
    # Write brands.json
    brands_data_path.parent.mkdir(parents=True, exist_ok=True)
    with open(brands_data_path, 'w') as f:
        json.dump(brands_data, f, indent=2)
    print(f"✅ Updated: {brands_data_path}")
    
    print(f"\n=== BRAND '{args.name}' IS READY ===\n")
    print(f"Next steps:")
    print(f"1. Add product images to: brand_assets/{slug}/products/")
    print(f"2. Add logo to: brand_assets/{slug}/logo/")
    print(f"3. Add reference photos using: add_refs.py")
    print(f"4. Edit {config_path} to set logo_path and products_dir")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
