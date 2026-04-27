# SoulPrint - PROTECTED SPEC
> ⚠️ **DO NOT DELETE OR MODIFY** without Drew's explicit approval

---

## Embedding Model
- **USE:** OpenAI `text-embedding-3-small`
- **Dimension:** 1536
- **Endpoint:** `/api/embeddings/process`

## Soulprint Structure

The soulprint is the **system prompt** for the user's AI. It should contain:

### Must Have (Core)
- **Personality fingerprint** - tone, humor, formality level
- **Writing style** - sentence structure, vocabulary, punctuation habits
- **Communication patterns** - how they start/end messages, emoji usage
- **Thinking rhythm** - pace, pauses, how they build arguments

### Should Have (Memory)
- **Key facts** - names, places, preferences, history
- **Relationship context** - how they talk to different people
- **Recurring themes** - topics they care about deeply

### RLM Extraction Targets
1. **Voice Profile** - formality spectrum, humor style, emoji patterns, message length
2. **Thinking Style** - how they explain, question, problem-solve, decide
3. **Emotional Signature** - enthusiasm, frustration, comfort patterns
4. **Context Adaptation** - professional vs personal shifts
5. **Memory Anchors** - people, events, strong preferences, interests

## Database Schema (12 tables)
```
user_profiles       - user data + soulprint_text (system prompt)
conversation_chunks - imported convos + embeddings (1024 dim)
chat_messages       - chat history
learned_facts       - extracted knowledge
achievements        - achievement definitions
user_achievements   - unlocked achievements
user_stats          - XP, streaks
recurring_tasks     - scheduled tasks
pending_waitlist    - signups
referrals           - referral tracking
import_jobs         - import debugging
raw_conversations   - temp import data
```

## Flow
1. User uploads ChatGPT ZIP on mobile
2. Server processes → creates conversation_chunks
3. RLM generates soulprint_text from conversations
4. Cohere embeds chunks (1024 dim)
5. Chat uses soulprint_text as system prompt + memory search

## Tech Stack
- Next.js 14 (App Router)
- Supabase (Auth, DB, Storage)
- Cohere embeddings via AWS Bedrock
- Claude/Bedrock for chat
- Vercel deployment
- RLM service on Render

## URLs
- Prod: https://www.soulprintengine.ai
- Supabase: swvljsixpvvcirjmflze
- RLM: https://soulprint-landing.onrender.com

---

## TODO: Automation
After manual flow is verified working:
- [ ] Auto-trigger embeddings after import
- [ ] Auto-trigger soulprint generation after embeddings
- [ ] Cron job for any missed users
- [ ] Error handling and retry logic

---
*Created: 2026-01-30*
*Last verified: 2026-01-30*
