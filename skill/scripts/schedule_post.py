#!/usr/bin/env python3
"""
Schedule or post an approved ad to social platforms via Blotato.

Usage:
  # List connected accounts
  python3 skill/scripts/schedule_post.py --list-accounts

  # Post immediately
  python3 skill/scripts/schedule_post.py --post --brand island-splash --ad-id ad_123 --platform instagram

  # Schedule for later
  python3 skill/scripts/schedule_post.py --schedule --brand island-splash --ad-id ad_123 --platform instagram --at "2026-04-25T09:00:00Z"

  # Show scheduled posts
  python3 skill/scripts/schedule_post.py --show-scheduled --brand island-splash

  # Cancel scheduled post
  python3 skill/scripts/schedule_post.py --cancel --post-id scheduled_123 --brand island-splash
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

import requests


# Blotato API config
BLOTATO_BASE = "https://backend.blotato.com/v2"
ENV_PATH = Path.home() / ".hermes" / "profiles" / "hermes-11" / ".env"


def load_api_key() -> str:
    """Load Blotato API key from environment."""
    # Try env var first
    key = os.environ.get("BLOTATO_API_KEY")
    if key:
        return key
    
    # Try loading from .env
    if ENV_PATH.exists():
        with open(ENV_PATH) as f:
            for line in f:
                line = line.strip()
                if line.startswith("BLOTATO_API_KEY="):
                    return line.split("=", 1)[1].strip()
    
    raise RuntimeError("BLOTATO_API_KEY not found. Set it in environment or ~/.hermes/profiles/hermes-11/.env")


def blotato_headers() -> dict:
    """Get headers for Blotato API."""
    return {
        "blotato-api-key": load_api_key(),
        "Content-Type": "application/json"
    }


def list_accounts() -> list:
    """List all connected social accounts."""
    response = requests.get(
        f"{BLOTATO_BASE}/users/me/accounts",
        headers=blotato_headers()
    )
    
    if response.status_code != 200:
        raise RuntimeError(f"Failed to list accounts: {response.status_code} {response.text}")
    
    accounts = response.json().get("accounts", [])
    return accounts


def show_accounts():
    """Display connected accounts."""
    accounts = list_accounts()
    
    print("\n=== Connected Social Accounts ===\n")
    
    if not accounts:
        print("No accounts connected.")
        print("Go to https://blotato.com → Settings → Connected Accounts to connect Instagram, TikTok, etc.\n")
        return []
    
    for acc in accounts:
        print(f"  ID: {acc.get('id')}")
        print(f"  Platform: {acc.get('platform')}")
        print(f"  Name: {acc.get('name', acc.get('username', 'N/A'))}")
        print()
    
    return accounts


def load_ad(brand_slug: str, ad_id: str) -> dict:
    """Load ad data from ads.json."""
    ads_path = Path("website/public/data/ads.json")
    
    if not ads_path.exists():
        raise FileNotFoundError(f"ads.json not found: {ads_path}")
    
    with open(ads_path) as f:
        ads = json.load(f)
    
    # Find the ad
    for ad in ads:
        if ad.get('id') == ad_id or ad.get('id') == f"{brand_slug}-{ad_id}":
            return ad
    
    raise ValueError(f"Ad not found: {ad_id}")


def upload_image(file_path: str) -> str:
    """Upload image to Blotato and return public URL."""
    file_path = Path(file_path)
    
    if not file_path.exists():
        raise FileNotFoundError(f"Image not found: {file_path}")
    
    # Get presigned URL
    response = requests.post(
        f"{BLOTATO_BASE}/media/uploads",
        headers=blotato_headers(),
        json={
            "filename": file_path.name,
            "contentType": "image/png" if file_path.suffix == ".png" else "image/jpeg"
        }
    )
    
    if response.status_code != 200:
        raise RuntimeError(f"Failed to get upload URL: {response.status_code} {response.text}")
    
    data = response.json()
    presigned_url = data.get("presignedUrl")
    media_id = data.get("mediaId")
    
    if not presigned_url:
        raise RuntimeError(f"No presigned URL in response: {data}")
    
    # Upload the file
    with open(file_path, "rb") as f:
        upload_response = requests.put(
            presigned_url,
            data=f,
            headers={"Content-Type": "image/png" if file_path.suffix == ".png" else "image/jpeg"}
        )
    
    if upload_response.status_code not in [200, 201]:
        raise RuntimeError(f"Failed to upload image: {upload_response.status_code}")
    
    # Return the public URL
    return data.get("publicUrl", f"https://media.blotato.com/{media_id}")


def post_to_instagram(account_id: str, image_url: str, caption: str, hashtags: str = "") -> dict:
    """Post an image to Instagram immediately."""
    full_caption = caption
    if hashtags:
        full_caption = f"{caption}\n\n{hashtags}"
    
    # Blotato requires media for IG posts (no text-only)
    response = requests.post(
        f"{BLOTATO_BASE}/posts",
        headers=blotato_headers(),
        json={
            "post": {
                "accountId": account_id,
                "content": {
                    "text": full_caption,
                    "mediaUrls": [image_url],
                    "platform": "instagram"
                },
                "target": {
                    "targetType": "instagram"
                }
            }
        }
    )
    
    if response.status_code != 200:
        raise RuntimeError(f"Failed to create post: {response.status_code} {response.text}")
    
    return response.json()


def poll_post_status(submission_id: str, timeout: int = 120) -> dict:
    """Poll until post is published or failed."""
    start = time.time()
    
    while time.time() - start < timeout:
        response = requests.get(
            f"{BLOTATO_BASE}/posts/{submission_id}",
            headers=blotato_headers()
        )
        
        if response.status_code != 200:
            print(f"⚠️  Polling error: {response.status_code}")
            time.sleep(5)
            continue
        
        status_data = response.json()
        status = status_data.get("status")
        
        print(f"   Status: {status}")
        
        if status == "published":
            return status_data
        elif status == "failed":
            return status_data
        
        time.sleep(5)
    
    raise RuntimeError(f"Post timed out after {timeout} seconds")


def load_brand(brand_slug: str) -> dict:
    """Load brand config."""
    config_path = Path("brands") / f"{brand_slug}.json"
    if not config_path.exists():
        raise FileNotFoundError(f"Brand not found: {config_path}")
    
    with open(config_path) as f:
        return json.load(f)


def update_ad_status(brand_slug: str, ad_id: str, status: str, platform: str = None, post_url: str = None, scheduled_at: str = None):
    """Update ad status in ads.json."""
    ads_path = Path("website/public/data/ads.json")
    
    with open(ads_path) as f:
        ads = json.load(f)
    
    # Find and update the ad
    for ad in ads:
        if ad.get('id') == ad_id or ad.get('id') == f"{brand_slug}-{ad_id}":
            ad['status'] = status
            if platform:
                ad['posted_to'] = platform
            if post_url:
                ad['post_url'] = post_url
            if scheduled_at:
                ad['scheduled_at'] = scheduled_at
            break
    
    with open(ads_path, 'w') as f:
        json.dump(ads, f, indent=2)


def add_to_scheduled(brand_slug: str, post_data: dict):
    """Add a scheduled post to the scheduled posts file."""
    scheduled_path = Path(f"website/public/data/scheduled/{brand_slug}.json")
    scheduled_path.parent.mkdir(parents=True, exist_ok=True)
    
    scheduled = []
    if scheduled_path.exists():
        with open(scheduled_path) as f:
            scheduled = json.load(f)
    
    scheduled.append(post_data)
    
    with open(scheduled_path, 'w') as f:
        json.dump(scheduled, f, indent=2)


def post_ad(brand_slug: str, ad_id: str, platform: str = "instagram", caption: str = None, hashtags: str = None):
    """Post an approved ad immediately."""
    print(f"\n=== Posting Ad: {ad_id} to {platform} ===\n")
    
    # Load brand to get account ID
    brand = load_brand(brand_slug)
    account_id = brand.get('scheduling', {}).get('instagram_account_id')
    
    if not account_id or account_id.startswith("TODO"):
        print("❌ Instagram account not configured for this brand.")
        print(f"   Edit brands/{brand_slug}.json and set scheduling.instagram_account_id")
        print(f"   Run --list-accounts to see available accounts.\n")
        return 1
    
    # Load ad data
    ad = load_ad(brand_slug, ad_id)
    
    # Get image path
    image_path = Path("website/public") / ad.get('path', ad.get('filename', ''))
    if not image_path.exists():
        image_path = Path(f"website/public/images/ads/{brand_slug}/{ad.get('filename', '')}")
    
    if not image_path.exists():
        raise FileNotFoundError(f"Image not found: {image_path}")
    
    # Use provided caption or ad's caption
    if not caption:
        caption = ad.get('caption', '')
    if not hashtags:
        hashtags = ad.get('hashtags', '')
    
    # Upload image
    print(f"📤 Uploading image...")
    image_url = upload_image(str(image_path))
    print(f"   Uploaded: {image_url}")
    
    # Post to Instagram
    print(f"📤 Posting to Instagram (account: {account_id})...")
    result = post_to_instagram(account_id, image_url, caption, hashtags)
    
    submission_id = result.get("postSubmissionId")
    print(f"   Submission ID: {submission_id}")
    
    # Poll for completion
    print(f"⏳ Waiting for post to publish...")
    status = poll_post_status(submission_id)
    
    if status.get("status") == "published":
        post_url = status.get("publicUrl", "")
        print(f"\n✅ POSTED! {post_url}")
        
        # Update ad status
        update_ad_status(brand_slug, ad_id, "published", "instagram", post_url)
        
        return 0
    else:
        print(f"\n❌ POST FAILED: {status}")
        update_ad_status(brand_slug, ad_id, "failed")
        return 1


def show_scheduled(brand_slug: str):
    """Show scheduled posts for a brand."""
    scheduled_path = Path(f"website/public/data/scheduled/{brand_slug}.json")
    
    print(f"\n=== Scheduled Posts: {brand_slug} ===\n")
    
    if not scheduled_path.exists():
        print("No scheduled posts.\n")
        return
    
    with open(scheduled_path) as f:
        scheduled = json.load(f)
    
    if not scheduled:
        print("No scheduled posts.\n")
        return
    
    for post in scheduled:
        status_emoji = "✅" if post.get('status') == 'posted' else "⏳" if post.get('status') == 'scheduled' else "❌"
        print(f"  {status_emoji} {post.get('id')}")
        print(f"     Platform: {post.get('platform')}")
        print(f"     Scheduled: {post.get('scheduled_at')}")
        print(f"     Caption: {post.get('caption', '')[:50]}...")
        print()
    
    return scheduled


def cancel_scheduled(brand_slug: str, post_id: str):
    """Cancel a scheduled post."""
    scheduled_path = Path(f"website/public/data/scheduled/{brand_slug}.json")
    
    if not scheduled_path.exists():
        print(f"\n❌ No scheduled posts found for {brand_slug}\n")
        return 1
    
    with open(scheduled_path) as f:
        scheduled = json.load(f)
    
    # Find and remove the post
    original_count = len(scheduled)
    scheduled = [p for p in scheduled if p.get('id') != post_id]
    
    if len(scheduled) == original_count:
        print(f"\n❌ Post not found: {post_id}\n")
        return 1
    
    with open(scheduled_path, 'w') as f:
        json.dump(scheduled, f, indent=2)
    
    print(f"\n✅ Cancelled scheduled post: {post_id}\n")
    return 0


def main():
    parser = argparse.ArgumentParser(description="Schedule or post ads to social platforms")
    parser.add_argument("--list-accounts", action='store_true', help="List connected social accounts")
    parser.add_argument("--post", action='store_true', help="Post immediately")
    parser.add_argument("--schedule", action='store_true', help="Schedule for later")
    parser.add_argument("--show-scheduled", action='store_true', help="Show scheduled posts")
    parser.add_argument("--cancel", action='store_true', help="Cancel a scheduled post")
    
    parser.add_argument("--brand", help="Brand slug (e.g. island-splash)")
    parser.add_argument("--ad-id", help="Ad ID to post")
    parser.add_argument("--post-id", help="Scheduled post ID to cancel")
    parser.add_argument("--platform", default="instagram", help="Platform (default: instagram)")
    parser.add_argument("--at", help="ISO datetime to schedule (e.g. 2026-04-25T09:00:00Z)")
    parser.add_argument("--caption", help="Post caption (uses ad caption if not provided)")
    parser.add_argument("--hashtags", help="Hashtags (uses ad hashtags if not provided)")
    
    args = parser.parse_args()
    
    # List accounts mode
    if args.list_accounts:
        show_accounts()
        return 0
    
    # Show scheduled mode
    if args.show_scheduled:
        if not args.brand:
            print("\n❌ --brand required\n")
            return 1
        show_scheduled(args.brand)
        return 0
    
    # Cancel scheduled mode
    if args.cancel:
        if not args.brand or not args.post_id:
            print("\n❌ --brand and --post-id required\n")
            return 1
        return cancel_scheduled(args.brand, args.post_id)
    
    # Post mode
    if args.post:
        if not args.brand or not args.ad_id:
            print("\n❌ --brand and --ad-id required\n")
            return 1
        return post_ad(args.brand, args.ad_id, args.platform, args.caption, args.hashtags)
    
    # Schedule mode (placeholder - Blotato scheduling API varies)
    if args.schedule:
        if not args.brand or not args.ad_id:
            print("\n❌ --brand and --ad-id required\n")
            return 1
        
        # For now, add to scheduled list without actual API call
        # Blotato's scheduling API requires different implementation
        print("\n⚠️  Scheduling requires more setup.")
        print("   For now, use --post to post immediately.")
        print("   Or use the Hermes agent to manage scheduling.\n")
        return 1
    
    # No action specified
    print("\n=== Asset Ads - Schedule/Post Tool ===\n")
    print("Commands:")
    print("  --list-accounts       List connected social accounts")
    print("  --show-scheduled      Show scheduled posts for a brand")
    print("  --post                Post an ad immediately")
    print("  --cancel              Cancel a scheduled post")
    print("\nExamples:")
    print("  python3 schedule_post.py --list-accounts")
    print("  python3 schedule_post.py --post --brand island-splash --ad-id ad_123")
    print("  python3 schedule_post.py --show-scheduled --brand island-splash\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
