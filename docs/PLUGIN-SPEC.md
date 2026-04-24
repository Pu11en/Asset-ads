# ASSET-ADS — PLUGIN SPEC
**Version:** 1.0
**Date:** 2026-04-23
**Status:** Vision / How We Scale

---

## The Vision

**A skill bundle you drop into any Hermes agent.**

Give someone a link to the repo, they clone it, paste their API keys, and BOOM — they have their own ad generation system.

No coding required. Just follow the setup guide.

---

## How It Works (The Dream)

```
1. User clones repo
   ↓
2. User pastes API keys (guided setup)
   ↓
3. User runs "onboard my brand"
   ↓
4. Bot asks questions (name, products, style)
   ↓
5. Brand config created automatically
   ↓
6. User adds reference photos
   ↓
7. DONE — now can generate ads on demand
```

---

## What The Plugin Includes

### 1. The Main Skill
`asset-ads/` folder with:
- `SKILL.md` — Entry point for the agent
- `references/` — All flow docs
- `scripts/` — Python generators
- `templates/` — Brand config templates

### 2. Setup Guide
Step-by-step instructions for:
- Cloning the repo
- Getting API keys (Gemini, Blotato)
- Adding keys to Hermes profile
- Testing the setup

### 3. Brand Onboarding Flow
The agent walks the user through:
- What's the brand name?
- What do you sell?
- What platforms? (Instagram, TikTok, etc.)
- What's the voice/tone?
- Any forbidden words?

### 4. Reference Photo Guide
How to:
- Take good reference photos
- What makes a good reference
- Where to put them

---

## The Setup Experience (What We Want)

```
=== ASSET-ADS SETUP ===

Welcome! Let's get your brand ready.

First, I need some API keys...

1. Get a Gemini API key:
   → Go to https://makersuite.google.com/app/apikey
   → Copy your key
   → Paste it here: _

2. Get a Blotato API key:
   → Go to https://blotato.com
   → Sign up, connect Instagram
   → Get API key
   → Paste it here: _

Keys saved! Now let's set up your brand.

What's your brand called? → Island Splash
What do you sell? → Caribbean fruit juices
What platforms? → Instagram
What's your Instagram handle? → @islandsplashjuice

Perfect! Your brand is set up.

Next: Add reference photos.
Take 3-5 photos of your products in lifestyle settings.
Drop them in brand_assets/island-splash/references/

Ready to generate your first ad? Just say "create an ad"
```

---

## Skill Structure (For Distribution)

```
asset-ads-plugin/
├── README.md                   ← Setup guide (human readable)
├── SKILL.md                    ← Agent entry point
├── references/
│   ├── onboard-brand.md        ← Flow 1
│   ├── add-refs.md             ← Flow 2
│   ├── generate-ad.md          ← Flow 3
│   └── schedule-post.md        ← Flow 4
├── scripts/
│   ├── generator.py            ← Main script
│   ├── brand_setup.py          ← Create new brand
│   └── poster.py               ← Post to socials
├── templates/
│   └── brand-template.json     ← Empty brand config
└── examples/
    ├── island-splash/          ← Example brand
    └── coffee-shop/            ← Another example
```

---

## Distribution Options

### Option A: GitHub Repo
- Link to `Pu11en/asset-ads`
- Users clone and install

### Option B: npm Package
- `npm install @yourname/asset-ads-skill`
- Auto-installs to skills folder

### Option C: Hermes Marketplace (Future)
- Browse skills
- One-click install

---

## What Makes It Easy

| Feature | How It Helps |
|---------|-------------|
| **Guided setup** | No reading docs required |
| **Example brands** | See how configs look |
| **Error messages** | Clear if something's wrong |
| **Test command** | "Verify setup" to check everything works |

---

## The Onboarding Flow (In the Skill)

```markdown
# Onboard a Brand

## When User Says
- "set up my brand"
- "add a new brand"
- "onboard"

## Steps
1. Ask brand name → derive slug
2. Ask what they sell → products list
3. Ask platforms → social accounts
4. Ask voice/tone → tone keywords
5. Ask forbidden words → never-say list
6. Create brand_assets/<slug>/ folder
7. Create brands/<slug>.json config
8. Show user what was created
9. Tell them how to add reference photos

## Example
User: "onboard my coffee shop"

Bot: "What's your brand called?"
User: "Morning Buzz Coffee"

Bot: "What do you sell?"
User: "Artisan coffee drinks and pastries"

Bot: "What tone should the posts have?"
User: "Friendly, local, morning vibes"

Bot: "Any words we should NEVER use?"
User: "No medical claims, no discount percentages"

Bot: "Creating your brand config..."

*[creates files]*

"Done! Your brand 'Morning Buzz Coffee' is set up.

Next: Add reference photos.
Take 3-5 photos of your products looking great.
Drop them in brand_assets/morning-buzz-coffee/references/

Say 'generate an ad' when ready!"
```

---

## Success Criteria

| Metric | Goal |
|--------|------|
| Setup time | < 10 minutes |
| Steps required | < 5 |
| Questions asked | < 10 |
| Works first try | 90%+ |

---

## Competitors (Why We Win)

| Competitor | Setup Pain | Ours |
|------------|-----------|------|
| Later.com | 30 min, forms | 10 min, chat |
| Hootsuite | 1 hour, multiple tools | 10 min, one repo |
| Agency | Days, calls | 10 min, self-serve |

---

## Open Questions

- [ ] Make scripts portable (work from anywhere)
- [ ] Add video tutorial for setup
- [ ] Create video tutorial for reference photos
- [ ] Build "verify setup" command
- [ ] Test with non-technical user

---

## Future: Marketplace

Imagine:
```
Hermes → /install asset-ads → Done
```

One command. All skills installed. Ready to work.
