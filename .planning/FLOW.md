# SoulPrint - User Flow

## Overview

The complete user journey from first visit to personalized chat.

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Signup  │───▶│  Import  │───▶│ Process  │───▶│ Soulprint│───▶│   Chat   │
│          │    │  Upload  │    │  (async) │    │ Generated│    │          │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
                                      │                              │
                                      ▼                              ▼
                              ┌──────────────┐              ┌──────────────┐
                              │  Background  │              │   Learning   │
                              │  Embeddings  │              │  (new facts) │
                              └──────────────┘              └──────────────┘
```

---

## 1. Signup / Login

### Pages
- `/` - Landing page with "Get Started" CTA
- `/signup` - Email/password registration
- `/login` - Login with email or Google OAuth
- `/enter` - Quick entry point

### Flow
```
User visits soulprintengine.ai
        │
        ▼
    Landing page (app/page.tsx)
        │
        ├─── "Get Started" ───▶ /signup
        │                           │
        │                           ▼
        │                   Create account
        │                   (Supabase Auth)
        │                           │
        │                           ▼
        └─── "Sign In" ───▶ /login ─┴──▶ Redirect to /import
```

### Key Files
| File | Purpose |
|------|---------|
| `app/page.tsx` | Landing page |
| `app/signup/page.tsx` | Registration form |
| `app/login/page.tsx` | Login form |
| `app/auth/callback/route.ts` | OAuth callback handler |

### Database
- Creates `auth.users` entry (Supabase Auth)
- Creates `user_profiles` row with defaults

---

## 2. Import Upload

### Pages
- `/import` - Main upload interface

### Flow
```
User lands on /import
        │
        ▼
    Shows dropzone UI
    "Upload your ChatGPT export"
        │
        ▼
    User selects ZIP file
        │
        ▼
    Client: Request signed upload URL
    POST /api/import/get-upload-url
        │
        ▼
    Client: Direct upload to Supabase Storage
    PUT {signedUrl} with file body
        │
        ▼
    Client: Queue background processing
    POST /api/import/queue-processing
        │
        ▼
    UI shows "Processing..." state
    Redirect to /chat (or show progress)
```

### Key Files
| File | Purpose |
|------|---------|
| `app/import/page.tsx` | Upload UI with dropzone |
| `app/api/import/get-upload-url/route.ts` | Generate signed URL |
| `app/api/import/queue-processing/route.ts` | Start background job |

### API Details

**GET /api/import/get-upload-url**
```typescript
Request:  { filename: "export.zip" }
Response: { uploadUrl: "https://...", path: "imports/{userId}/{timestamp}-export.zip" }
```

**POST /api/import/queue-processing**
```typescript
Request:  { storagePath: "imports/...", filename: "export.zip", fileSize: 12345678 }
Response: { success: true, message: "Processing started" }
Actions:
  - Updates user_profiles.import_status = 'processing'
  - Fires async request to /api/import/process-server
```

---

## 3. Processing (Background)

### Flow
```
/api/import/process-server (async, up to 5 min)
        │
        ▼
    Download ZIP from Supabase Storage
        │
        ▼
    Extract conversations.json
    (lib/import/parser.ts)
        │
        ▼
    Parse all conversations
    Tree structure → flat array
        │
        ▼
    Store raw conversations
    INSERT into raw_conversations
        │
        ▼
    Chunk conversations (5-layer RLM)
    (lib/import/chunker.ts)
    ┌───────────────────────────────────────┐
    │ Layer 1 (Micro):  ~200 chars          │
    │ Layer 2 (Flow):   ~500 chars          │
    │ Layer 3 (Theme):  ~1000 chars         │
    │ Layer 4 (Narrat): ~2000 chars         │
    │ Layer 5 (Macro):  ~5000 chars         │
    └───────────────────────────────────────┘
        │
        ▼
    Save chunks to conversation_chunks
    (without embeddings yet)
        │
        ▼
    Generate Soulprint
    ├─── Option A: RLM Service /analyze
    └─── Option B: lib/import/soulprint.ts
        │
        ▼
    Update user_profiles:
    - soulprint_text = generated content
    - import_status = 'quick_ready'
    - total_chunks = count
        │
        ▼
    Delete uploaded file from Storage
        │
        ▼
    Trigger embedding job
    POST /api/import/embed-background
