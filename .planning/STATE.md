# SoulPrint — Current State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-31)

**Core value:** Import your ChatGPT history → Get an AI that knows you
**Current focus:** Mobile MVP — Upload → Process → Chat flow

---

## Current Phase: Mobile MVP

### Status: 🔄 Testing

**Objective:** User can upload ChatGPT ZIP on mobile and land in working chat.

### Completed
- [x] Database cleanup (29 → 12 tables)
- [x] Storage bucket MIME fix (accepts any type)
- [x] Build passing on Vercel
- [x] Test user cleared for fresh import test
- [x] GSD discovery documentation complete

### In Progress
- [ ] Drew testing mobile upload flow

### Blocked
- None

### Next Actions
1. Verify mobile upload completes successfully
2. Verify processing creates soulprint
3. Verify chat loads with memory context
4. Fix any issues found

---

## Key Technical Specs (LOCKED)

| Spec | Value | Notes |
|------|-------|-------|
| **Embeddings** | Cohere Embed v3 via Bedrock | 1024 dimensions, NOT OpenAI |
| **LLM** | Claude 3.5 Haiku via Bedrock | Primary for chat & soulprint |
| **Chunking** | 5-layer RLM | 200/500/1000/2000/5000 char |
| **Vector DB** | Supabase pgvector | IVFFlat index |
| **Schema** | 12 tables | See PROJECT.md |

---

## Recent Sessions

### 2026-01-31 00:00 CST
**Focus:** GSD Discovery & Documentation
- Created comprehensive `.planning/` documentation:
  - `PROJECT.md` - Full project spec
  - `CONTEXT.md` - Technical architecture
  - `FLOW.md` - User flow details
- Mapped entire codebase structure
- Documented all API routes and integrations
- **Status:** Discovery complete, awaiting test results

### 2026-01-30 22:30 CST
**Focus:** Database cleanup + mobile testing
- Cloned fresh repo, fixed build errors
- Cleaned Supabase: dropped 17 unused tables
- Fixed storage bucket MIME restrictions
- Cleared Drew's test account
- Created GSD skill
- **Status:** Awaiting Drew's mobile test result

---

## Architecture Summary

```
User → Next.js (Vercel) → Supabase (DB/Auth/Storage)
                      ↘
                   RLM Service (Render) → Bedrock (Claude/Cohere)
                      ↗
         Perplexity/Tavily (Web Search)
```

## Key Files

| Category | Key Files |
|----------|-----------|
| **Import** | `lib/import/parser.ts`, `chunker.ts`, `embedder.ts`, `soulprint.ts` |
| **Memory** | `lib/memory/query.ts`, `learning.ts`, `facts.ts` |
| **Chat** | `app/api/chat/route.ts`, `lib/search/perplexity.ts` |
| **DB** | `lib/supabase/server.ts`, `client.ts` |

---

## Environment

- **Prod URL:** https://www.soulprintengine.ai
- **Supabase:** swvljsixpvvcirjmflze
- **Vercel Project:** soulprint-landing
- **RLM Service:** soulprint-landing.onrender.com

---

## Blockers Log

(None currently)

---
*Last updated: 2026-01-31 00:15 CST after GSD discovery*
