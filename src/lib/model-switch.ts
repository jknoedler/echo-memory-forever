// Detect "switch to X" / "use deepseek" / "run llama" style commands in
// chat so users can hop between free OpenRouter models without opening Settings.
//
// Only OpenRouter free-tier models are shipped built-in. Legacy aliases for
// paid providers (Gemini/OpenAI/Groq/Venice/Meta Llama direct) resolve to
// the closest free OpenRouter equivalent instead.

export type BuiltinKind = "openrouter";

export type ModelSwitch = {
  provider: BuiltinKind;
  model: string;
  /** Short human label for the acknowledgement. */
  label: string;
};

type Alias = {
  phrase: RegExp;
  provider: BuiltinKind;
  model: string;
  label: string;
};

// Order matters — longer / more specific phrases first.
const LLAMA_DEFAULT = "meta-llama/llama-3.3-70b-instruct:free";
const ALIASES: Alias[] = [
  // Llama family (free on OpenRouter)
  { phrase: /\bllama[\s-]?3\.?3[\s-]?70b\b/i, provider: "openrouter", model: LLAMA_DEFAULT, label: "Llama 3.3 70B (free)" },
  { phrase: /\bllama[\s-]?3\.?2[\s-]?3b\b/i, provider: "openrouter", model: "meta-llama/llama-3.2-3b-instruct:free", label: "Llama 3.2 3B (free)" },
  { phrase: /\b(meta[\s-]?llama|llama)\b/i, provider: "openrouter", model: LLAMA_DEFAULT, label: "Llama 3.3 70B (free)" },

  // Qwen
  { phrase: /\bqwen[\s-]?coder\b/i, provider: "openrouter", model: "qwen/qwen3-coder:free", label: "Qwen3 Coder (free)" },
  { phrase: /\bqwen\b/i, provider: "openrouter", model: "qwen/qwen3-next-80b-a3b-instruct:free", label: "Qwen3 Next 80B (free)" },

  // Nvidia
  { phrase: /\bnemotron[\s-]?nano\b/i, provider: "openrouter", model: "nvidia/nemotron-nano-9b-v2:free", label: "Nemotron Nano 9B (free)" },
  { phrase: /\bnemotron\b/i, provider: "openrouter", model: "nvidia/nemotron-3-super-120b-a12b:free", label: "Nemotron 3 Super 120B (free)" },

  // OpenAI open-weights
  { phrase: /\bgpt[\s-]?oss[\s-]?120\b/i, provider: "openrouter", model: "openai/gpt-oss-120b:free", label: "GPT-OSS 120B (free)" },
  { phrase: /\bgpt[\s-]?oss\b/i, provider: "openrouter", model: "openai/gpt-oss-20b:free", label: "GPT-OSS 20B (free)" },

  // Hermes / Dolphin (uncensored)
  { phrase: /\bhermes\b/i, provider: "openrouter", model: "nousresearch/hermes-3-llama-3.1-405b:free", label: "Hermes 3 405B (free)" },
  { phrase: /\bdolphin\b/i, provider: "openrouter", model: "cognitivecomputations/dolphin-mistral-24b-venice-edition:free", label: "Dolphin Mistral 24B (free)" },

  // Gemma (Google open-weights)
  { phrase: /\bgemma\b/i, provider: "openrouter", model: "google/gemma-4-31b-it:free", label: "Gemma 4 31B (free)" },

  // OpenRouter as an explicit target
  { phrase: /\bopen[\s-]?router\b/i, provider: "openrouter", model: LLAMA_DEFAULT, label: "Llama 3.3 70B (free)" },

  // Legacy paid aliases → redirect to the closest free model with a note.
  { phrase: /\b(open\s?ai|gpt[\s-]?4o|gpt)\b/i, provider: "openrouter", model: "openai/gpt-oss-120b:free", label: "GPT-OSS 120B (free) — OpenAI paid is BYO-key" },
  { phrase: /\bgroq\b/i, provider: "openrouter", model: LLAMA_DEFAULT, label: "Llama 3.3 70B (free) — Groq is BYO-key only" },
  { phrase: /\bvenice\b/i, provider: "openrouter", model: "cognitivecomputations/dolphin-mistral-24b-venice-edition:free", label: "Dolphin Venice edition (free) — Venice direct is BYO-key" },
  { phrase: /\b(grok|x\.?ai)\b/i, provider: "openrouter", model: LLAMA_DEFAULT, label: "Llama 3.3 70B (free) — Grok is BYO-key only" },
  { phrase: /\bgemini\b/i, provider: "openrouter", model: LLAMA_DEFAULT, label: "Llama 3.3 70B (free) — Gemini free was pulled by OpenRouter" },
  { phrase: /\b(deep[\s-]?seek|mistral)\b/i, provider: "openrouter", model: LLAMA_DEFAULT, label: "Llama 3.3 70B (free) — that model's free tier was pulled" },
];

const SWITCH_VERB =
  /\b(switch|swap|change|use|run|set|move|flip|put|route)\b[^.?!\n]{0,40}?\b(to|over to|on|onto)?\b/i;
const MODEL_SCOPE = /\b(model|llm|ai|provider|engine|bot)\b/i;

export function parseModelSwitch(text: string): ModelSwitch | null {
  if (!text) return null;
  const t = text.trim();
  if (t.length > 400) return null;

  const hasVerb = SWITCH_VERB.test(t);
  const looksShort = t.length <= 80;
  const hasScope = MODEL_SCOPE.test(t);
  if (!hasVerb && !looksShort) return null;
  if (!hasVerb && !hasScope) return null;

  for (const a of ALIASES) {
    if (a.phrase.test(t)) {
      return { provider: a.provider, model: a.model, label: a.label };
    }
  }
  return null;
}
