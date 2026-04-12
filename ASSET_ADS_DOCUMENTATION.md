# Island Splash — Asset Ads Pipeline Documentation

**Version:** 1.0 — April 2026
**Status:** Operational — No Supabase, fully local
**GitHub:** `Pu11en/asset-ads` (private)

---

## Overview

The Island Splash asset ads pipeline takes inspiration images from Pinterest, transforms them into Island Splash tropical drink ads using Gemini AI, and posts approved carousels to Instagram via the Blotato REST API.

**The promise:** You send one Pinterest link. The bot handles everything else. You only need to approve or reject the finished carousel before it goes live.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      TELEGRAM (Pullen)                              │
│   "generate an ad from this" → Pinterest URL                         │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     HERMES-2 AGENT (this bot)                        │
│                                                                      │
│  1. Pinterest find-more (beverage-filtered)                          │
│     → Downloads 4 reference images                                   │
│                                                                      │
│  2. Gemini Vision analysis                                           │
│     → PRESERVE / REPLACE / ADAPT breakdown per ref                   │
│                                                                      │
│  3. Gemini image generation                                          │
│     → 5 carousel slides (1 ref + selected products per slide)        │
│     → All 7 Island Splash products covered across slides             │
│                                                                      │
│  4. Approval display                                                 │
│     → Shows each slide sequentially with caption + hashtags         │
│     → USER replies: approve → Step 5 / reject → regenerate          │
│                                                                      │
│  5. Blotato REST API → Instagram @islandsplashjuice                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Brand Identity

### Products (7 Flavours)

| # | Emoji | Name | Tag |
|---|-------|------|-----|
| 1 | 🥭 | Mango Passion | MangoPassion |
| 2 | 🌿 | Mauby | Mauby |
| 3 | 🥜 | Peanut Punch | PeanutPunch |
| 4 | 🍋 | Lime | LimeJuice |
| 5 | 🫒 | Guava Pine | GuavaPine |
| 6 | 🌺 | Sorrel | SorrelDrink |
| 7 | 🫚 | Pine Ginger | PineGinger |

### Brand Colors

| Role | Hex | Use |
|------|-----|-----|
| Primary | `#FF6B35` | CTAs, brand moments |
| Secondary | `#00B4D8` | Accents, ocean feel |
| Accent | `#90BE6D` | Natural/green elements |

### Brand Feel

Tropical · Fun · Fresh · Friendly · Caribbean · Natural

### Health Claims

- 100% natural Caribbean fruit
- No artificial additives
- No concentrates
- No preservatives

### Instagram Account

| Field | Value |
|-------|-------|
| Platform | Instagram |
| Username | @islandsplashjuice |
| Account ID (Blotato) | `27011` |
| Posting frequency | ~1/day |

---

## Pipeline Flow — Step by Step

### Step 1: User Sends Pinterest URL

```
Pullen: "generate an ad from this: https://pinterest.com/pin/123456789/"
```

The bot treats ANY URL containing `pinterest.com` or `pin.it` as an implicit `!addref` or `!instant` request.

### Step 2: Pinterest Find-More (Beverage-Filtered)

The system downloads the seed image, then runs keyword searches to find more beverage-style ads. The key innovation is the **beverage filter** — it rejects refs containing alcohol keywords, fashion, people, tech, and food photography that doesn't match drinks.

**Drink Words (score boosters):**
```
drink, beverage, juice, soda, water, smoothie, shake,
lemonade, bottle, can, glass, cup, refreshment, fruit,
tropical, energy, coconut, pineapple, mango, berry,
citrus, health, wellness, flavored, sparkling, natural
```

**Junk Words (automatic rejection):**
```
beer, wine, vodka, whiskey, spirit, liquor, cocktail,
fashion, clothing, makeup, furniture, tech, car,
recipe, cake, pizza, man holding, woman holding,
model, portrait, selfie, face
```

Scored and ranked, top 4 refs downloaded for generation.

