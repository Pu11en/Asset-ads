# Technology Stack

**Analysis Date:** 2026-04-08

## Languages

**Primary:**
- JavaScript - Main application language for all source files
- TypeScript - Used for type-safe files (`.ts`, `.tsx` extensions)

**Secondary:**
- JSX - Used in React components (`.jsx`, `.tsx`)

## Runtime

**Environment:**
- Node.js - Specified as runtime in `middleware.js:4`

**Package Manager:**
- npm - Version from package-lock.json
- Lockfile: `package-lock.json` (present)

## Frameworks

**Core:**
- Next.js 15.5.14 - React framework for full-stack web application
  - App Router architecture
  - API routes for backend endpoints
  - Server-side rendering

**UI:**
- React 19.2.4 - Component library for UI rendering
- React DOM 19.2.4 - DOM-specific rendering

**Image Processing:**
- Sharp 0.34.5 - Server-side image resizing and compression

**Database:**
- libSQL (@libsql/client) 0.17.2 - SQLite database client
- better-sqlite3 12.8.0 - SQLite bindings (for local development)

**Authentication:**
- bcryptjs 3.0.3 - Password hashing
- cookie 1.1.1 - HTTP cookie handling

**Testing:**
- No test framework configured - `npm test` exits with code 1

**Build/Dev:**
- TypeScript 6.0.2 - Type checking and compilation
- Vercel CLI (implied by vercel.json)

## Key Dependencies

**Critical:**
- next 15.5.14 - Core framework
- react 19.2.4 - UI library
- @libsql/client 0.17.2 - Production database connection (Turso)

**Authentication:**
- bcryptjs 3.0.3 - Password hashing with bcrypt
- cookie 1.1.1 - Cookie parsing and serialization

**Image Processing:**
- sharp 0.34.5 - High-performance image processing for server-side compression

**Local Development:**
- better-sqlite3 12.8.0 - Local SQLite database for development

**Type Support:**
- @types/bcryptjs 2.4.6 - TypeScript types for bcryptjs
- @types/node 25.5.2 - TypeScript types for Node.js
- @types/react 19.2.14 - TypeScript types for React

**Dev Tools:**
- drizzle-kit 0.31.10 - Database schema management (if used)

## Configuration

**TypeScript:**
- Config file: `tsconfig.json`
- Target: ES2017
- Path alias: `@/*` maps to `./app/*`
- Strict mode: disabled (`strict: false`)

**Next.js:**
- Config file: `next.config.js`
- React strict mode: enabled

**Environment:**
- Environment file: `.env.production` (contains Vercel OIDC token)
- Local `.env` files ignored in `.gitignore`
- Production detection: checks `TURSO_DATABASE_URL` env var

**Deployment:**
- Platform: Vercel
- Config: `vercel.json`
- Build command: `npm run build`
- Output: `.next` directory

## Platform Requirements

**Development:**
- Node.js runtime
- npm for package management
- Local SQLite database file at `data/previewhair.db`

**Production:**
- Node.js runtime (Vercel)
- Turso database (libSQL) via `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`
- Google Gemini API key via `GEMINI_API_KEY`

---

*Stack analysis: 2026-04-08*
