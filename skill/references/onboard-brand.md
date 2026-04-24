# Flow: Onboard a New Brand

Create a new brand from scratch. The agent interviews the user, gathers the
needed info, and runs the `onboard_brand.py` script.

## Trigger

User says any of:
- "add a brand"
- "new brand"
- "set up my brand"
- "onboard"
- "I want to create ads for my [business type]"

## Before Starting

Check if the brand already exists:
```bash
ls brands/
```

If the brand exists, skip onboarding and move to adding refs.

## The Interview Script

The agent asks these questions. Keep it conversational, not a form:

### 1. Brand Name
```
"What's your brand called?"
```

Derive the slug automatically from the name.

### 2. Tagline (optional)
```
"What's your tagline or one-line pitch? (optional)"
```

### 3. Brand Vibe
```
"How would you describe your brand's vibe? Like... fun? Professional? Relaxed?"
```

### 4. Products
```
"What do you sell? List your products or services."
```

If they say "juices", ask for specific names:
```
"Cool, what flavors/types of juice?"
```

### 5. Colors (optional)
```
"Do you have brand colors? Hex codes or names?" (optional)
```

### 6. Forbidden Words
```
"Are there any words or phrases we should NEVER use in your ads? Like medical claims, pricing, competitors?"
```

### 7. Social Platforms
```
"Which social platforms do you want to post to? Instagram, TikTok, Facebook, LinkedIn?"
```

## After the Interview

Run the script with what you gathered:

```bash
python3 skill/scripts/onboard_brand.py \
  --name "Brand Name" \
  --slug "brand-slug" \
  --tagline "Your tagline here" \
  --vibe "fun, tropical, Caribbean" \
  --products "Product 1" "Product 2" "Product 3" \
  --platforms "instagram" \
  --forbidden "medical claims" "competitor names" \
  --dry-run  # Remove this to actually create
```

Check the output, then run without `--dry-run`:

```bash
python3 skill/scripts/onboard_brand.py \
  --name "Brand Name" \
  --slug "brand-slug" \
  --products "Product 1" "Product 2" "Product 3" \
  --platforms "instagram"
```

## What Gets Created

1. **`brands/<slug>.json`** — Brand config file
2. **`brand_assets/<slug>/references/`** — Per-product reference folders
3. **`brand_assets/<slug>/logo/`** — Logo upload folder
4. **`brand_assets/<slug>/products/`** — Product image folder
5. **`output/<slug>/`** — Generated ad output folder
6. **`website/public/data/brands.json`** — Updated for dashboard

## After Onboarding

Tell the user:

```
"✅ Brand '[Brand Name]' is set up!

Next steps:
1. Add your logo to: brand_assets/<slug>/logo/
2. Add product photos to: brand_assets/<slug>/products/
3. Add reference photos for each product (send them in chat and say 'add these to [product name]')

Once you have reference photos, just say 'generate an ad' and I'll create one!"
```

## Script Options

```bash
# Minimal - just name and products
python3 skill/scripts/onboard_brand.py --name "My Brand" --products "Product 1" "Product 2"

# Full options
python3 skill/scripts/onboard_brand.py \
  --name "Island Splash" \
  --slug "island-splash" \
  --tagline "Caribbean fruit juices" \
  --vibe "fun, tropical, laid-back" \
  --palette-desc "teal, orange, green" \
  --colors "#243C3C,#F0A86C,#E4843C" \
  --products "Mango Passion" "Mauby" "Peanut Punch" \
  --platforms "instagram,tiktok" \
  --posts-per-day 2 \
  --time-slots "09:00,17:00" \
  --forbidden "medical claims:never say this" "pricing:no prices"
```

## Manual Edits Needed After

The script creates a basic config. The user will need to manually:

1. **Set logo_path** in `brands/<slug>.json` → paths.logo_path
2. **Set products_dir** in `brands/<slug>.json` → paths.products_dir
3. **Configure social account IDs** after running `--list-accounts`

## Troubleshooting

### Brand already exists
```
ls brands/  # Check if slug already exists
```
If it exists, skip onboarding.

### Products didn't get created
```
python3 skill/scripts/onboard_brand.py --help
# Check --products argument format
```

### Folder creation failed
Make sure you're running from the repo root where `brand_assets/` and `brands/` exist.

## Out of Scope

- Image upload in this flow (use `add-refs.md` for that)
- Auto-connecting social accounts (manual for now)
- Payment/billing setup (future feature)
