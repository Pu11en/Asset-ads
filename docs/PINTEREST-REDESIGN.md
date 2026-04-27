# Pinterest 2.0 Redesign - Asset Ads

## Overview
Redesign the asset-ads interface to match Pinterest's clean, minimal aesthetic.

---

## Pinterest Design System

### Colors
| Token | Hex | Usage |
|-------|-----|-------|
| `--pinterest-red` | `#E60023` | Primary CTA, save button |
| `--pinterest-red-dark` | `#AD0812` | Hover state |
| `--pinterest-cream` | `#F5F5F5` | Background |
| `--pinterest-white` | `#FFFFFF` | Cards |
| `--pinterest-gray-100` | `#EFEFEF` | Borders, dividers |
| `--pinterest-gray-300` | `#CDCDCD` | Placeholder text |
| `--pinterest-gray-500` | `#767676` | Secondary text |
| `--pinterest-gray-700` | `#333333` | Primary text |
| `--pinterest-black` | `#111111` | Headlines |

### Typography
- **Font**: Inter (fallback: system-ui)
- **Weights**: 400 (regular), 500 (medium), 600 (semibold), 700 (bold)
- **Sizes**:
  - Headlines: 24px / 700
  - Body: 14px / 400
  - Small: 12px / 500
  - Micro: 11px / 500

### Spacing
- Base unit: 8px
- Card gap: 16px (2 units)
- Content padding: 16px
- Section margin: 24px

### Components

#### Pin Card (Core Element)
```
Width: Fluid (columns * card-width)
Border-radius: 16px (rounded-2xl)
Shadow: 0 1px 2px rgba(0,0,0,0.05)
Shadow-hover: 0 4px 12px rgba(0,0,0,0.15)
Transition: transform 200ms ease, box-shadow 200ms ease
```

#### Save Button
```
Position: Absolute top-right (appears on hover)
Size: 32px circle
Color: --pinterest-red
Icon: Bookmarked/Save
Transform: Scale 0.8 → 1 on hover
```

#### Header
```
Height: 56px (desktop), 48px (mobile)
Background: white
Border-bottom: 1px solid --pinterest-gray-100
Shadow: none (clean)
```

#### Search Bar
```
Height: 48px
Border-radius: 24px (pill shape)
Background: --pinterest-gray-100
Border: none
Placeholder color: --pinterest-gray-500
```

#### Dropdown/Select
```
Border-radius: 8px
Border: 2px solid transparent
Border-focus: 2px solid --pinterest-gray-700
Background: white
Shadow: 0 4px 16px rgba(0,0,0,0.1)
```

---

## Current Asset-Ads vs Pinterest

### Current (Dark Theme)
- Black/dark background
- White text with transparency
- Rounded borders (8px)
- Muted colors

### Target (Pinterest Light)
- Clean white background
- Dark text (#333)
- Heavier border-radius (16px)
- Red accent for actions
- Card shadows
- Hover elevations

---

## Implementation Plan

### Phase 1: Global Styles
- [ ] Replace Tailwind config with Pinterest tokens
- [ ] Set background to `#F5F5F5`
- [ ] Set card background to `#FFFFFF`
- [ ] Add Inter font via Google Fonts
- [ ] Global border-radius: 16px

### Phase 2: Header
- [ ] White header with subtle bottom border
- [ ] Pinterest-style logo (red "P" or custom)
- [ ] Search bar with pill shape
- [ ] Clean icon buttons

### Phase 3: Masonry Grid
- [ ] Implement `react-masonry-css` or CSS columns
- [ ] Card width: 236px (Pinterest standard)
- [ ] Gap: 16px
- [ ] Infinite scroll with loading indicator

### Phase 4: Pin Cards
- [ ] White background
- [ ] Border-radius: 16px
- [ ] Subtle shadow → elevated on hover
- [ ] Image fills card top
- [ ] Optional: title, caption below image
- [ ] Save button appears on hover

### Phase 5: Modals & Overlays
- [ ] Lightbox with Pinterest-style close button
- [ ] White/dark semi-transparent backdrop
- [ ] Rounded modal corners

### Phase 6: Mobile Nav
- [ ] Pinterest-style bottom navigation
- [ ] Icons: Home, Search, Plus, Bell, Profile
- [ ] Fixed position, 64px height

---

## File Structure
```
src/
├── app/
│   ├── [brand]/
│   │   ├── page.tsx          # Pinterest-style board view
│   │   └── components/
│   │       ├── MasonryGrid.tsx
│   │       ├── PinCard.tsx
│   │       ├── PinModal.tsx
│   │       └── SaveButton.tsx
│   └── layout.tsx            # Pinterest header
├── components/
│   ├── PinterestHeader.tsx
│   ├── PinterestNav.tsx
│   └── PinterestSearch.tsx
└── styles/
    └── pinterest.css         # Pinterest design tokens
```

---

## Key Interactions

### Hover States
- Cards: Scale 1.02, shadow increases, save button appears
- Buttons: Background darkens 10%
- Links: Underline appears

### Click/Tap
- Cards: Opens lightbox modal
- Save button: Toggles saved state (red fill)
- Long press (mobile): Shows quick actions

### Scroll
- Infinite scroll loads more pins
- Staggered entrance animations (50ms delay between pins)
- Sticky header with subtle shadow

---

## Brand Customization
Keep brand colors for:
- Save button (brand accent)
- Brand-specific boards
- Admin vs viewer modes

But overall UI chrome should be Pinterest-style light theme.
