# Codebase Concerns

**Analysis Date:** 2026-04-08

## CRITICAL Security Issues

### 1. Hardcoded Password Still Present

**Severity:** CRITICAL

**Files:**
- `repo/app/api/auth/route.js` (lines 3, 14-15)

**Issue:** The hardcoded `daviddrew` password authentication still exists in `app/api/auth/route.js`. SPEC.md section 191 explicitly states: "Remove hardcoded `daviddrew` password check entirely".

```javascript
const VALID_PASSWORD = process.env.AUTH_PASSWORD || 'daviddrew';
// ...
if (password.trim() !== VALID_PASSWORD) {
  return NextResponse.json({ success: false, error: 'Incorrect password' }, { status: 401 });
}
```

**Impact:** Anyone can authenticate using the password `daviddrew`. This bypasses the entire barber account system.

**Fix:** Delete `app/api/auth/route.js` entirely. The new authentication system uses `app/api/auth/login/route.js` and `app/api/auth/signup/route.js` with proper bcrypt hashing.

---

### 2. Sensitive Credentials Committed to Repository

**Severity:** CRITICAL

**Files:**
- `repo/.env.production`
- `repo/.gitignore` (line 14 only ignores `.env.production.local`)

**Issue:** `.env.production` contains a Vercel OIDC token (JWT) which is a sensitive credential. The `.gitignore` does not exclude `.env.production` files:

```
.env
.env.local
.env.development.local
.env.test.local
.env.production.local   <-- Only this one is ignored
```

**Impact:** Vercel OIDC token is committed and visible in git history. If the token has significant permissions, attackers could use it to access Vercel infrastructure.

**Fix:** Immediately:
1. Rotate the Vercel OIDC token
2. Add `.env.production` to `.gitignore`
3. Use `git filter-branch` or BFG to remove the file from history

---

## HIGH Security Concerns

### 3. No Rate Limiting on Authentication Endpoints

**Severity:** HIGH

**Files:**
- `repo/app/api/auth/login/route.js`
- `repo/app/api/auth/signup/route.js`

**Issue:** No rate limiting on login/signup endpoints. Attackers can brute force passwords or enumerate email addresses via signup timing differences.

**Impact:** Brute force attacks on barber accounts are possible.

**Fix:** Implement rate limiting using a service like Upstash Redis or Vercel's built-in rate limiting.

---

### 4. API Key Passed in URL Query String

**Severity:** HIGH

**Files:**
- `repo/app/api/generate/route.js` (line 62)
- `repo/app/api/analyze/route.js` (line 61)
- `repo/app/api/preview/route.js` (line 43)

**Issue:** The Gemini API key is passed as a URL query parameter:

```javascript
const url = `${endpoint}?key=${apiKey}`;
```

**Impact:** API key gets logged in server access logs, browser history, and can leak via Referer headers.

**Fix:** Use the `Authorization: Bearer` header instead:
```javascript
headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }
```

Note: Google's Gemini API does support Bearer token authentication.

---

### 5. No Session Regeneration on Login

**Severity:** MEDIUM-HIGH

**Files:**
- `repo/app/lib/auth.js` (lines 45-74)

**Issue:** After successful login, a new session is created but there's no session fixation protection. The old session ID is not invalidated before creating a new one.

**Impact:** Session fixation attacks are theoretically possible if an attacker can set a user's session cookie before authentication.

**Fix:** On login, delete the old session before creating a new one, or ensure session IDs cannot be pre-set by attackers.

---

### 6. Weak Password Requirements

**Severity:** MEDIUM

**Files:**
- `repo/app/lib/auth.js` (line 29)
- `repo/app/api/auth/signup/route.js` (line 17)

**Issue:** Passwords only require 6 characters minimum. No requirements for uppercase, numbers, or special characters.

**Impact:** Weak passwords are easier to brute force or guess.

**Fix:** Enforce stronger requirements (e.g., 8+ chars with mixed case + number) or use a password strength library.

---

## SPEC Conformance Issues

### 7. SPEC.md Required Deletion Not Done

**Severity:** CRITICAL

**Files:**
- `repo/app/api/auth/route.js` should be deleted per SPEC.md section 191

**Issue:** SPEC.md explicitly states "Remove hardcoded `daviddrew` password check entirely" but the file still exists and still contains that check.

**Fix:** Delete `repo/app/api/auth/route.js`.

---

### 8. Scheduled Cleanup Not Implemented

**Severity:** MEDIUM

**Files:**
- `repo/app/api/client-photos/route.js` (only cleans on GET request)
- `repo/app/lib/auth.js` (only cleans on login)

**Issue:** SPEC.md section 202 states: "Cleanup job (can be manual or on login): delete expired sessions and expired client photos". The cleanup only happens:
- When a barber logs in (deletes expired sessions)
- When client photos are fetched (deletes expired photos)

There's no cron job or scheduled task for cleanup.

**Impact:** Expired data accumulates in the database until the next user interaction.

**Fix:** Either:
1. Set up a Vercel Cron job to call `DELETE /api/client-photos/expired`
2. Keep the current "on-demand" cleanup (functional but not ideal)

---

### 9. Client Photo Reuse via sessionStorage (Fragile)

