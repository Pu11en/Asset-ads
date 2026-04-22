#!/usr/bin/env python3
"""
Island Splash — Schedule Runner
Fires every minute via cron. Posts any scheduled Instagram carousel when its time is due.
"""
import os
import json
import random
import sys
import time
import uuid
from pathlib import Path
from datetime import datetime, timedelta

import requests

# ── Config ────────────────────────────────────────────────────────────────────

BASE_URL = "https://backend.blotato.com/v2"
POOL_FILE = Path("/home/drewp/asset-ads/ref_pool.json")
SCHEDULE_FILE = Path("/home/drewp/asset-ads/post_schedule.json")
POSTED_DIR = Path("/home/drewp/asset-ads/posted")
BLOTATO_API_KEY = os.environ.get("BLOTATO_API_KEY", "")
INSTAGRAM_ACCOUNT_ID = os.environ.get("BLOTATO_IG_ACCOUNT_ID", "")

HEADERS = {
    "Authorization": BLOTATO_API_KEY,
    "Content-Type": "application/json",
}

MORNING_START, MORNING_END = 9, 12   # 9am–12pm
EVENING_START, EVENING_END = 17, 20  # 5pm–8pm

# ── Helpers ───────────────────────────────────────────────────────────────────

def load_json(path):
    return json.loads(path.read_text())

def save_json(path, data):
    path.write_text(json.dumps(data, indent=2))

def ig_account_id() -> str:
    """Resolve Instagram account ID from env or blotato accounts list."""
    global INSTAGRAM_ACCOUNT_ID
    if INSTAGRAM_ACCOUNT_ID:
        return INSTAGRAM_ACCOUNT_ID
    # Fetch accounts via Blotato API
    resp = requests.get(f"{BASE_URL}/accounts", headers=HEADERS)
    resp.raise_for_status()
    accounts = resp.json().get("accounts", [])
    for acc in accounts:
        if acc.get("platform") == "instagram":
            INSTAGRAM_ACCOUNT_ID = acc["id"]
            return INSTAGRAM_ACCOUNT_ID
    raise RuntimeError("No Instagram account found in Blotato")

def random_slot_time(start_hour: int, end_hour: int) -> str:
    """Return HH:MM string within the window."""
    hour = random.randint(start_hour, end_hour - 1)
    minute = random.randint(0, 59)
    return f"{hour:02d}:{minute:02d}"

def next_available_slot(schedule: dict) -> tuple[str, str]:
    """
    Return (date_str, slot_type) for the next open slot.
    slot_type = 'morning' | 'evening'
    date_str  = 'YYYY-MM-DD'
    """
    today = datetime.now().date()

    for day_offset in range(365):
        day = today + timedelta(days=day_offset)
        date_str = day.isoformat()

        for slot_type in ["morning", "evening"]:
            key = f"{date_str}_{slot_type}"
            slot = schedule.get("slots", {}).get(key, {})
            if slot.get("status") in ("pending", None, ""):
                return date_str, slot_type

    # All slots full — create new ones far out
    date_str = (today + timedelta(days=day_offset)).isoformat()
    return date_str, "morning"

def upload_image_via_presigned(image_path: str) -> str:
    """
    Upload a local image to Blotato via presigned URL.
    Returns the publicUrl for use in a post.
    """
    filename = Path(image_path).name
    # 1. Get presigned URL
    r = requests.post(
        f"{BASE_URL}/media/uploads",
        headers=HEADERS,
        json={"filename": filename},
    )
    r.raise_for_status()
    data = r.json()
    presigned_url = data["presignedUrl"]
    public_url = data["publicUrl"]

    # 2. PUT binary to presigned URL
    mime = "image/jpeg"
    if filename.lower().endswith(".png"):
        mime = "image/png"

    with open(image_path, "rb") as f:
        binary = f.read()

    # Presigned URL may have query params — use raw URL as-is
    put_resp = requests.put(
        presigned_url,
        data=binary,
        headers={"Content-Type": mime},
    )
    put_resp.raise_for_status()
    return public_url

