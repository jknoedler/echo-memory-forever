// Curated allowlist of OpenRouter models that are $0 to run on our project key.
// The chat/settings/provider layers force any openrouter selection served by
// OUR key into one of these. User-provided OpenRouter keys (user_providers)
// are NOT restricted — those bill the user, not us.
//
// NOTE: OpenRouter rotates their free tier constantly. Every id here must
// currently show `:free` in their catalog (https://openrouter.ai/api/v1/models).
// When they pull one, add a replacement and remove the dead id — otherwise
// requests come back 404 "unavailable for free" / "no endpoints".

export type OpenRouterFreeModel = {
  id: string; // model id sent to OpenRouter
  label: string; // shown in the picker
  hint: string; // small subtitle
};

// Verified free on OpenRouter as of the last sweep. If OR removes one, the
// chat route silently cycles to the next entry.
export const OPENROUTER_FREE_MODELS: OpenRouterFreeModel[] = [
  {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    label: "Llama 3.3 70B",
    hint: "default · general chat",
  },
  {
    id: "meta-llama/llama-3.2-3b-instruct:free",
    label: "Llama 3.2 3B",
    hint: "fastest · low quality",
  },
  {
    id: "qwen/qwen3-next-80b-a3b-instruct:free",
    label: "Qwen3 Next 80B",
    hint: "multilingual · MoE",
  },
  {
    id: "qwen/qwen3-coder:free",
    label: "Qwen3 Coder",
    hint: "code-tuned",
  },
  {
    id: "openai/gpt-oss-120b:free",
    label: "GPT-OSS 120B",
    hint: "openai open-weights · big",
  },
  {
    id: "openai/gpt-oss-20b:free",
    label: "GPT-OSS 20B",
    hint: "openai open-weights · fast",
  },
  {
    id: "nvidia/nemotron-3-super-120b-a12b:free",
    label: "Nemotron 3 Super 120B",
    hint: "nvidia tuned · reasoning",
  },
  {
    id: "nvidia/nemotron-nano-9b-v2:free",
    label: "Nemotron Nano 9B",
    hint: "nvidia · fast",
  },
  {
    id: "nousresearch/hermes-3-llama-3.1-405b:free",
    label: "Hermes 3 405B",
    hint: "uncensored · steerable",
  },
  {
    id: "cognitivecomputations/dolphin-mistral-24b-venice-edition:free",
    label: "Dolphin Mistral 24B (Venice)",
    hint: "uncensored · roleplay",
  },
  {
    id: "google/gemma-4-31b-it:free",
    label: "Gemma 4 31B",
    hint: "google open-weights",
  },
];

export const OPENROUTER_FREE_DEFAULT = "meta-llama/llama-3.3-70b-instruct:free";

const FREE_IDS = new Set(OPENROUTER_FREE_MODELS.map((m) => m.id));

/**
 * Coerce any OpenRouter model id into the free allowlist.
 * Anything not in the list, or missing the `:free` suffix, is rewritten to
 * the default free model. Never lets a paid OpenRouter model reach the API
 * on our project key.
 */
export function sanitizeOpenRouterModel(model: string | null | undefined): string {
  const m = (model ?? "").trim();
  if (!m) return OPENROUTER_FREE_DEFAULT;
  if (FREE_IDS.has(m)) return m;
  return OPENROUTER_FREE_DEFAULT;
}

export function isFreeOpenRouterModel(model: string | null | undefined): boolean {
  return FREE_IDS.has((model ?? "").trim());
}
