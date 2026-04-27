# Codebase Structure

**Analysis Date:** 2026-04-08

## Directory Layout

```
repo/
├── app/                    # Next.js App Router (pages + API routes)
│   ├── api/                # API Route Handlers
│   ├── dashboard/          # Dashboard page + components
│   ├── db/                 # Database module (Neon/Postgres - unused)
│   ├── lib/                # Server-side libraries (auth, db, imageUtils)
│   ├── login/              # Login page
│   ├── signup/             # Signup page
│   ├── gallery/            # Style gallery page
│   ├── custom/             # Custom style builder page
│   ├── try-on/             # Try-on pages
│   ├── utils/              # Client-side utilities
│   ├── global-error.js     # Global error boundary
│   ├── layout.js           # Root layout
│   ├── not-found.js        # 404 page
│   └── page.js             # Landing page
├── components/             # Shared React components
├── data/                   # Static data (men-styles.js)
├── docs/                   # Documentation
├── public/                 # Static assets
│   └── refs/               # Reference style images
├── styles/                 # Global CSS
├── middleware.js           # Next.js middleware (auth protection)
├── next.config.js          # Next.js configuration
├── package.json            # Dependencies
├── tsconfig.json           # TypeScript configuration
└── vercel.json            # Vercel deployment config
```

## Directory Purposes

**`app/`:**
- Purpose: Next.js App Router directory containing all pages and API routes
- Contains: Page components (`.js`, `.jsx`), API route handlers, layouts
- Key: Uses file-system based routing

**`app/api/`:**
- Purpose: REST API Route Handlers
- Contains: Auth routes (`login`, `logout`, `signup`, `me`), generation routes, photo routes
- Pattern: Each endpoint is a directory with `route.js`

**`app/lib/`:**
- Purpose: Server-side shared libraries
- Contains: `auth.js` (authentication), `db.js` (primary database), `imageUtils.js` (Sharp compression)
- Used by: API routes exclusively

**`app/db/`:**
- Purpose: Reserved database module
- Contains: `index.ts` using `@neondatabase/serverless`
- Status: NOT actively used by any API route

**`app/dashboard/`:**
- Purpose: Barber dashboard page
- Contains: `page.jsx` (main dashboard), `components/` (shared dashboard components)
- Features: History of generations, saved client photos, load more pagination

**`app/dashboard/components/`:**
- Purpose: Dashboard-specific React components
- Contains: `ClientPhotoStrip.jsx`, `GenerationCard.jsx`, `GenerationModal.jsx`

**`app/try-on/`:**
- Purpose: Virtual try-on flow
- Contains: `[id]/page.js` (preset style try-on), `custom/page.js` (custom style builder)
- Dynamic: Uses `dynamicParams = true` for static generation

**`components/`:**
- Purpose: Shared React components
- Contains: `SiteNav.js`, `VenmoModal.js`
- Note: Dashboard components are in `app/dashboard/components/` not here

**`data/`:**
- Purpose: Static configuration data
- Contains: `men-styles.js` (hairstyle library with 25+ styles)
- Structure: Array of style objects with id, name, category, prompt, image path

**`public/refs/`:**
- Purpose: Reference hairstyle images
- Contains: PNG files like `01-textured-crop.png`, `05-buzz-cut.png`, etc.

**`styles/`:**
- Purpose: Global CSS
- Contains: `globals.css` with CSS custom properties (design system), utility classes

**`app/utils/`:**
- Purpose: Client-side utilities
- Contains: `imageCompression.js` (Canvas API for browser-side image resizing)

## Key File Locations

**Entry Points:**
- `app/page.js`: Landing/marketing page (client component)
- `app/layout.js`: Root HTML layout
- `app/login/page.js`: Login page
- `app/signup/page.js`: Signup page

**Configuration:**
- `next.config.js`: Next.js config (React strict mode enabled)
- `tsconfig.json`: TypeScript config with `@/*` path alias to `app/*`
- `middleware.js`: Auth protection for protected routes
- `vercel.json`: Vercel deployment settings