### Step 3: Gemini Vision Analysis

For each reference image, the bot calls `analyze_image()` which sends the image to Gemini Flash Vision with this prompt:

```
Analyze this Pinterest ad image for replication. Break it down:
1. Ad type (lifestyle, flatlay, product hero, etc.)
2. Layout (composition, text placement zones, focal point)
3. Lighting (direction, quality, mood)
4. Color mood (dominant palette, tone)
5. Background setting and props
6. Number of products shown
7. Energy/feeling the ad conveys

Then give a one-line PRESERVE / REPLACE / ADAPT summary:
PRESERVE: what must stay exactly the same
REPLACE: what product/branding elements change
ADAPT: how to tropicalize the feel while keeping the layout
```

The analysis is logged but the bot doesn't wait for user review — it proceeds to generation.

### Step 4: Slide Generation

**Critical Rule (NEVER BREAK):**

> ONE reference image + ONE OR MORE products for that slide + ONE prompt = ONE `generate_image()` call.

- **Never** pass products for Slide 2 when generating Slide 1.
- **Never** generate two slides in one call.
- If a slide has multiple products (e.g., Slide 3: Guava Pine + Sorrel + Mauby), pass them ALL in that ONE call.
- If a generation fails, retry with the SAME ref + same products before picking a new ref.

**Slide Plan** (all 7 products distributed across 5 slides):

| Slide | Products | Ref Used |
|-------|----------|----------|
| 1 | 🥭 Mango Passion | ref[0] |
| 2 | 🍋 Lime + 🫚 Pine Ginger | ref[1] |
| 3 | 🫒 Guava Pine + 🌺 Sorrel + 🌿 Mauby | ref[2] |
| 4 | 🥜 Peanut Punch | ref[3] |
| 5 | 🥭 Mango Passion (CTA) | ref[0] again |

**Generation Prompt Template:**

```
Transform this Pinterest ad image into an Island Splash tropical drink ad.

Slide N: Feature [product names].

BRAND: Island Splash — Caribbean-style tropical fruit drinks.
COLORS: Primary #FF6B35 (vibrant orange), Secondary #00B4D8 (teal), Accent #90BE6D (green).
PRESERVE: Layout, lighting, color mood, background, lifestyle feel, text placement zones.
REPLACE: Product shown must be replaced with Island Splash bottles.
         Props must be replaced with tropical fruits, leaves, or natural Caribbean elements.
ADAPT: Apply tropical color treatment (teal, orange, green) throughout.
       Match the lighting, shadows, and reflections of the original image so the
       Island Splash bottles look naturally photographed in the scene.
       Ensure the product label is clearly visible with the Island Splash branding.
```

**Product Image Paths:**

```
~/asset-ads/media/products/island-splash_mango-passion.jpg
~/asset-ads/media/products/island-splash_mauby.jpg
~/asset-ads/media/products/island-splash_peanut-punch.jpg
~/asset-ads/media/products/island-splash_lime.jpg
~/asset-ads/media/products/island-splash_guava-pine.jpg
~/asset-ads/media/products/island-splash_sorrel.jpg
~/asset-ads/media/products/island-splash_pine-ginger.jpg
~/asset-ads/media/logos/island-splash_logo.jpg      ← NOTE: logos/, not products/
```

**Output:** `~/asset-ads/output/slide_1.png` through `slide_5.png`

### Step 5: Approval Display

The bot shows the finished carousel to the user for review:

