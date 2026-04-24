# asset-ads repo map

One-page, human-readable layout of what lives where.

## The three surfaces

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│   Hermes Agent      │    │    Next.js site     │    │  Local scripts      │
│   (Railway)         │───▶│    (Vercel)         │    │  (this machine)     │
│                     │    │                     │    │                     │
│  Loads skill/       │    │  Reads              │    │  Python engines     │
│  Runs flows         │    │  public/data/*.json │    │  at repo root       │
│  Writes to site     │    │  + public/images/   │    │  (cron, batch)      │
│                     │    │  View + download    │    │                     │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
```

## Folder guide

| Folder             | What                                                | Deploys to   |
| ------------------ | --------------------------------------------------- | ------------ |
| `skill/`           | Hermes skill package (agentskills.io format)        | Railway      |
| `skill/SKILL.md`   | Entry point — agent reads this on load              | Railway      |
| `skill/references/`| Flow instructions (onboard, refs, gen, schedule)    | Railway      |
| `skill/scripts/`   | Placeholder — see README, real scripts at root FTM  | Railway      |
| `skill/assets/`    | Templates (brand-template.json, etc.)               | Railway      |
| `website/`         | Next.js 16 + React 19 dashboard                     | Vercel       |
| `website/public/data/` | `ads.json`, `posts.json` — agent writes here    | Vercel       |
| `website/public/images/` | Ads, product shots, refs                      | Vercel       |
| `website/src/`     | React components (ads-client.tsx, etc.)             | Vercel       |
| `brands/`          | Per-brand JSON configs (voice, products, claims)    | Shared       |
| `brand_assets/`    | Per-brand media (refs, logos)                       | Local/shared |
| `docs/`            | This map + deploy docs                              | —            |
| `output/`          | Generated ads (gitignored, local only)              | Local only   |
| `src/`             | `gemini.py` helper (gitignored; fragile)            | Local only   |

## Scripts at root (Phase 0 — will relocate in Phase 1)

| File                       | Purpose                                |
| -------------------------- | -------------------------------------- |
| `asset_ads.py`             | Multi-brand ad generator (main)        |
| `generate_splash_ad.py`    | Island Splash carousel generator       |
| `batch_splash_ads.py`      | Batch runner                           |
| `schedule_runner.py`       | Cron-fired Blotato poster              |

## Two sites right now (transitional)

1. **`/home/drewp/splash-website/`** — Python `http.server` on `:4003`.
   Prototype. Not in git. Still running so you can use it during migration.
2. **`asset-ads/website/`** — Next.js. This is the future. Vercel deploys.

The Python prototype gets retired in Phase 1 when the Next.js site fully
replaces it.

## Data flow (MVP target)

```
User (browser)
   ↓ chat
Hermes (Railway) ── reads ──▶ skill/SKILL.md + references/*.md
   ↓ calls
Python scripts at repo root
   ↓ writes PNG
website/public/images/ads/<brand>/
   ↓ appends row
website/public/data/ads.json
   ↓ (git push → Vercel redeploy)  OR  (external bucket + runtime fetch)
User sees it on the dashboard
```

Phase 1 decision: do we push to Vercel on each generation (slow, fine for low volume) or move images to an external bucket (S3/R2) and have Vercel fetch them at runtime?

## Deploys

- **Railway**: `skill/` → Hermes loads it on boot. See `docs/RAILWAY_DEPLOY.md` (to be written).
- **Vercel**: `website/` → static + SSR dashboard. See `docs/VERCEL_DEPLOY.md` (to be written).
