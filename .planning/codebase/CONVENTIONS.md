# Coding Conventions

**Analysis Date:** 2026-04-08

## Languages & Type Safety

**Primary:** JavaScript (ES2017+)
- Most source files use `.js` extension
- Next.js App Router structure

**Type Safety:** TypeScript available but **not enforced**
- `tsconfig.json` exists at project root with `"strict": false`
- TypeScript is used primarily for Next.js types and configuration
- No TypeScript in actual source files (all `.js`)
- No PropTypes usage detected

**CSS:** Plain CSS with CSS custom properties (design tokens)
- Global styles in `styles/globals.css`
- Inline `<style>` tags in some components
- CSS variables for theming (e.g., `--accent`, `--bg`, `--surface`)

## Linting & Formatting

**ESLint:** Not configured
- No `.eslintrc*` or `eslint.config.*` files found
- `package.json` has `"lint": "next lint"` script but no config committed
- Project does not enforce linting rules

**Prettier:** Not configured
- No `.prettierrc*` files found
- No formatting enforced

**Recommendation:** Add ESLint + Prettier configuration to ensure consistent code style.

## Naming Conventions

### Files
- **JavaScript modules:** camelCase (e.g., `auth.js`, `db.js`, `route.js`)
- **Page files:** `page.js` (Next.js convention)
- **API route files:** `route.js` (Next.js convention)
- **Data files:** kebab-case (e.g., `men-styles.js`)
- **Component files:** PascalCase (e.g., `SiteNav.js`, `VenmoModal.js`)

### Variables & Functions
- **Local variables:** camelCase (e.g., `sessionId`, `expiresAt`, `imageData`)
- **Function names:** camelCase (e.g., `getSessionFromRequest`, `hashPassword`)
- **Constants (module-level):** UPPER_SNAKE_CASE (e.g., `SESSION_COOKIE_NAME`, `SESSION_ONLY_DURATION`)
- **CSS custom properties:** kebab-case (e.g., `--accent`, `--text-muted`)

### CSS Classes
- **Utility classes:** kebab-case (e.g., `.accent-btn`, `.ghost-btn`)
- **Component classes:** kebab-case with descriptive names (e.g., `.site-nav`, `.gallery-section`, `.style-card`)
- **BEM-like patterns:** Used in some places (e.g., `.style-card-img`, `.style-card-body`)

## Import Patterns

**Path Aliases:**
```javascript
import { login } from '@/lib/auth';           // maps to app/lib/auth
import { getSessionFromRequest } from '@/lib/auth';
import { compressImageForStorage } from '@/lib/imageUtils';
```

**Configuration in `tsconfig.json`:**
```json
"paths": {
  "@/*": ["./app/*"]
}
```

**Standard imports:**
```javascript
import { NextResponse } from 'next/server';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
```

## Code Organization

### Directory Structure
```
repo/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   ├── auth/          # Auth endpoints (login, logout, me, signup)
│   │   ├── client-photos/ # Photo management
│   │   ├── analyze/
│   │   ├── generate/
│   │   └── preview/
│   ├── lib/               # Shared libraries
│   │   ├── auth.js        # Authentication logic
│   │   ├── db.js          # Database operations
│   │   └── imageUtils.js  # Image processing
│   ├── gallery/
│   ├── try-on/
│   ├── custom/
│   ├── page.js            # Home page
│   └── layout.js          # Root layout
├── components/            # Shared React components
├── data/                  # Static data
├── styles/                # Global CSS
└── middleware.js          # Next.js middleware
```

### Component Structure

**Client vs Server Components:**
- `'use client'` directive at top of client-side React files
- Server components are the default in Next.js App Router

**Example component pattern from `components/SiteNav.js`:**
```javascript
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

export default function SiteNav({ showPaywall = false, onPaywallTrigger }) {
  // Hooks first
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  // Event handlers
  const handleLogout = async () => {
    // ...
  };

  // Return JSX
  return (
    <nav className="site-nav">
      {/* ... */}
    </nav>
  );
}
```

## Error Handling Patterns

### API Routes
```javascript
export async function POST(request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const result = await login(email, password);
    return NextResponse.json({ success: true, barber: result.barber });

  } catch (error) {
    console.error('Login error:', error);
    if (error.message === 'Invalid credentials') {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
```

### Library Functions
```javascript
export async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}
```

### Validation Patterns
- Input validation at API route entry points
- Error messages returned as JSON with status codes
- Generic error messages for internal errors (avoid leaking details)
- Specific error messages for validation failures

## Function Design

### Size Guidelines
- Functions tend to be focused and single-purpose
- Large page components (600+ lines in `page.js`) - consider splitting
- Business logic extracted to library files (`lib/`)

### Async/Await
```javascript
export async function login(email, password, remember = false) {
  if (!email || !password) {
    throw new Error('Email and password are required');
  }
  // ...
  const valid = await verifyPassword(password, barber.password_hash);
  // ...
}
```

## Logging

**Framework:** `console` (no structured logging)
- `console.error()` for errors (API errors, catch blocks)
- No logging library configured
- No log levels or structured logging

**Pattern:**
```javascript
console.error('Login error:', error);
console.error('Generate error:', err);
console.error('Failed to create DB client:', e);
```

## CSS Style Patterns

**Global Design Tokens (`styles/globals.css`):**
```css
:root {
  --accent: #C8956C;
  --accent-light: #E8C4A0;
  --bg: #0F0F14;
  --surface: #1C1C28;
  --surface-2: #252535;
  --border: rgba(200, 149, 108, 0.15);
  --text: #FAFAFA;
  --text-muted: #9A9AAA;
}
```

**Inline Styles:**
- Used extensively for component-specific styling
- Avoided for shared styles
- Style objects with camelCase properties

**CSS-in-JS (rare):**
```javascript
<style>{`
  @keyframes modalIn {
    from { opacity: 0; transform: scale(0.94) translateY(12px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }
`}</style>
```

## Module Design

### Barrel Files
- No barrel files (`index.js`) for exports
- Direct imports from specific modules

### Exports
- Named exports for utility functions
- Default exports for React components

**Example:**
```javascript
// Named export
export async function login(email, password, remember = false) { ... }

// Default export
export default function SiteNav({ showPaywall = false, onPaywallTrigger }) { ... }
```

## Security Patterns

**Authentication:**
- Session-based auth using cookies (`session_id`)
- Passwords hashed with bcrypt (12 rounds)
- HTTP-only, secure, sameSite cookies
- Protected routes checked in middleware

**API Security:**
- Session validation on protected endpoints
- Input validation before processing
- SQL parameterized queries (no SQL injection risk)

## Next.js Specific Conventions

**Middleware (`middleware.js`):**
```javascript
export const runtime = 'nodejs';

export function middleware(request) {
  // Path protection logic
}

export const config = {
  matcher: ['/gallery/:path*', '/custom/:path*', '/try-on/:path*', '/dashboard/:path*'],
};
```

**Route Handlers:**
- `route.js` files in directories define route behavior
- Export named HTTP methods: `GET`, `POST`, `PUT`, `DELETE`
- Receive `request` object, return `NextResponse`

---

*Convention analysis: 2026-04-08*
