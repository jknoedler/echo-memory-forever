// Multi-provider router. Returns an AI-SDK language model.
//
// Priority:
//   1. activeProvider (a row from user_providers) — saved API key for a
//      hosted catalog entry, OR a local runtime baseUrl. Spoken to via
//      OpenAI-compatible chat completions.
//   2. cfg.provider === "openai" | "groq" | "llama" | "venice" — direct call
//      using the matching project secret.
//   3. cfg.provider === "custom" — raw base URL + key configured in settings.
//   4. Default ("auto" / "lovable" / anything unknown) — auto-pick the first
//      available built-in provider in this order: groq, openai, venice, llama.
//      This keeps the app fully functional with zero coupling to any
//      first-party gateway.
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

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

type ResolveOpts = {
  openaiApiKey?: string;
  groqApiKey?: string;
  llamaApiKey?: string;
  veniceApiKey?: string;
  activeProvider?: ActiveProvider | null;
};

function buildBuiltin(
  kind: "openai" | "groq" | "llama" | "venice",
  apiKey: string,
  modelOverride?: string,
): ResolvedProvider {
  if (kind === "openai") {
    const modelId = modelOverride || "gpt-4o-mini";
    const provider = createOpenAICompatible({
      name: "openai",
      baseURL: "https://api.openai.com/v1",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return { model: provider(modelId), providerName: "openai", modelId };
  }
  if (kind === "groq") {
    const modelId = modelOverride || "llama-3.3-70b-versatile";
    const provider = createOpenAICompatible({
      name: "groq",
      baseURL: "https://api.groq.com/openai/v1",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return { model: provider(modelId), providerName: "groq", modelId };
  }
  if (kind === "llama") {
    const modelId = modelOverride || "Llama-3.3-70B-Instruct";
    const provider = createOpenAICompatible({
      name: "llama",
      baseURL: "https://api.llama.com/compat/v1",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return { model: provider(modelId), providerName: "llama", modelId };
  }
  // venice
  const modelId = modelOverride || "venice-uncensored";
  const provider = createOpenAICompatible({
    name: "venice",
    baseURL: "https://api.venice.ai/api/v1",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return { model: provider(modelId), providerName: "venice", modelId };
}

function autoPick(cfg: UserAiConfig, opts: ResolveOpts): ResolvedProvider {
  // Reasonable model override only when the saved cfg.model looks like it
  // belongs to the picked provider — otherwise we let the built-in default
  // for that provider win to avoid sending e.g. "google/gemini-..." to Groq.
  const m = (cfg.model || "").trim();
  const looksHostedGateway = m.includes("/"); // "google/gemini-...", "openai/gpt-..."
  const passModel = !looksHostedGateway ? m || undefined : undefined;

  if (opts.groqApiKey) return buildBuiltin("groq", opts.groqApiKey, passModel);
  if (opts.openaiApiKey) return buildBuiltin("openai", opts.openaiApiKey, passModel);
  if (opts.veniceApiKey) return buildBuiltin("venice", opts.veniceApiKey, passModel);
  if (opts.llamaApiKey) return buildBuiltin("llama", opts.llamaApiKey, passModel);
  throw new Error(
    "No AI provider is configured. Add one of GROQ_API_KEY, OPENAI_API_KEY, VENICE_API_KEY, or LLAMA_API_KEY.",
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

  if (cfg.provider === "openai") {
    if (!opts.openaiApiKey) throw new Error("OpenAI provider selected but OPENAI_API_KEY is not configured.");
    return buildBuiltin("openai", opts.openaiApiKey, cfg.model || undefined);
  }
  if (cfg.provider === "groq") {
    if (!opts.groqApiKey) throw new Error("Groq provider selected but GROQ_API_KEY is not configured.");
    return buildBuiltin("groq", opts.groqApiKey, cfg.model || undefined);
  }
  if (cfg.provider === "llama") {
    if (!opts.llamaApiKey) throw new Error("Llama provider selected but LLAMA_API_KEY is not configured.");
    return buildBuiltin("llama", opts.llamaApiKey, cfg.model || undefined);
  }
  if (cfg.provider === "venice") {
    if (!opts.veniceApiKey) throw new Error("Venice provider selected but VENICE_API_KEY is not configured.");
    return buildBuiltin("venice", opts.veniceApiKey, cfg.model || undefined);
  }

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

  // "auto" / "lovable" / unknown → auto-pick.
  return autoPick(cfg, opts);
}
