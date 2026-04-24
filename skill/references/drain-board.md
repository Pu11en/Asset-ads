# Flow: Drain Pinterest Board for References

Pull images from a Pinterest board and add them to a brand's reference pool.

## When to Use

User says:
- "drain my Pinterest board"
- "pull references from this board"
- "get refs from Pinterest"
- "fill my reference pool from Pinterest"

## Before Starting

1. Check if the brand exists:
   ```bash
   ls brands/
   ```

2. Check the brand's products:
   ```bash
   python3 skill/scripts/add_refs.py --brand <slug> --list-products
   ```

3. Ask the user which pool to use:
   - **Single pool** (Island Splash): All images go to one pool
   - **Multi pool** (Cinco H Ranch): Images get sorted by product

## Single Pool Mode (e.g. Island Splash)

All images go to one pool because there's no product split.

```bash
python3 skill/scripts/drain_board.py \
  --brand island-splash \
  --board-url "https://pin.it/XXXXX" \
  --pool "all-drinks" \
  --max-images 10
```

## Multi Pool Mode (e.g. Cinco H Ranch)

Images get sorted by product using AI vision.

```bash
python3 skill/scripts/drain_board.py \
  --brand cinco-h-ranch \
  --board-url "https://pin.it/XXXXX" \
  --auto-categorize \
  --max-images 20
```

**Note:** `--auto-categorize` requires Gemini API and may be slow.

## Conversation Script

### Step 1: Get the Pinterest URL
```
User: "drain my Pinterest board for island splash"

Bot: "Sure! What's the Pinterest board URL?
You can find it by going to Pinterest → your board → copy link."

User: "https://pin.it/4MOvVetIJ"
```

### Step 2: Ask About Pool Strategy
```
Bot: "For Island Splash, should all refs go to one pool, or split by flavor?

1. One pool (all drinks together)
2. Split by flavor (mango refs, lime refs, etc.)"

User: "One pool"
```

### Step 3: Run the Script
```bash
python3 skill/scripts/drain_board.py \
  --brand island-splash \
  --board-url "https://pin.it/4MOvVetIJ" \
  --pool "all-drinks" \
  --max-images 10
```

### Step 4: Report Results
```
Bot: "✅ Added 8 reference images to island-splash/all-drinks pool!

Pool now has 13 total reference images.

Ready to generate an ad? Say 'create an ad' and I'll pull from this pool."
```

## Quick Reference

```bash
# Island Splash (single pool)
python3 skill/scripts/drain_board.py \
  --brand island-splash \
  --board-url "PASTE_URL_HERE" \
  --pool "all-drinks"

# Cinco H Ranch (multi pool - AI categorizes)
python3 skill/scripts/drain_board.py \
  --brand cinco-h-ranch \
  --board-url "PASTE_URL_HERE" \
  --auto-categorize

# Preview only (don't download)
python3 skill/scripts/drain_board.py \
  --brand island-splash \
  --board-url "..." \
  --dry-run
```

## Options

| Flag | What it does |
|------|-------------|
| `--brand` | Brand slug (required) |
| `--board-url` | Pinterest URL (short or full) |
| `--pool` | Pool name for single-pool brands |
| `--max-images` | How many to grab (default: 10) |
| `--dry-run` | Preview without downloading |
| `--delay` | Seconds between downloads (default: 1) |

## Pinterest URL Formats

Works with:
- `https://pin.it/XXXXX` (short URL)
- `https://www.pinterest.com/user/board/XXXXX/` (full URL)
- `https://www.pinterest.com/pin/XXXXX/` (single pin)

## Troubleshooting

### "No images found"
- Board may be private
- Try making board public temporarily
- Or have user download images and use `add_refs.py` instead

### Pinterest rate limiting
- Use `--delay 2` or higher
- Try in smaller batches

### Wrong images in pool
- Pinterest may show unrelated pins on the board
- User should curate their Pinterest board before draining

## After Draining

Tell the user:
```
"Your reference pool is ready!

Pool: island-splash / all-drinks
Images added: 10
Total in pool: 15

Next: Say 'generate an ad' and I'll create one using these refs."
```
