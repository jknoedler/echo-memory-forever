// Curated allowlist of OpenRouter models that are $0 to run on our project key.
// The chat/settings/provider layers force any openrouter selection served by
// OUR key into one of these. User-provided OpenRouter keys (user_providers)
// are NOT restricted — those bill the user, not us.

export type OpenRouterFreeModel = {
  id: string; // model id sent to OpenRouter
  label: string; // shown in the picker
  hint: string; // small subtitle
};

// Every id ends in ":free" — OpenRouter's convention for zero-cost variants.
// If OR removes one of these, the resolver silently falls back to the
// default; nothing breaks.
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
    id: "meta-llama/llama-3.2-11b-vision-instruct:free",
    label: "Llama 3.2 11B Vision",
    hint: "images + text",
  },
  {
    id: "google/gemini-2.0-flash-exp:free",
    label: "Gemini 2.0 Flash (exp)",
    hint: "google · experimental",
  },
  {
    id: "deepseek/deepseek-r1:free",
    label: "DeepSeek R1",
    hint: "reasoning",
  },
  {
    id: "deepseek/deepseek-chat-v3-0324:free",
    label: "DeepSeek V3",
    hint: "general chat",
  },
  {
    id: "qwen/qwen-2.5-72b-instruct:free",
    label: "Qwen 2.5 72B",
    hint: "multilingual",
  },
  {
    id: "mistralai/mistral-small-3.1-24b-instruct:free",
    label: "Mistral Small 3.1 24B",
    hint: "european · fast",
  },
  {
    id: "nvidia/llama-3.1-nemotron-70b-instruct:free",
    label: "Nemotron 70B",
    hint: "nvidia tuned",
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
