#!/usr/bin/env python3
"""
Asset Ads Pipeline — Full flow from refs to scheduled posts.

Usage:
  python3 run_pipeline.py --brand island-splash          # Full pipeline
  python3 run_pipeline.py --brand island-splash --step compose  # Just compose posts
  python3 run_pipeline.py --brand island-splash --dry-run       # Show what would happen
"""

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent


def step_generate_ads(brand: str, dry_run: bool = False):
    """Generate ads from approved refs."""
    print("\n" + "=" * 50)
    print("STEP 1: Generate Ads")
    print("=" * 50)

    # Find approved refs
    pool_dir = REPO_ROOT / "brand_assets" / brand
    approved_dir = pool_dir / "approved"

    # Also check hermes references
    hermes_dir = REPO_ROOT / "hermes-11" / "references" / "all-drinks"
    if hermes_dir.exists():
        approved_dir = hermes_dir / "approved"

    if not approved_dir.exists() or not any(approved_dir.iterdir()):
        print("No approved refs found")
        return []

    refs = list(approved_dir.glob("*.jpg")) + list(approved_dir.glob("*.png"))
    refs += list(approved_dir.glob("*.jpeg")) + list(approved_dir.glob("*.webp"))

    if not refs:
        print("No approved refs found")
        return []

    print(f"Found {len(refs)} approved refs")

    if dry_run:
        print("[DRY RUN] Would generate ads for:")
        for ref in refs:
            print(f"  - {ref.name}")
        return []

    # Run asset_ads.py for each ref
    import subprocess
    generated = []
    for ref in refs:
        print(f"\nGenerating ad from {ref.name}...")
        try:
            result = subprocess.run(
                ["python3", "asset_ads.py", "--brand", brand, str(ref)],
                cwd=str(REPO_ROOT),
                capture_output=True,
                text=True,
                timeout=300,
            )
            if result.returncode == 0:
                output = result.stdout.strip().split("\n")[-1]
                print(f"  ✓ Generated: {output}")
                generated.append(output)
            else:
                print(f"  ✗ Failed: {result.stderr[:200]}")
        except Exception as e:
            print(f"  ✗ Error: {e}")

    print(f"\nGenerated {len(generated)}/{len(refs)} ads")
    return generated


def step_compose_posts(brand: str, dry_run: bool = False, min_ads: int = 1):
    """Compose posts from generated ads."""
    print("\n" + "=" * 50)
    print("STEP 2: Compose Posts")
    print("=" * 50)

    # Import and run compose_posts
    import subprocess
    cmd = [
        "python3", "skill/scripts/compose_posts.py",
        "--brand", brand,
        "--min-ads", str(min_ads),
    ]
    if dry_run:
        cmd.append("--dry-run")

    result = subprocess.run(cmd, cwd=str(REPO_ROOT))
    return result.returncode == 0


def step_prepare_blotato(brand: str):
    """Prepare posts for Blotato scheduling."""
    print("\n" + "=" * 50)
    print("STEP 3: Prepare for Blotato")
    print("=" * 50)

    # Load latest composed posts
    posts_dir = REPO_ROOT / "output" / "posts"
    post_files = list(posts_dir.glob(f"{brand}_*.json"))
    if not post_files:
        print("No composed posts found")
        return []

    latest = max(post_files, key=lambda p: p.stat().st_mtime)
    posts = json.loads(latest.read_text())

    print(f"Found {posts['total_posts']} posts in {latest.name}")
    print("\nPosts ready for scheduling:")

    scheduled_posts = []
    for i, post in enumerate(posts["posts"], 1):
        ad_count = len(post.get("ad_filenames", []))
        caption = post.get("caption", "")[:50]

        # Build scheduled post entry
        scheduled_post = {
            "id": f"{brand}_{latest.stem}_{i}",
            "post_file": str(latest.name),
            "post_index": i - 1,
            "ad_count": ad_count,
            "caption_preview": caption,
            "caption": post.get("caption", ""),
            "hashtags": post.get("hashtags", ""),
            "status": "ready",  # pending, approved, scheduled, posted
            "blotato_id": None,
            "scheduled_time": None,
        }
        scheduled_posts.append(scheduled_post)
        print(f"\n  Post {i}: {ad_count} images")
        print(f"    Caption: {caption}...")

    # Save scheduled posts list
    output_file = REPO_ROOT / "output" / "scheduled" / f"{brand}_ready.json"
    output_file.parent.mkdir(exist_ok=True)
    output_file.write_text(json.dumps(scheduled_posts, indent=2))
    print(f"\nSaved to: {output_file}")

    return scheduled_posts


def step_send_telegram(brand: str):
    """Send posts to Telegram for approval."""
    print("\n" + "=" * 50)
    print("STEP 4: Send to Telegram")
    print("=" * 50)
    print("(Telegram integration not yet configured)")
    return False


def run_full_pipeline(brand: str, dry_run: bool = False, min_ads: int = 1):
    """Run the complete pipeline."""
    print(f"\n{'=' * 50}")
    print(f"ASSET ADS PIPELINE: {brand}")
    print(f"{'=' * 50}")

    if dry_run:
        print("DRY RUN MODE - No changes will be made")

    # Step 1: Generate ads
    step_generate_ads(brand, dry_run)

    # Step 2: Compose posts
    step_compose_posts(brand, dry_run, min_ads)

    # Step 3: Prepare for Blotato
    step_prepare_blotato(brand)

    # Step 4: Telegram
    step_send_telegram(brand)

    print(f"\n{'=' * 50}")
    print("PIPELINE COMPLETE")
    print(f"{'=' * 50}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Asset Ads Pipeline")
    parser.add_argument("--brand", required=True, help="Brand slug")
    parser.add_argument("--step", choices=["generate", "compose", "prepare", "telegram", "all"], default="all")
    parser.add_argument("--min-ads", type=int, default=1, help="Minimum ads before composing")
    parser.add_argument("--dry-run", action="store_true", help="Show what would happen")
    args = parser.parse_args()

    if args.step == "all":
        run_full_pipeline(args.brand, args.dry_run, args.min_ads)
    elif args.step == "generate":
        step_generate_ads(args.brand, args.dry_run)
    elif args.step == "compose":
        step_compose_posts(args.brand, args.dry_run, args.min_ads)
    elif args.step == "prepare":
        step_prepare_blotato(args.brand)
    elif args.step == "telegram":
        step_send_telegram(args.brand)
