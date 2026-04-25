#!/usr/bin/env python3
"""Asset Ads State Manager — persistent state for campaigns.

Manages:
- Ref pools (approved, rejected, used counts)
- Flavor rotation (Island Splash)
- Campaign progress
- Current brand

Usage:
    python3 state_manager.py status <brand> [--category <cat>]
    python3 state_manager.py approve-refs <brand> <count> [--category <cat>]
    python3 state_manager.py reject-refs <brand> <count> [--category <cat>]
    python3 state_manager.py mark-used <brand> <count> [--category <cat>]
    python3 state_manager.py reset-pool <brand> [--category <cat>]
    python3 state_manager.py set-brand <brand>
    python3 state_manager.py next-flavor <brand>
    python3 state_manager.py campaign-status <brand>
"""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent
STATE_DIR = REPO_ROOT / "state"


def get_state_path(*parts):
    """Get path to a state file, creating directories as needed."""
    path = STATE_DIR / Path(*parts)
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def load_json(path):
    if path.exists():
        return json.loads(path.read_text())
    return None


def save_json(path, data):
    path.write_text(json.dumps(data, indent=2))


def cmd_status(brand, category="drinks"):
    """Show status of a ref pool."""
    path = get_state_path("ref-pool", brand, category, "index.json")
    data = load_json(path)

    if not data:
        print(f"Pool '{brand}/{category}': empty or not initialized")
        return

    print(f"Pool: {brand}/{category}")
    print(f"  Unapproved: {data.get('unapproved', 0)}")
    print(f"  Approved:   {data.get('approved', 0)}")
    print(f"  Rejected:  {data.get('rejected', 0)}")
    print(f"  Used:      {data.get('used', 0)}")
    print(f"  Threshold: {data.get('trigger_threshold', 3)}")
    print(f"  Triggered: {data.get('triggered', False)}")
    print(f"  Updated:   {data.get('last_updated', 'never')}")


def cmd_init_pool(brand, category="drinks", threshold=3):
    """Initialize a ref pool."""
    path = get_state_path("ref-pool", brand, category, "index.json")
    data = {
        "brand": brand,
        "category": category,
        "unapproved": 0,
        "approved": 0,
        "rejected": 0,
        "used": 0,
        "trigger_threshold": threshold,
        "triggered": False,
        "last_updated": datetime.now().isoformat()
    }
    save_json(path, data)
    print(f"Initialized pool: {brand}/{category} (threshold={threshold})")


def cmd_approve_refs(brand, count, category="drinks"):
    """Move refs from unapproved to approved."""
    path = get_state_path("ref-pool", brand, category, "index.json")
    data = load_json(path) or {}

    unapproved = data.get("unapproved", 0)
    approved = data.get("approved", 0)

    if unapproved < count:
        print(f"Error: only {unapproved} unapproved refs available")
        return

    data["unapproved"] = unapproved - count
    data["approved"] = approved + count
    data["last_updated"] = datetime.now().isoformat()

    # Check if threshold met
    if data["approved"] >= data.get("trigger_threshold", 3):
        data["triggered"] = True
        print(f"✓ Approved {count} refs → {data['approved']} total (threshold met!)")
    else:
        print(f"✓ Approved {count} refs → {data['approved']}/{data.get('trigger_threshold', 3)} (need {data.get('trigger_threshold', 3) - data['approved']} more)")

    save_json(path, data)


def cmd_reject_refs(brand, count, category="drinks"):
    """Move refs from unapproved to rejected."""
    path = get_state_path("ref-pool", brand, category, "index.json")
    data = load_json(path) or {}

    unapproved = data.get("unapproved", 0)

    if unapproved < count:
        print(f"Error: only {unapproved} unapproved refs available")
        return

    data["unapproved"] = unapproved - count
    data["rejected"] = data.get("rejected", 0) + count
    data["last_updated"] = datetime.now().isoformat()

    print(f"✓ Rejected {count} refs")
    save_json(path, data)


def cmd_mark_used(brand, count, category="drinks"):
    """Move refs from approved to used."""
    path = get_state_path("ref-pool", brand, category, "index.json")
    data = load_json(path) or {}

    approved = data.get("approved", 0)

    if approved < count:
        print(f"Error: only {approved} approved refs available")
        return

    data["approved"] = approved - count
    data["used"] = data.get("used", 0) + count
    data["last_updated"] = datetime.now().isoformat()

    print(f"✓ Marked {count} refs as used (total used: {data['used']})")
    save_json(path, data)


