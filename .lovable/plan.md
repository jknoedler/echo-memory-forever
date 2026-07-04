## Heads up on `VITE_` vars

`VITE_*` variables are **build-time**, not runtime secrets. Lovable Cloud's secret store (`add_secret`) injects env vars into **backend code only** (server functions, edge functions) — they never reach the browser bundle. So storing `VITE_API_BASE_URL` there does nothing for `import.meta.env`.

For a client-side base URL, two options:

**Option A — Add to `.env` as a `VITE_` var (correct for this case)**
The value (`https://api.moment0.com`) is a public URL, not a secret. I'll append it to `.env` so Vite inlines it into the build. `import.meta.env.VITE_API_BASE_URL` then works everywhere in the frontend.

**Option B — Also store as backend secret**
Only needed if server functions (`src/routes/api/chat.ts`, etc.) also need to call the same URL. Different variable name (no `VITE_` prefix), read via `process.env.API_BASE_URL` in handlers.

## Plan (assuming Option A + wire it in)

1. **Add to `.env`**
   Append `VITE_API_BASE_URL=https://api.moment0.com` (note: you wrote `moment0.com`, not `mement0.com` — confirm which is intended).

2. **Type it**
   Add to `src/vite-env.d.ts` (or create) so TS knows about `import.meta.env.VITE_API_BASE_URL`.

3. **Create a small helper** `src/lib/api-base.ts`:
   ```ts
   export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
   ```
   So we don't sprinkle `import.meta.env` reads across the codebase.

4. **Update fetch call sites** — I need to know **which** code should use this base URL. The project currently calls its own internal routes (`/api/chat`, `/api/stt`, `/api/tts`, etc.) as relative paths. Blindly prefixing all `fetch()` calls with `https://api.moment0.com` will break the app.

## Questions before I build

1. **Domain typo?** `moment0.com` vs `mement0.com` — which is correct?
2. **What is `api.moment0.com` for?** Is it your Qwen inference server (the Vast.ai one from earlier), or a different backend entirely?
3. **Which existing fetch calls should point at it?** Options:
   - (a) Only new code I'm about to add — tell me what to build
   - (b) Replace the internal `/api/chat` route so the browser calls `https://api.moment0.com/chat` directly instead of the TanStack server function
   - (c) Just add the constant and leave call sites alone for now
