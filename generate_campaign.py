#!/usr/bin/env python3
"""
Asset Ads Campaign Generator

Takes approved refs and generates:
1. Individual ads via asset_ads.py
2. Posts (carousel of ads + captions)

Usage:
    python3 generate_campaign.py island-splash drinks
"""

import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent
STATE_DIR = REPO_ROOT / "state"
OUTPUT_DIR = REPO_ROOT / "output"


def get_pool_dir(brand: str, category: str) -> Path:
    """Get pool directory from brand config."""
    config_path = REPO_ROOT / "brands" / f"{brand}.json"
    if config_path.exists():
        cfg = json.loads(config_path.read_text())
        pool_dir = cfg.get("paths", {}).get("pool_dir")
        if pool_dir:
            return Path(pool_dir)
    return REPO_ROOT / "brand_assets" / brand / category


def get_approved_refs(brand: str, category: str) -> list[Path]:
    """Get list of approved ref files."""
    pool_dir = get_pool_dir(brand, category)
    approved_dir = pool_dir / "approved"

    if not approved_dir.exists():
        return []

    refs = []
    for f in sorted(approved_dir.iterdir()):
        if f.suffix.lower() in [".jpg", ".jpeg", ".png", ".webp"]:
            refs.append(f)

    return refs


def generate_ad(brand: str, ref_path: Path) -> dict:
    """Run asset_ads.py on a single ref."""
    print(f"Generating ad from {ref_path.name}...")

    cmd = [
        "python3",
        str(REPO_ROOT / "asset_ads.py"),
        "--brand", brand,
        str(ref_path),
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=str(REPO_ROOT),
            timeout=300,
        )

        if result.returncode == 0:
            # Last line is the output path
            output_path = result.stdout.strip().split("\n")[-1]
            print(f"  ✓ Generated: {output_path}")
            return {
                "success": True,
                "ref": str(ref_path),
                "output": output_path,
            }
        else:
            print(f"  ✗ Failed: {result.stderr}")
            return {
                "success": False,
                "ref": str(ref_path),
                "error": result.stderr,
            }
    except Exception as e:
        print(f"  ✗ Error: {e}")
        return {
            "success": False,
            "ref": str(ref_path),
            "error": str(e),
        }


def create_post(brand: str, ads: list[dict]) -> dict:
    """Create a carousel post from generated ads."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    post_dir = OUTPUT_DIR / "posts" / f"{brand}_{timestamp}"
    post_dir.mkdir(parents=True, exist_ok=True)

    # Copy ads to post dir
    ad_paths = []
    for i, ad in enumerate(ads):
        if ad.get("success") and ad.get("output"):
            src = Path(ad["output"])
            if src.exists():
                dst = post_dir / f"ad_{i+1:02d}{src.suffix}"
                import shutil
                shutil.copy(src, dst)
                ad_paths.append(str(dst))

    # Generate caption
    caption = generate_caption(brand, len(ad_paths))

    post_data = {
        "id": f"{brand}_{timestamp}",
        "brand": brand,
        "created_at": datetime.now().isoformat(),
        "ad_count": len(ad_paths),
        "ad_paths": ad_paths,
        "caption": caption,
        "hashtags": "#IslandSplash #TropicalFlavors #NaturalIngredients #CaribbeanJuice #IslandLife",
    }

    # Save post metadata
    (post_dir / "post.json").write_text(json.dumps(post_data, indent=2))

    return post_data


def generate_caption(brand: str, ad_count: int) -> str:
    """Generate caption for the post."""
    captions = [
        "Tropical vibes in every sip 🌴\n\nPure Caribbean flavor, natural ingredients.",
        "Escape to the islands 🍹\n\nReal fruit, real flavor, real refreshment.",
        "Island fresh, always ✨\n\nPure tropical juice made with love.",
    ]
    return captions[ad_count % len(captions)]


def main():
    if len(sys.argv) < 3:
        print("Usage: python3 generate_campaign.py <brand> <category>")
        sys.exit(1)

    brand = sys.argv[1]
    category = sys.argv[2]

    print(f"\n=== Campaign Generator ===")
    print(f"Brand: {brand}")
    print(f"Category: {category}")

    # Get approved refs
    refs = get_approved_refs(brand, category)
    if not refs:
        print("No approved refs found!")
        sys.exit(1)

    print(f"\nFound {len(refs)} approved refs")

    # Generate ads
    ads = []
    for ref in refs:
        result = generate_ad(brand, ref)
        ads.append(result)

    successful = [a for a in ads if a["success"]]
    print(f"\nGenerated {len(successful)}/{len(ads)} ads successfully")

    if successful:
        # Create post
        post = create_post(brand, successful)
        print(f"\n=== Post Created ===")
        print(f"ID: {post['id']}")
        print(f"Ads: {post['ad_count']}")
        print(f"Caption: {post['caption'][:50]}...")
        print(f"\nPost directory: {OUTPUT_DIR / 'posts' / post['id']}")

    # Update state
    try:
        subprocess.run(
            ["python3", str(REPO_ROOT / "state_manager.py"), "used", brand, str(len(successful))],
            cwd=str(REPO_ROOT),
            check=True,
        )
    except Exception as e:
        print(f"Failed to update state: {e}")


if __name__ == "__main__":
    main()
