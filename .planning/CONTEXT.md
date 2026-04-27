# SoulPrint - Technical Context

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SOULPRINT ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                │
│  │   Next.js    │     │   Supabase   │     │     RLM      │                │
│  │  (Vercel)    │────▶│  (Postgres)  │◀────│   (Render)   │                │
│  │              │     │   + pgvector │     │  FastAPI/ML  │                │
│  └──────────────┘     └──────────────┘     └──────────────┘                │
│         │                    │                    │                         │
│         ▼                    ▼                    ▼                         │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                │
│  │  Supabase    │     │  AWS Bedrock │     │  Perplexity  │                │
│  │   Storage    │     │  Claude/Cohere│    │  Web Search  │                │
│  │    (R2)      │     │              │     │              │                │
│  └──────────────┘     └──────────────┘     └──────────────┘                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Frontend (Next.js 15)

| Directory | Purpose |
|-----------|---------|
| `app/` | App Router pages and API routes |
| `app/import/` | Upload flow UI |
| `app/chat/` | Main chat interface |
| `app/admin/` | Admin dashboard |
| `components/` | Shared React components |

### 2. Backend Services

| Service | Location | Purpose |
|---------|----------|---------|
| **API Routes** | `/app/api/*` | Next.js API handlers |
| **RLM Service** | Render | Memory retrieval, soulprint generation |
| **AWS Bedrock** | us-east-1 | Claude 3.5 Haiku (LLM), Cohere Embed v3 |

### 3. Data Layer

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Auth** | Supabase Auth | Google OAuth, email/password |
| **Database** | Supabase PostgreSQL | All application data |
| **Vectors** | pgvector extension | Similarity search on embeddings |
| **Storage** | Supabase Storage (R2) | Temporary file uploads |

---

## Data Flow Diagrams

### Import Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           IMPORT PIPELINE                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. UPLOAD                                                                  │
│     User selects ChatGPT ZIP                                               │
│         │                                                                   │
│         ▼                                                                   │
│     /api/import/get-upload-url                                             │
│         │                                                                   │
│         ▼                                                                   │
│     Client uploads directly to Supabase Storage                            │
│         │                                                                   │
│         ▼                                                                   │
│     /api/import/queue-processing                                           │
│         │                                                                   │
│  2. PARSE (process-server)                                                 │
│         ▼                                                                   │
│     Download ZIP from Storage                                              │
│         │                                                                   │
│         ▼                                                                   │
│     lib/import/parser.ts                                                   │
│     Extract conversations.json, parse tree structure                       │
│         │                                                                   │
│  3. CHUNK                                                                   │
│         ▼                                                                   │
│     lib/import/chunker.ts                                                  │
│     5-Layer RLM Chunking:                                                  │
│     ┌───────┬───────┬───────┬───────┬───────┐                             │
│     │ L1    │ L2    │ L3    │ L4    │ L5    │                             │
│     │ Micro │ Flow  │Theme  │Narrat │ Macro │                             │
│     │ 200ch │ 500ch │1000ch │2000ch │5000ch │                             │
│     └───────┴───────┴───────┴───────┴───────┘                             │
│         │                                                                   │
│  4. SOULPRINT                                                               │
│         ▼                                                                   │
│     RLM Service /analyze                                                   │
│     OR lib/import/soulprint.ts (generateLLMSoulprint)                      │
│     Extract: identity, interests, relationships, communication style      │
│         │                                                                   │
│         ▼                                                                   │
│     Save to user_profiles.soulprint_text                                   │
│         │                                                                   │
│  5. EMBED (background)                                                      │
│         ▼                                                                   │
│     /api/import/embed-background                                           │
│         │                                                                   │
│         ▼                                                                   │
│     lib/import/embedder.ts                                                 │
│     Cohere Embed v3 via Bedrock (96 texts/batch)                          │
│         │                                                                   │
│         ▼                                                                   │
│     Store in conversation_chunks.embedding (1024 dim vector)               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Chat Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CHAT FLOW                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  User Message                                                               │
│      │                                                                      │
│      ▼                                                                      │
│  /api/chat (route.ts)                                                       │
│      │                                                                      │
│      ├───────────────────────────────────────────────┐                      │
│      │                                               │                      │
│      ▼                                               ▼                      │
│  Get User Profile                            Web Search Toggle ON?          │
│  (soulprint_text, import_status)                     │                      │
│      │                                               ▼                      │
│      │                                      queryPerplexity()               │
│      │                                      (or Tavily fallback)            │
│      │                                               │                      │
│      ▼                                               │                      │
│  ┌─────────────────────────────────────────────────┐ │                      │
│  │           MEMORY RETRIEVAL                       │◀┘                     │
│  │  lib/memory/query.ts                            │                        │
│  │                                                  │                        │
│  │  1. Embed query (Cohere v3, input_type: query)  │                        │
│  │  2. Layered vector search:                       │                        │
│  │     - MACRO (L5): 2 chunks, 0.25 threshold      │                        │
│  │     - THEME (L3): 3 chunks, 0.35 threshold      │                        │
│  │     - MICRO (L1): 4 chunks, 0.45 threshold      │                        │
│  │  3. Fallback: keyword search if < 3 chunks      │                        │
│  │  4. Also search learned_facts table              │                        │
│  └─────────────────────────────────────────────────┘                        │
│      │                                                                      │
│      ▼                                                                      │
│  ┌─────────────────────────────────────────────────┐                        │
│  │           RLM SERVICE (primary)                  │                        │
│  │  POST /query                                     │                        │
│  │  - user_id, message, soulprint_text, history    │                        │
│  │  - web_search_context (if enabled)              │                        │
│  │  Returns: response, chunks_used, method          │                        │
│  └─────────────────────────────────────────────────┘                        │
│      │                                                                      │
│      │ (fallback if RLM fails)                                             │
│      ▼                                                                      │
│  ┌─────────────────────────────────────────────────┐                        │
│  │           BEDROCK FALLBACK                       │                        │
│  │  Claude 3.5 Haiku via ConverseCommand           │                        │
│  │  System prompt: soulprint_text + memory context │                        │
│  └─────────────────────────────────────────────────┘                        │
│      │                                                                      │
│      ▼                                                                      │
│  Stream Response (SSE)                                                      │
│      │                                                                      │
│      ▼                                                                      │
│  ┌─────────────────────────────────────────────────┐                        │
│  │           LEARNING (async)                       │                        │
│  │  lib/memory/learning.ts                         │                        │
│  │  Extract facts from user message                │                        │
│  │  Store in learned_facts with embeddings         │                        │
│  └─────────────────────────────────────────────────┘                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Files Reference

