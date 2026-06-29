// Multi-provider router. Returns an AI-SDK language model for a user's
// configured provider. Default = Lovable AI Gateway. Custom = any
// OpenAI-compatible endpoint (Ollama, LM Studio, self-hosted llama, OpenRouter, etc.)
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

export type UserAiConfig = {
  provider: string;
  model: string;
  custom_base_url: string | null;
  custom_api_key: string | null;
  custom_model_id: string | null;
};

export type ResolvedProvider = {
  model: ReturnType<ReturnType<typeof createLovableAiGatewayProvider>>;
  providerName: string;
  modelId: string;
  // Optional: a Lovable gateway handle (only set when provider === lovable)
  lovableGateway?: ReturnType<typeof createLovableAiGatewayProvider>;
};

export function resolveProvider(
  cfg: UserAiConfig,
  opts: { lovableApiKey?: string; initialRunId?: string } = {},
): ResolvedProvider {
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
    return {
      model: provider(modelId),
      providerName: "custom",
      modelId,
    };
  }

  // Default: Lovable AI Gateway
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
