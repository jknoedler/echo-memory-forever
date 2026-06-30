// GET /api/health/ai — gateway connectivity & credits health check.
//
// Pings each configured upstream with a tiny chat completion and reports
// per-provider status (ok | unauthorized | rate_limited | credits_exhausted |
// unavailable | not_configured). Designed to be friendly enough to surface
// in the UI when the chat goes silent.

import { createFileRoute } from "@tanstack/react-router";

type ProviderKind = "groq" | "openai" | "venice" | "llama" | "gemini" | "openrouter";

type ProviderStatus = {
  provider: ProviderKind;
  configured: boolean;
  status: "ok" | "unauthorized" | "rate_limited" | "credits_exhausted" | "unavailable" | "not_configured" | "error";
  http?: number;
  message: string;
  latencyMs?: number;
};

const ENDPOINTS: Record<ProviderKind, { url: string; model: string; envVar: string }> = {
  groq: {
    url: "https://api.groq.com/openai/v1/chat/completions",
    model: "llama-3.3-70b-versatile",
    envVar: "GROQ_API_KEY",
  },
  openai: {
    url: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
    envVar: "OPENAI_API_KEY",
  },
  venice: {
    url: "https://api.venice.ai/api/v1/chat/completions",
    model: "venice-uncensored",
    envVar: "VENICE_API_KEY",
  },
  llama: {
    url: "https://api.llama.com/compat/v1/chat/completions",
    model: "Llama-3.3-70B-Instruct",
    envVar: "LLAMA_API_KEY",
  },
  gemini: {
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    model: "gemini-2.5-flash",
    envVar: "GEMINI_API_KEY",
  },
  openrouter: {
    url: "https://openrouter.ai/api/v1/chat/completions",
    model: "meta-llama/llama-3.3-70b-instruct",
    envVar: "OPENROUTER_API_KEY",
  },
};

function classify(http: number): ProviderStatus["status"] {
  if (http >= 200 && http < 300) return "ok";
  if (http === 401 || http === 403) return "unauthorized";
  if (http === 402) return "credits_exhausted";
  if (http === 429) return "rate_limited";
  if (http >= 500) return "unavailable";
  return "error";
}

function humanize(s: ProviderStatus["status"], provider: ProviderKind): string {
  switch (s) {
    case "ok":
      return `${provider} is reachable and responding.`;
    case "unauthorized":
      return `${provider} rejected the API key. Update the secret and retry.`;
    case "credits_exhausted":
      return `${provider} returned HTTP 402 — out of credits. Top up the account or rely on a fallback provider.`;
    case "rate_limited":
      return `${provider} is rate-limiting requests right now. Try again shortly.`;
    case "unavailable":
      return `${provider} is currently unavailable (upstream 5xx).`;
    case "not_configured":
      return `${provider} has no API key configured on this deployment.`;
    default:
      return `${provider} returned an unexpected error.`;
  }
}

async function pingProvider(provider: ProviderKind, apiKey: string | undefined): Promise<ProviderStatus> {
  if (!apiKey) {
    return {
      provider,
      configured: false,
      status: "not_configured",
      message: humanize("not_configured", provider),
    };
  }
  const { url, model } = ENDPOINTS[provider];
  const start = Date.now();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8_000);
    const res = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
    });
    clearTimeout(t);
    const latencyMs = Date.now() - start;
    const status = classify(res.status);
    return {
      provider,
      configured: true,
      status,
      http: res.status,
      message: humanize(status, provider),
      latencyMs,
    };
  } catch (e) {
    return {
      provider,
      configured: true,
      status: "unavailable",
      message:
        e instanceof Error && e.name === "AbortError"
          ? `${provider} timed out after 8s.`
          : `${provider} could not be reached: ${e instanceof Error ? e.message : String(e)}`,
      latencyMs: Date.now() - start,
    };
  }
}

export const Route = createFileRoute("/api/health/ai")({
  server: {
    handlers: {
      GET: async () => {
        const providers: ProviderKind[] = ["groq", "gemini", "openrouter", "openai", "venice", "llama"];
        const keys: Record<ProviderKind, string | undefined> = {
          groq: process.env.GROQ_API_KEY,
          openai: process.env.OPENAI_API_KEY,
          venice: process.env.VENICE_API_KEY,
          llama: process.env.LLAMA_API_KEY,
          gemini: process.env.GEMINI_API_KEY,
          openrouter: process.env.OPENROUTER_API_KEY,
        };
        const results = await Promise.all(providers.map((p) => pingProvider(p, keys[p])));
        const anyOk = results.some((r) => r.status === "ok");
        const summary = anyOk
          ? "At least one model provider is healthy. Chat should work."
          : "No model provider is currently healthy. Chat will fail until at least one recovers or is reconfigured.";
        return Response.json({
          ok: anyOk,
          summary,
          checkedAt: new Date().toISOString(),
          providers: results,
        });
      },
    },
  },
});
