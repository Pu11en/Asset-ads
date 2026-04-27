# Architecture

**Analysis Date:** 2026-04-08

## Pattern Overview

**Overall:** Next.js App Router with client-server separation, cookie-based session authentication, and libSQL/Turso for persistence.

**Key Characteristics:**
- Next.js 15 with App Router (Pages remain in `app/` directory, not `src/`)
- API Routes in `app/api/` using Next.js Route Handlers (`route.js`)
- SQLite via `@libsql/client` for local dev, Turso for production
- Cookie-based session authentication with `session_id` stored in httpOnly cookies
- AI image generation via Google Gemini API
- Client-side image compression using Canvas API and Sharp (server-side)

## Layers

**UI Layer (Pages):**
- Location: `app/` directory
- Contains: React page components (`page.js`, `page.jsx`)
- Rendering: Mix of Server Components (layout, pages) and Client Components (`'use client'` directive)
- Entry point: `app/page.js` (landing page), `app/layout.js` (root layout)

**API Layer (Route Handlers):**
- Location: `app/api/<resource>/route.js`
- Contains: Next.js Route Handlers for REST endpoints
- Auth: Session checked via `getSessionFromRequest()` from `@/lib/auth`
- Pattern: Each route exports named HTTP methods (`GET`, `POST`, `DELETE`)

**Library Layer:**
- Location: `app/lib/`
- Contains: `auth.js` (authentication), `db.js` (database), `imageUtils.js` (image processing)
- Purpose: Shared server-side logic for API routes

**Data Layer:**
- Location: `app/db/` and `app/lib/db.js`
- Contains: `app/db/index.ts` (Neon/Postgres - NOT actively used), `app/lib/db.js` (libsql/Turso - primary)
- Schema: `barbers`, `sessions`, `generations`, `client_photos` tables

**Utilities:**
- Location: `app/utils/` (client-side), inline in components
- Contains: `imageCompression.js` (Canvas-based client-side compression)

**Shared Components:**
- Location: `components/` (root) and `app/dashboard/components/`
- Contains: `SiteNav.js`, `VenmoModal.js`, dashboard components

## Data Flow

**Authentication Flow:**
1. User submits credentials to `/api/auth/login` (POST)
2. `login()` in `app/lib/auth.js` validates credentials via bcrypt
3. Creates session in `sessions` table with expiration
4. Returns `session_id` cookie to client
5. Subsequent requests include cookie automatically
6. Middleware (`middleware.js`) validates session on protected routes
7. Logout calls `/api/auth/logout` which deletes session from DB

**Image Generation Flow:**
1. User uploads face photo (compressed client-side to max 1024px)
2. POST to `/api/generate` with face image (base64) and style prompt
3. Server calls Gemini API with prompt + image
4. Response image extracted and returned to client
5. Generation saved to `generations` table via `/api/generations` (silent, fire-and-forget)

**Client Photo Flow:**
1. Photo uploaded and compressed (512px JPEG 80%)
2. POST to `/api/client-photos` with base64 image
3. Stored with 24-hour expiration in `client_photos` table
4. Auto-cleanup of expired photos on each GET request

## Key Abstractions

**Authentication (`app/lib/auth.js`):**
- `login(email, password, remember)` - validates and creates session
- `signup(email, password)` - creates new barber account
- `logout(sessionId)` - deletes session
- `getSessionFromRequest(request)` - extracts and validates session from cookie
- `getBarberFromSession(sessionId)` - gets barber ID from session
- Session durations: 24 hours (standard), 30 days (remember me)

**Database (`app/lib/db.js`):**
- Uses `@libsql/client` with file-based SQLite locally (`data/previewhair.db`)
- Uses Turso (libsql) in production via `TURSO_DATABASE_URL` env var
- Schema initialized on module load via `initializeSchema()`
- Tables: `barbers`, `sessions`, `generations`, `client_photos`
- Helper functions: `createBarber`, `getBarberByEmail`, `createSession`, `getSession`, `createGeneration`, `getGenerations`, `createClientPhoto`, `getClientPhotos`

**Image Processing:**
- Client-side: `app/utils/imageCompression.js` uses Canvas API to resize to max 1024px at 0.82 quality
- Server-side: `app/lib/imageUtils.js` uses Sharp to compress to 512px JPEG 80% for storage

## Entry Points

**Root Layout:**
- Location: `app/layout.js`
- Responsibilities: HTML shell, global CSS import, font loading (Google Fonts), body styling

**Landing Page:**
- Location: `app/page.js`
- Type: Client Component (`'use client'`)
- Purpose: Marketing landing page with hero, gallery showcase, testimonials, pricing

**API Routes:**
- `/api/auth/login` - POST login
- `/api/auth/logout` - POST logout
- `/api/auth/signup` - POST registration
- `/api/auth/me` - GET current barber
- `/api/auth/route.js` - Simple password auth (hardcoded password for preview access)
- `/api/generate` - POST AI hairstyle generation (face image + style prompt)
- `/api/preview` - POST AI style preview (text prompt only)
- `/api/analyze` - POST analyze inspiration image
- `/api/generations` - GET/POST generation history
- `/api/client-photos` - GET/POST client photos
- `/api/client-photos/[id]` - DELETE client photo

**Middleware:**
- Location: `middleware.js` (root)
- Responsibilities: Protects `/gallery`, `/custom`, `/try-on`, `/dashboard` routes
- Redirects unauthenticated users to `/login?redirect=<path>`

## Error Handling

**API Routes:**
- Return `{ error: 'message' }` with appropriate HTTP status (400, 401, 500)
- Errors logged to console with context
- No structured error logging service

**Client Components:**
- Error states stored in `useState` and displayed inline
- Silent failure for non-critical operations (photo save, history save)
- User-facing error messages displayed in styled containers

**Image Validation:**
- MimeType validation before extracting image data from Gemini responses
- Blocked prompt injection patterns in custom style descriptions

## Cross-Cutting Concerns

**Logging:** Console.log/error only - no structured logging
**Validation:** Input validation on all API routes (required fields, types)
**Authentication:** Cookie-based sessions with httpOnly, secure in production
**Image Security:** Client-side compression reduces payload size; server-side validates mime types; prompt injection blocked via regex patterns

---

*Architecture analysis: 2026-04-08*
