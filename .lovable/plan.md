
# Tiered model fallback with price ceilings

## Goal

When free OpenRouter models get 429'd, gracefully step down to paid models — but keep costs pennies-per-day per user by enforcing hard price ceilings + per-tier rate limits.

## Tiers

| Tier | Price ceiling (output $/M tok) | Who can use | Rate limit |
|---|---|---|---|
| **T0 — Free** | $0 | Everyone | Unlimited |
| **T1 — Ultra-cheap** | ≤ $0.15/M output | Everyone (free + paid users) | 20 messages / hour / user |
| **T2 — Cheap** | ≤ $1.00/M output | Paid users only | 100 messages / hour / user |
| **T3+** | anything above | Nobody | Blocked |

Free users who exhaust T1 hourly quota get a "come back in X min or upgrade" message. Paid users fall through to T2.

## Fallback order (per chat request)

1. Cycle **all T0 free** models on the OpenRouter allowlist (`src/lib/openrouter-free.ts`). Short retry per model, then move to next free one. Only after every free model 429s do we spend money.
2. Drop to **T1 ultra-cheap** (with quota check).
3. If paid user: drop to **T2 cheap** (with quota check).
4. If everything failed / user is over quota: friendly error toast, no charge.

## Model shortlist

**T0 (existing free allowlist, unchanged):** Llama 3.3 70B, Qwen3, GPT-OSS, Nemotron, Hermes, Gemma, etc.

**T1 ultra-cheap (≤ $0.15 output):**
- `meta-llama/llama-3.1-8b-instruct` — ~$0.02 in / $0.05 out
- `google/gemini-2.0-flash-lite-001` — $0.075 in / $0.30 out ← borderline, will verify against live OpenRouter price at build time and drop if over
- `mistralai/ministral-8b` — ~$0.10 / $0.10

**T2 cheap (≤ $1.00 output, paid users only):**
- `openai/gpt-4.1-nano` — $0.10 / $0.40
- `openai/gpt-4o-mini` — $0.15 / $0.60
- `anthropic/claude-3-haiku` — $0.25 / $1.25 ← over, drop

Actual list is confirmed against OpenRouter's `/models` endpoint at build time (see technical section) so nothing over ceiling can sneak in.

All routed through OpenRouter using the existing `OPENROUTER_API_KEY` — no new provider integrations.

## Cost sanity check

Assumptions per active user: ~50 messages/day, ~2K tokens each = ~100K tokens/day.

- If T0 covers them: **$0**
- If they fall to T1 all day: ~$0.03/day/user
- If paid user falls to T2 all day: ~$0.10/day/user

With rate limits (T1 = 20/hr, T2 = 100/hr paid), worst-case daily spend per user is capped at cents. **Yes, this is sustainable for a broad free user base**, especially since T0 handles most traffic and T1/T2 only kick in during OpenRouter's free-tier throttle windows.

The real risk isn't per-user cost — it's an abusive user hammering the endpoint. The hourly rate limit is what keeps that bounded.

## User-facing changes

- **Chat error messages** get clearer: "Free models busy, using [tier name]" as a subtle badge under the assistant reply when we fall to T1/T2, so users understand why quality/speed shifted.
- **Rate-limit hit:** friendly message ("You've hit the hourly limit on paid backups — free models will retry in X min, or upgrade for higher limits") instead of a raw 429.
- **Settings > Library:** existing BYO-key path stays unchanged — users with their own OpenRouter key bypass all ceilings and quotas (they're paying).

## Technical section

### Files to add
- `src/lib/model-tiers.ts` — declares T0/T1/T2 model lists + price ceilings + rate-limit configs. Single source of truth.
- `src/lib/rate-limit.server.ts` — simple per-user hourly counter table in Supabase (`user_model_usage`: user_id, tier, hour_bucket, count). Increment + check on each paid-tier call.

### Files to edit
- `src/routes/api/chat.ts` — replace current fallback chain with tiered walker:
  1. loop T0 allowlist (existing behavior, already there)
  2. on exhaustion, check rate limit → call T1
  3. on exhaustion, check paid status + rate limit → call T2
  4. return structured error with tier info so UI can badge it
- `src/lib/openrouter-free.ts` — no change (T0 stays as-is).
- `src/lib/ai-provider.server.ts` — add a `buildOpenRouterPaid(modelId)` variant that bypasses `sanitizeOpenRouterModel` (which currently forces everything to free-only).
- `src/routes/api/health.ai.ts` — extend health check to ping one T1 and one T2 model too.

### Database
- New migration: `user_model_usage` table (user_id uuid, tier text, hour_bucket timestamptz, count int, PK on user_id+tier+hour_bucket). RLS: users can read their own row; server writes via service role. GRANT SELECT to authenticated, ALL to service_role.
- New column on `user_settings`: `is_paid boolean default false` — toggled manually for now (no billing integration yet).

### Price-ceiling enforcement
On server start (or lazily cached for 1hr), fetch `https://openrouter.ai/api/v1/models` and filter each tier's declared model IDs by their live `pricing.completion` field. Any model over ceiling is dropped from the tier at runtime — so if OpenRouter raises a price, we don't get surprise-billed.

### Out of scope
- Actual paid-user billing / Stripe. `is_paid` is a manual flag until a separate billing plan.
- Non-OpenRouter providers (Groq/Gemini/OpenAI direct) — those direct fallbacks in `chat.ts` will be removed since we're consolidating on OpenRouter for cost control. Confirm before I strip them.