```

### Key Files
| File | Purpose |
|------|---------|
| `app/api/import/process-server/route.ts` | Main processing orchestrator |
| `lib/import/parser.ts` | ZIP extraction, JSON parsing |
| `lib/import/chunker.ts` | 5-layer chunking logic |
| `lib/import/soulprint.ts` | Soulprint generation (quick + LLM) |
| `app/api/import/save-chunks/route.ts` | Bulk insert chunks |

### Soulprint Generation

```typescript
// Quick analysis (pattern matching, ~30s)
const quickSoulprint = await generateQuickSoulprint(conversations);
// Extracts: writingStyle, personality, interests, facts, relationships

// LLM analysis (Claude, ~3-5min for 300 convos)
const { extraction, soulprint } = await generateLLMSoulprint(conversations);
// Extracts: identity, professional, relationships, interests, beliefs,
//           communication, health, technology, goals, painPoints

// Convert to system prompt format
const soulprintText = soulprintToContext(soulprint);
```

---

## 4. Background Embeddings

### Flow
```
/api/import/embed-background
        │
        ▼
    Fetch chunks without embeddings
    SELECT * FROM conversation_chunks 
    WHERE user_id = ? AND embedding IS NULL
    LIMIT 1000
        │
        ▼
    Batch embed (96 texts per batch)
    (lib/import/embedder.ts)
    ┌───────────────────────────────────────┐
    │ Cohere Embed v3 via AWS Bedrock       │
    │ Model: cohere.embed-english-v3        │
    │ Input type: search_document           │
    │ Output: 1536-dim float vectors        │
    └───────────────────────────────────────┘
        │
        ▼
    Update chunks with embeddings
    UPDATE conversation_chunks SET embedding = ?
        │
        ▼
    Update progress
    UPDATE user_profiles SET embedding_progress = ?
        │
        ▼
    If more chunks remain:
        - Queue another embed-background call
    Else:
        - Set embedding_status = 'complete'
```

### Key Files
| File | Purpose |
|------|---------|
| `app/api/import/embed-background/route.ts` | Background embedding processor |
| `lib/import/embedder.ts` | Cohere Bedrock embedding logic |

### Progress Tracking

```typescript
// User profile columns
{
  embedding_status: 'processing' | 'complete' | null,
  embedding_progress: 0-100,
  total_chunks: number
}

// Client polls /api/memory/status
{
  status: 'ready' | 'processing' | 'failed',
  hasSoulprint: true,
  embeddingProgress: 75,
  totalChunks: 500
}
```

---

## 5. Chat

### Pages
- `/chat` - Main chat interface

### Flow
```
User on /chat
        │
        ▼
    Load chat history from Supabase
    GET /api/chat/messages
        │
        ▼
    Check memory status
    GET /api/memory/status
        │
        ├─── Processing? Show progress bar
        └─── Ready? Enable full chat
        │
        ▼
    User types message
        │
        ▼
    POST /api/chat
    { message, history, deepSearch }
        │
        ▼
    ┌─────────────────────────────────────┐
    │          CHAT API FLOW               │
    │                                      │
    │  1. Get user profile (soulprint)    │
    │                                      │
    │  2. If deepSearch enabled:          │
    │     - queryPerplexity(message)      │
    │     - or searchWeb (Tavily)         │
    │                                      │
    │  3. Search memories                  │
    │     - getMemoryContext(userId, msg) │
    │     - Layered vector search         │
    │     - Plus learned_facts            │
    │                                      │
    │  4. Try RLM Service first           │
    │     POST /query                     │
    │     - Returns: response, chunks_used│
    │                                      │
    │  5. Fallback: Bedrock direct        │
    │     - Build system prompt with:     │
    │       * soulprint_text              │
    │       * memory context              │
    │       * web search results          │
    │     - ConverseCommand → Claude      │
    │                                      │
    │  6. Stream response (SSE)           │
    │                                      │
    │  7. Learn from exchange (async)     │
    │     - learnFromChat()               │
    │     - Extract facts → learned_facts │
    └─────────────────────────────────────┘
        │
        ▼
    Display streamed response
        │
        ▼
    Save to chat history
    POST /api/chat/messages