def post_to_instagram(image_urls: list[str], caption: str, scheduled_time: str) -> str:
    """
    Post a carousel to Instagram via Blotato.
    scheduled_time = 'HH:MM'
    Returns the Blotato post URL.
    """
    account_id = ig_account_id()

    # Blotato expects scheduledTime as an ISO string with timezone
    today = datetime.now().date().isoformat()
    full_scheduled = f"{today}T{scheduled_time}:00"

    payload = {
        "post": {
            "accountId": account_id,
            "content": {
                "text": caption,
                "mediaUrls": image_urls,
                "platform": "instagram",
            },
            "target": {
                "targetType": "instagram",
            },
        },
        "scheduledTime": full_scheduled,
    }

    resp = requests.post(
        f"{BASE_URL}/posts",
        headers=HEADERS,
        json=payload,
    )
    resp.raise_for_status()
    result = resp.json()
    # Blotato returns postId / submissionId in various places depending on version
    post_id = (
        result.get("post", {}).get("id")
        or result.get("id")
        or result.get("submissionId")
        or "unknown"
    )
    # Try to build a post URL
    post_url = f"https://www.instagram.com/p/{post_id}/"
    return post_url, post_id

def archive_post(slot_key: str, images: list[str], caption: str, post_url: str, post_id: str):
    """Move images to posted archive dir."""
    posted_dir = POSTED_DIR / slot_key.replace("_", "/")
    posted_dir.mkdir(parents=True, exist_ok=True)

    for img_path in images:
        src = Path(img_path)
        if src.exists():
            (posted_dir / src.name).write_bytes(src.read_bytes())

    # Write metadata
    (posted_dir / "post-meta.txt").write_text(
        f"Slot: {slot_key}\n"
        f"Post URL: {post_url}\n"
        f"Post ID: {post_id}\n"
        f"Caption: {caption}\n"
        f"Posted at: {datetime.now().isoformat()}\n"
    )

# ── Main ──────────────────────────────────────────────────────────────────────

def run():
    if not BLOTATO_API_KEY:
        print("ERROR: BLOTATO_API_KEY env var not set")
        sys.exit(1)

    schedule = load_json(SCHEDULE_FILE)
    now = datetime.now()
    current_time_str = now.strftime("%H:%M")

    updated = False

    for key, slot in list(schedule.get("slots", {}).items()):
        if slot.get("status") != "scheduled":
            continue

        sched_time = slot.get("scheduled_time", "")
        if not sched_time:
            continue

        # Check if due (scheduled_time <= current time)
        if sched_time > current_time_str:
            continue

        # DUE — post it
        print(f"[{now.isoformat()}] Posting due slot: {key}")

        try:
            image_paths = slot.get("images", [])
            caption = slot.get("caption", "")

            # Upload images
            public_urls = []
            for img_path in image_paths:
                url = upload_image_via_presigned(img_path)
                public_urls.append(url)
                print(f"  Uploaded: {img_path} -> {url}")
                time.sleep(0.5)  # brief pause between uploads

            # Post to Instagram
            post_url, post_id = post_to_instagram(public_urls, caption, sched_time)
            print(f"  Posted: {post_url} (id: {post_id})")

            # Archive
            archive_post(key, image_paths, caption, post_url, post_id)

            # Mark done
            slot["status"] = "posted"
            slot["post_url"] = post_url
            slot["posted_at"] = datetime.now().isoformat()
            updated = True

        except Exception as e:
            print(f"  ERROR posting {key}: {e}")
            slot["status"] = "failed"
            slot["error"] = str(e)
            updated = True

    if updated:
        save_json(SCHEDULE_FILE, schedule)
        print(f"[{now.isoformat()}] Schedule updated.")

if __name__ == "__main__":
    run()
