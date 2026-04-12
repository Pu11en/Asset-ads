# Island Splash — Asset Ads Pipeline

Turn Pinterest drink ads into Island Splash Instagram carousels automatically.

## What It Does

1. Takes a Pinterest URL → finds more beverage-filtered ad references
2. Analyzes each reference with Gemini Vision
3. Generates custom Island Splash carousel slides (1 ref + products per slide)
4. Shows you the finished carousel for approval
5. Posts approved carousel to Instagram via Blotato REST API

## Quick Start

### 1. Install Dependencies

```bash
pip install requests Pillow google-genai

# Pinterest scraper (for find-more refs)
git clone https://github.com/your-repo/pinterest-dl.git
```

### 2. Add Your Product Images

Place Island Splash product photos in `media/products/`:
- `island-splash_mango-passion.jpg`
- `island-splash_mauby.jpg`
- `island-splash_peanut-punch.jpg`
- `island-splash_lime.jpg`
- `island-splash_guava-pine.jpg`
- `island-splash_sorrel.jpg`
- `island-splash_pine-ginger.jpg`

Place the logo in `media/logos/island-splash_logo.jpg`.

### 3. Configure API Keys

```bash
export GEMINI_API_KEY="your_gemini_api_key"
export BLOTATO_API_KEY="your_blotato_api_key"
```

### 4. Generate a Carousel

```bash
python3 -c "
from src.pipeline import run_pipeline, display_carousel_for_approval, approve_and_post

result = run_pipeline('https://pinterest.com/pin/123456789/')
if result['success']:
    display_carousel_for_approval(
        result['slide_paths'],
        [p for slide in result['slide_plan'] for p in slide],
        result['caption']
    )
"
```

Then reply `approve` to post, or `reject` to regenerate.

### 5. Post After Approval

```bash
python3 -c "
from src.pipeline import approve_and_post

result = approve_and_post(slide_paths, caption, account_id='27011')
print('Posted!', result.get('publicUrl'))
"
```

## Directory Structure

```
asset-ads-pipeline/
  src/
    pipeline.py           # Full pipeline logic
  media/
    products/             # Product images (7 flavours)
    logos/                # Brand logo
  references/             # Pinterest reference images
  output/                 # Generated slide images
  pinterest-dl/           # Pinterest scraper (git submodule or separate clone)
  README.md
  requirements.txt
```

## Products

| Emoji | Name | File |
|---|---|---|
| 🥭 | Mango Passion | island-splash_mango-passion.jpg |
| 🌿 | Mauby | island-splash_mauby.jpg |
| 🥜 | Peanut Punch | island-splash_peanut-punch.jpg |
| 🍋 | Lime | island-splash_lime.jpg |
| 🫒 | Guava Pine | island-splash_guava-pine.jpg |
| 🌺 | Sorrel | island-splash_sorrel.jpg |
| 🫚 | Pine Ginger | island-splash_pine-ginger.jpg |

## Blotato Setup

1. Sign up at [blotato.com](https://blotato.com)
2. Connect your Instagram account (@islandsplashjuice = account ID `27011`)
3. Go to Settings → API → Generate API Key
4. Copy key to `BLOTATO_API_KEY` env var

## Brand Colors

- Primary: `#FF6B35` (vibrant orange)
- Secondary: `#00B4D8` (teal)
- Accent: `#90BE6D` (green)

## Caption Rules

- Instagram max 5 hashtags per post
- Always include: #IslandSplash #TropicalJuice #CaribbeanFlavours #NaturalFruit #IslandLife
- Hook → product callouts with emoji → CTA