### Import System

| File | Purpose |
|------|---------|
| `lib/import/parser.ts` | Parse ChatGPT ZIP → conversations array |
| `lib/import/chunker.ts` | 5-layer RLM chunking (200-5000 char tiers) |
| `lib/import/embedder.ts` | Cohere Embed v3 via Bedrock (96/batch) |
| `lib/import/soulprint.ts` | Quick + LLM soulprint generation |
| `lib/import/personality-analysis.ts` | Deep personality extraction |
| `app/api/import/process-server/route.ts` | Main processing endpoint |
| `app/api/import/embed-background/route.ts` | Background embedding job |

### Memory System

| File | Purpose |
|------|---------|
| `lib/memory/query.ts` | Vector search with layer filtering |
| `lib/memory/facts.ts` | Fact extraction from chunks |
| `lib/memory/learning.ts` | Learn new facts from chat |
| `app/api/memory/query/route.ts` | Memory search API |
| `app/api/memory/synthesize/route.ts` | Soulprint update from facts |

### Chat System

| File | Purpose |
|------|---------|
| `app/api/chat/route.ts` | Main chat endpoint |
| `lib/search/perplexity.ts` | Web search (primary) |
| `lib/search/tavily.ts` | Web search (fallback) |
| `app/chat/page.tsx` | Chat UI |

### Database

| File | Purpose |
|------|---------|
| `lib/supabase/server.ts` | SSR Supabase client |
| `lib/supabase/client.ts` | Browser Supabase client |
| `lib/supabase/middleware.ts` | Auth token refresh |

---

## Integration Points

### AWS Bedrock

```typescript
// Claude 3.5 Haiku for chat/soulprint
const modelId = 'us.anthropic.claude-3-5-haiku-20241022-v1:0';

// Cohere Embed v3 for embeddings
const embedModelId = 'cohere.embed-english-v3';
// Returns 1536-dimensional vectors
// input_type: 'search_document' for chunks, 'search_query' for queries
```

### Supabase pgvector

```sql
-- Vector column
embedding vector(1536)

-- IVFFlat index for similarity search
CREATE INDEX idx_chunks_embedding 
ON conversation_chunks 
USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

-- Similarity search RPC
CREATE FUNCTION match_conversation_chunks_layered(
  query_embedding vector(1536),
  match_user_id uuid,
  match_layer int,
  match_count int DEFAULT 5,
  match_threshold float DEFAULT 0.5
)
```

### RLM Service

```
URL: https://soulprint-landing.onrender.com

Endpoints:
- POST /query    - Chat with memory
- POST /analyze  - Generate soulprint
- GET /health    - Health check
```

---

## Key Patterns

### 1. Client-Side Upload (Bypass Vercel Limits)

```typescript
// Get signed URL
const { uploadUrl, path } = await fetch('/api/import/get-upload-url', {
  method: 'POST',
  body: JSON.stringify({ filename: file.name })
}).then(r => r.json());

// Upload directly to Supabase Storage
await fetch(uploadUrl, {
  method: 'PUT',
  body: file,
  headers: { 'Content-Type': file.type }
});
```

### 2. Layered Memory Retrieval

```typescript
// Search at multiple granularities
const results = await Promise.all([
  searchLayer(embedding, userId, 5, 2, 0.25),  // Macro: big picture
  searchLayer(embedding, userId, 3, 3, 0.35),  // Theme: topics
  searchLayer(embedding, userId, 1, 4, 0.45),  // Micro: details
]);
```

### 3. Background Processing Pattern

```typescript
// Queue processing (returns immediately)
await fetch('/api/import/queue-processing', { ... });

// Actual processing happens in background
await fetch('/api/import/process-server', { ... });

// Embeddings happen via background job
await fetch('/api/import/embed-background', { ... });
```

---

## Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# AWS Bedrock
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
BEDROCK_MODEL_ID=us.anthropic.claude-3-5-haiku-20241022-v1:0

# RLM Service
RLM_SERVICE_URL=https://soulprint-landing.onrender.com

# Search
PERPLEXITY_API_KEY=pplx-...
TAVILY_API_KEY=tvly-...
```

---
*Last updated: 2026-01-31 after GSD discovery*