**Severity:** MEDIUM

**Files:**
- `repo/app/try-on/custom/page.js` (lines 38-39)
- `repo/app/custom/page.js` (lines 71-82)

**Issue:** SPEC.md section 216 says "Reuse: clicking a saved photo on try-on page pre-fills it". The implementation uses `sessionStorage` to pass the photo from `/try-on/custom` to `/custom`:

```javascript
sessionStorage.setItem('prefillPhoto', JSON.stringify(foundPhoto));
// Later in /custom:
const prefillStr = sessionStorage.getItem('prefillPhoto');
```

**Impact:** This works but is fragile - sessionStorage is cleared when the tab closes, and large base64 images in sessionStorage can cause issues.

**Fix:** Consider using a more robust state management approach or a temporary server-side session.

---

## Technical Debt

### 10. Schema Initialization on Module Load

**Severity:** LOW-MEDIUM

**Files:**
- `repo/app/lib/db.js` (line 259)

**Issue:** Database schema is initialized when the module is first imported:

```javascript
initializeSchema().catch(console.error);
```

**Impact:** First request to any API route may experience latency while schema is initialized. If initialization fails silently, subsequent requests may fail with confusing errors.

**Fix:** Initialize schema in a dedicated setup script or during app startup, not on first API call.

---

### 11. Silent Failures Throughout

**Severity:** MEDIUM

**Files:**
- `repo/app/try-on/[id]/page.js` (lines 81-91, 137-147)
- `repo/app/custom/page.js` (lines 136-147)

**Issue:** Per SPEC.md section 8, fire-and-forget POSTs silently ignore failures. While this is intentional, it means users never know if their generations are not being saved:

```javascript
const silentSave = useCallback(async (styleName, resultImg) => {
  try {
    fetch('/api/generations', { ... });
  } catch (err) {
    // Silently ignore
  }
}, []);
```

**Impact:** Data loss if the POST fails. No logging of failures for debugging.

**Fix:** Add error logging at minimum, even if you don't show UI errors to users.

---

### 12. No React Error Boundaries

**Severity:** MEDIUM

**Files:**
- `repo/app/global-error.js` (exists but limited)
- All page components

**Issue:** No error boundaries around major UI sections. If a component throws, the entire page crashes.

**Impact:** Poor user experience when errors occur.

**Fix:** Wrap major sections in error boundaries with graceful degradation.

---

### 13. No Input Size Limits on Image Uploads

**Severity:** MEDIUM

**Files:**
- `repo/app/try-on/[id]/page.js` (line 151)
- `repo/app/custom/page.js` (line 189)

**Issue:** File uploads have no explicit size validation before processing:

```javascript
const handleFileChange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  // No size check
  const compressed = await compressImage(file, 1024, 0.82);
```

**Impact:** Large files can cause memory issues or long processing times.

**Fix:** Validate file size before processing:
```javascript
if (file.size > 10 * 1024 * 1024) { // 10MB limit
  setError('Image too large. Please use an image under 10MB.');
  return;
}
```

---

### 14. Unbounded Photo Retrieval

**Severity:** LOW

**Files:**
- `repo/app/api/client-photos/route.js` (line 17)

**Issue:** `getClientPhotos()` returns all unexpired photos with no pagination or limit:

```javascript
const photos = await getClientPhotos(session.barber_id);
```

**Impact:** As photos accumulate, this could return a large payload.

**Fix:** Add pagination or a reasonable limit (e.g., 50 most recent).

---

## Performance Considerations

### 15. Double Sequential API Calls in Analyze Route

**Severity:** LOW

**Files:**
- `repo/app/api/analyze/route.js` (lines 25-149)

**Issue:** The analyze endpoint makes two sequential Gemini API calls:
1. Analyze inspiration image to extract description
2. Generate reference image from description

These could potentially be parallelized or the second call could be made client-side.

**Impact:** Slower response times for the inspiration photo feature.

---

### 16. No Connection Pooling

**Severity:** LOW

**Files:**
- `repo/app/lib/db.js` (lines 9-36)

**Issue:** The database client is created once and reused globally, but there's no explicit connection pooling configuration.

**Impact:** May not efficiently handle high concurrency scenarios.

---

## Missing Functionality (Not MVP, But Noted)

Per SPEC.md section 10, these are intentionally not in MVP:
- Profile page
- Edit/delete generations
- Share links
- Client accounts
- Premium features
- Email verification
- Password reset
- Image upscale/processing tools

These are not concerns for implementation but good to track for future phases.

---

## Summary

| Priority | Count | Key Issues |
|----------|-------|------------|
| CRITICAL | 3 | Hardcoded password, committed secrets, spec violation |
| HIGH | 3 | No rate limiting, API key in URL, weak passwords |
| MEDIUM | 7 | Silent failures, no error boundaries, fragile session sharing |
| LOW | 3 | Schema init timing, unbounded queries, no connection pooling |

**Immediate Actions:**
1. Delete `app/api/auth/route.js`
2. Remove `.env.production` from git history and rotate the token
3. Move API key from URL query to Authorization header
4. Add rate limiting to auth endpoints

---

*Concerns audit: 2026-04-08*
