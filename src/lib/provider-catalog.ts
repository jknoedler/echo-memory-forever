// Mement0 provider catalog — client-safe.
// Two kinds of entries:
//   - "hosted": OpenAI-compatible cloud APIs. User supplies an API key.
//   - "local":  Self-hosted runtimes (Ollama, LM Studio, llama.cpp). User
//               installs the runtime on their machine, we wire up base URL.
//
// All entries are spoken to via the OpenAI-compatible chat completions shape,
// so the resolver only needs baseUrl + apiKey + modelId.

export type CatalogKind = "hosted" | "local";

export type CatalogEntry = {
  id: string;
  kind: CatalogKind;
  name: string;
  tagline: string;
  baseUrl: string;
  // Where the user gets their API key (hosted) or installs the runtime (local).
  signupUrl: string;
  // Optional: command to install / pull. Shown as a copyable code block.
  installCommand?: string;
  // Suggested models. First is the default when the user adds the provider.
  models: string[];
  // Free-text notes shown on the library card.
  notes?: string;
};

export const CATALOG: CatalogEntry[] = [
  // ---------- HOSTED ----------
  {
    id: "openai",
    kind: "hosted",
    name: "OpenAI",
    tagline: "GPT-4o, GPT-4.1, o-series reasoning.",
    baseUrl: "https://api.openai.com/v1",
    signupUrl: "https://platform.openai.com/api-keys",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1", "gpt-4.1-mini", "o4-mini"],
  },
  {
    id: "anthropic",
    kind: "hosted",
    name: "Anthropic",
    tagline: "Claude — long context, careful reasoning.",
    baseUrl: "https://api.anthropic.com/v1",
    signupUrl: "https://console.anthropic.com/settings/keys",
    models: [
      "claude-sonnet-4-5",
      "claude-opus-4-5",
      "claude-3-5-sonnet-latest",
      "claude-3-5-haiku-latest",
    ],
    notes: "Uses Anthropic's OpenAI-compatible endpoint.",
  },
  {
    id: "openrouter",
    kind: "hosted",
    name: "OpenRouter",
    tagline: "One key, every frontier model. Pay-as-you-go.",
    baseUrl: "https://openrouter.ai/api/v1",
    signupUrl: "https://openrouter.ai/keys",
    models: [
      "anthropic/claude-sonnet-4.5",
      "openai/gpt-4o",
      "google/gemini-2.5-pro",
      "meta-llama/llama-3.3-70b-instruct",
      "deepseek/deepseek-chat",
    ],
    notes: "Cheapest way to try any model without a separate signup.",
  },
  {
    id: "groq",
    kind: "hosted",
    name: "Groq",
    tagline: "Insanely fast inference on LPUs. Llama, Qwen, Kimi.",
    baseUrl: "https://api.groq.com/openai/v1",
    signupUrl: "https://console.groq.com/keys",
    models: [
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "qwen-qwq-32b",
      "moonshotai/kimi-k2-instruct",
    ],
  },
  {
    id: "deepseek",
    kind: "hosted",
    name: "DeepSeek",
    tagline: "Cheap, strong reasoning and coding.",
    baseUrl: "https://api.deepseek.com/v1",
    signupUrl: "https://platform.deepseek.com/api_keys",
    models: ["deepseek-chat", "deepseek-reasoner"],
  },
  {
    id: "mistral",
    kind: "hosted",
    name: "Mistral",
    tagline: "European frontier lab. Mistral Large, Codestral.",
    baseUrl: "https://api.mistral.ai/v1",
    signupUrl: "https://console.mistral.ai/api-keys",
    models: ["mistral-large-latest", "mistral-small-latest", "codestral-latest"],
  },
  {
    id: "xai",
    kind: "hosted",
    name: "xAI",
    tagline: "Grok — uncensored posture, real-time x.com data.",
    baseUrl: "https://api.x.ai/v1",
    signupUrl: "https://console.x.ai",
    models: ["grok-4", "grok-3", "grok-3-mini"],
  },
  {
    id: "together",
    kind: "hosted",
    name: "Together AI",
    tagline: "Big open-source catalog. Cheap Llama and Qwen.",
    baseUrl: "https://api.together.xyz/v1",
    signupUrl: "https://api.together.ai/settings/api-keys",
    models: [
      "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      "Qwen/Qwen2.5-72B-Instruct-Turbo",
      "deepseek-ai/DeepSeek-V3",
    ],
  },
  {
    id: "fireworks",
    kind: "hosted",
    name: "Fireworks AI",
    tagline: "Fast hosted open models with tool calling.",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    signupUrl: "https://fireworks.ai/account/api-keys",
    models: [
      "accounts/fireworks/models/llama-v3p3-70b-instruct",
      "accounts/fireworks/models/qwen2p5-72b-instruct",
    ],
  },
  {
    id: "cerebras",
    kind: "hosted",
    name: "Cerebras",
    tagline: "World's fastest inference. Llama at ~2000 tok/s.",
    baseUrl: "https://api.cerebras.ai/v1",
    signupUrl: "https://cloud.cerebras.ai",
    models: ["llama-3.3-70b", "llama3.1-8b", "qwen-3-32b"],
  },

  // ---------- LOCAL ----------
  {
    id: "ollama",
    kind: "local",
    name: "Ollama",
    tagline: "The easiest way to run Llama / Qwen / Mistral on your machine.",
    baseUrl: "http://localhost:11434/v1",
    signupUrl: "https://ollama.com/download",
    installCommand: "ollama pull llama3.1:8b",
    models: [
      "llama3.1:8b",
      "llama3.1:70b",
      "llama3.3:70b",
      "qwen2.5:32b",
      "qwen2.5-coder:32b",
      "mistral-nemo",
      "deepseek-r1:14b",
      "gemma2:27b",
    ],
    notes:
      "1) Install Ollama from the link above. 2) Run the pull command for any model. 3) Mement0 talks to it on localhost — no key required.",
  },
  {
    id: "lmstudio",
    kind: "local",
    name: "LM Studio",
    tagline: "GUI for local models. Built-in OpenAI server.",
    baseUrl: "http://localhost:1234/v1",
    signupUrl: "https://lmstudio.ai",
    models: ["llama-3.3-70b-instruct", "qwen2.5-32b-instruct", "deepseek-r1-distill-qwen-14b"],
    notes:
      "Install LM Studio, download any GGUF from the in-app catalog, then start the local server (Developer tab → Start Server).",
  },
  {
    id: "llamacpp",
    kind: "local",
    name: "llama.cpp",
    tagline: "Bare-metal GGUF runtime. Maximum control.",
    baseUrl: "http://localhost:8080/v1",
    signupUrl: "https://github.com/ggerganov/llama.cpp",
    installCommand:
      "./llama-server -m /path/to/model.gguf --host 0.0.0.0 --port 8080",
    models: ["local-gguf"],
    notes: "For users who want to point at a specific GGUF and tune flags themselves.",
  },
];

export function findCatalog(id: string): CatalogEntry | undefined {
  return CATALOG.find((c) => c.id === id);
}
