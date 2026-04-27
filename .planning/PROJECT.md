# SoulPrint

## What This Is

AI companion that actually remembers you. Users import their ChatGPT conversation history (ZIP export), and SoulPrint learns their communication style, preferences, interests, relationships, and context to provide truly personalized conversations. Mobile-first, works on any device.

**Target User:** Anyone with 100+ ChatGPT conversations who wants an AI that "gets them" without re-explaining everything.

## Core Value

**Import your ChatGPT history → Get an AI that knows you.**

The import-to-chat flow must work flawlessly on mobile. Everything else (gamification, achievements, memory browsing) is secondary to this core loop.

## Requirements

### Validated

(None yet — ship to validate)

### Active

**MVP (Current Focus):**
- [ ] Mobile upload flow works end-to-end (ZIP → processing → chat)
- [ ] Soulprint generated from imported conversations via RLM
- [ ] Chat with memory-enhanced responses (RAG retrieval)
- [ ] User can see import/embedding progress
- [ ] Clean, mobile-responsive UI

**Memory System:**
- [ ] 5-layer RLM chunking (200→5000 chars)
- [ ] Cohere embeddings via AWS Bedrock (1024 dimensions)
- [ ] Layered vector search (macro → thematic → micro)
- [ ] Learning from chat (new facts stored with embeddings)

**Chat Features:**
- [ ] Streaming responses from Claude 3.5 Haiku via Bedrock
- [ ] Web search toggle (Perplexity primary, Tavily fallback)
- [ ] Chat history persistence in Supabase

### Out of Scope (MVP)

- **Desktop-only features** — mobile first always
- **Multiple AI providers** — Claude/Bedrock only for now (not OpenAI GPT)
- **Voice features** — text chat only for MVP
- **Social/sharing** — single user experience
- **Pricing/billing** — free during beta
- **Multi-format imports** — ChatGPT ZIP only (not Anthropic, Google, etc.)
- **OpenAI embeddings** — using Cohere via Bedrock (1024 dim), NOT OpenAI

## Context

**Tech Stack:**
- Next.js 15 (App Router) + React 19
- Supabase (Auth, PostgreSQL + pgvector, Storage)
- AWS Bedrock: Cohere Embed v3 (embeddings), Claude 3.5 Haiku (chat/soulprint)
- Vercel deployment (Pro plan for 5min function timeout)
- RLM Service on Render (Python/FastAPI)

**Current State (2026-01-31):**
- Database: 12 tables (cleaned from 29)
- Storage bucket: accepts ZIP, JSON, any MIME type (Safari fix applied)
- Build: passing on Vercel
- Import flow: upload → process-server → chunks → background embeddings

**Key Integrations:**
- **RLM Service** (`soulprint-landing.onrender.com`): Primary for chat, memory retrieval, soulprint generation
- **AWS Bedrock**: Claude 3.5 Haiku for LLM, Cohere Embed v3 for vectors
- **Perplexity API**: Real-time web search (user-triggered via toggle)
- **Tavily**: Web search fallback

**Known Issues:**
- Mobile MIME types vary (fixed by removing restrictions)
- Large files (>500MB) hit Vercel memory limits
- Embedding cron needs monitoring for stalled jobs

## Constraints

| Type | Constraint | Why |
|------|------------|-----|
| **Vercel** | 5 min function timeout, ~500MB memory limit | Serverless platform limits |
| **Mobile** | Must work on iOS Safari, Android Chrome | Target users are mobile-first |
| **File Size** | ChatGPT exports can be 1-10GB | Need chunked processing, can't load all in memory |
| **Embeddings** | Cohere via Bedrock (1024 dim) | Drew's explicit decision — NOT OpenAI |
| **Cost** | Batch embeddings efficiently | Cohere/Bedrock pricing adds up at scale |
| **Storage** | Files deleted after processing | Don't store raw user data long-term |
| **RLM** | Service must be up for chat to work well | Bedrock fallback exists but less personalized |

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Client-side upload to Supabase Storage | Bypass Vercel 4.5MB body limit | ✓ Good |
| Server-side ZIP processing | Mobile browsers crash on large JSZip | ✓ Good |
| Cohere embeddings (not OpenAI) | Drew's explicit choice, 1024 dim vs 1536 | ✓ Locked |
| RLM service for soulprint generation | Dedicated Python service for ML tasks | ✓ Good |
| 5-layer RLM chunking | Hierarchical memory at multiple granularities | ✓ Good |
| Background embedding via cron | Don't block user after import | — Pending validation |
| Remove MIME restrictions on storage | Mobile sends application/octet-stream | ✓ Good |
| 12-table schema (was 29) | Removed duplicates/unused tables | ✓ Good |
| Web search is user-triggered only | Cost control, predictable behavior | ✓ Good |
| 30-day data purge for inactive users | Balance storage vs retention | — Pending |

---

## Schema Overview (12 Tables)

| Table | Purpose |
|-------|---------|
| `user_profiles` | User settings, soulprint_text, import status |
| `conversation_chunks` | Chunked conversations with embeddings (pgvector) |
| `raw_conversations` | Original parsed conversations (full messages) |
| `learned_facts` | Facts extracted from chat, with embeddings |
| `chat_messages` | Chat history persistence |
| `user_stats` | Gamification (XP, level, streak) |
| `achievements` | Achievement definitions |
| `user_achievements` | User's earned achievements |
| `tasks` | Recurring tasks/reminders |
| `import_jobs` | Import job tracking |
| `waitlist` | Email waitlist signups |
| `referrals` | Referral program tracking |

---
*Last updated: 2026-01-31 after GSD discovery*