```
============================================================
   🌴 CAROUSEL READY FOR APPROVAL
============================================================

  Slide 1: /path/to/output/slide_1.png
  Product:  🥭 Mango Passion

  Slide 2: /path/to/output/slide_2.png
  Product:  🍋 Lime + 🫚 Pine Ginger

  ...

------------------------------------------------------------
  CAPTION:
------------------------------------------------------------
  🥭🌿🥜🍋🫒🌺🫚

  Swipe through the full Island Splash lineup:

  S1: 🥭 Mango Passion
  S2: 🍋 Lime + 🫚 Pine Ginger
  S3: 🫒 Guava Pine + 🌺 Sorrel + 🌿 Mauby
  S4: 🥜 Peanut Punch
  S5: 🥭 Mango Passion

  100% natural Caribbean fruit. Zero junk. All island.

  💛 Save this carousel. Share with someone who needs a taste of the tropics.

  #IslandSplash #TropicalJuice #CaribbeanFlavours #NaturalFruit #IslandLife

============================================================
  Reply:  approve / yes / post it  → post to Instagram
          reject / no / regenerate  → redo generation
============================================================
```

**User approval triggers `approve_and_post()`.**
**User rejection raises a signal to regenerate with new refs.**

### Step 6: Blotato Posting

After approval, the bot:

1. **Uploads each slide** to Blotato storage via presigned URLs
2. **Creates the post** with the caption and all 5 media URLs
3. **Polls for completion** (typically 10-30 seconds)
4. **Returns the public URL** (e.g., `https://www.instagram.com/p/DXBn-KlFFqH/`)

**Instagram hashtag rule:** Maximum 5 hashtags per post.

---

## Blotato REST API

**Base URL:** `https://backend.blotato.com/v2`
**Auth header:** `blotato-api-key: <your_key>`
**No OAuth, no browser, no MCP — pure REST.**

### Key Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/users/me/accounts` | List connected accounts |
| `POST` | `/media/uploads` | Get presigned upload URL |
| `PUT` | `<presignedUrl>` | Upload image binary |
| `POST` | `/posts` | Create a post (async) |
| `GET` | `/posts/:id` | Poll post status |

### Account IDs

| Account | ID | Platform |
|---------|----|----------|
| @islandsplashjuice | `27011` | Instagram |
| @drew__pullen | `14209` | Instagram |
| Drew Pullen | `9466` | Facebook |
| LinkedIn | `5883` | LinkedIn |
| TikTok | `15125` | TikTok |
| Twitter/X | `6855` | Twitter |
| Bluesky | `24176` | Bluesky |

### Upload + Post Flow

```python
import requests, time

API_KEY = "your_blotato_api_key"
BASE    = "https://backend.blotato.com/v2"
HEADERS = {"blotato-api-key": API_KEY, "Content-Type": "application/json"}

# 1. Upload image → get public URL
def upload_image(file_path: str) -> str:
    # Get presigned URL
    r = requests.post(f"{BASE}/media/uploads", headers=HEADERS,
        json={"filename": "slide.png", "contentType": "image/png"})
    data = r.json()
    # PUT binary to presigned URL
    with open(file_path, "rb") as f:
        requests.put(data["presignedUrl"], data=f.read(),
                    headers={"Content-Type": "image/png"})
    return data["publicUrl"]

# 2. Create carousel post (IG requires media — no text-only)
media_urls = [upload_image(f"slide_{i}.png") for i in range(1, 6)]

caption = "🌴 TROPICAL lineup 🌴\n\nSwipe through...\n\n#IslandSplash #TropicalJuice #CaribbeanFlavours #NaturalFruit #IslandLife"

r = requests.post(f"{BASE}/posts", headers=HEADERS, json={
    "post": {
        "accountId": "27011",
        "content": {"text": caption, "mediaUrls": media_urls, "platform": "instagram"},
        "target": {"targetType": "instagram"}
    }
})
submission_id = r.json()["postSubmissionId"]

# 3. Poll until published
for _ in range(30):
    time.sleep(3)
    status = requests.get(f"{BASE}/posts/{submission_id}", headers=HEADERS).json()
    if status["status"] == "published":
        print("LIVE:", status["publicUrl"])
        break
    if status["status"] == "failed":
        print("FAILED:", status)
        break
```

### API Key Setup

