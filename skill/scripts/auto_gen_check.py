#!/usr/bin/env python3
"""
Auto-Gen Check — Cron script for Hermes.
Runs every 15 min to check if pool is big enough to auto-generate and schedule posts.

Trigger logic:
  - Brand with >= 10 unused ads + instagram_account_id configured:
      generate 2 new ads → schedule carousel → Telegram notification
  - Brand with >= 10 unused ads + NO instagram_account_id (Cinco mock):
      generate 2 new ads only (no scheduling)

Usage:
  python3 skill/scripts/auto_gen_check.py
  python3 skill/scripts/auto_gen_check.py --brand island-splash
"""
import argparse
import json
import os
import random
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

REPO_ROOT = Path("/home/drewp/asset-ads")
ADS_FILE = str(REPO_ROOT / "website/public/data/{brand}.json")
SCHEDULED_FILE = str(REPO_ROOT / "website/public/data/scheduled/{brand}.json")
OUTPUT_DIR = REPO_ROOT / "output"
BRAND_CONFIG = str(REPO_ROOT / "brands/{brand}.json")
POOL_TRIGGER = 10
GENERATE_COUNT = 2

BRAND_CAPTIONS = {
    "island-splash": {
        "caption": "Tropical vibes only 🌴",
        "hashtags": "#IslandSplash #TropicalFlavors #CaribbeanJuice #NaturalIngredients",
    },
    "cinco-h-ranch": {
        "caption": "THE RANCH STANDARD 🌵",
        "hashtags": "#CincoHRanch #TexasMade #NaturalSkincare #RanchStandard",
    },
}


def load_json(path):
    try:
        if isinstance(path, str):
            path = Path(path)
        return json.loads(path.read_text())
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return []


def brand_config(brand: str) -> dict | None:
    try:
        return json.loads(Path(BRAND_CONFIG.format(brand=brand)).read_text())
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None


def is_schedulable(brand: str) -> bool:
    """True if brand has Blotato/instagram_account_id configured."""
    cfg = brand_config(brand)
    if not cfg:
        return False
    acc_id = cfg.get("scheduling", {}).get("instagram_account_id", "")
    return bool(acc_id and acc_id not in ("TODO", "TODO_set_me"))


def unused_ads(brand: str) -> list:
    """Return list of unused ad filenames for a brand."""
    ads = load_json(Path(ADS_FILE.format(brand=brand)))
    if not ads:
        return []
    try:
        scheduled = json.loads(Path(SCHEDULED_FILE.format(brand=brand)).read_text())
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        scheduled = []
    scheduled_ids = set()
    for post in scheduled:
        for ad_id in post.get("ad_ids", []):
            scheduled_ids.add(ad_id)
    return [a for a in ads if a.get("filename") not in scheduled_ids]


def scheduled_upcoming(brand: str) -> int:
    """Count posts scheduled in the next 7 days."""
    try:
        scheduled = json.loads(Path(SCHEDULED_FILE.format(brand=brand)).read_text())
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return 0
    now = datetime.now(timezone.utc)
    week_end = now + timedelta(days=7)
    count = 0
    for post in scheduled:
        if post.get("status", "") in ("rejected"):
            continue
        try:
            sched_time = datetime.fromisoformat(post["scheduled_at"].replace("Z", "+00:00"))
            if now <= sched_time <= week_end:
                count += 1
        except (ValueError, OSError):
            pass
    return count


def next_local_slot(brand: str) -> tuple[str, str]:
    """Find the next open local 9am/5pm slot from scheduled JSON only."""
    try:
        scheduled = json.loads(Path(SCHEDULED_FILE.format(brand=brand)).read_text())
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        scheduled = []

    booked = {
        post.get("scheduled_at")
        for post in scheduled
        if post.get("status") not in ("rejected", "failed") and post.get("scheduled_at")
    }
    now = datetime.now(timezone.utc)

    for day_offset in range(0, 30):
        day = now + timedelta(days=day_offset)
        for hour, slot in ((9, "9am"), (17, "5pm")):
            slot_dt = day.replace(hour=hour, minute=0, second=0, microsecond=0)
            iso = slot_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
            if slot_dt <= now or iso in booked:
                continue
            return iso, slot

    raise RuntimeError("No local slot found in next 30 days")


