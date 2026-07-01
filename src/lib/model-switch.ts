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
const ALIASES: Alias[] = [
  // Llama family (free on OpenRouter)
  { phrase: /\bllama[\s-]?3\.?3[\s-]?70b\b/i, provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B (free)" },
  { phrase: /\bllama[\s-]?3\.?2[\s-]?11b[\s-]?vision\b/i, provider: "openrouter", model: "meta-llama/llama-3.2-11b-vision-instruct:free", label: "Llama 3.2 11B Vision (free)" },
  { phrase: /\bllama[\s-]?3\.?2[\s-]?3b\b/i, provider: "openrouter", model: "meta-llama/llama-3.2-3b-instruct:free", label: "Llama 3.2 3B (free)" },
  { phrase: /\b(meta[\s-]?llama|llama)\b/i, provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B (free)" },

  // DeepSeek
  { phrase: /\bdeep[\s-]?seek[\s-]?r1\b/i, provider: "openrouter", model: "deepseek/deepseek-r1:free", label: "DeepSeek R1 (free)" },
  { phrase: /\bdeep[\s-]?seek\b/i, provider: "openrouter", model: "deepseek/deepseek-chat-v3-0324:free", label: "DeepSeek V3 (free)" },

  // Qwen / Mistral / Nvidia
  { phrase: /\bqwen\b/i, provider: "openrouter", model: "qwen/qwen-2.5-72b-instruct:free", label: "Qwen 2.5 72B (free)" },
  { phrase: /\bmistral\b/i, provider: "openrouter", model: "mistralai/mistral-small-3.1-24b-instruct:free", label: "Mistral Small 3.1 (free)" },
  { phrase: /\bnemotron\b/i, provider: "openrouter", model: "nvidia/llama-3.1-nemotron-70b-instruct:free", label: "Nemotron 70B (free)" },

  // Gemini — free experimental via OpenRouter only. Paid Gemini isn't shipped.
  { phrase: /\bgemini\b/i, provider: "openrouter", model: "google/gemini-2.0-flash-exp:free", label: "Gemini 2.0 Flash exp (free)" },

  // OpenRouter as an explicit target
  { phrase: /\bopen[\s-]?router\b/i, provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B (free)" },

  // Legacy paid aliases → redirect to the closest free model with a note.
  { phrase: /\b(open\s?ai|gpt[\s-]?4o|gpt)\b/i, provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B (free) — OpenAI is BYO-key only" },
  { phrase: /\bgroq\b/i, provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B (free) — Groq is BYO-key only" },
  { phrase: /\bvenice\b/i, provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B (free) — Venice is BYO-key only" },
  { phrase: /\b(grok|x\.?ai)\b/i, provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B (free) — Grok is BYO-key only" },
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
