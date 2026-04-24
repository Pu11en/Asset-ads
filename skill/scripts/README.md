# Asset Ads - Scripts

This folder contains the Python scripts that power the asset-ads skill.

## Scripts

| Script | Purpose |
|--------|---------|
| `onboard_brand.py` | Create a new brand (config + folders) |
| `add_refs.py` | Add reference photos to a product's pool |
| `drain_board.py` | Pull images from Pinterest board, auto-categorize |
| `schedule_post.py` | Post or schedule ads to social platforms |

## Running Scripts

All scripts run from the repo root:

```bash
cd /home/drewp/asset-ads
python3 skill/scripts/<script>.py --help
```

## Quick Examples

### Onboard a Brand
```bash
python3 skill/scripts/onboard_brand.py \
  --name "Morning Buzz Coffee" \
  --products "Espresso" "Latte" "Cold Brew" \
  --vibe "friendly, local, morning vibes"
```

### Add Reference Photos (Manual)
```bash
# List products
python3 skill/scripts/add_refs.py --brand island-splash --list-products

# Show pool
python3 skill/scripts/add_refs.py --brand island-splash --product "Mango Passion" --show-pool

# Add photos
python3 skill/scripts/add_refs.py --brand island-splash --product "Mango Passion" --images photo1.jpg photo2.jpg
```

### Drain Pinterest Board (Auto-Categorize)

**For single-pool brands (like Island Splash - all drinks in one pool):**
```bash
python3 skill/scripts/drain_board.py \
  --brand island-splash \
  --board-url "https://pinterest.com/user/board/xyz"
```

**For multi-pool brands (like Cinco H Ranch - soap, sunscreen, etc.):**
```bash
python3 skill/scripts/drain_board.py \
  --brand cinco-h-ranch \
  --board-url "https://pinterest.com/user/board/xyz" \
  --auto-categorize
```

**Preview first:**
```bash
python3 skill/scripts/drain_board.py \
  --brand cinco-h-ranch \
  --board-url "..." \
  --dry-run
```

### Post to Instagram
```bash
# List accounts
python3 skill/scripts/schedule_post.py --list-accounts

# Post ad
python3 skill/scripts/schedule_post.py --post --brand island-splash --ad-id island-splash-123.png
```

## Requirements

```bash
pip install requests Pillow
pip install google-genai  # For drain_board.py auto-categorization
```

## Environment

Scripts expect to run from the repo root where:
- `brands/` folder exists
- `brand_assets/` folder exists
- `output/` folder exists
- `website/public/data/` folder exists

API keys are loaded from:
- Environment variable: `BLOTATO_API_KEY`, `GEMINI_API_KEY`
- Or from: `~/.hermes/profiles/hermes-11/.env`

## Pool Strategy by Brand

### Island Splash (Single Pool)
All 7 flavors share ONE reference pool because they're all drinks.
```bash
--pool "all-drinks"  # Force all images to one pool
```

### Cinco H Ranch (Multi Pool)
Different pools per product category (soap, sunscreen, lip balm, etc.)
```bash
--auto-categorize  # AI determines which pool each image belongs to
```

## Pinterest Setup

The drain script tries multiple methods to get images:
1. Pinterest API (requires access token)
2. pinterest-dl script (if installed)
3. HTML parsing (fallback, may not work for all boards)

For best results:
- Make Pinterest boards public
- Or set `PINTEREST_ACCESS_TOKEN` in environment
