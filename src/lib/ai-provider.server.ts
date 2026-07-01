// Multi-provider router. Returns an AI-SDK language model.
//
// Shipped built-in: OpenRouter only (free-tier models on the project key).
// Users bring their own keys for anything else via the Library — those go
// through the "saved provider" branch below.
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

// The only kind we ship with. Legacy `provider` column values ("groq",
// "openai", "venice", "gemini", "llama") are coerced to "openrouter" so
// old accounts keep working after the pivot.
export type BuiltinKind = "openrouter";

type ResolveOpts = {
  openrouterApiKey?: string;
  activeProvider?: ActiveProvider | null;
};

const OPENROUTER = {
  baseURL: "https://openrouter.ai/api/v1",
  defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
  envName: "OPENROUTER_API_KEY",
} as const;

export function builtinDefaultModel(_kind: BuiltinKind): string {
  return OPENROUTER.defaultModel;
}

function buildOpenRouter(apiKey: string, modelOverride?: string): ResolvedProvider {
  const modelId = sanitizeOpenRouterModel(modelOverride || OPENROUTER.defaultModel);
  const provider = createOpenAICompatible({
    name: "openrouter",
    baseURL: OPENROUTER.baseURL,
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return { model: provider(modelId), providerName: "openrouter", modelId };
}

export function resolveProvider(cfg: UserAiConfig, opts: ResolveOpts = {}): ResolvedProvider {
  // 1. Saved provider from the user's library (BYO key).
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

  // 2. Custom (raw base URL + key from settings, not the catalog).
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

  // 3. Everything else → OpenRouter free tier on the project key.
  // Legacy `provider` values (groq/openai/venice/gemini/llama/lovable/auto)
  // all land here.
  const key = opts.openrouterApiKey;
  if (!key) {
    throw new Error(
      "OpenRouter is not configured. Set OPENROUTER_API_KEY, or add your own key from the Library.",
    );
  }
  return buildOpenRouter(key, cfg.model || undefined);
}
