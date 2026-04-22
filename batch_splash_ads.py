#!/usr/bin/env python3
"""Batch generate Island Splash ads from all reference images.

Usage:
    python3 batch_splash_ads.py

Processes all refs in /home/drewp/hermes-11/references/ in parallel (max 2 at a time).
Each successful generation moves the ref to processed/.
"""

import os
import sys
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

# Add src to path
sys.path.insert(0, str(Path(__file__).parent))
from generate_splash_ad import main as generate_single

MAX_CONCURRENT = 2  # Cap to avoid Gemini rate limits
REFERENCES_DIR = Path("/home/drewp/hermes-11/references")
PROCESSED_DIR = Path("/home/drewp/hermes-11/references/processed")
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)


def process_one(ref_path):
    """Process a single ref, return success/fail and output path."""
    try:
        print(f"[BATCH] Starting: {ref_path.name}")
        # Run the generator (it will handle success/fail and auto-move)
        sys.argv = ["generate_splash_ad.py", str(ref_path)]
        generate_single()

        # Find the generated file (most recent in output dir)
        output_dir = Path("/home/drewp/hermes-11/generated")
        files = sorted(output_dir.glob("splash_*.png"), key=lambda f: f.stat().st_mtime, reverse=True)
        latest = files[0] if files else None

        return (ref_path.name, True, str(latest) if latest else None)
    except SystemExit:
        return (ref_path.name, False, None)
    except Exception as e:
        print(f"[BATCH] ERROR {ref_path.name}: {e}")
        return (ref_path.name, False, None)


def main():
    # Find all refs
    refs = []
    for ext in ["*.png", "*.jpg", "*.webp"]:
        refs.extend(REFERENCES_DIR.glob(ext))

    if not refs:
        print("[BATCH] No reference images found in references/")
        return

    print(f"[BATCH] Found {len(refs)} refs — processing {MAX_CONCURRENT} at a time...")

    success = 0
    failed = 0
    generated_files = []

    with ThreadPoolExecutor(max_workers=MAX_CONCURRENT) as executor:
        futures = {executor.submit(process_one, r): r for r in refs}

        for future in as_completed(futures):
            name, ok, output_path = future.result()
            if ok:
                success += 1
                generated_files.append(output_path)
                print(f"[BATCH] ✓ Done: {name}")
            else:
                failed += 1
                print(f"[BATCH] ✗ Failed: {name}")

    print(f"\n[BATCH] Complete — {success} succeeded, {failed} failed")
    if generated_files:
        print(f"[BATCH] Generated {len(generated_files)} ads:")
        for f in generated_files:
            print(f"  {f}")
        print("[BATCH] SEND_TO_TELEGRAM:" + ",".join(generated_files))


if __name__ == "__main__":
    main()
