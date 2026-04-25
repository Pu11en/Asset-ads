# Asset Ads MVP Plan — Marketing Campaign Creation Flow

**Goal:** Complete end-to-end flow: Pinterest board → approved refs → campaign plan → ad generation → scheduling

## Clarified Flow

```
1. Board URL → Hermes scrapes via pinterest-dl → refs go to pool (existing ✓)

2. Gallery selection on website (new)
   - Go to /admin/swipe/island-splash/all-drinks
   - See uniform grid of all unapproved refs
   - Click "Select All" → all highlighted
   - Tap bad ones to deselect
   - "Approve Selected" → moves to approved/
   - X button on singles, or "Reject Selected" for batch
   - Progress: "100 approved · 25 rejected · 75 remaining"

3. You trigger campaign plan manually (when ready)
   - Tell Hermes "island plan" or similar
   - Analyzes all approved refs
   - Outputs: themes, product pairings, ad concepts, schedule
   - Sent to Telegram for review

4. Ad generation + review in Telegram
   - Hermes generates ads from approved refs
   - Each ad sent to Telegram with "Approve? (y/n)"
   - "y" = approved for scheduling, "n" = regenerate

5. Approved ads → scheduled as campaign
   - All approved ads scheduled via Blotato
   - Dynamic campaign with fresh captions
```

## Current State

| Stage | Status | Notes |
|-------|--------|-------|
| Pinterest board scrape | ✅ Working | `pinterest-dl` pulls images from board URL |
| Reference pool management | ✅ Working | `brands/<slug>.json` + `pool_dir` stores refs |
| Gallery selection UI | ❌ Missing | Website grid with tap-to-select |
| 100-ref campaign plan | ❌ Missing | Auto-generates after 100 approvals |
| Ad generation + review | ❌ Missing | Ads sent to Telegram for y/n |
| Campaign scheduling | ✅ Working | Blotato posts to Instagram |

---

## Components to Build

### 1. Gallery Selection UI (website)
- **Route:** `/admin/swipe/[brand]/[pool]/` (URL-based)
  - Example: `/admin/swipe/island-splash/all-drinks`
- **Layout:** Uniform grid (square thumbnails)
- **Selection Flow:**
  1. "Select All" button → all refs highlighted
  2. Tap to deselect bad ones
  3. "Approve Selected" → batch move to `approved/`
  4. X button on individual cards → reject
  5. "Reject Selected" → batch move to `rejected/`, hide from gallery
- **Features:**
  - Checkmark overlay on selected (like iOS photo picker)
  - Live counter: "142 of 200 selected"
  - "Approve Selected" + "Reject Selected" buttons
  - Progress header: "100 approved · 25 rejected · 75 remaining"
  - Refreshes gallery after batch actions
- **States tracked in:** `/home/drewp/asset-ads/state/swipe-sessions.json`

### 2. Campaign Plan Generator
- **Script:** `generate_campaign_plan.py`
- **Input:** `pool_dir/<pool>/approved/*.{jpg,png}` (all 100)
- **Output:** Campaign plan sent to Telegram + saved to `output/campaigns/<brand>-<pool>-<date>.md`
- **Auto-triggers:** After 100th approved ref in swipe session
- **AI Steps:**
  1. Analyze all 100 approved refs (vision model)
  2. Extract: visual themes, color usage, composition patterns, lifestyle contexts
  3. Map themes to brand products
  4. Generate: campaign concept, ad variations, caption ideas, posting schedule
- **Human review:** Sent to Telegram, operator replies "yes" or feedback
- **Plan stored:** `output/campaigns/<brand>-<pool>-<date>.md`

### 3. Ad Review in Telegram
- **Trigger:** After campaign plan approved
- **Flow:**
  - Hermes generates ad from each approved ref
  - Sends ad image to Telegram with prompt "Approve? (y/n)"
  - Operator replies "y" = approved for scheduling, "n" = regenerate
  - Approved ads move to `output/approved/<ad-id>.png`
  - Track approved ads in `state/ad-reviews.json`
