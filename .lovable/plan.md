## Scope

Small tactical change, separate from the larger vLLM pivot.

1. **OPENROUTER_API_KEY** — already saved via `@secret:`. Nothing for me to do on secrets.
2. **Default OpenRouter model → free Llama.** Swap `meta-llama/llama-3.3-70b-instruct` (paid) for `meta-llama/llama-3.3-70b-instruct:free`. OpenRouter's `:free` variants are billed at $0. If it 429s or gets pulled, the existing cascade (Groq → Gemini → Venice) still catches it.

## Files touched

- `src/lib/ai-provider.server.ts` — change `BUILTIN_CONFIG.openrouter.defaultModel` to `meta-llama/llama-3.3-70b-instruct:free`.
- `src/lib/model-switch.ts` — update the OpenRouter alias default to the `:free` variant. Grok has no free tier on OR — leave as-is.
- `src/routes/api/health.ai.ts` — same model swap so the health ping hits the free endpoint.
- `src/routes/api/chat.ts` — only if it hardcodes an OpenRouter model; otherwise no change.

## Not doing this turn

- Not touching the vLLM pivot, ripping out OpenAI/Gemini, or the BYO settings redesign. Waits for a separate go-ahead once your vLLM endpoints are ready.
- Not adding a free-model picker. If a different free OR model beats Llama 3.3 70B for you, name the id and I will swap it.

## Heads up

Free OpenRouter models are rate-limited hard (about 20 req/min, lower at peak) and can be pulled without notice. Fine as a default because the cascade covers it, but expect 429s under load.
