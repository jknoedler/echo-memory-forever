## Diagnosis

`GET /api/health/ai` (just now, 2026-06-30 15:20 UTC):
- `llama` → **HTTP 401 unauthorized** ("llama rejected the API key")
- `groq` → 200 OK
- `openrouter` → 200 OK
- `gemini` → 429 rate-limited
- `openai` → 429 rate-limited
- `venice` → 402 credits exhausted

Since the Auto cascade is `groq → openrouter → gemini → llama → venice → openai`, every chat for the last ~12 hours has been served by **Groq's** `llama-3.3-70b-versatile`. That's the same Llama 3.3 70B model, but Groq hosts it and bills it on Groq's dashboard — not on llama.com. Meta's dashboard correctly shows 0 because Meta's API never accepted a single request from us.

The 401 means one of:
1. **Key is wrong / revoked / typo** — most common. `LLAMA_API_KEY` env var doesn't match what's active in your llama.com project.
2. **Key belongs to a different Meta org/project** than the one you're checking usage on.
3. **Key was rotated** on Meta's side and the new value was never copied into the project secret.
4. **Wrong key format** — Meta keys are project-scoped; pasting a preview/test key would also fail auth.

## What I'll do once you switch to build mode

1. **Confirm the symptom is just the key, not the integration.** Our integration is sound — we send `Authorization: Bearer $LLAMA_API_KEY` to `https://api.llama.com/compat/v1/chat/completions`, which is exactly what Meta's TypeScript OpenAI-compatible docs prescribe. Groq, OpenRouter, and Gemini all use the identical pattern with their own keys and work fine, so the code is not the problem.
2. **Rotate the key.** Ask you to generate a fresh key at llama.com (Settings → API Keys → Create), then I'll update the `LLAMA_API_KEY` secret with the new value via the secret tool.
3. **Re-check `/api/health/ai`.** If `llama` flips to 200, the key was the only issue. Send 1 test chat forced onto Llama via the in-chat switch ("switch to meta llama") and confirm a token count appears on llama.com within ~10 min (Meta's dashboard lags).
4. **If it still 401s after rotation,** the key likely belongs to a different Meta project/org than the dashboard you're viewing. I'll have you double-check the project selector at top of llama.com matches the project the key was created under.
5. **No code changes** are required for the diagnosis — the routing demotion I did last turn is correct and should stay; direct Llama is the flakiest provider in the cascade and Groq is a healthy substitute when Meta's key is rejected.

## Technical notes

- Meta's usage dashboard is delayed; even a working key won't show tokens immediately. Give it 10-30 min after a successful 200.
- Groq's `llama-3.3-70b-versatile` is functionally the same weights as Meta's `Llama-3.3-70B-Instruct`, just hosted by Groq. If you only care about the model behavior, you're already using it. If you specifically want billing to land on llama.com, the key has to authenticate.
- Yes, we're TypeScript — pick TypeScript when their docs ask.