**Core Logic:**
- `app/lib/auth.js`: Authentication (login, signup, session management)
- `app/lib/db.js`: Database operations (libsql/Turso)
- `app/lib/imageUtils.js`: Server-side image compression (Sharp)
- `app/utils/imageCompression.js`: Client-side image compression (Canvas)
- `data/men-styles.js`: Hairstyle definitions and prompts

**API Routes:**
- `app/api/auth/login/route.js`: POST login
- `app/api/auth/logout/route.js`: POST logout
- `app/api/auth/signup/route.js`: POST signup
- `app/api/auth/me/route.js`: GET current barber
- `app/api/auth/route.js`: POST simple password auth
- `app/api/generate/route.js`: POST AI generation (face + style)
- `app/api/preview/route.js`: POST AI style preview (text only)
- `app/api/analyze/route.js`: POST inspiration image analysis
- `app/api/generations/route.js`: GET/POST generation history
- `app/api/client-photos/route.js`: GET/POST client photos
- `app/api/client-photos/[id]/route.js`: DELETE client photo

**Pages:**
- `app/page.js`: Landing page
- `app/login/page.js`: Login
- `app/signup/page.js`: Signup
- `app/gallery/page.js`: Style gallery grid
- `app/custom/page.js`: Custom style builder
- `app/try-on/[id]/page.js`: Preset style try-on
- `app/try-on/custom/page.js`: Custom style try-on
- `app/dashboard/page.jsx`: Barber dashboard

**Components:**
- `components/SiteNav.js`: Site-wide navigation
- `components/VenmoModal.js`: Venmo payment modal
- `app/dashboard/components/ClientPhotoStrip.jsx`: Saved photos display
- `app/dashboard/components/GenerationCard.jsx`: Generation history card
- `app/dashboard/components/GenerationModal.jsx`: Generation detail modal

## Naming Conventions

**Files:**
- Pages: `page.js` or `page.jsx` (Next.js convention)
- API Routes: `route.js`
- Components: `PascalCase.js` or `PascalCase.jsx`
- Utilities: `camelCase.js`
- Data: `kebab-case.js`

**Directories:**
- Pages/API: `kebab-case/` (e.g., `client-photos/`, `try-on/`)
- Components: `PascalCase/` or flat with other components

**API Routes:**
- Resource-based: `/api/client-photos`, `/api/generations`
- Nested for specific resource: `/api/client-photos/[id]`

## Where to Add New Code

**New API Route:**
- Create `app/api/<resource>/route.js`
- Export named HTTP methods: `GET`, `POST`, `DELETE`, etc.
- Import auth from `@/lib/auth` and db from `@/lib/db`
- Return `NextResponse.json()` with appropriate status

**New Page:**
- Create `app/<path>/page.js` or `page.jsx`
- Use `'use client'` directive if client-side state needed
- Import shared components from `components/` or `app/dashboard/components/`

**New Shared Component:**
- Add to `components/` if shared across pages
- Add to `app/dashboard/components/` if dashboard-specific
- Use `.jsx` extension for React components

**New Utility:**
- Client-side: `app/utils/yourUtility.js`
- Server-side: `app/lib/yourUtility.js`

**New Data/Style:**
- Add to `data/men-styles.js` following existing structure:
  ```javascript
  {
    id: "unique-id",
    name: "Display Name",
    subtitle: "Short description",
    category: "Category",
    maintenance: "Level",
    faceShapes: ["Shape1", "Shape2"],
    image: "/refs/xx-name.png",
    keywords: ["tag1", "tag2"],
    needsHairline: false,
    prompt: "Short prompt",
    promptFull: "Full detailed prompt"
  }
  ```

## Special Directories

**`app/db/`:**
- Purpose: Reserved for Neon/Postgres integration
- Generated: No
- Committed: Yes
- Status: NOT actively used - `app/lib/db.js` is the active database module

**`data/`:**
- Purpose: Static configuration data
- Generated: No
- Committed: Yes
- Note: Contains hairstyle library imported by gallery and try-on pages

**`public/refs/`:**
- Purpose: Reference hairstyle images served statically
- Generated: No (committed images)
- Committed: Yes
- Served as: `/refs/filename.png`

---

*Structure analysis: 2026-04-08*