def add_local_preapproved_post(brand: str, carousel_ads: list[str], caption: str, hashtags: str) -> str:
    """Create a local-only preapproved post for brands without Blotato."""
    scheduled_at, slot = next_local_slot(brand)
    scheduled_path = Path(SCHEDULED_FILE.format(brand=brand))
    scheduled_path.parent.mkdir(parents=True, exist_ok=True)

    posts = load_json(scheduled_path)
    posts.append({
        "id": f"local_{int(time.time() * 1000)}",
        "blotato_id": f"localonly_{int(time.time() * 1000)}",
        "ad_ids": carousel_ads,
        "caption": caption,
        "hashtags": hashtags,
        "scheduled_at": scheduled_at,
        "slot": slot,
        "platform": "instagram",
        "status": "preapproved",
    })
    scheduled_path.write_text(json.dumps(posts, indent=2))
    return scheduled_at


def pick_ref(brand: str) -> Path | None:
    """Pick a random ref image from brand's pool_dir."""
    cfg = brand_config(brand)
    if not cfg:
        return None
    pool_dir = Path(cfg.get("paths", {}).get("pool_dir", ""))
    if not pool_dir.exists():
        return None
    refs: list[Path] = []
    for ext in ("*.jpg", "*.jpeg", "*.png"):
        refs.extend(pool_dir.glob(f"**/{ext}"))
    # Exclude used-refs subfolder
    refs = [r for r in refs if "used-refs" not in str(r)]
    return random.choice(refs) if refs else None


def run_generation(brand: str, ref_path: Path) -> bool:
    """Run asset_ads.py to generate one ad."""
    cmd = [
        "python3", str(REPO_ROOT / "asset_ads.py"),
        "--brand", brand,
        str(ref_path),
    ]
    env = os.environ.copy()
    env["PYTHONPATH"] = str(REPO_ROOT)
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(REPO_ROOT), env=env)
    if result.returncode != 0:
        print(f"    generation failed: {result.stderr[:200]}", file=sys.stderr)
    return result.returncode == 0


def run_scheduling(brand: str, unused: list) -> bool:
    """Schedule a carousel from 5 unused ads via schedule_post.py."""
    if len(unused) < 5:
        print(f"[{brand}] Only {len(unused)} unused ads, need 5 for carousel")
        return False

    # Pick 5 diverse ads (prefer different product_names)
    chosen = []
    used_products = set()
    remaining = list(unused)
    random.shuffle(remaining)
    for ad in remaining:
        pname = ad.get("product_name", "")
        if pname not in used_products or len(chosen) < 3:
            chosen.append(ad)
            used_products.add(pname)
        if len(chosen) >= 5:
            break
    if len(chosen) < 5:
        chosen = remaining[:5]

    carousel_ads = [a["filename"] for a in chosen]
    product_names = list(set(a.get("product_name", "") for a in chosen))

    # Generate unique caption + hashtags via generate_caption.py
    # Use --ad-files so it reads instruction files and extracts real product names
    gen_cmd = [
        "python3", str(REPO_ROOT / "skill/scripts/generate_caption.py"),
        "--brand", brand,
        "--ad-files", ",".join(carousel_ads),
    ]
    gen_result = subprocess.run(gen_cmd, capture_output=True, text=True, cwd=str(REPO_ROOT))
    caption = "Tropical vibes only 🌴"
    hashtags = "#IslandSplash #TropicalFlavors #CaribbeanJuice #NaturalIngredients"
    if gen_result.returncode == 0:
        for line in gen_result.stdout.splitlines():
            if line.startswith("Caption:"):
                caption = line.replace("Caption:", "").strip()
            if line.startswith("Hashtags:"):
                hashtags = line.replace("Hashtags:", "").strip()

    cmd = [
        "python3", str(REPO_ROOT / "skill/scripts/schedule_post.py"),
        "--brand", brand,
        "--carousel-ads", ",".join(carousel_ads),
        "--caption", caption,
        "--hashtags", hashtags,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(REPO_ROOT))
    if result.returncode == 0:
        print(f"[{brand}] Scheduled: {', '.join(carousel_ads)}")
        print(f"[{brand}] Caption: {caption[:50]}")
        return True
    print(f"[{brand}] Scheduling failed: {result.stderr[:200]}", file=sys.stderr)
    return False


