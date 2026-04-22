# Island Splash Ad Generator — How It Works

## The Concept

Take any image (found ad, competitor ad, style you like) → transform it into an Island Splash ad using the reference as a style template.

---

## The Flow

### Step 1 — Analyze the Reference Image

Look at the image sent. Understand:

- **How many products** are shown and where are they positioned
- **Lighting** — is it bright, moody, natural, studio
- **Mood** — energetic, calm, premium, casual
- **Color grade** — what tones dominate the scene
- **Props** — what surrounds the products (ice, fruit, greenery, glasses, backgrounds)
- **Text** — any words, headers, callouts in the scene
- **Branding** — logos, brand names, foreign product labels
- **Health/nutritional claims** — "low sugar", "organic", "no additives"
- **Pricing and contact info** — prices, phone numbers, websites, social handles
- **Promotional elements** — "30% OFF", "Limited time", "Grab it now"
- **Tropical clashes** — elements that don't fit a Caribbean brand

### Step 2 — Pick the Next Flavor (Rotation)

Island Splash has 7 flavors. Every ad uses the next flavor in rotation. This ensures:
- All flavors get equal air time
- You don't accidentally over-promote the same product
- Each ad feels fresh because the product changes

**Flavor list:** Mango Passion → Mauby → Peanut Punch → Lime → Guava Pine → Sorrel → Pine Ginger → repeat

A state file tracks where you are in the rotation. After each ad, advance by 1. Start fresh each session.

### Step 3 — Generate the Ad

Use the reference as a **style template**. What you want:

- The **product** in the ad gets replaced with Island Splash bottles (keep the bottle labels — the brand label IS on the bottle)
- The **layout and composition** stay the same (product positions, angle, depth)
- The **lighting and mood** get preserved
- The **color grade** gets shifted to match the brand's palette

Strip out everything from the reference:
- All text, logos, brand names
- All health claims, nutritional info, organic seals
- All promotional callouts and pricing
- All contact info
- Everything that doesn't belong to Island Splash

Apply brand elements:
- Brand colors: orange (#FF6B35), teal (#00B4D8), green (#90BE6D)
- Island Splash product with its label
- Tropical Caribbean vibe to replace anything that clashes

### Step 4 — Deliver

Send the image. Say: "Done. Tell me what needs adjusting."

---

## Key Principles

**Reference = style source, not product source**
The reference tells you "put 3 products in a triangle, side-lit with warm tones against a stone background." It does NOT tell you "use beet juice." You replace the product with Island Splash.

**Keep the product label intact**
The Island Splash bottle has its own brand label on it. Never strip it or modify it. The label IS the brand.

**Strip everything foreign**
The only text allowed in the final scene is what's on the Island Splash bottle label. No callouts, no prices, no promotional text anywhere else.

**Brand colors unify everything**
When you shift the color grade to orange/teal/green, even a completely different-looking reference becomes cohesive with the Island Splash brand.

---

## What Can Go Wrong

- **Agent stops to ask questions** — fix: make it clear in the skill that it NEVER stops to ask, it just executes
- **Agent picks flavor based on ref matching** — wrong. The ref is just style. Flavor comes from rotation.
- **Agent summarizes the analysis instead of using it** — fix: force the full analysis into the generation prompt
- **Agent creates products that don't exist** — fix: explicitly state the product images are Island Splash bottles with specific flavor names, use the actual product image files
- **Agent generates single-flavor ad when ref has multiple slots** — fix: count slots in Step 1, pick that many flavors from rotation for multi-product ads
- **Brand colors not applied** — fix: include brand color hex codes explicitly in the transform rules

---

## Files and Paths

Product images: `/home/drewp/asset-ads/products_downloaded/[flavor].jpg`
State file: `~/.island_splash_flavor_state.json`
Output: `/home/drewp/asset-ads/output/`

---

## Multi-Flavor Ads

If the reference shows 2 or 3 products (2-pack, 3-pack display), pick 2 or 3 consecutive flavors from the rotation. Don't repeat the same flavor. Each slot gets its own flavor.

Rotation tracking matters more when doing multi-flavor — if you're on "Mango Passion" and the ref has 3 slots, you use Mango Passion + Mauby + Peanut Punch, then advance by 3.