- **Batch option:** "approve all" to skip review

### 4. Dynamic Campaign Scheduling
- **Trigger:** After ads approved
- **Script:** `schedule_campaign.py` (extends existing schedule logic)
- **Flow:**
  - Reads all approved ads from `output/approved/`
  - Creates posting schedule (AM + PM slots)
  - Generates fresh captions + hashtags per post
  - Schedules via Blotato MCP
  - Status tracked in `output/campaigns/<campaign-id>/schedule.json`

---

## Hermes Skill Updates
- `skill/references/gallery-selection.md` — how to use the gallery
- `skill/references/campaign-plan.md` — trigger with "island plan" / "cinco plan"
- `skill/references/ad-review.md` — ad review flow in Telegram

---

## File Changes

### New Files
```
website/src/app/admin/swipe/
  [brand]/
    [pool]/
      page.tsx              # Gallery selection UI

website/src/app/api/swipe/[brand]/[pool]/
  route.ts                  # GET unapproved refs
  approve/route.ts         # POST — batch approve selected
  reject/route.ts          # POST — reject single ref

scripts/
  generate_campaign_plan.py # Campaign plan AI

skill/references/
  gallery-selection.md      # How to use the gallery
  campaign-plan.md          # Campaign plan generation

state/
  swipe-sessions.json       # Per-brand swipe session state
  ad-reviews.json          # Per-ad approval state

output/
  approved/                 # Approved ads (ready to schedule)
  campaigns/                # Campaign plans + schedules
```

---

## Ref Pool Directory Structure
```
pool_dir/
  <pool>/
    *.jpg, *.png              # Unapproved refs (default location)
    approved/
      *.jpg, *.png            # Approved for ad gen
    rejected/
      *.jpg, *.png            # Rejected — kept for audit
```

---

## Campaign Plan Output Example

```markdown
# Campaign Plan — Island Splash / all-drinks
Generated: 2026-04-24

## Visual Themes Found
- Beach/tropical: 8 refs — sunset, palm trees, ocean
- Lifestyle/smoothie: 5 refs — people drinking, outdoors
- Product close-up: 3 refs — bottles in natural light

## Recommended Ad Variations
1. **Tropical Escape** — beach scene + Mango Passion
2. **Morning Ritual** — Mauby with breakfast setting
3. **Poolside** — Guava Pine with pool/lounge context

## Caption Concepts
- "Transport yourself to the islands 🍹"
- "Your daily escape awaits 🌴"
- "Tropical vibes, family recipe"

## Posting Schedule
- Post 1 (Tropical Escape): Mon 9am
- Post 2 (Morning Ritual): Wed 5pm
- Post 3 (Poolside): Fri 9am
```

---

## Implementation Order

1. **Create approved/ rejected/ dirs** in brand assets
2. **Build Gallery API routes** — get unapproved, approve batch, reject single
3. **Build Gallery UI** — grid + tap-to-select + "Approve Selected" button
4. **Add to admin nav** — link to gallery
5. **Update Hermes skill** — document gallery flow
6. **Build campaign plan generator** — analyze 100 refs → plan
7. **Update asset_ads.py** — read from approved/ subfolder
8. **Build ad review flow in Telegram** — send ads, y/n responses
9. **Build schedule campaign** — batch schedule approved ads
10. **Test end-to-end** — board → gallery → plan → ad review → schedule

---

## Verification Criteria

- [ ] Pinterest board URL → images in pool ✓ (existing)
- [ ] Gallery shows all unapproved refs
- [ ] Tap to select/deselect works (like photo picker)
- [ ] "Approve Selected" moves all to approved/
- [ ] X button rejects → moves to rejected/ → hidden
- [ ] Progress counter: "X approved, Y rejected, Z remaining"
- [ ] 100th approval auto-triggers campaign plan
- [ ] Campaign plan sent to Telegram for review
- [ ] After plan approved, ads generate and send to Telegram
- [ ] "y" on ad approves for scheduling, "n" regenerates
- [ ] Approved ads scheduled via Blotato