def cmd_add_unapproved(brand, count, category="drinks"):
    """Add unapproved refs (after scraping)."""
    path = get_state_path("ref-pool", brand, category, "index.json")
    data = load_json(path)

    if not data:
        cmd_init_pool(brand, category)
        data = load_json(path)

    data["unapproved"] = data.get("unapproved", 0) + count
    data["last_updated"] = datetime.now().isoformat()

    print(f"✓ Added {count} unapproved refs (total unapproved: {data['unapproved']})")
    save_json(path, data)


def cmd_reset_pool(brand, category="drinks"):
    """Reset a pool to empty state."""
    path = get_state_path("ref-pool", brand, category, "index.json")
    if path.exists():
        path.unlink()
    print(f"✓ Reset pool: {brand}/{category}")


def cmd_set_brand(brand):
    """Set the current active brand."""
    path = get_state_path("current-brand.json")
    data = {
        "brand": brand,
        "last_updated": datetime.now().isoformat()
    }
    save_json(path, data)
    print(f"✓ Current brand set to: {brand}")


def cmd_next_flavor(brand):
    """Get and advance flavor rotation."""
    path = get_state_path("flavor-rotation.json")
    data = load_json(path)

    # Load brand config to get products
    brand_path = REPO_ROOT / "brands" / f"{brand}.json"
    if not brand_path.exists():
        print(f"Error: brand config not found: {brand_path}")
        return

    brand_cfg = json.loads(brand_path.read_text())
    products = [p["name"] for p in brand_cfg.get("products", [])]

    if not products:
        print("Error: no products found in brand config")
        return

    if not data or data.get("brand") != brand:
        # Initialize
        data = {
            "brand": brand,
            "products": products,
            "current_index": 0
        }

    current = data["current_index"]
    current_product = products[current]

    # Advance
    next_index = (current + 1) % len(products)
    data["current_index"] = next_index
    data["last_updated"] = datetime.now().isoformat()

    save_json(path, data)
    print(f"Current flavor: {current_product} (next: {products[next_index]})")


def cmd_get_flavor(brand):
    """Get current flavor without advancing."""
    path = get_state_path("flavor-rotation.json")
    data = load_json(path)

    brand_path = REPO_ROOT / "brands" / f"{brand}.json"
    if not brand_path.exists():
        print(f"Error: brand config not found")
        return

    brand_cfg = json.loads(brand_path.read_text())
    products = [p["name"] for p in brand_cfg.get("products", [])]

    if not data or data.get("brand") != brand:
        print(products[0] if products else "none")
        return

    current = data.get("current_index", 0)
    print(products[current % len(products)] if products else "none")


def cmd_campaign_status(brand):
    """Show campaign progress."""
    path = get_state_path("campaigns", brand, "current", "plan.json")
    data = load_json(path)

    if not data:
        print(f"No active campaign for {brand}")
        return

    print(f"Campaign: {brand}")
    print(f"  Started: {data.get('started_at', 'unknown')}")
    print(f"  Refs used: {data.get('approved_refs_used', 0)}")
    print(f"  Ads generated: {data.get('ads_generated', 0)}")
    print(f"  Posts created: {data.get('posts_created', 0)}")
    print(f"  Status: {data.get('status', 'unknown')}")


def cmd_init_campaign(brand, ref_count):
    """Initialize a campaign."""
    path = get_state_path("campaigns", brand, "current")
    plan_path = path / "plan.json"
    posts_path = path / "posts.json"

    plan_data = {
        "brand": brand,
        "started_at": datetime.now().isoformat(),
        "approved_refs_used": ref_count,
        "ads_generated": 0,
        "posts_created": 0,
        "status": "generating"
    }

    posts_data = {"posts": []}

    save_json(plan_path, plan_data)
    save_json(posts_path, posts_data)

    print(f"✓ Campaign initialized: {brand} ({ref_count} refs)")


