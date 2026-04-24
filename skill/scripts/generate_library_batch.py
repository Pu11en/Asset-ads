#!/usr/bin/env python3
"""
Generate ads from the ref pool in an explicit controlled batch.

Usage:
  python3 skill/scripts/generate_library_batch.py --brand island-splash --limit 10
  python3 skill/scripts/generate_library_batch.py --brand cinco-h-ranch --limit 25
"""
import argparse
import os
import subprocess
import sys
from pathlib import Path

from add_refs import load_brand, mark_ref_as_used

REPO_ROOT = Path("/home/drewp/asset-ads")


def available_refs(brand_slug: str) -> list[tuple[Path, str]]:
    brand = load_brand(brand_slug)
    pool_dir = Path(brand.get("paths", {}).get("pool_dir", ""))
    if not pool_dir.exists():
        return []

    refs: list[tuple[Path, str]] = []
    for ext in ("*.jpg", "*.jpeg", "*.png", "*.webp"):
        for ref in pool_dir.glob(f"**/{ext}"):
            if "used-refs" in str(ref):
                continue
            if brand.get("product_required"):
                product_name = ref.parent.name.replace("-", " ").title()
            else:
                stem = ref.stem.split("_ref_")[0]
                product_name = stem.replace("-", " ").title()
            refs.append((ref, product_name))
    return sorted(refs, key=lambda item: item[0].name)


def run_generation(brand_slug: str, ref_path: Path) -> bool:
    cmd = [
        "python3", str(REPO_ROOT / "asset_ads.py"),
        "--brand", brand_slug,
        str(ref_path),
    ]
    env = os.environ.copy()
    env["PYTHONPATH"] = str(REPO_ROOT)
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(REPO_ROOT), env=env)
    if result.returncode != 0:
        print(f"  [gen] ⚠️ Failed for {ref_path.name}: {result.stderr[:160]}")
        return False
    print(f"  [gen] ✅ Generated ad from {ref_path.name}")
    return True


def main():
    parser = argparse.ArgumentParser(description="Explicit batch generator for the ad library")
    parser.add_argument("--brand", required=True, help="Brand slug")
    parser.add_argument("--limit", type=int, default=10, help="How many refs to process")
    args = parser.parse_args()

    refs = available_refs(args.brand)
    if not refs:
        print(f"No available refs for {args.brand}")
        return 1

    to_process = refs[:args.limit]
    print(f"Processing {len(to_process)} refs for {args.brand}")

    generated = 0
    for ref_path, product_name in to_process:
        if run_generation(args.brand, ref_path):
            mark_ref_as_used(args.brand, product_name, ref_path)
            generated += 1

    print(f"Done. Generated {generated}/{len(to_process)} ads.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
