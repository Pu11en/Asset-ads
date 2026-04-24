#!/usr/bin/env python3
"""
Library Check — non-destructive cron/status script.

This no longer auto-generates ads or auto-schedules posts.
It only reports brand readiness:
  - refs available in the pool
  - ads already in the library
  - planned posts currently on the calendar

Use an explicit generation command to build the library.
"""
import argparse
import json
from pathlib import Path

REPO_ROOT = Path("/home/drewp/asset-ads")
ADS_FILE = REPO_ROOT / "website/public/data/{brand}.json"
SCHEDULED_FILE = REPO_ROOT / "website/public/data/scheduled/{brand}.json"
BRAND_CONFIG = REPO_ROOT / "brands/{brand}.json"
LIBRARY_TARGET = 100


def load_json(path: Path):
    try:
        return json.loads(path.read_text())
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return []


def brand_config(brand: str) -> dict | None:
    try:
        return json.loads(Path(BRAND_CONFIG.as_posix().format(brand=brand)).read_text())
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None


def available_refs(brand: str) -> int:
    cfg = brand_config(brand)
    if not cfg:
        return 0
    pool_dir = Path(cfg.get("paths", {}).get("pool_dir", ""))
    if not pool_dir.exists():
        return 0
    refs = []
    for ext in ("*.jpg", "*.jpeg", "*.png", "*.webp"):
        refs.extend(pool_dir.glob(f"**/{ext}"))
    refs = [ref for ref in refs if "used-refs" not in str(ref)]
    return len(refs)


def library_ads(brand: str) -> int:
    ads = load_json(Path(ADS_FILE.as_posix().format(brand=brand)))
    return len(ads)


def planned_posts(brand: str) -> int:
    posts = load_json(Path(SCHEDULED_FILE.as_posix().format(brand=brand)))
    return len(posts)


def check_brand(brand: str) -> str:
    refs = available_refs(brand)
    ads = library_ads(brand)
    planned = planned_posts(brand)
    remaining = max(0, LIBRARY_TARGET - ads)

    status = "ready" if ads >= LIBRARY_TARGET else "building"
    lines = [
        f"[{brand}] refs={refs} ads={ads}/{LIBRARY_TARGET} planned={planned} status={status}",
    ]
    if remaining:
        lines.append(f"[{brand}] Need {remaining} more ads to hit the 100-ad library target.")
        lines.append(f"[{brand}] Next step: run an explicit batch generation command.")
    else:
        lines.append(f"[{brand}] Library target reached. Focus on campaign planning and calendar fill.")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Non-destructive library readiness check")
    parser.add_argument("--brand", help="Specific brand to check")
    args = parser.parse_args()

    brands = [args.brand] if args.brand else ["island-splash", "cinco-h-ranch"]
    for brand in brands:
        print(check_brand(brand))


if __name__ == "__main__":
    main()