def cmd_add_post(brand, ad_ids, caption, hashtags):
    """Add a post to the current campaign."""
    path = get_state_path("campaigns", brand, "current")
    plan_path = path / "plan.json"
    posts_path = path / "posts.json"

    plan_data = load_json(plan_path) or {}
    posts_data = load_json(posts_path) or {"posts": []}

    post_id = f"post_{len(posts_data['posts']) + 1:03d}"

    post = {
        "id": post_id,
        "ad_ids": ad_ids,
        "caption": caption,
        "hashtags": hashtags,
        "status": "pending_approval",
        "created_at": datetime.now().isoformat()
    }

    posts_data["posts"].append(post)
    plan_data["posts_created"] = len(posts_data["posts"])
    plan_data["last_updated"] = datetime.now().isoformat()

    save_json(plan_path, plan_data)
    save_json(posts_path, posts_data)

    print(f"✓ Post created: {post_id}")


def cmd_approve_post(brand, post_id):
    """Approve a post."""
    path = get_state_path("campaigns", brand, "current", "posts.json")
    data = load_json(path)

    if not data:
        print("Error: no posts found")
        return

    for post in data["posts"]:
        if post["id"] == post_id:
            post["status"] = "approved"
            post["approved_at"] = datetime.now().isoformat()
            save_json(path, data)
            print(f"✓ Post {post_id} approved")
            return

    print(f"Error: post {post_id} not found")


def cmd_schedule_post(brand, post_id):
    """Mark post as scheduled."""
    path = get_state_path("campaigns", brand, "current", "posts.json")
    data = load_json(path)

    if not data:
        print("Error: no posts found")
        return

    for post in data["posts"]:
        if post["id"] == post_id:
            post["status"] = "scheduled"
            post["scheduled_at"] = datetime.now().isoformat()
            save_json(path, data)
            print(f"✓ Post {post_id} scheduled")
            return

    print(f"Error: post {post_id} not found")


def cmd_get_unapproved_refs(brand, category="drinks"):
    """Get list of unapproved ref filenames."""
    # Get pool_dir from brand config
    cfg_path = REPO_ROOT / "brands" / f"{brand}.json"
    if cfg_path.exists():
        cfg = json.loads(cfg_path.read_text())
        pool_dir = Path(cfg.get("paths", {}).get("pool_dir", REPO_ROOT / "brands" / brand))
    else:
        pool_dir = REPO_ROOT / "brands" / brand

    pool_dir = pool_dir / category if category else pool_dir

    if not pool_dir.exists():
        return []

    # Get already processed (approved/rejected/used)
    approved_dir = pool_dir / "approved"
    rejected_dir = pool_dir / "rejected"
    used_dir = pool_dir / "used"

    approved_files = set()
    rejected_files = set()
    used_files = set()

    if approved_dir.exists():
        approved_files = {p.name for p in approved_dir.iterdir() if p.suffix.lower() in ['.jpg', '.jpeg', '.png', '.webp']}
    if rejected_dir.exists():
        rejected_files = {p.name for p in rejected_dir.iterdir() if p.suffix.lower() in ['.jpg', '.jpeg', '.png', '.webp']}
    if used_dir.exists():
        used_files = {p.name for p in used_dir.iterdir() if p.suffix.lower() in ['.jpg', '.jpeg', '.png', '.webp']}

    processed = approved_files | rejected_files | used_files

    # Get unprocessed refs
    unapproved = []
    for p in sorted(pool_dir.iterdir()):
        if p.suffix.lower() in ['.jpg', '.jpeg', '.png', '.webp'] and p.name not in processed:
            unapproved.append(str(p))

    print(json.dumps(unapproved))


