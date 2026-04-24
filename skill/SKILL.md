---
name: asset-ads
description: Run a multi-brand social-media ad pipeline. Onboard new brands, manage reference image pools per product, generate on-brand ad creatives from those references, and (later) schedule posts to connected social accounts.
version: 0.1.0
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

- User wants to create ads for a product or brand.
- User mentions "references", "ad pool", "generate an ad", "schedule a post".
- User says they want to onboard a new brand.
- User wants to review, delete, or approve generated creatives.

## Core Concepts

- **Brand** — a named workspace (`brands/<slug>.json` = config, `brand_assets/<slug>/` = media).
- **Reference pool** — real photos of the brand's product in lifestyle settings. Input only. See `references/ref-pools.md`.
- **Ad pool** — generated creatives. Output only. **Never feed an ad back in as a reference.**
- **Flow** — a named multi-step pipeline (onboard, add-refs, generate, schedule).

## The Four Flows

1. **Onboard brand** — interview the user, produce `brands/<slug>.json` + folder scaffold.
   See `references/onboard-brand.md`.
2. **Add references** — intake images into a product's ref pool from chat uploads.
   See `references/add-refs.md`.
3. **Generate ad** — call `scripts/generate_ad.py` with a locked product, pick
   from ref pool, return creative + write to website data.
   See `references/ad-generation-pipeline.md`.
4. **Schedule post** — stage 2, not built yet. See `references/scheduling-pipeline.md`.

## Output Contract (how the dashboard sees results)

After generating an ad, append a record to `website/public/data/ads.json` and
drop the PNG into `website/public/images/ads/<brand-slug>/`. The Next.js site
on Vercel reads this and renders it. That's the view-only user dashboard.

## Brand Config Schema

See `references/brand-config-schema.md` for the JSON shape.
Real examples in `brands/island-splash.json`, `brands/cinco-h-ranch.json`.

## Scripts

Python entry points currently live at the **repo root** (they use `Path(__file__).parent`
to locate `brands/` and `output/`). Always run from repo root.

- `asset_ads.py` — main multi-brand ad generation engine.
- `generate_splash_ad.py` — Island Splash carousel generator (imports from `src/gemini.py`).
- `batch_splash_ads.py` — batch runner over a folder of refs.
- `schedule_runner.py` — cron-fired post scheduler (stage 2, uses Blotato).

Phase 1 TODO: relocate these into `skill/scripts/` once we refactor path handling
and the `gemini` helper module. See `skill/scripts/README.md`.

## Non-negotiables

- Reference pools and ad pools are **strictly separate**. Never mix.
- No medical claims in any brand copy. See per-brand `forbidden` list in the config.
- Generated output is **local-only** by default (`output/` is gitignored). The dashboard's copy under `website/public/images/ads/` is the exception — that ships to Vercel.
