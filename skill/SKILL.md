---
name: asset-ads
preamble-tier: 2
version: 5.0.0
description: |
  Multi-brand social-media ad pipeline. Website shows ads, YOU do the work.
  Brands: Island Splash (juice) and Cinco H Ranch (skincare).
triggers:
  - island splash
  - splash
  - splash go
  - cinco h ranch
  - cinco
  - cinco go
  - add refs
  - generate ads
  - compose posts
  - run pipeline
allowed-tools:
  - Bash
  - Read
  - Glob
  - Grep
  - Write
  - Edit
  - Vision
---

# Asset Ads Pipeline

Website: `http://localhost:3000`
- `/admin` — Ad pool (approve/skip ads)
- `/admin/swipe/{brand}/{category}` — Ref gallery (approve/reject refs)
- `/admin/posts` — Composed posts (schedule them)

Scripts run from: `/home/drewp/asset-ads`

## THE FLOW

```
Refs → YOU Generate Ads (write prompts) → Review on website → Compose Posts → Schedule
```

## TWO BRANDS — don't conflate them

- **Island Splash** (slug `island-splash`): Caribbean juice. 7 flavors. Triggers: "splash", "island splash", "splash go"
- **Cinco H Ranch** (slug `cinco-h-ranch`): Texas skincare. 3 products. Triggers: "cinco", "cinco h ranch", "cinco go"

When you hear "cinco" anywhere → brand is Cinco H Ranch. Never mix with Island Splash.

## HOW YOU GENERATE AN AD

YOU write the image-generation prompt. Read `skill/references/ad-generation-pipeline.md` for the full 5-phase framework.

TL;DR:
1. Analyze the reference image — extract EVERY forbidden element first
2. Write the prompt in 5 phases: Forbidden → Subject → Product → Text → Style
3. The product must look like it BELONGS in the scene — same lighting, same shadows
4. Generate with `gpt-image-2-medium` at 4:5 aspect ratio

### Image generation tool

Use the `image_gen` tool available to you. Format:
- Model: `gpt-image-2-medium`
- Aspect ratio: `4:5`
- Include reference image + product label as inputs

## BEHAVIOR

### "splash go" or "cinco go" (no image attached)
Drain that brand's pool. Generate ads from all refs in the pool.

### "splash go" or "cinco go" (with image attached)
One-off generation on that specific ref. Pool untouched.

### User sends image without "go"
Add to the brand's pool. Don't generate yet.

## COMMANDS

### Generate ads from pool
```bash
cd /home/drewp/asset-ads
.venv/bin/python3 asset_ads.py --brand island-splash --pool
```

### Generate ad from specific ref
```bash
cd /home/drewp/asset-ads
.venv/bin/python3 asset_ads.py --brand island-splash --ref /path/to/ref.jpg --product "Peanut Punch"
```

### Compose posts from generated ads
```bash
cd /home/drewp/asset-ads
.venv/bin/python3 skill/scripts/compose_posts.py --brand island-splash
```

### Schedule posts via Blotato
```bash
cd /home/drewp/asset-ads
.venv/bin/python3 skill/scripts/schedule_post.py --brand island-splash
```

## DATA LOCATIONS

| What | Where |
|------|-------|
| Ref images (pool) | `/home/drewp/hermes-11/references/all-drinks/` |
| Generated ads | `website/public/images/ads/{brand}/` |
| Ad library | `website/public/data/{brand}.json` |
| Approval state | `output/ad-approval/{brand}.json` |
| Composed posts | `output/posts/` |
| Brand configs | `brands/{brand}.json` |
| Product images | `/home/drewp/splash-website/assets/products/` (brand config now uses `upgraded_*.png` automatically) |

## BRAND CONFIG

Always read `/home/drewp/asset-ads/brands/{brand}.json` before generating. Get:
- `identity.palette` — brand colors
- `identity.vibe` — brand voice
- `products[]` — each product with label_file, cap_rule, keywords
- `global_forbidden_text[]` — text patterns that must never appear

## BRAND VOICE

**Island Splash:**
- Colors: dark teal #243C3C, warm golden orange #F0A86C, deep coral orange #E4843C, warm sand #A89078
- Hashtags: #IslandSplash #TropicalFlavors #CaribbeanJuice #NaturalIngredients
- Voice: plain, honest, no spa-fluff
- Products: Mango Passion, Mauby, Peanut Punch, Lime, Guava Pine, Sorrel, Pine Ginger

**Cinco H Ranch:**
- Hashtags: #CincoHRanch #TexasMade #NaturalSkincare #RanchStandard
- Products: Honey Vanilla Soap, Rejuvenating Face + Body Cream, Sunscreen Stick

## RULES

- Never feed generated ads back as refs
- No medical claims in copy
- Instagram carousel max: 10 images
- Never schedule an ad twice
- Always use `upgraded_*.png` product images (opaque, better for compositing)
- YOU write the prompt — don't let a script build it generically
- Check `skill/references/ad-generation-pipeline.md` for the 5-phase prompt framework every time