def main():
    parser = argparse.ArgumentParser(description="Asset Ads State Manager")
    subparsers = parser.add_subparsers(dest="cmd", help="Command")

    # Status
    p = subparsers.add_parser("status", help="Show pool status")
    p.add_argument("brand", help="Brand slug")
    p.add_argument("--category", default="drinks", help="Category (default: drinks)")

    # Init pool
    p = subparsers.add_parser("init-pool", help="Initialize a pool")
    p.add_argument("brand", help="Brand slug")
    p.add_argument("--category", default="drinks", help="Category")
    p.add_argument("--threshold", type=int, default=3, help="Trigger threshold")

    # Add unapproved
    p = subparsers.add_parser("add-unapproved", help="Add unapproved refs (after scrape)")
    p.add_argument("brand", help="Brand slug")
    p.add_argument("count", type=int, help="Number of refs")
    p.add_argument("--category", default="drinks", help="Category")

    # Approve
    p = subparsers.add_parser("approve", help="Approve refs")
    p.add_argument("brand", help="Brand slug")
    p.add_argument("count", type=int, help="Number of refs")
    p.add_argument("--category", default="drinks", help="Category")

    # Reject
    p = subparsers.add_parser("reject", help="Reject refs")
    p.add_argument("brand", help="Brand slug")
    p.add_argument("count", type=int, help="Number of refs")
    p.add_argument("--category", default="drinks", help="Category")

    # Mark used
    p = subparsers.add_parser("used", help="Mark refs as used")
    p.add_argument("brand", help="Brand slug")
    p.add_argument("count", type=int, help="Number of refs")
    p.add_argument("--category", default="drinks", help="Category")

    # Reset
    p = subparsers.add_parser("reset", help="Reset pool")
    p.add_argument("brand", help="Brand slug")
    p.add_argument("--category", default="drinks", help="Category")

    # Set brand
    p = subparsers.add_parser("set-brand", help="Set current brand")
    p.add_argument("brand", help="Brand slug")

    # Flavor
    p = subparsers.add_parser("next-flavor", help="Get next flavor (advances)")
    p.add_argument("brand", help="Brand slug")

    p = subparsers.add_parser("get-flavor", help="Get current flavor (no advance)")
    p.add_argument("brand", help="Brand slug")

    # Campaign
    p = subparsers.add_parser("campaign-status", help="Show campaign status")
    p.add_argument("brand", help="Brand slug")

    p = subparsers.add_parser("init-campaign", help="Initialize campaign")
    p.add_argument("brand", help="Brand slug")
    p.add_argument("ref_count", type=int, help="Number of refs used")

    p = subparsers.add_parser("add-post", help="Add post to campaign")
    p.add_argument("brand", help="Brand slug")
    p.add_argument("--ad-ids", nargs="+", help="Ad IDs")
    p.add_argument("--caption", default="", help="Caption")
    p.add_argument("--hashtags", default="", help="Hashtags")

    p = subparsers.add_parser("approve-post", help="Approve a post")
    p.add_argument("brand", help="Brand slug")
    p.add_argument("post_id", help="Post ID")

    p = subparsers.add_parser("schedule-post", help="Schedule a post")
    p.add_argument("brand", help="Brand slug")
    p.add_argument("post_id", help="Post ID")

    p = subparsers.add_parser("get-unapproved", help="Get list of unapproved refs")
    p.add_argument("brand", help="Brand slug")
    p.add_argument("--category", default="drinks", help="Category")

    args = parser.parse_args()

    if not args.cmd:
        parser.print_help()
        return

    if args.cmd == "status":
        cmd_status(args.brand, args.category)
    elif args.cmd == "init-pool":
        cmd_init_pool(args.brand, args.category, args.threshold)
    elif args.cmd == "add-unapproved":
        cmd_add_unapproved(args.brand, args.count, args.category)
    elif args.cmd == "approve":
        cmd_approve_refs(args.brand, args.count, args.category)
    elif args.cmd == "reject":
        cmd_reject_refs(args.brand, args.count, args.category)
    elif args.cmd == "used":
        cmd_mark_used(args.brand, args.count, args.category)
    elif args.cmd == "reset":
        cmd_reset_pool(args.brand, args.category)
    elif args.cmd == "set-brand":
        cmd_set_brand(args.brand)
    elif args.cmd == "next-flavor":
        cmd_next_flavor(args.brand)
    elif args.cmd == "get-flavor":
        cmd_get_flavor(args.brand)
    elif args.cmd == "campaign-status":
        cmd_campaign_status(args.brand)
    elif args.cmd == "init-campaign":
        cmd_init_campaign(args.brand, args.ref_count)
    elif args.cmd == "add-post":
        cmd_add_post(args.brand, args.ad_ids or [], args.caption, args.hashtags)
    elif args.cmd == "approve-post":
        cmd_approve_post(args.brand, args.post_id)
    elif args.cmd == "schedule-post":
        cmd_schedule_post(args.brand, args.post_id)
    elif args.cmd == "get-unapproved":
        cmd_get_unapproved_refs(args.brand, args.category)


if __name__ == "__main__":
    main()