```

### Key Files
| File | Purpose |
|------|---------|
| `app/chat/page.tsx` | Chat UI component |
| `app/api/chat/route.ts` | Main chat endpoint |
| `app/api/chat/messages/route.ts` | Chat history CRUD |
| `lib/memory/query.ts` | Memory retrieval |
| `lib/memory/learning.ts` | Fact extraction from chat |
| `lib/search/perplexity.ts` | Web search |

### Memory Retrieval Details

```typescript
// lib/memory/query.ts - getMemoryContext()

// 1. Embed the query
const queryEmbedding = await createQueryEmbedding(message);

// 2. Layered search
const results = {
  macro: await searchLayer(5, limit=2, threshold=0.25),  // Big picture
  theme: await searchLayer(3, limit=3, threshold=0.35),  // Topics
  micro: await searchLayer(1, limit=4, threshold=0.45),  // Details
};

// 3. Also search learned facts
const facts = await searchLearnedFacts(embedding, 10, 0.4);

// 4. Format context
return {
  contextText: `
    [MACRO CONTEXT]
    ${macro.map(c => c.content).join('\n')}
    
    [THEMATIC CONTEXT]
    ${theme.map(c => c.content).join('\n')}
    
    [MICRO DETAILS]
    ${micro.map(c => c.content).join('\n')}
    
    [LEARNED FACTS]
    ${facts.map(f => f.fact).join('\n')}
  `,
  chunks: [...macro, ...theme, ...micro],
  facts,
  method: 'layered'
};
```

---

## 6. Learning from Chat

### Flow
```
After chat response generated
        │
        ▼
    learnFromChat(userId, userMessage, assistantResponse)
    (lib/memory/learning.ts)
        │
        ▼
    Extract facts via Claude
    ┌───────────────────────────────────────┐
    │ Prompt: "Extract durable facts about │
    │ this person from the exchange..."    │
    │                                       │
    │ Returns: [                           │
    │   { fact: "User prefers...",         │
    │     category: "preferences",         │
    │     confidence: 0.8 }                │
    │ ]                                    │
    └───────────────────────────────────────┘
        │
        ▼
    Filter by confidence >= 0.7
        │
        ▼
    Embed each fact
    (Cohere via Bedrock)
        │
        ▼
    Store in learned_facts table
    { user_id, fact, category, confidence, embedding, status: 'active' }
```

### Fact Categories

```typescript
type FactCategory = 
  | 'preferences'   // Likes, dislikes, favorites
  | 'relationships' // People mentioned
  | 'milestones'    // Life events, achievements
  | 'beliefs'       // Values, opinions
  | 'decisions'     // Choices, plans
  | 'events';       // Recent/upcoming events
```

---

## 7. Periodic Synthesis

### Flow (Cron or Manual)
```
/api/memory/synthesize
(triggered by cron every 6 hours)
        │
        ▼
    Get learned facts since last synthesis
    SELECT * FROM learned_facts 
    WHERE user_id = ? 
    AND created_at > last_synthesis
        │
        ▼
    If new facts exist:
        │
        ▼
    LLM: Integrate facts into soulprint
    ┌───────────────────────────────────────┐
    │ Prompt: "Given these new facts about │
    │ the user, update the soulprint to    │
    │ reflect their current state..."      │
    └───────────────────────────────────────┘
        │
        ▼
    Update user_profiles.soulprint_text
```

---

## Status Indicators

### Import Status (`user_profiles.import_status`)

| Status | Meaning |
|--------|---------|
| `none` | No import started |
| `processing` | Import in progress |
| `quick_ready` | Soulprint ready, embeddings pending |
| `complete` | Fully processed |
| `failed` | Error occurred |

### Embedding Status (`user_profiles.embedding_status`)

| Status | Meaning |
|--------|---------|
| `null` | Not started |
| `processing` | Embeddings being generated |
| `complete` | All chunks embedded |
| `failed` | Embedding error |

---

## Error Recovery

### Import Failures
```
On error during processing:
  - Set import_status = 'failed'
  - Set import_error = error message
  - UI shows "Try Again" button
  - User can re-upload
```

### Embedding Failures
```
On error during embedding:
  - Set embedding_status = 'failed'
  - Chat still works (just no memory context)
  - Admin can trigger manual re-embed
```

### Chat Fallbacks
```
1. Try RLM Service
   ↓ (if fails)
2. Bedrock with memory context
   ↓ (if memory search fails)
3. Bedrock with soulprint only
   ↓ (if soulprint missing)
4. Generic Claude response
```

---
*Last updated: 2026-01-31 after GSD discovery*
