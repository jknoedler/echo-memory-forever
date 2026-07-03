## Goal

Sending a message must always finish, even if you close the tab, lose signal, or reload. When you're present, you still get the live streaming feel. When you're gone, a background worker completes the reply and it's waiting for you on reload.

## What you'll see

- Send a message → assistant "thinking" bubble appears immediately.
- Stay in the app → stream renders live, exactly like today.
- Close the app mid-reply → server keeps working. When you reopen the thread, the finished reply is there.
- Reload during a still-processing turn → thread shows the "thinking" bubble with a live status; message appears via realtime when done.
- If the model errors, the turn is marked failed and shown as such (with retry).

## How it works (technical)

### 1. New table: `chat_jobs`

Columns: `id`, `user_id`, `thread_id`, `status` (`pending` | `processing` | `complete` | `failed`), `request_payload` (jsonb — the messages array + tz), `assistant_message_id` (nullable), `error` (text), `attempts` (int), `worker_lock` (uuid nullable), `locked_at`, `created_at`, `updated_at`, `started_at`, `finished_at`. RLS scoped to owner. Realtime enabled. Owner-read, service-role-write.

### 2. Extract chat pipeline into a reusable function

Move the entire model-call pipeline currently inline in `POST /api/chat` (memory retrieval, personality block, biometrics, calendar, followups, model resolution, refusal/fallback logic, post-turn extraction) into `src/lib/chat-pipeline.server.ts` exposing `runChatTurn({ supabase, userId, threadId, messages, tz, onDelta? })`. Same function powers both the live route and the worker.

### 3. `POST /api/chat` — hybrid path

- Insert a `chat_jobs` row with status `processing` and a per-request `worker_lock` UUID.
- Run `runChatTurn` with an `onDelta` callback that streams to the response.
- On success: write assistant message to `messages` table, mark job `complete`, clear lock.
- If `request.signal` aborts (client disconnected) mid-stream: keep the model call running to completion using `ctx.waitUntil` (Cloudflare Workers), save the message, mark complete. If the runtime kills us before completion, the row stays `processing` with a stale `locked_at` — the worker reclaims it after 60s.
- If the model call throws: mark `failed` with error message.

### 4. `POST /api/public/hooks/process-chat-jobs` — worker

- Authenticated by Supabase `apikey` header (anon key, per platform pattern).
- Uses `supabaseAdmin` to atomically claim up to N pending/stale jobs (`UPDATE ... SET status='processing', worker_lock=gen_random_uuid(), locked_at=now() WHERE (status='pending') OR (status='processing' AND locked_at < now()-interval '60s') RETURNING *`).
- For each claimed job: instantiate a user-scoped Supabase client using the service role but scoping all queries by `user_id`, run `runChatTurn`, save assistant message, mark complete. Errors → `failed` with error, `attempts++`; give up after 3.
- Returns `{ processed, failed }`.

### 5. pg_cron schedule

Runs the worker every minute against the stable preview/production URL.

### 6. Frontend changes

- Thread route (`c.$threadId.tsx`): on mount, subscribe to two Supabase realtime channels for this thread: `messages` (INSERT) and `chat_jobs` (UPDATE). New assistant message → append to chat. Job `complete`/`failed` → hide thinking bubble / show error.
- On reload with an in-flight job: query `chat_jobs` where thread_id=… and status in (pending, processing); if any, render the thinking bubble immediately with "Working on your last message…".
- Send flow: keep AI SDK `useChat` streaming for the live-present case. The stream itself carries text as today; on stream close without content (disconnect), realtime picks it up.

### 7. Cleanup

Old completed jobs older than 7 days pruned by pg_cron nightly.

## Files touched

- New: `supabase/migrations/…_chat_jobs.sql`, `src/lib/chat-pipeline.server.ts`, `src/routes/api/public/hooks/process-chat-jobs.ts`
- Edited: `src/routes/api/chat.ts` (thin wrapper around pipeline + job lifecycle), `src/routes/_authenticated/c.$threadId.tsx` (realtime subscriptions + in-flight indicator on load)
- SQL insert (not migration): pg_cron schedule for the worker

## Out of scope

- Push notifications on completion (can add later).
- Streaming resumption if you reconnect mid-generation — you'll see the final message appear at once via realtime, not resumed token-by-token. Adding true stream resume is a much bigger project.

Approve and I'll build it.