# External Integrations

**Analysis Date:** 2026-04-08

## APIs & External Services

**AI Image Generation:**
- Google Gemini API - AI-powered haircut preview generation
  - Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent`
  - Auth: API key via `GEMINI_API_KEY` environment variable
  - Used in: `app/api/generate/route.js`, `app/api/analyze/route.js`, `app/api/preview/route.js`
  - Purpose: Generates hairstyle previews from face photos and style prompts

**AI Image Analysis:**
- Google Gemini API - Analyzes inspiration photos to extract hairstyle descriptions
  - Endpoint: Same as above (gemini-3.1-flash-image-preview)
  - Auth: API key via `GEMINI_API_KEY` environment variable
  - Used in: `app/api/analyze/route.js`

## Data Storage

**Production Database:**
- Turso (libSQL) - Distributed SQLite database
  - Connection: `TURSO_DATABASE_URL` environment variable
  - Auth Token: `TURSO_AUTH_TOKEN` environment variable
  - Client: `@libsql/client` 0.17.2
  - Used in: `app/lib/db.js` (detected via `process.env.TURSO_DATABASE_URL`)

**Local Development Database:**
- SQLite - Local file-based database
  - Location: `data/previewhair.db`
  - Client: `better-sqlite3` 12.8.0
  - Fallback when `TURSO_DATABASE_URL` is not set

**File Storage:**
- Local filesystem only
  - Database file: `data/previewhair.db`
  - Image assets: `public/` directory

**Caching:**
- None detected

## Authentication & Identity

**Auth Provider:**
- Custom session-based authentication (no third-party provider)
  - Password hashing: bcrypt (via `bcryptjs` 3.0.3)
  - Session ID: Cryptographically secure random 32-byte hex strings
  - Session storage: SQLite database (`sessions` table)
  - Cookie: HTTP-only session cookie named `session_id`
  - Cookie security: `secure: true` in production, `sameSite: 'lax'`

**Session Configuration:**
- Session-only duration: 24 hours
- Remember-me duration: 30 days
- Cookie settings in `app/lib/auth.js:106-119`

## Monitoring & Observability

**Error Tracking:**
- None detected (no Sentry, LogRocket, etc.)

**Logs:**
- Console logging via `console.error()` and `console.log()`
- Example: `app/lib/db.js:26` logs DB client creation failures
- Example: `app/api/generate/route.js:115` logs generation errors

## CI/CD & Deployment

**Hosting:**
- Vercel - Serverless deployment platform
  - Config: `vercel.json`
  - Framework: Next.js (auto-detected)

**CI Pipeline:**
- Vercel CI/CD (automatic on push to connected repository)
- OIDC token used for Vercel authentication (`.env.production`)

## Environment Configuration

**Required env vars:**
- `GEMINI_API_KEY` - Google Gemini API key for AI generation
- `TURSO_DATABASE_URL` - Turso database connection URL (production only)
- `TURSO_AUTH_TOKEN` - Turso authentication token (production only)
- `NODE_ENV` - Set to `production` in production environment

**Optional env vars:**
- `AUTH_PASSWORD` - Fallback auth password (default: `daviddrew`) - **deprecated**

**Secrets location:**
- Vercel environment variables (for production)
- `.env.production` file (contains Vercel OIDC token, not actual secrets)

## Webhooks & Callbacks

**Incoming:**
- None detected

**Outgoing:**
- Google Gemini API calls from:
  - `app/api/generate/route.js`
  - `app/api/analyze/route.js`
  - `app/api/preview/route.js`

---

*Integration audit: 2026-04-08*
