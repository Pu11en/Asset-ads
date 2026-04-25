# Asset Ads — Hermes Agent Brief

## Project Overview

Multi-brand social media ad pipeline. You are the operational agent. The website is just a dashboard for viewing; YOU do the work.

**Brands:** Island Splash (juice), Cinco H Ranch (skincare)

**Repo:** `/home/drewp/asset-ads`

---

## The Pipeline

```
Pinterest board → Refs in pool → User approves refs (gallery) →
50 approved refs → Generate ads → Compose into carousels →
User approves posts → Schedule via Blotato → Posted to Instagram
```

---

## Key Files

### Scripts (run from repo root: `/home/drewp/asset-ads`)

| Script | What it does |
|--------|--------------|
| `asset_ads.py` | Generate ads from refs. Usage: `python3 asset_ads.py --brand island-splash --pool` |
| `skill/scripts/compose_posts.py` | Group ads into carousels with captions. Usage: `python3 skill/scripts/compose_posts.py --brand island-splash --min-ads 3` |
| `skill/scripts/drain_board.py` | Scrape Pinterest board. Usage: `python3 skill/scripts/drain_board.py --brand X --board-url <url>` |
| `skill/scripts/add_refs.py` | Add ref images manually |
| `skill/scripts/generate_caption.py` | Generate caption + hashtags for a post |
| `skill/scripts/schedule_post.py` | Schedule via Blotato |
| `run_pipeline.py` | Orchestrator — run full pipeline or individual steps |

### Website (dashboard)

- **Admin:** `http://localhost:3000/admin`
- **Login:** password is `1234` (check `.env.local` for actual)
- **Gallery:** `http://localhost:3000/admin/swipe/{brand}/{category}` — approve/reject refs
- **Posts:** `http://localhost:3000/admin/posts` — view composed carousels

### State Files

| What | Where |
|------|-------|
| Ref pool counts | `state/ref-pool/{brand}/{category}/index.json` |
| Flavor rotation | `state/flavor-rotation.json` |
| Composed posts | `output/posts/{brand}_{timestamp}.json` |
| Ad library | `website/public/data/{brand}.json` |
| Generated ads | `website/public/images/ads/{brand}/` |

---

## Ad Generation (asset_ads.py)

**How it works:**
1. Reads refs from pool directory
2. For each ref: reverse analyze → vibe shift → compose prompt → generate image
3. Creates `.instructions.txt` sidecar with: products, mood, headline, vibe keywords
4. Outputs to `output/` + `website/public/images/ads/{brand}/`

**Sidecar format:**
```
PRODUCTS: Mango Passion, Pineapple
MOOD: tropical, energetic
HEADLINE: Tropical vibes in every sip
VIBE SHIFT: warm lighting, coral tones...
```

---

## Carousel Composition (compose_posts.py)

**How it works:**
1. Reads all ad `.instructions.txt` sidecars
2. Feeds them to Gemini as "creative director"
3. LLM groups ads into carousels (2-10 images each)
4. LLM decides which ads go together based on visual narrative
5. Generates unique caption + hashtags per post
6. Saves to `output/posts/{brand}_{timestamp}.json`

**Output format:**
```json
{
  "brand": "island-splash",
  "posts": [
    {
      "post_id": "post_1",
      "ad_filenames": ["ad1.png", "ad2.png", "ad3.png"],
      "post_type": "carousel",
      "creative_concept": "A vibrant carousel showcasing tropical flavors",
      "caption": "Tropical vibes in every sip...",
      "hashtags": "#IslandSplash #TropicalFlavors..."
    }
  ]
}
```

---

## Brand Voice

**Island Splash:** Fun, laid-back, tropical, Caribbean juice
- Hashtags: `#IslandSplash #TropicalFlavors #CaribbeanJuice #NaturalIngredients`

**Cinco H Ranch:** Honest, Texas ranch, historic homestead recipes
- Hashtags: `#CincoHRanch #TexasMade #NaturalSkincare #RanchStandard`

---

## Dead Code (can be ignored/deleted)

- `generate_splash_ad.py` — old Island Splash only, superseded
- `batch_splash_ads.py` — old, superseded
- `generate_campaign.py` — duplicate of run_pipeline.py

---

## Your Tasks as Agent

When user says "island splash" or wants to run the pipeline:

1. **Check state:** `cat state/ref-pool/island-splash/drinks/index.json`
2. **If 50+ approved refs:** Run `python3 asset_ads.py --brand island-splash --pool`
3. **If 3+ ads generated:** Run `python3 skill/scripts/compose_posts.py --brand island-splash --min-ads 3`
4. **Tell user:** Check `http://localhost:3000/admin/posts` to approve composed posts
5. **When approved:** Run `python3 skill/scripts/schedule_post.py` with the post data

---

## Current Status (as of 2026-04-25)

- Pinterest scraper: Working
- Ref pool: Has approved refs in `/home/drewp/hermes-11/references/all-drinks/approved/`
- Generated ads: 8 Island Splash ads in `website/public/images/ads/island-splash/`
- Composed posts: 2 batches in `output/posts/`
- Blotato: Needs API key configured
- Telegram: Not wired up yet

---

## Rules

- Never feed generated ads back as refs
- No medical claims in copy
- Instagram carousel max: 10 images
- Never schedule an ad twice
