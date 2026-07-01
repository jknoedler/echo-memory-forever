// Multi-provider router. Returns an AI-SDK language model.
//
// Built-in providers: groq, openai, venice, llama, gemini, openrouter.
// All are spoken to via OpenAI-compatible chat completions, so the
// resolver only needs baseURL + apiKey + modelId.
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { sanitizeOpenRouterModel } from "./openrouter-free";

export type UserAiConfig = {
  provider: string;
  model: string;
  custom_base_url: string | null;
  custom_api_key: string | null;
  custom_model_id: string | null;
};

export type ActiveProvider = {
  catalog_id: string;
  base_url: string | null;
  api_key: string | null;
  default_model: string | null;
};

type AnyProvider = ReturnType<typeof createOpenAICompatible>;

export type ResolvedProvider = {
  model: ReturnType<AnyProvider>;
  providerName: string;
  modelId: string;
};

export type BuiltinKind = "openai" | "groq" | "llama" | "venice" | "gemini" | "openrouter";

type ResolveOpts = {
  openaiApiKey?: string;
  groqApiKey?: string;
  llamaApiKey?: string;
  veniceApiKey?: string;
  geminiApiKey?: string;
  openrouterApiKey?: string;
  activeProvider?: ActiveProvider | null;
};

const BUILTIN_CONFIG: Record<
  BuiltinKind,
  { baseURL: string; defaultModel: string; envName: string }
> = {
  openai: {
    baseURL: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    envName: "OPENAI_API_KEY",
  },
  groq: {
    baseURL: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    envName: "GROQ_API_KEY",
  },
  llama: {
    baseURL: "https://api.llama.com/compat/v1",
    defaultModel: "Llama-3.3-70B-Instruct",
    envName: "LLAMA_API_KEY",
  },
  venice: {
    baseURL: "https://api.venice.ai/api/v1",
    defaultModel: "venice-uncensored",
    envName: "VENICE_API_KEY",
  },
  gemini: {
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.5-flash",
    envName: "GEMINI_API_KEY",
  },
  openrouter: {
    baseURL: "https://openrouter.ai/api/v1",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    envName: "OPENROUTER_API_KEY",
  },
};

export function builtinDefaultModel(kind: BuiltinKind): string {
  return BUILTIN_CONFIG[kind].defaultModel;
}

function buildBuiltin(
  kind: BuiltinKind,
  apiKey: string,
  modelOverride?: string,
): ResolvedProvider {
  const cfg = BUILTIN_CONFIG[kind];
  const modelId = modelOverride || cfg.defaultModel;
  const provider = createOpenAICompatible({
    name: kind,
    baseURL: cfg.baseURL,
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return { model: provider(modelId), providerName: kind, modelId };
}

function pickKey(kind: BuiltinKind, opts: ResolveOpts): string | undefined {
  switch (kind) {
    case "openai":
      return opts.openaiApiKey;
    case "groq":
      return opts.groqApiKey;
    case "llama":
      return opts.llamaApiKey;
    case "venice":
      return opts.veniceApiKey;
    case "gemini":
      return opts.geminiApiKey;
    case "openrouter":
      return opts.openrouterApiKey;
  }
}

function autoPick(cfg: UserAiConfig, opts: ResolveOpts): ResolvedProvider {
  const m = (cfg.model || "").trim();
  const looksHostedGateway = m.includes("/"); // "google/gemini-...", "openai/gpt-..."
  const passModel = !looksHostedGateway ? m || undefined : undefined;

  // Order: stable hosted routes first → direct Meta Llama later.
  // Direct Llama keys have proven prone to intermittent 401s, so don't let
  // that key be the first thing Auto relies on when Groq/OpenRouter/Gemini are healthy.
  const order: BuiltinKind[] = ["groq", "openrouter", "gemini", "llama", "venice", "openai"];
  for (const kind of order) {
    const key = pickKey(kind, opts);
    if (key) return buildBuiltin(kind, key, passModel);
  }
  throw new Error(
    "No AI provider is configured. Add one of LLAMA_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, GEMINI_API_KEY, VENICE_API_KEY, or OPENAI_API_KEY.",
  );
}

export function resolveProvider(cfg: UserAiConfig, opts: ResolveOpts = {}): ResolvedProvider {
  // 1. Saved provider from the user's library.
  if (opts.activeProvider) {
    const ap = opts.activeProvider;
    const baseURL = ap.base_url?.trim();
    if (!baseURL) {
      throw new Error(`Saved provider "${ap.catalog_id}" has no base URL configured.`);
    }
    const modelId = (cfg.model || ap.default_model || "").trim();
    if (!modelId) {
      throw new Error(`No model selected for saved provider "${ap.catalog_id}".`);
    }
    const apiKey = ap.api_key?.trim();
    const provider = createOpenAICompatible({
      name: ap.catalog_id,
      baseURL,
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });
    return { model: provider(modelId), providerName: ap.catalog_id, modelId };
  }

  // 2. Explicit built-in provider.
  if (cfg.provider in BUILTIN_CONFIG) {
    const kind = cfg.provider as BuiltinKind;
    const key = pickKey(kind, opts);
    if (!key) {
      throw new Error(
        `${kind} provider selected but ${BUILTIN_CONFIG[kind].envName} is not configured.`,
      );
    }
    return buildBuiltin(kind, key, cfg.model || undefined);
  }

  // 3. Custom (raw base URL + key).
  if (cfg.provider === "custom") {
    const baseURL = cfg.custom_base_url?.trim();
    const apiKey = cfg.custom_api_key?.trim() || "not-required";
    const modelId = cfg.custom_model_id?.trim() || cfg.model;
    if (!baseURL) throw new Error("Custom provider selected but no base URL is configured.");
    const provider = createOpenAICompatible({
      name: "custom",
      baseURL,
      headers: apiKey && apiKey !== "not-required" ? { Authorization: `Bearer ${apiKey}` } : {},
    });
    return { model: provider(modelId), providerName: "custom", modelId };
  }

  // 4. "auto" / unknown → auto-pick.
  return autoPick(cfg, opts);
}
