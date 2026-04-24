# ASSET-ADS — LOCAL SPEC (Hermes/Telegram)
**Version:** 2.0
**Date:** 2026-04-23
**Status:** Working Now / All 4 Flows Built

---

## What This Is

The working version that runs through **Hermes agent via Telegram**.

Drew uses this NOW to generate ads for Island Splash and Cinco H Ranch.

---

## How It Works (Right Now)

```
Telegram Message → Hermes Agent → Python Scripts → Output Files
                       ↓
                  Gemini API (image gen)
                       ↓
                  Blotato API (posting)
                       ↓
                  Vercel Website (dashboard view)
```

---

## The Setup

### Where It Runs
- **Hermes Agent**: Railway (cloud) or local
- **Scripts**: `/home/drewp/asset-ads/skill/scripts/`
- **Dashboard**: Vercel (Next.js site)

### How You Talk To It
Telegram chat with the Hermes bot.

### Commands (Natural Language)
- "generate ad for island-splash mango passion"
- "onboard my new brand"
- "add these photos to island-splash mango passion"
- "post this ad"
- "show scheduled posts"

---

## The 4 Flows (ALL BUILT ✅)

| Flow | Status | Script | Doc |
|------|--------|--------|-----|
| **Onboard Brand** | ✅ Built | `onboard_brand.py` | `onboard-brand.md` |
| **Add References** | ✅ Built | `add_refs.py` | `add-refs.md` |
| **Generate Ad** | ✅ Works | `asset_ads.py` | `ad-generation-pipeline.md` |
| **Schedule Post** | ✅ Built | `schedule_post.py` | `schedule-post.md` |

---

## Scripts (skill/scripts/)

### onboard_brand.py
Create a new brand from scratch.

```bash
python3 skill/scripts/onboard_brand.py \
  --name "Brand Name" \
  --products "Product 1" "Product 2" \
  --vibe "fun, tropical"
```

### add_refs.py
Add reference photos to a product's pool.

```bash
# List products
python3 skill/scripts/add_refs.py --brand island-splash --list-products

# Add photos
python3 skill/scripts/add_refs.py --brand island-splash --product "Mango Passion" --images photo1.jpg photo2.jpg
```

### schedule_post.py
Post or schedule ads.

```bash
# List accounts
python3 skill/scripts/schedule_post.py --list-accounts

# Post ad
python3 skill/scripts/schedule_post.py --post --brand island-splash --ad-id ad_123.png
```

---

## File Structure (Current)

```
/home/drewp/asset-ads/
├── skill/
│   ├── SKILL.md                   ← Updated entry point
│   ├── references/
│   │   ├── onboard-brand.md       ← Updated
│   │   ├── add-refs.md            ← Updated
│   │   ├── ad-generation-pipeline.md
│   │   └── schedule-post.md       ← Updated
│   └── scripts/                   ← All scripts now here
│       ├── onboard_brand.py       ← NEW
│       ├── add_refs.py            ← NEW
│       ├── schedule_post.py       ← NEW
│       └── README.md
├── brands/
│   ├── island-splash.json
│   └── cinco-h-ranch.json
├── brand_assets/
│   └── <brand>/references/        ← Reference photos
├── output/                         ← Generated ads (gitignored)
├── website/
│   └── public/
│       ├── data/ads.json          ← Dashboard reads this
│       └── images/ads/           ← Synced ad images
├── asset_ads.py                    ← Ad generator (repo root)
└── src/gemini.py                  ← Gemini helper
```

---

## Brand Config Example

```json
{
  "slug": "island-splash",
  "display_name": "Island Splash",
  "scheduling": {
    "posts_per_day": 2,
    "time_slots": ["09:00", "17:00"],
    "platforms": ["instagram"],
    "instagram_account_id": "27011"
  },
  "identity": {
    "vibe": "fun, tropical, Caribbean",
    "palette": { "hex": ["#FF6B35", "#00B4D8"] }
  },
  "products": [
    { "name": "Mango Passion", "keywords": ["mango", "tropical"] }
  ],
  "global_forbidden_text": [
    { "pattern": "#", "severity": "error", "reason": "no hashtags" }
  ]
}
```

---

## Non-Negotiables (Same as Final)

- ❌ Ref photos never become ad images
- ❌ No medical claims
- ❌ No pricing/discounts
- ❌ Never post without user approval

---

## API Keys Needed

| Service | Purpose | Where It's Stored |
|---------|---------|-------------------|
| Gemini API | Image generation | `~/.hermes/profiles/hermes-11/.env` |
| Blotato API | Instagram posting | `~/.hermes/profiles/hermes-11/.env` |

---

## What's Next (Polish)

- [ ] Test onboard flow with new brand
- [ ] Test add refs with actual photos
- [ ] Test post flow end-to-end
- [ ] Add `cinco-h-ranch` reference photos
- [ ] Web chat UI (replace Telegram for end users)

---

## Repo Info

- **GitHub**: `Pu11en/Asset-ads`
- **Deploy**: Vercel (website), Railway (Hermes)
