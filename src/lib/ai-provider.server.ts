// Multi-provider router. Returns an AI-SDK language model.
//
// Priority:
//   1. activeProvider (a row from user_providers) — saved API key for a
//      hosted catalog entry, OR a local runtime baseUrl. Spoken to via
//      OpenAI-compatible chat completions.
//   2. cfg.provider === "openai" — direct OpenAI using project OPENAI_API_KEY.
//   3. cfg.provider === "custom" — raw base URL + key configured in settings.
//   4. Default — Lovable AI Gateway (Claude by default to the user).
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

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

export type ResolvedProvider = {
  model: ReturnType<ReturnType<typeof createLovableAiGatewayProvider>>;
  providerName: string;
  modelId: string;
  lovableGateway?: ReturnType<typeof createLovableAiGatewayProvider>;
};

export function resolveProvider(
  cfg: UserAiConfig,
  opts: {
    lovableApiKey?: string;
    openaiApiKey?: string;
    groqApiKey?: string;
    llamaApiKey?: string;
    veniceApiKey?: string;
    initialRunId?: string;
    activeProvider?: ActiveProvider | null;
  } = {},
): ResolvedProvider {

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

  if (cfg.provider === "openai") {
    if (!opts.openaiApiKey) {
      throw new Error("OpenAI provider selected but OPENAI_API_KEY is not configured.");
    }
    const modelId = cfg.model || "gpt-4o-mini";
    const provider = createOpenAICompatible({
      name: "openai",
      baseURL: "https://api.openai.com/v1",
      headers: { Authorization: `Bearer ${opts.openaiApiKey}` },
    });
    return { model: provider(modelId), providerName: "openai", modelId };
  }

  if (cfg.provider === "groq") {
    if (!opts.groqApiKey) {
      throw new Error("Groq provider selected but GROQ_API_KEY is not configured.");
    }
    const modelId = cfg.model || "llama-3.3-70b-versatile";
    const provider = createOpenAICompatible({
      name: "groq",
      baseURL: "https://api.groq.com/openai/v1",
      headers: { Authorization: `Bearer ${opts.groqApiKey}` },
    });
    return { model: provider(modelId), providerName: "groq", modelId };
  }

  if (cfg.provider === "llama") {
    if (!opts.llamaApiKey) {
      throw new Error("Llama provider selected but LLAMA_API_KEY is not configured.");
    }
    const modelId = cfg.model || "Llama-3.3-70B-Instruct";
    const provider = createOpenAICompatible({
      name: "llama",
      baseURL: "https://api.llama.com/compat/v1",
      headers: { Authorization: `Bearer ${opts.llamaApiKey}` },
    });
    return { model: provider(modelId), providerName: "llama", modelId };
  }

  if (cfg.provider === "venice") {
    if (!opts.veniceApiKey) {
      throw new Error("Venice provider selected but VENICE_API_KEY is not configured.");
    }
    const modelId = cfg.model || "venice-uncensored";
    const provider = createOpenAICompatible({
      name: "venice",
      baseURL: "https://api.venice.ai/api/v1",
      headers: { Authorization: `Bearer ${opts.veniceApiKey}` },
    });
    return { model: provider(modelId), providerName: "venice", modelId };
  }

  if (cfg.provider === "custom") {

    const baseURL = cfg.custom_base_url?.trim();
    const apiKey = cfg.custom_api_key?.trim() || "not-required";
    const modelId = cfg.custom_model_id?.trim() || cfg.model;
    if (!baseURL) {
      throw new Error("Custom provider selected but no base URL is configured.");
    }
    const provider = createOpenAICompatible({
      name: "custom",
      baseURL,
      headers: apiKey && apiKey !== "not-required" ? { Authorization: `Bearer ${apiKey}` } : {},
    });
    return { model: provider(modelId), providerName: "custom", modelId };
  }

  if (!opts.lovableApiKey) {
    throw new Error("LOVABLE_API_KEY is not configured for this project.");
  }
  const gateway = createLovableAiGatewayProvider(opts.lovableApiKey, opts.initialRunId);
  return {
    model: gateway(cfg.model),
    providerName: "lovable",
    modelId: cfg.model,
    lovableGateway: gateway,
  };
}
