// Detect "switch to X" / "use gemini pro" / "run groq" style commands in
// chat, so users can change models without opening Settings.
//
// Returns the resolved built-in provider kind + model id, or null if the
// message isn't a switch command.

export type BuiltinKind =
  | "groq"
  | "gemini"
  | "openrouter"
  | "openai"
  | "venice"
  | "llama";

export type ModelSwitch = {
  provider: BuiltinKind;
  model: string;
  /** Short human label for the acknowledgement, e.g. "Gemini 2.5 Pro". */
  label: string;
};

type Alias = {
  // Matched as a whole-word phrase (case-insensitive). Longer phrases first.
  phrase: RegExp;
  provider: BuiltinKind;
  model: string;
  label: string;
};

// Order matters — longer / more specific phrases first so "gemini 2.5 pro"
// wins over a bare "gemini".
const ALIASES: Alias[] = [
  // Gemini
  { phrase: /\bgemini[\s-]?2\.?5[\s-]?pro\b/i, provider: "gemini", model: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { phrase: /\bgemini[\s-]?2\.?5[\s-]?flash[\s-]?lite\b/i, provider: "gemini", model: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
  { phrase: /\bgemini[\s-]?2\.?5[\s-]?flash\b/i, provider: "gemini", model: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { phrase: /\bgemini\b/i, provider: "gemini", model: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },

  // Groq
  { phrase: /\bllama[\s-]?3\.?3[\s-]?70b\b/i, provider: "groq", model: "llama-3.3-70b-versatile", label: "Llama 3.3 70B (Groq)" },
  { phrase: /\bllama[\s-]?3\.?1[\s-]?8b\b/i, provider: "groq", model: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant (Groq)" },
  { phrase: /\bgroq\b/i, provider: "groq", model: "llama-3.3-70b-versatile", label: "Llama 3.3 70B (Groq)" },

  // OpenRouter — broad catalog. We deliberately do NOT default to Claude.
  { phrase: /\bgpt[\s-]?4o[\s-]?mini\b/i, provider: "openai", model: "gpt-4o-mini", label: "GPT-4o mini" },
  { phrase: /\bgpt[\s-]?4o\b/i, provider: "openai", model: "gpt-4o", label: "GPT-4o" },
  { phrase: /\b(open\s?ai|gpt)\b/i, provider: "openai", model: "gpt-4o-mini", label: "GPT-4o mini" },
  { phrase: /\bopen[\s-]?router\b/i, provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B (OpenRouter)" },
  { phrase: /\bdeepseek\b/i, provider: "openrouter", model: "deepseek/deepseek-chat", label: "DeepSeek (OpenRouter)" },
  { phrase: /\b(grok|x\.?ai)\b/i, provider: "openrouter", model: "x-ai/grok-2-1212", label: "Grok (OpenRouter)" },

  // Venice (uncensored)
  { phrase: /\bvenice\b/i, provider: "venice", model: "venice-uncensored", label: "Venice Uncensored" },

  // Llama (Meta hosted)
  { phrase: /\bmeta[\s-]?llama\b/i, provider: "llama", model: "Llama-3.3-70B-Instruct", label: "Llama 3.3 70B (Meta)" },
];

// Verb that indicates the user wants to change models.
const SWITCH_VERB =
  /\b(switch|swap|change|use|run|set|move|flip|put|route)\b[^.?!\n]{0,40}?\b(to|over to|on|onto)?\b/i;

// Anchor that scopes the verb to model selection.
const MODEL_SCOPE = /\b(model|llm|ai|provider|engine|bot)\b/i;

export function parseModelSwitch(text: string): ModelSwitch | null {
  if (!text) return null;
  const t = text.trim();
  if (t.length > 400) return null; // long prose isn't a command

  const hasVerb = SWITCH_VERB.test(t);
  // Very short imperatives like "use gemini" or "groq please" should
  // also count even without the word "model".
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