1. Log in to [blotato.com](https://blotato.com)
2. Go to **Settings → API → Generate API Key**
3. Copy the key
4. Set as environment variable: `export BLOTATO_API_KEY="blt_..."`

---

## Directory Structure

```
asset-ads/
  media/
    products/                 # 7 product images (REQUIRED)
      island-splash_mango-passion.jpg
      island-splash_mauby.jpg
      island-splash_peanut-punch.jpg
      island-splash_lime.jpg
      island-splash_guava-pine.jpg
      island-splash_sorrel.jpg
      island-splash_pine-ginger.jpg
    logos/
      island-splash_logo.jpg  # REQUIRED — passed to every generation
  references/                # Auto-populated by find-more
  output/                    # Generated slides (slide_1.png … slide_5.png)
  pinterest-dl/              # Pinterest scraper (separate clone)
  gemini-adapter/            # Gemini API wrapper (from existing asset-ads/src)
  pipeline/
    __init__.py
    pipeline.py              # run_pipeline(), approve_and_post(), BlotatoClient
```

---

## Caption Formula

### Structure

```
[Emojis for all featured flavours]

[Hook — bold statement or question]

[Slide-by-slide breakdown OR flavour description]

[Brand promise — 100% natural / zero junk / all island]

[CTA — save, share, tag, tap link]

[#IslandSplash #TropicalJuice #CaribbeanFlavours #NaturalFruit #IslandLife]
```

### Instagram Hashtag Rules

- **Maximum 5 hashtags** per post (Instagram enforced)
- Always include: `#IslandSplash` `#TropicalJuice` `#CaribbeanFlavours` `#NaturalFruit` `#IslandLife`
- Do NOT add more than 5 — Blotato will reject with `"Instagram allows a maximum of 5 hashtags per post."`

### Caption Templates

**Template 1 (recommended):**
```
🥭🌿🥜🍋🫒🌺🫚

Swipe through the full Island Splash lineup:

S1: 🥭 Mango Passion
S2: 🍋 Lime + 🫚 Pine Ginger
S3: 🫒 Guava Pine + 🌺 Sorrel + 🌿 Mauby
S4: 🥜 Peanut Punch
S5: 🥭 Mango Passion

100% natural Caribbean fruit. Zero junk. All island.

💛 Save this carousel. Share with someone who needs a taste of the tropics.

#IslandSplash #TropicalJuice #CaribbeanFlavours #NaturalFruit #IslandLife
```

**Template 2:**
```
🌺 TROPICAL lineup unlocked 🌺

S1: 🥭 Mango Passion
S2: 🍋 Lime + 🫚 Pine Ginger
S3: 🫒 Guava Pine + 🌺 Sorrel + 🌿 Mauby
S4: 🥜 Peanut Punch
S5: 🥭 Mango Passion

From the Caribbean to your hands — all natural, all flavour.

🏝️ Tag a friend who needs a taste of island life!

#IslandSplash #TropicalJuice #CaribbeanFlavours #NaturalFruit #IslandLife
```

---

## Generation Rules (Critical)

1. **ONE ref + ONE OR MORE products for that slide + ONE prompt = ONE `generate_image()` call.**
2. **Multi-product slide:** Pass ALL products for that slide in one call, then stitch with PIL only if needed.
3. **Never pass products for the wrong slide** — only the products appearing on that specific slide.
4. **Logo is in `media/logos/`, NOT `media/products/`** — always include logo in generation.
5. **Retry before changing ref** — if generation fails, retry with same inputs before picking a new reference image.
6. **No fake URLs** — never add websites or domains to generated images.
7. **Never generate the same ad twice** from the same reference.
8. **Rotate through all 7 products** — each product should appear at least once across carousel slides.

---

## Telegram Commands

### Natural Language (bot understands these):

- `"generate an ad from this <pinterest_url>"` — starts full pipeline
- `"add this pinterest link"` — adds to ref pool
- `"show me the pool"` — shows pending ref count
- `"approve this carousel"` / `"post it"` / `"yes"` — triggers posting
- `"reject this"` / `"no"` / `"regenerate"` — regenerates carousel
- `"show carousels"` — lists pending/approved carousels
- `"show the queue"` — shows scheduled posts

### Explicit Commands:

| Command | Description |
|---------|-------------|
| `!addref <url> [notes]` | Add Pinterest URL to ref pool |
| `!pool` | Show pool counts at 5/10/20 thresholds |
| `!batch [5\|10\|20]` | Manually trigger batch at threshold |
| `!instant <url>` | Generate ad immediately (no batching) |
| `!carousels` | List pending/approved carousels |
| `!approve <id> [caption] [hashtags]` | Approve and queue carousel |
| `!reject <id>` | Reject carousel |
| `!queue` | Show post queue |
| `!help` | Show help |

### URL Detection

ANY message containing `pinterest.com` or `pin.it` is treated as an implicit ref request. The bot asks:

> "Want me to batch this, or generate an ad right now?"

---

## API Keys & Credentials

| Service | Key / Location | Purpose |
|---------|---------------|---------|
| Gemini | `AIzaSyBopkWhOn7eupxCtwUH2IUb-i2zeyCHg8w` | Image generation + vision |
| Blotato | `blt_PBWdgMRLKJTZkWMUgN2qWDqEJeU3+37ohpjm2Ya3Ick=` | Instagram posting |

Stored in `~/.env.local` as:
```
GEMINI_API_KEY=AIzaSyBopkWhOn7eupxCtwUH2IUb-i2zeyCHg8w
BLOTATO_API_KEY=blt_PBWdgMRLKJTZkWMUgN2qWDqEJeU3+37ohpjm2Ya3Ick=
```

---

## Gemini Image Generation

**Model:** `gemini-3.1-flash-image-preview` (Gemini 3.1 Flash with image output)

**Function signature:**
```python
result = generate_image(
    reference_image_path='/path/to/ref.jpg',   # Pinterest reference (REQUIRED)
    product_image_paths=['/path/to/prod.jpg', '/path/to/logo.jpg'],  # REQUIRED, list
    generation_prompt='PRESERVE... REPLACE... ADAPT...',
    output_path='/path/to/output.png',          # REQUIRED
)
# Returns: {"success": bool, "output_path": str, "error": str}
```

**Size:** Default output is 4:5 (optimal for Instagram feed).

**Important:** Do NOT pass a `size` parameter — not supported by this wrapper.

---

## Troubleshooting

### "Instagram allows a maximum of 5 hashtags per post"
Instagram limit enforced by Blotato. Remove hashtags until only 5 remain. Always include `#IslandSplash`.

### Generation failed with 400 error
Gemini API sometimes returns 400 for malformed requests. The wrapper in `~/asset-ads/src/gemini.py` handles retries. If it persists, wait 30 seconds and retry.

### Slides don't match product assignments
Double-check `PRODUCTS_DIR` and `LOGO_PATH` paths are correct. Logo must be in `media/logos/`, not `media/products/`.

### Blotato upload returns HTTP 000
Network timeout on the presigned PUT. Retry the upload — the presigned URL is single-use but the upload endpoint generates a new one each call.

### Post stuck in "in-progress" for >2 minutes
Poll manually:
```bash
curl -s "https://backend.blotato.com/v2/posts/<submission_id>" \
  -H "blotato-api-key: <key>"
```
If status is "failed", check the error message. If still "in-progress", Blotato may be experiencing delays — wait up to 5 minutes before retrying.

---

## What Makes a Great Island Splash Ad

### DO
- Keep the tropical, fresh, fun energy
- Show real fruit in the props/background (mangoes, pineapples, leaves)
- Match the lighting of the reference image closely
- Make the Island Splash label clearly readable
- Use teal, orange, and green color treatment
- Show the product as the hero — it's a drink ad

### DON'T
- Add fake websites or URLs to the image
- Use more than one brand's products
- Generate alcohol-related imagery
- Leave the label hard to read
- Create flat, sterile, clinical-looking ads
- Repeat the same reference twice in one carousel