def run_local_queue(brand: str, unused: list) -> bool:
    """Queue a local-only preapproved carousel when Blotato is not configured."""
    if len(unused) < 5:
        print(f"[{brand}] Only {len(unused)} unused ads, need 5 for local queue")
        return False

    chosen = []
    used_products = set()
    remaining = list(unused)
    random.shuffle(remaining)
    for ad in remaining:
        pname = ad.get("product_name", "")
        if pname not in used_products or len(chosen) < 3:
            chosen.append(ad)
            used_products.add(pname)
        if len(chosen) >= 5:
            break
    if len(chosen) < 5:
        chosen = remaining[:5]

    carousel_ads = [a["filename"] for a in chosen]
    gen_cmd = [
        "python3", str(REPO_ROOT / "skill/scripts/generate_caption.py"),
        "--brand", brand,
        "--ad-files", ",".join(carousel_ads),
    ]
    gen_result = subprocess.run(gen_cmd, capture_output=True, text=True, cwd=str(REPO_ROOT))
    caption = "Fresh batch ready"
    hashtags = ""
    if gen_result.returncode == 0:
        for line in gen_result.stdout.splitlines():
            if line.startswith("Caption:"):
                caption = line.replace("Caption:", "").strip()
            if line.startswith("Hashtags:"):
                hashtags = line.replace("Hashtags:", "").strip()

    scheduled_at = add_local_preapproved_post(brand, carousel_ads, caption, hashtags)
    print(f"[{brand}] Local preapproved post queued: {', '.join(carousel_ads)} @ {scheduled_at}")
    return True


def check_brand(brand: str) -> str | None:
    """Check one brand. Returns Telegram-formatted message if action taken."""
    unused = unused_ads(brand)
    unused_count = len(unused)
    upcoming = scheduled_upcoming(brand)
    schedulable = is_schedulable(brand)

    print(f"[{brand}] {unused_count} unused ads, {upcoming} upcoming, Blotato={'yes' if schedulable else 'NO (mock)'}")

    if unused_count >= POOL_TRIGGER and upcoming < 2:
        msg_parts = [f"🤖 *Auto-Gen*\n{brand}"]

        # Queue a carousel first when the pool is healthy.
        if unused_count >= 5:
            print(f"[{brand}] Attempting to queue carousel from existing unused ads...")
            fresh_unused = unused_ads(brand)
            if schedulable:
                if run_scheduling(brand, fresh_unused):
                    msg_parts.append("✅ Carousel scheduled in Blotato")
                    msg_parts.append(f"View & approve: http://localhost:3000/{brand}")
                    return "\n".join(msg_parts)
                msg_parts.append("⚠️ Scheduling failed (Blotato unreachable)")
            else:
                if run_local_queue(brand, fresh_unused):
                    msg_parts.append("✅ Local preapproved carousel queued")
                    msg_parts.append(f"View queue: http://localhost:3000/{brand}")
                    return "\n".join(msg_parts)

        # Generate new ads to keep pool topped up
        print(f"[{brand}] Generating {GENERATE_COUNT} new ads...")
        generated = 0
        for i in range(GENERATE_COUNT):
            ref = pick_ref(brand)
            if not ref:
                print(f"[{brand}] No refs in pool_dir — stopping")
                break
            if run_generation(brand, ref):
                generated += 1
                print(f"[{brand}] Ad {generated}/{GENERATE_COUNT} generated: {ref.name}")
            time.sleep(1)

        if generated == 0:
            # No refs available — pool exhausted
            if schedulable:
                msg_parts.append(f"Pool exhausted. Add more refs to continue.")
            else:
                msg_parts.append(f"Mock mode: no refs left to generate.")
            return "\n".join(msg_parts)

        msg_parts.append(f"✅ Generated {generated} new ad(s)")
        if schedulable:
            msg_parts.append(f"📝 Scheduling pending (Blotato unreachable)")
        else:
            msg_parts.append(f"📝 Mock mode — pool updated, no auto-scheduling")

        return "\n".join(msg_parts)

    return None


def main():
    parser = argparse.ArgumentParser(description="Auto-gen check for asset ads")
    parser.add_argument("--brand", help="Specific brand to check")
    args = parser.parse_args()

    brands = [args.brand] if args.brand else ["island-splash", "cinco-h-ranch"]
    messages = []
    for brand in brands:
        msg = check_brand(brand)
        if msg:
            messages.append(msg)

    if messages:
        print("\n" + "=" * 40)
        print("AUTO-GEN REPORT")
        print("=" * 40)
        for m in messages:
            print(m)
        print("=" * 40)
        # Exit 0 so Hermes sends the output to Telegram
        sys.exit(0)
    else:
        print(f"[{datetime.now().strftime('%H:%M')}] Auto-gen: no action needed")


if __name__ == "__main__":
    main()
