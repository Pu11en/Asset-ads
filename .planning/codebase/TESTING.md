# Testing Patterns

**Analysis Date:** 2026-04-08

## Test Framework

**Status:** NOT IMPLEMENTED

**No testing framework is configured or in use.**

- No `jest.config.*` found
- No `vitest.config.*` found
- No test files anywhere in the codebase
- `package.json` test script: `"test": "echo \"No tests yet\" && exit 1"`

**DevDependencies in `package.json`:**
```json
"devDependencies": {
  "@types/bcryptjs": "^2.4.6",
  "@types/node": "25.5.2",
  "@types/react": "19.2.14",
  "drizzle-kit": "^0.31.10",
  "typescript": "6.0.2"
}
```

No testing libraries (Jest, Vitest, React Testing Library, Playwright, Cypress, etc.) are installed.

## Run Commands

**Current test command (non-functional):**
```bash
npm test
# Output: "No tests yet"
```

**If tests were implemented, expected commands:**
```bash
npm test              # Run all tests
npm run test:watch    # Watch mode (not configured)
npm run test:coverage # Coverage report (not configured)
```

## Test File Organization

**Current state:** No test files exist

**Expected patterns for this codebase (based on structure):**

**Location:** Tests would likely co-locate with source files or in a `__tests__` directory
```
repo/
├── app/
│   ├── lib/
│   │   ├── auth.js
│   │   ├── auth.test.js        # Co-located unit tests
│   │   └── __tests__/          # Or in __tests__ folder
│   ├── api/
│   │   └── auth/
│   │       └── login/
│   │           └── route.test.js
├── components/
│   ├── SiteNav.test.js
└── __tests__/                 # Or top-level tests directory
```

**Naming conventions (when implemented):**
- `*.test.js` - Unit/integration tests
- `*.spec.js` - Alternative naming
- `*.test.ts` - If using TypeScript

## Test Structure Patterns

**Since no tests exist, patterns below are recommendations based on codebase structure:**

### API Route Testing

**Expected pattern for testing API routes:**
```javascript
// app/api/auth/login/route.test.js
import { POST } from './route';
import { login } from '@/lib/auth';

jest.mock('@/lib/auth');

describe('POST /api/auth/login', () => {
  it('should return 400 if email or password missing', async () => {
    const request = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: '', password: '' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('should return barber on successful login', async () => {
    // ...
  });
});
```

### Library Function Testing

**Expected pattern for auth library:**
```javascript
// app/lib/auth.test.js
import { hashPassword, verifyPassword, login } from './auth';

describe('hashPassword', () => {
  it('should hash password with bcrypt', async () => {
    const hash = await hashPassword('testpassword');
    expect(hash).toBeDefined();
    expect(hash).not.toBe('testpassword');
  });
});

describe('verifyPassword', () => {
  it('should return true for correct password', async () => {
    const hash = await hashPassword('testpassword');
    const result = await verifyPassword('testpassword', hash);
    expect(result).toBe(true);
  });
});
```

### Component Testing

**Expected pattern for React components (if using React Testing Library):**
```javascript
// components/SiteNav.test.js
import { render, screen, fireEvent } from '@testing-library/react';
import SiteNav from './SiteNav';

describe('SiteNav', () => {
  it('should render navigation links', () => {
    render(<SiteNav />);
    expect(screen.getByText('Gallery')).toBeInTheDocument();
  });

  it('should call onPaywallTrigger when CTA clicked', () => {
    const mockFn = jest.fn();
    render(<SiteNav onPaywallTrigger={mockFn} />);
    fireEvent.click(screen.getByText('Enter Studio'));
    expect(mockFn).toHaveBeenCalled();
  });
});
```

## Mocking

**Current state:** No mocking framework configured

**Recommendations for this codebase:**

**What to Mock:**
- Database layer (`lib/db.js`) - use a test database or mock
- External APIs (Gemini API in `app/api/generate/route.js`)
- Authentication functions (`lib/auth.js`)
- Image processing utilities (`lib/imageUtils.js`)

**Example mocking approach:**
```javascript
// Mock external API calls
jest.mock('@/lib/db', () => ({
  getSession: jest.fn(),
  createSession: jest.fn(),
  getBarberByEmail: jest.fn(),
}));

// Mock environment variables
process.env.TURSO_DATABASE_URL = 'file::memory:';
```

## Fixtures and Factories

**Current state:** No test fixtures exist

**Data files that could serve as test fixtures:**
- `data/men-styles.js` - Contains style data for testing gallery/filtering

**Recommended test data location:**
```
repo/
├── fixtures/              # Test data files
│   ├── barbers.js
│   ├── sessions.js
│   └── styles.js
└── factories/             # Factory functions for test data
    ├── barberFactory.js
    └── sessionFactory.js
```

## Coverage

**Current coverage:** 0% (no tests)

**If coverage were implemented:**
```bash
npm run test:coverage
```

**Recommended coverage targets for this codebase:**
- Auth functions: 100% (critical security)
- API routes: 80%+ (input validation, error handling)
- Database helpers: 80%+
- React components: 70%+ (basic render and interaction tests)

## Test Types (Recommendations)

### Unit Tests
**Priority:** High for `lib/` functions
- Auth functions (`hashPassword`, `verifyPassword`, `login`, `logout`, etc.)
- Database helper functions
- Utility functions (`imageCompression`, `imageUtils`)

### Integration Tests
**Priority:** Medium for API routes
- Full request/response cycle for each endpoint
- Auth flow testing
- Database integration

### E2E Tests
**Priority:** Low (not currently feasible)
- Would require Playwright or Cypress
- Not currently set up

## Database Testing

**Current approach:** Uses Turso (libSQL) in production, local file in dev

**Testing recommendations:**
```javascript
// Use in-memory database for tests
const testDb = createClient({ url: 'file::memory:' });

// Or use a separate test database file
const testDb = createClient({ url: 'file:./data/test.db' });
```

## Async Testing

**Expected patterns for this codebase:**
```javascript
// Using async/await
it('should login successfully', async () => {
  const result = await login('test@example.com', 'password123');
  expect(result.barber).toBeDefined();
});

// Using Promise-based assertions
it('should hash password', () => {
  return expect(hashPassword('password')).resolves.toBeDefined();
});
```

## Error Testing

**Expected patterns:**
```javascript
it('should throw on invalid credentials', async () => {
  await expect(login('wrong@example.com', 'wrongpass')).rejects.toThrow('Invalid credentials');
});

it('should return 401 for invalid credentials', async () => {
  const response = await POST(invalidRequest);
  expect(response.status).toBe(401);
});
```

## Missing Testing Infrastructure

1. **No test runner configured** - Need to add Jest or Vitest
2. **No testing library** - Need `@testing-library/react` for component tests
3. **No E2E framework** - Playwright or Cypress not set up
4. **No test utilities** - No helpers for API testing, DB setup
5. **No CI integration** - No GitHub Actions or other CI for automated testing
6. **No coverage reporting** - No integration with coverage tools

## Recommended Test Setup

```bash
# Install testing dependencies
npm install --save-dev jest @testing-library/react @testing-library/jest-dom jest-environment-jsdom

# Or use Vitest (faster, Vite-native)
npm install --save-dev vitest @testing-library/react
```

---

*Testing analysis: 2026-04-08*
