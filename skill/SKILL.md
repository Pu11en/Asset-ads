---
name: asset-ads
description: Run a multi-brand social-media ad pipeline. Onboard new brands, manage reference image pools per product, generate on-brand ad creatives from those references, and schedule posts to connected social accounts.
version: 0.3.0
author: Drew Pullen
license: MIT
platforms: [linux, macos]
metadata:
  hermes:
    tags: [ads, marketing, brand-management, social-media, image-generation, carousel]
---

# Asset Ads

Give Hermes the ability to run an ad pipeline for one or many brands. The agent
is the center — it talks to the user (via chat), keeps brand state on disk,
calls scripts to generate creatives, and writes output to a dashboard the user
can view on the web.

## When to Use

- User wants to create ads for a product or brand
- User mentions "references", "ad pool", "generate an ad", "schedule a post"
- User says they want to onboard a new brand
- User wants to add reference photos
- User says "drain Pinterest", "pull from Pinterest", "fill my pool"

## The 5 Flows

### Flow 1: Onboard Brand
Create a new brand from scratch.

**Trigger:** "add a brand", "new brand", "set up my brand", "onboard"

```bash
python3 skill/scripts/onboard_brand.py --name "Brand Name" --products "Product 1" "Product 2"
```

See `references/onboard-brand.md`

### Flow 2: Add References
Add reference photos to a product's pool.

**Trigger:** "add these photos", "add to the pool", "upload refs"

Two ways:
1. **User sends images** → Use `add_refs.py`
2. **Drain Pinterest board** → Use `drain_board.py`

See `references/add-refs.md` and `references/drain-board.md`

### Flow 3: Generate Ad
Create an ad creative using reference photos and brand config.

**Trigger:** "generate ad", "create an ad", "make me an ad"

See `references/ad-generation-pipeline.md`

### Flow 4: Schedule Post
Post approved ads to social platforms.

**Trigger:** "post this ad", "publish it", "schedule for tomorrow"

```bash
python3 skill/scripts/schedule_post.py --post --brand <slug> --ad-id <id>
```

See `references/schedule-post.md`

## Quick Reference

| User Says | Agent Does |
|-----------|------------|
| "onboard new brand" | Run `onboard_brand.py`, interview user |
| "drain Pinterest board" | Run `drain_board.py` |
| "add these photos" | Run `add_refs.py` |
| "generate ad" | Run generation pipeline |
| "post this ad" | Run `schedule_post.py --post` |
| "show scheduled" | Run `schedule_post.py --show-scheduled` |

## Scripts Location

All scripts are in `skill/scripts/`. Run from repo root:

```bash
python3 skill/scripts/onboard_brand.py [args]
python3 skill/scripts/add_refs.py [args]
python3 skill/scripts/drain_board.py [args]
python3 skill/scripts/schedule_post.py [args]
```

## Non-negotiables

- Reference pools and ad pools are **strictly separate**. Never mix
- No medical claims in any brand copy
- Generated output is **local-only** by default (`output/` is gitignored)
- The dashboard copy under `website/public/images/ads/` ships to Vercel
