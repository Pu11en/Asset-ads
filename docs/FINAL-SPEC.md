# ASSET-ADS — FINAL SPEC
**Version:** 1.0
**Date:** 2026-04-23
**Status:** Goal / North Star

---

## What This Is

**An AI social media manager that never sleeps.**

Small business owners chat with a web bot, the bot creates posts and ads, they approve, and it publishes automatically.

---

## The Promise

> Tell the bot what you need. It creates it. You approve. It posts.

---

## How It Works

```
User Chat → Bot Creates → User Approves → Bot Posts
```

### 1. User chats with web bot
Natural language. No forms, no dashboards to navigate.

### 2. Bot creates content
- Posts (text with captions + hashtags)
- Ads (AI-generated images)
- Carousels (multiple images in one post)

### 3. User approves in chat
One word: "yes" or "post it"

### 4. Bot publishes or schedules
Chooses the best time, or user specifies.

---

---

## Platforms

| Platform | Status |
|----------|--------|
| Instagram | ✅ |
| TikTok | 🔜 |
| Facebook | 🔜 |
| LinkedIn | 🔜 |
| Pinterest | 🔜 |

---

## Features

### Now (MVP)
- ✅ Web chat UI
- ✅ Brand setup (onboarding flow)
- ✅ Post generation (text)
- ✅ Ad generation (AI images)
- ✅ Approval workflow
- ✅ Scheduling
- ✅ Basic dashboard

### Later (Polish)
- 📋 Analytics (impressions, clicks)
- 📋 Multi-platform posting
- 📋 A/B ad variants
- 📋 Template library by industry
- 📋 Email reports

### Future (Scale)
- 🌐 White-label (agencies)
- 🌐 Client management
- 🌐 Bulk generation
- 🌐 API access

---

## Example Chats

### Post Request
```
User: "Generate a post for our mango juice"

Bot: "Here's a post for Island Splash Mango Passion:

🌴 Mango Monday vibes! 🥭

When you need a taste of the islands, reach for Mango Passion. 100% natural Caribbean fruit, zero junk.

#IslandSplash #MangoPassion #CaribbeanFlavors #NaturalFruit #IslandTime

Approve to post now, or tell me when to schedule."
```

### Ad Request
```
User: "Create an ad for our lime flavor"

Bot: "Creating an ad using your reference photos..."

*[generates image]*

Bot: "Here's your ad:

*[image shown]*

Caption: 🍋 Fresh squeeze energy. Lime so bright it feels like summer year-round.

Approve or request changes?"
```

### Schedule Request
```
User: "Show me this week's posts"

Bot: "Scheduled for Island Splash:

Mon 9am  → Mango Passion post
Mon 5pm  → Lime ad
Tue 9am  → Sorrel post
Wed 9am  → Peanut Punch carousel

Want to add, edit, or remove any?"
```

---

## Data We Store

### User
- Email, password, billing info
- Multiple brands

### Brand
- Name, logo, colors
- Voice/tone guidelines
- Products list
- Reference photos
- Connected social accounts

### Post
- Text content
- Hashtags
- Images (if any)
- Scheduled time
- Status (draft/approved/scheduled/published)

---

## Rules (Never Break)

- ❌ Ref photos never become ad images
- ❌ No medical claims
- ❌ No pricing or discounts (unless asked)
- ❌ Never post without user approval (default)

---

## Success Goals

| Goal | Target |
|------|--------|
| Active Brands | ~80 |
| Posts/Month | 500+ |
| Ads/Month | 200+ |
| Retention | 80%+ |

---

## What Makes This Different

| Competitor | What They Do | What We Do |
|------------|-------------|------------|
| Later.com | Schedule posts you make | We **make** the posts too |
| Canva | Templates you customize | We **generate** the content |
| Hootsuite | Bulk publishing | We **create** AND publish |
| Agency | Humans create everything | AI creates, you approve |

**You don't need a social media manager. You need this.**

---

## Out of Scope (For Now)

- Video generation
- Custom image uploads
- Mobile app
- Team collaboration

---

## Open Questions

- [ ] Stripe integration for payments
- [ ] Email authentication vs social login
- [ ] Host where? (Railway, Vercel, Fly.io)
- [ ] Database choice (Supabase, PlanetScale, SQLite)
