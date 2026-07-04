# Daily chats with sub-chats + hour markers + AI recall

Replace the flat thread list with one chat per day. Sub-chats nest inside today when you want separation. Within each day, subtle hour markers divide the transcript so you can scroll to a specific time. At the user's local midnight the day rolls over: brief loading screen, fresh chat for the new day, last ~10 messages silently carried as context. And the AI itself can fetch any past moment on demand — you shouldn't ever *have* to scroll to find something.

## How it works for the user

- **Opening the app** lands you in *today's chat*, always.
- **"New" button** creates a *sub-chat inside today*. All of today's chats (root + sub-chats) group together in the sidebar.
- **Sidebar** grouped by day: Today, Yesterday, then dated headers. Sub-chats indent under their day. Older days collapse under "Earlier".
- **Hour markers** inside every chat: thin dividers appear inline in the transcript at each hour boundary — `— 2 PM —`, `— 3 PM —`. Empty hours are skipped. A tiny hour rail on the right edge lets you jump-scroll to any hour of the day.
- **Midnight rollover**: mid-message when the clock rolls → short "New day…" loading screen (~1s) → new day's chat opens, draft text preserved and pasted into the composer.
- **Context carry**: every new day-root silently inherits the last ~10 messages of the previous day's root as background context for the model. Not shown in the visible transcript.
- **AI recall (this is the point)**: ask "what did I say about the espresso machine last Thursday?" and the model retrieves it directly from your archive and quotes it back. No manual searching required.
- **Archived days** are read-only in the sidebar. Click "continue this thread" to reopen for writing.

## Layout sketch

```text
┌──────────────────────────────┐  ┌───────────────────────────┐
│ + New sub-chat               │  │  Today · Wed Nov 12       │
├──────────────────────────────┤  │ ─── 9 AM ─────────────    │
│ TODAY                        │  │  you: morning notes…      │
│ • Main                    ●  │  │  DED: got it              │
│   ↳ Debugging build          │  │ ─── 11 AM ────────────    │
│   ↳ Grocery list             │  │  you: quick q…            │
│ YESTERDAY                    │  │ ─── 2 PM ─────────────    │
│ • Main                       │  │  you: …                   │
│ EARLIER                      │  │                       │9│ │
│ ▸ Wed · Nov 12               │  │                       │11││
│ ▸ Tue · Nov 11               │  │                       │2 ││
└──────────────────────────────┘  └───────────────────────────┘
```

## Technical plan

**Schema (migration)**
- `threads` gains: `day_key date`, `parent_thread_id uuid null references threads(id)`, `is_daily_root bool default false`, `carried_from_thread_id uuid null`, `timezone text`.
- Unique partial index: one daily root per `(user_id, day_key)` where `is_daily_root = true`.
- Backfill: `day_key = created_at::date`, mark existing threads as daily roots.
- Nightly cron: flip `continuity_status = 'archived'` on roots where `day_key < current_date` and status is `open`.

**Server functions (`src/lib/threads.functions.ts`)**
- `getOrCreateTodayThread({ tz })` — returns today's daily root, creates it if missing, sets `carried_from_thread_id` to yesterday's root.
- `createSubThread({ parentId })` — creates a sub-chat under a day root; blocks if parent is archived.
- `listThreadsGrouped()` — returns `[{ dayKey, root, subs[] }]` newest-first with a lazy "load older" cursor.

**AI recall (`src/lib/memories.functions.ts` + `src/routes/api/chat.ts`)**
- Existing embeddings pipeline already indexes messages. Add a tool the model can call mid-turn: `recall_from_archive({ query, day_range?, thread_id? })` that runs a hybrid search (pgvector `match_memories` + a lexical `ILIKE` fallback) across the user's entire message history and returns the top hits with `thread_id`, `timestamp`, and quoted content.
- Chat system prompt updated with a short instruction: "Before answering questions about the past, call `recall_from_archive` — do not guess. Quote the retrieved text with its date/time."
- When the model quotes a recalled snippet, render an inline "Jump to this moment" link in the assistant bubble that deep-links to `/c/{threadId}?t={messageId}` and scrolls the transcript to that hour marker.

**Chat pipeline (`src/routes/api/chat.ts`)**
- When building context for a daily root, if `carried_from_thread_id` is set and this is the first user turn, prepend the last 10 messages from that prior root as system-tagged "prior day context" (not persisted).
- Sub-chats do not carry context from siblings.

**Frontend**
- `/app` calls `getOrCreateTodayThread` with `Intl.DateTimeFormat().resolvedOptions().timeZone` and redirects to `/c/{todayId}`.
- `/day-turnover` transient route: loading screen, awaits new day root, redirects. Draft passed via `sessionStorage`.
- `app-shell.tsx` sidebar: grouped renderer; "New thread" → "New sub-chat" when inside a day.
- `c.$threadId.tsx`:
  - `?t={messageId}` search param scrolls to that message on mount and briefly highlights it.
  - Hour-marker renderer: walk the sorted messages; when the local hour changes, emit a divider row before the next message. Hour rail on the right computes which hours have any messages and renders clickable ticks (`scrollIntoView` on the divider).
  - Restore carried draft from `sessionStorage`.
- `useDayRollover` hook: computes ms-until-local-midnight, on fire stashes the draft and navigates to `/day-turnover`. Re-arms on visibility change and after each rollover.

**Edge cases**
- Tab open across midnight → watcher fires seamlessly.
- Tab closed at 11pm, reopened 2am next day → `/app` creates today's root with carry.
- Timezone travel → tz captured per-thread; each visit uses browser's current tz.
- Sub-chat open at midnight → rolls over to new day's root.
- Recall across archived + active threads works identically (same message table).

## Out of scope
- Search across archived days as a manual UI (AI recall replaces it).
- Renaming daily roots (auto-titled by date + optional summary).
- Merging sub-chats.
