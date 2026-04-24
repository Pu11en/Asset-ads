# Flow: Onboard a New Brand

The agent asks the user questions, writes `brands/<slug>.json`, and creates
the folder scaffold. **This flow does not exist yet** — it's the first MVP
feature to build.

## Trigger

User says any of: "add a brand", "new brand", "set up my brand",
"onboard <brand name>".

## Conversation script (planned)

1. **Name + slug** — "What's the brand called?" → derive slug.
2. **Tagline + voice** — "One-line pitch? What's the tone?"
3. **Products** — "Which products? Name + short description for each."
4. **Approved headlines** — "Give me 3–5 headlines you'd be happy to see on an ad."
5. **Allowed claims per product** — "What can we say about <product>?"
6. **Forbidden list** — "What must we NEVER say? (e.g. medical claims, price)"
7. **Social accounts** — "Which Instagram/TikTok/etc. connects to this brand?"
8. **Confirm** — show the generated `brands/<slug>.json` preview and ask to save.

## Side effects

On save:
- Write `brands/<slug>.json`.
- Create `brand_assets/<slug>/references/<each-product-slug>/`.
- Add a row to `website/public/data/brands.json` (so the dashboard sees it).
- Tell user: "Send me reference images and I'll add them to the pool."

## Out of scope for MVP

- Image upload inside this flow (that's `add-refs.md`).
- Auto-connecting social accounts (manual for now).
