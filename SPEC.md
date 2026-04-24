# Asset Ads — SPEC

## What this is

A two-brand (Island Splash + Cinco H Ranch) ad generation and social scheduling system. One agent orchestrates everything. Clients view their brand's ads through a password-gated Vercel site.

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│  Hermes Agent   │────▶│  Blotato MCP │     │  Vercel     │
│  (Railway)      │     │  (schedule)  │     │  (website)  │
└────────┬────────┘     └──────────────┘     └─────────────┘
         │                                        ▲
         │  generate ad                          │
         ▼                                        │
┌─────────────────┐                               │
│  Gemini API     │                               │
│  (image gen)    │                               │
└─────────────────┘                               │
         │                                        │
         ▼                                        │
┌─────────────────┐      ┌───────────────────────┘
│  local output/  │──────│  sync-ads.js → GitHub → Vercel
└─────────────────┘
```

## Brands

| Brand | Slug | Password | Status |
|-------|------|----------|--------|
| Island Splash | `island-splash` | `ahmeer` | Active — scheduling enabled |
| Cinco H Ranch | `cinco-h-ranch` | `carol` | Paused — no IG account yet |

## Repos

- `Pu11en/Asset-ads` — **deploy repo** — Next.js site → Vercel. Public, password-gated.
- `/home/drewp/asset-ads/` — **local agent repo** — Python ad gen, brand configs, Hermes skill. Not deployed.
- `/home/drewp/asset-ads-site/` — working copy of deploy repo, pushed to `Pu11en/Asset-ads`.

## Stages

### Stage 1 — Generate (done)
- Telegram bot triggers ad generation via Gemini
- Ads saved to `output/<brand>/`
- `scripts/sync-ads.js` pushes new ads to Vercel

### Stage 2 — Approve + Schedule (in progress)
**Flow:**
1. Agent shows you generated ads (in chat or on website)
2. You pick which ads to post
3. Agent writes caption + hashtags
4. Agent schedules post via Blotato MCP for the brand's connected Instagram
5. Scheduled post appears on website under "Scheduled" tab

**Skill file:** `skill/references/schedule-post.md`

**Data:** scheduled posts stored in `website/public/data/scheduled/<brand>.json` on the deploy repo. Synced via `sync-ads.js`.

**Blotato MCP actions used:**
- `blotato_schedule_post` — schedule a single image post to Instagram

**Constraints:**
- 5 slides per carousel (Instagram carousels)
- 2 posts/day per brand (AM + PM)
- Fresh caption + hashtags each time
- User reviews and approves before scheduling

### Stage 3 — Pinterest Drain (later)
- Pinterest board accumulates lifestyle images over time
- When threshold reached, refs drain into ref pool automatically
- Ads generate from refs

## Website pages

| Route | Auth | Content |
|-------|------|---------|
| `/` | None (password form) | Gate — enter brand password |
| `/island-splash` | Password cookie | Island Splash ads grid |
| `/cinco-h-ranch` | Password cookie | Cinco H Ranch ads grid |

Each brand page has tabs: **Ads** | **Scheduled**

## Ad data shape (ads.json)

```json
{
  "id": "island-splash-1715000000-004.png",
  "filename": "004.png",
  "path": "/images/ads/island-splash/004.png",
  "product_name": "Guava Pine",
  "caption": "...",
  "status": "new|approved|scheduled",
  "scheduled_at": null
}
```

## Scheduled post shape (scheduled/<brand>.json)

```json
{
  "id": "scheduled-1715000000",
  "ad_ids": ["island-splash-1715000000-004.png"],
  "caption": "...",
  "hashtags": "#islandsplash #guavapine ...",
  "scheduled_at": "2026-04-24T09:00:00Z",
  "platform": "instagram",
  "status": "scheduled|posted|failed"
}
```

## Skill reference files

- `skill/SKILL.md` — top-level entry point
- `skill/references/brand-config-schema.md` — shape of a brand config
- `skill/references/onboard-brand.md` — how to add a new brand
- `skill/references/add-refs.md` — how to add reference images
- `skill/references/ad-generation-pipeline.md` — how to generate an ad
- `skill/references/schedule-post.md` — **Stage 2 flow** — approve + schedule posts

## Non-negotiables

- Ref pools and ad pools are **strictly separate**
- Never use generated ads as reference images
- Blotato API key lives in `~/.hermes/profiles/hermes-11/.env`, never in a repo file
