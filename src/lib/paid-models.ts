// Paid OpenRouter model catalog with pricing metadata.
//
// Two audiences:
//   - Admins: unrestricted picker in the model switcher. Any of these can be
//     selected as the primary model with NO rate limit and NO price ceiling.
//   - Everyone: the ultra-cheap slice (≤ $0.15/M output) is available via
//     the tiered fallback in chat.ts when free models are exhausted.
//
// Prices are $/M tokens on OpenRouter (approximate live values). Update when
// OpenRouter changes them.

export type PaidModel = {
  id: string;
  label: string;
  inputPerM: number;   // $/M input tokens
  outputPerM: number;  // $/M output tokens
  category: "ultra_cheap" | "cheap" | "mid" | "premium";
  note?: string;
};

export const PAID_OPENROUTER_MODELS: PaidModel[] = [
  // Ultra-cheap (≤ $0.15/M out) — available to everyone via fallback tier
  { id: "meta-llama/llama-3.1-8b-instruct", label: "Llama 3.1 8B", inputPerM: 0.02, outputPerM: 0.05, category: "ultra_cheap" },
  { id: "mistralai/ministral-8b", label: "Ministral 8B", inputPerM: 0.10, outputPerM: 0.10, category: "ultra_cheap" },
  { id: "google/gemini-2.0-flash-lite-001", label: "Gemini 2.0 Flash Lite", inputPerM: 0.075, outputPerM: 0.30, category: "ultra_cheap", note: "borderline" },

  // Cheap (≤ $1/M out) — paid users via fallback; admins anytime
  { id: "openai/gpt-4.1-nano", label: "GPT-4.1 Nano", inputPerM: 0.10, outputPerM: 0.40, category: "cheap" },
  { id: "openai/gpt-4o-mini", label: "GPT-4o Mini", inputPerM: 0.15, outputPerM: 0.60, category: "cheap" },
  { id: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5", inputPerM: 1.00, outputPerM: 5.00, category: "mid" },

  // Mid — admins only
  { id: "openai/gpt-4o", label: "GPT-4o", inputPerM: 2.50, outputPerM: 10.00, category: "mid" },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", inputPerM: 1.25, outputPerM: 5.00, category: "mid" },
  { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B (paid)", inputPerM: 0.12, outputPerM: 0.30, category: "ultra_cheap" },

  // Premium — admins only
  { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5", inputPerM: 3.00, outputPerM: 15.00, category: "premium" },
  { id: "openai/gpt-5", label: "GPT-5", inputPerM: 5.00, outputPerM: 15.00, category: "premium" },
  { id: "anthropic/claude-opus-4.1", label: "Claude Opus 4.1", inputPerM: 15.00, outputPerM: 75.00, category: "premium" },
];

export function formatPrice(model: PaidModel): string {
  return `$${model.inputPerM.toFixed(2)} in / $${model.outputPerM.toFixed(2)} out per M`;
}
