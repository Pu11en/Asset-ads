# Flow: Generate an Ad

Produce a single ad creative for a brand + product, using the product's
reference pool and the brand's voice config.

## Trigger

User says "generate ad for <brand>" / "make me a <product> ad" / "splash go".

## Steps

1. Resolve context: brand (required), product (required if brand has multiple).
2. Validate: product must have at least 1 ref in its pool. If empty, refuse and
   prompt for refs via `add-refs.md` flow.
3. Pick N refs from the pool (default 1 for single ad, 5 for carousel).
4. Load `brands/<slug>.json` — pull voice, allowed_claims for this product,
   forbidden list, approved headlines.
5. Call the generator script:
   - `scripts/asset_ads.py` — general entry
   - `scripts/generate_splash_ad.py` — Island Splash specific
6. Write PNG to `output/<brand-slug>_<timestamp>.png` (local only).
7. **Also** copy to `website/public/images/ads/<brand-slug>/<filename>.png`
   and append metadata to `website/public/data/ads.json` so the dashboard
   shows it.
8. Return the image inline in chat + a note: "Saved to dashboard."

## Metadata row shape (for ads.json)

```json
{
  "id": "<brand>_<timestamp>",
  "brand": "<brand-slug>",
  "product": "<product-slug>",
  "filename": "<filename>.png",
  "created_at": "<ISO timestamp>",
  "refs_used": ["ref1.jpg", "ref2.jpg"],
  "status": "draft"
}
```

## Non-negotiables

- Never use an ad PNG as a reference input.
- Every generation must respect `forbidden` list from the brand config.
- If `allowed_claims` is empty, prompt user to fill it in before generating.
