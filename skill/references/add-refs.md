# Flow: Add References to a Brand

Intake real product-in-context photos into a product's reference pool. The
generator will pull from this pool when creating ads.

## Trigger

User sends images in chat and says something like "add these to <brand>
<product>" or has a locked product context from an earlier turn.

## Steps

1. Identify target: which brand, which product. Ask if unclear.
2. For each image, copy to `brand_assets/<brand-slug>/references/<product-slug>/`.
3. Name deterministically: `<product-slug>_ref<N>.jpg` where N is next index.
4. Optionally: run a quick vision pass to tag each image (lifestyle, flatlay, etc.).
5. Report back: "Added X refs to <brand>/<product>. Pool now has Y images."

## Non-negotiables

- **Never** pull an image from `output/` or `website/public/images/ads/`
  into a ref pool. Generated ads are not references.
- Don't overwrite existing refs — always increment the index.

## Source surfaces (MVP)

- Direct upload via the website chat UI (Phase 1 target).
- Later: Pinterest drain, drag-and-drop, URL paste.
