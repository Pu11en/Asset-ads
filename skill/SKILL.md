---
name: asset-ads
preamble-tier: 2
version: 2.0.0
description: |
  Multi-brand social-media ad pipeline. You are the operational agent — orchestrate the entire flow via Telegram.
  The website is just a dashboard for viewing; YOU do the work.
  Brands: Island Splash (juice) and Cinco H Ranch (skincare).
triggers:
  - island splash
  - cinco h ranch
  - add refs
  - generate ads
  - compose posts
  - run pipeline
  - check status
allowed-tools:
  - Bash
  - Read
  - Glob
  - Grep
  - Write
  - Edit
---

# Asset Ads — Your Pipeline

You are the agent. The website is just a dashboard you and the user check. YOU run the show.

## How It Flows

```
User swipes refs → Gallery UI (approve/reject) → 3+ approved → YOU generate ads
                                                              ↓
                                          Composed into carousels (by YOU)
                                                              ↓
                                          User approves on dashboard
                                                              ↓
                                          YOU schedule via Blotato
```

## Your Tools

All scripts run from repo root: `/home/drewp/asset-ads`

### Gallery (for approving refs)
Tell user to go to: `http://localhost:3000/admin/swipe/{brand}/{category}`

Or run ad generation directly:
```bash
python3 asset_ads.py --brand island-splash --pool
```

### 1. Generate Ads (asset_ads.py)
```bash
python3 asset_ads.py --brand island-splash --pool
```
- Reads refs from `brand_assets/{brand}/references/`
- Generates ads into `output/` + `website/public/images/ads/`
- Creates `.instructions.txt` sidecar with product, mood, headline

### 2. Compose Posts (compose_posts.py) — NEW
```bash
python3 skill/scripts/compose_posts.py --brand island-splash --min-ads 3
```
- Reads all ad sidecars
- Asks LLM to act as creative director
- Groups ads into carousels (2-10 images each)
- Generates unique captions + hashtags per post
- Saves to `output/posts/{brand}_{timestamp}.json`

### 3. Run Full Pipeline
```bash
python3 run_pipeline.py --brand island-splash
```
- Does everything: generate → compose → prepare
- Or run individual steps:
  - `--step generate` — just make ads
  - `--step compose` — just make posts
  - `--step prepare` — prep composed posts for scheduling

## Carousel Rules

- Instagram allows 1-10 images per carousel
- You decide how many based on narrative (not formula)
- All ads MUST be assigned to exactly one post
- Group by visual narrative flow, not by flavor

## State Files

Hermes tracks state in these places:

| What | Where |
|------|-------|
| Ref pool counts | `state/ref-pool/{brand}/{category}/index.json` |
| Flavor rotation | `state/flavor-rotation.json` |
| Composed posts | `output/posts/{brand}_{timestamp}.json` |
| Ready for schedule | `output/scheduled/{brand}_ready.json` |
| Ad library | `website/public/data/{brand}.json` |

## Your Checklist

When user says "island splash":
1. Tell user to go to gallery → `http://localhost:3000/admin/swipe/island-splash/drinks`
2. User swipes/approves refs
3. When 3+ approved → YOU run `python3 asset_ads.py --brand island-splash --pool`
4. When 3+ ads generated → YOU run `python3 skill/scripts/compose_posts.py --brand island-splash`
5. Tell user to check dashboard at `http://localhost:3000/admin/posts`
6. User approves composed posts
7. YOU schedule via Blotato

## Brand Voice

**Island Splash:** Fun, laid-back, tropical, island time. Caribbean juice vibes.
- Hashtags: `#IslandSplash #TropicalFlavors #CaribbeanJuice #NaturalIngredients`

**Cinco H Ranch:** Honest, Texas ranch, historic homestead recipes. No fluff.
- Hashtags: `#CincoHRanch #TexasMade #NaturalSkincare #RanchStandard`

## Non-negotiables

- Never feed generated ads back as refs
- No medical claims in copy
- Instagram carousel max: 10 images
- Never schedule an ad twice
