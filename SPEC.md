# Asset Ads — MVP Spec

**Goal:** End-to-end flow for Island Splash: Pinterest board → 3 approved refs → 3 ads → 1 carousel post → schedule.

---

## The Flow (Step by Step)

```
1. SCRAPE
   You: "scrape https://pinterest.com/board/..." for island-splash
   Hermes: Downloads images to pool, reports count
   State: refs added to pool

2. GALLERY
   You: Open /admin/swipe/island-splash/drinks
   Gallery: Shows all unapproved refs (uniform grid)
   You: Click "Select All" → tap bad ones to deselect
   You: Click "Approve Selected" → moves to approved/
   State: approved count updated

3. GENERATE (triggers when approved count >= 3)
   Hermes: Generates ad for each approved ref
   Each ad: Uses ref + brand config → follows the ad generation instructions
   Output: 3 ad images + sidecar data
   State: ads tracked, refs marked as "used"

4. CREATE POST
   Hermes: Reads all 3 generated ads + sidecar data
   Groups: All 3 ads into 1 carousel
   Creates: Caption + hashtags based on ad analyses
   Output: 1 post (carousel) with all 3 images + caption

5. APPROVE
   Hermes: Sends post to Telegram
   You: Review → "yes" to approve, "no" to regenerate
   If yes: State marks post as approved
   If no: Regenerate post

6. SCHEDULE
   Hermes: Schedules approved post via Blotato
   State: post status = "scheduled"
```

---

## Directory Structure

```
asset-ads/
├── brands/
│   └── island-splash.json          # Brand config
├── brands/<brand>/                   # E.g. island-splash
│   ├── drinks/                       # Category pool
│   │   ├── *.jpg, *.png             # Unapproved refs
│   │   ├── approved/                # Approved refs
│   │   ├── rejected/                # Rejected refs
│   │   └── used/                    # Used refs (gone forever)
│   └── products/                    # Product images
├── output/
│   ├── ads/                         # Generated ads
│   │   └── <timestamp>_ad_<id>.png
│   └── posts/                       # Posts awaiting approval
│       └── <timestamp>_post_<id>/
│           ├── ad_1.png
│           ├── ad_2.png
│           ├── ad_3.png
│           └── caption.json
├── state/                           # Persists on restart
│   ├── current-brand.json           # Active brand
│   ├── ref-pool/
│   │   └── <brand>/
│   │       └── <category>/
│   │           └── index.json       # counts: approved, rejected, used
│   ├── flavor-rotation.json         # IS: current index 1-7
│   └── campaigns/
│       └── <brand>/
│           └── current/
│               ├── plan.json        # Post plan
│               └── posts.json       # All posts + status
└── skill/
    └── references/
        └── ad-generation.md         # THE BULLETPROOF GENERATION INSTRUCTIONS
```

---

## State Files

### `state/current-brand.json`
```json
{
  "brand": "island-splash",
  "last_updated": "2026-04-25T12:00:00Z"
}
```

### `state/ref-pool/<brand>/<category>/index.json`
```json
{
  "brand": "island-splash",
  "category": "drinks",
  "approved": 3,
  "rejected": 0,
  "used": 0,
  "unapproved": 7,
  "trigger_threshold": 3,
  "triggered": true,
  "last_updated": "2026-04-25T12:05:00Z"
}
```

### `state/flavor-rotation.json`
```json
{
  "brand": "island-splash",
  "products": ["Mango Passion", "Mauby", "Peanut Punch", "Lime", "Guava Pine", "Sorrel", "Pine Ginger"],
  "current_index": 0,
  "last_updated": "2026-04-25T12:05:00Z"
}
```

### `state/campaigns/<brand>/current/plan.json`
```json
{
  "brand": "island-splash",
  "started_at": "2026-04-25T12:05:00Z",
  "approved_refs_used": 3,
  "ads_generated": 3,
  "posts_created": 1,
  "status": "awaiting_approval"
}
```

### `state/campaigns/<brand>/current/posts.json`
```json
{
  "posts": [
    {
      "id": "post_001",
      "ad_ids": ["ad_001", "ad_002", "ad_003"],
      "caption": "...",
      "hashtags": "...",
      "status": "pending_approval",
      "created_at": "2026-04-25T12:10:00Z"
    }
  ]
}
```

---

## Ad Generation Instructions (THE CRITICAL PART)

These MUST be followed exactly for every ad:

```
1. Take the reference image
2. Analyze it:
   - Subject (what's in it)
   - Composition (layout, positions)
   - Lighting (bright, moody, natural, studio)
   - Color grade (dominant tones)
   - Props (ice, fruit, background)
   - Style (lifestyle, product-focused, etc.)

3. Apply brand transformation:
   - Replace products with [BRAND] products
   - Keep layout/composition EXACTLY
   - Preserve lighting and mood
   - Shift colors to brand palette ONLY
   - Remove ALL foreign text/logos/branding
   - Add [BRAND] product with correct label

4. Generate image using analysis + brand config

5. Save:
   - Ad image to output/ads/
   - Sidecar JSON with: ref_used, analysis, prompt, product_used, timestamp
```

---

## Error Handling

### Pinterest Scrape
- Retry 3x with 10s delay
- If fails: Notify Telegram "Scrape failed after 3 retries"
- If invalid URL: "Board URL not accessible"

### Ad Generation
- Retry 3x with 30s delay
- If fails: Notify Telegram "Ad generation failed for [ref], skipping"
- Continue with next ref

### Scheduling
- Retry 3x with 10s delay
- If fails: Notify Telegram "Schedule failed, post marked as failed"

---

## Hermes Commands

| Command | What happens |
|---------|--------------|
| `scrape <pinterest-url> for island-splash` | Downloads board, adds to pool |
| `island splash status` | Shows: X refs, Y approved, Z used, current campaign status |
| `island splash generate` | Manually trigger generation (if threshold met) |
| `island splash posts` | Show all posts with status |
| `approve post <id>` | Approve a pending post |
| `reject post <id>` | Reject, triggers regeneration |

---

## Verification Criteria (MVP Test)

- [ ] `scrape <board-url>` downloads images to pool
- [ ] Gallery shows unapproved refs
- [ ] "Select All" selects all refs
- [ ] Tap to deselect works
- [ ] "Approve Selected" moves to approved/
- [ ] State file updated (approved count = 3)
- [ ] Generation triggered automatically
- [ ] 3 ads generated (1 per ref)
- [ ] Sidecar data saved with each ad
- [ ] 1 carousel post created (3 images)
- [ ] Caption + hashtags generated
- [ ] Post sent to Telegram for approval
- [ ] "yes" approves → scheduled via Blotato
- [ ] State shows post = "scheduled"
- [ ] All state persists after restart
