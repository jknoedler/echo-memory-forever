import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  getMySettings,
  rotateBiometricsSecret,
  updateMySettings,
} from "@/lib/settings.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

const LOVABLE_MODELS = [
  "google/gemini-3-flash-preview",
  "google/gemini-3.5-flash",
  "google/gemini-3.1-pro-preview",
  "google/gemini-2.5-pro",
  "google/gemini-2.5-flash",
  "openai/gpt-5",
  "openai/gpt-5-mini",
  "openai/gpt-5.4",
];

const OPENAI_DIRECT_MODELS = [
  "gpt-4o-mini",
  "gpt-4o",
  "gpt-4.1",
  "gpt-4.1-mini",
  "o4-mini",
];

function SettingsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["settings"], queryFn: () => getMySettings() });

  const [form, setForm] = useState({
    provider: "lovable",
    model: "google/gemini-3-flash-preview",
    custom_base_url: "",
    custom_api_key: "",
    custom_model_id: "",
    system_prompt_override: "",
    hotl_auto_execute: false,
  });

  useEffect(() => {
    if (!q.data) return;
    setForm({
      provider: q.data.provider ?? "lovable",
      model: q.data.model ?? "google/gemini-3-flash-preview",
      custom_base_url: q.data.custom_base_url ?? "",
      custom_api_key: q.data.custom_api_key ?? "",
      custom_model_id: q.data.custom_model_id ?? "",
      system_prompt_override: q.data.system_prompt_override ?? "",
      hotl_auto_execute: q.data.hotl_auto_execute ?? false,
    });
  }, [q.data]);

  const save = useMutation({
    mutationFn: () =>
      updateMySettings({
        data: {
          provider: form.provider as "lovable" | "openai" | "custom",
          model: form.model,
          custom_base_url: form.custom_base_url || null,
          custom_api_key: form.custom_api_key || null,
          custom_model_id: form.custom_model_id || null,
          system_prompt_override: form.system_prompt_override || null,
          hotl_auto_execute: form.hotl_auto_execute,
        },
      }),
    onSuccess: () => {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const rotate = useMutation({
    mutationFn: () => rotateBiometricsSecret(),
    onSuccess: () => {
      toast.success("New biometric secret minted");
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  if (q.isLoading) {
    return <div className="p-10 text-muted-foreground">Loading…</div>;
  }

  const biometricsEndpoint =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/public/biometrics`
      : "/api/public/biometrics";

  const userId = ""; // can be filled with claims if needed
  void userId;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-5 py-10 space-y-10">
        <header>
          <p className="text-xs uppercase tracking-widest text-primary">Console</p>
          <h1 className="mt-1 text-3xl font-display tracking-tight">Settings</h1>
        </header>

        <Card title="AI provider" subtitle="By default Mement0 routes through our included gateway — no API key needed from you. Switch to OpenAI Direct to use the project's OPENAI_API_KEY, or Custom to bring your own OpenAI-compatible endpoint (OpenRouter, Anthropic via proxy, Ollama, vLLM, self-hosted llama).">
          <Field label="Provider" hint="Included = our gateway. OpenAI = direct via OPENAI_API_KEY. Custom = your own endpoint.">
            <select
              value={form.provider}
              onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
              className="auth-input"
            >
              <option value="lovable">Included gateway — no key required</option>
              <option value="openai">OpenAI Direct — uses project OPENAI_API_KEY</option>
              <option value="custom">Bring your own — OpenAI-compatible endpoint</option>
            </select>
          </Field>

          {form.provider === "lovable" && (
            <Field label="Model">
              <select
                value={form.model}
                onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                className="auth-input"
              >
                {LOVABLE_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {form.provider === "openai" && (
            <Field label="Model" hint="Calls api.openai.com directly with the OPENAI_API_KEY stored on the project.">
              <select
                value={form.model}
                onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                className="auth-input"
              >
                {OPENAI_DIRECT_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {form.provider === "custom" && (
            <div className="space-y-4">
              <Field
                label="Base URL"
                hint="e.g. http://localhost:11434/v1 for Ollama, or your llama.cpp / vLLM endpoint."
              >
                <input
                  type="url"
                  value={form.custom_base_url}
                  onChange={(e) => setForm((f) => ({ ...f, custom_base_url: e.target.value }))}
                  className="auth-input"
                  placeholder="https://your-llama-host/v1"
                />
              </Field>
              <Field label="API Key (optional)">
                <input
                  type="password"
                  value={form.custom_api_key}
                  onChange={(e) => setForm((f) => ({ ...f, custom_api_key: e.target.value }))}
                  className="auth-input"
                  placeholder="Leave blank if your endpoint doesn't require one"
                />
              </Field>
              <Field label="Model ID">
                <input
                  type="text"
                  value={form.custom_model_id}
                  onChange={(e) => setForm((f) => ({ ...f, custom_model_id: e.target.value }))}
                  className="auth-input"
                  placeholder="llama3.1:70b-instruct"
                />
              </Field>
            </div>
          )}
        </Card>


        <Card title="Persona override" subtitle="Replace the System of Josiah default. Leave blank to use the built-in.">
          <Field label="System prompt">
            <textarea
              value={form.system_prompt_override}
              onChange={(e) =>
                setForm((f) => ({ ...f, system_prompt_override: e.target.value }))
              }
              rows={10}
              className="auth-input font-mono text-xs"
              placeholder="Default: System of Josiah"
            />
          </Field>
        </Card>

        <Card title="HOTL" subtitle="Auto-execute approved staged tasks without confirmation.">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.hotl_auto_execute}
              onChange={(e) =>
                setForm((f) => ({ ...f, hotl_auto_execute: e.target.checked }))
              }
              className="h-4 w-4 accent-primary"
            />
            <span className="text-sm">
              Auto-execute on approve (default: off — require a second confirmation)
            </span>
          </label>
        </Card>

        <Card
          title="Biometric ingest"
          subtitle="POST signed payloads here from your wearable, watch shortcut, or future native shell."
        >
          <Field label="Endpoint">
            <CopyRow value={biometricsEndpoint} />
          </Field>
          <Field
            label="Shared secret"
            hint="HMAC-SHA256 the raw request body using this secret. Send the hex digest in X-Mement0-Signature. Send your user id in X-Mement0-User."
          >
            <CopyRow value={q.data?.biometrics_secret ?? ""} secret />
          </Field>
          <button
            type="button"
            onClick={() => rotate.mutate()}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm hover:bg-secondary"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Rotate secret
          </button>
        </Card>

        <div className="sticky bottom-0 bg-background/90 backdrop-blur border-t border-border -mx-5 px-5 py-4">
          <div className="flex justify-end gap-2 max-w-3xl mx-auto">
            <button
              type="button"
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 ember-glow"
            >
              {save.isPending ? "Saving…" : "Save settings"}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .auth-input {
          width: 100%;
          background: var(--color-background);
          border: 1px solid var(--color-border);
          color: var(--color-foreground);
          padding: 0.625rem 0.875rem;
          border-radius: 0.5rem;
          font-size: 0.9rem;
          outline: none;
          transition: border-color 0.15s;
        }
        .auth-input:focus {
          border-color: var(--color-primary);
          box-shadow: 0 0 0 3px oklch(0.78 0.14 68 / 0.18);
        }
      `}</style>
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-6 space-y-4">
      <div>
        <h2 className="text-lg font-display font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-widest text-muted-foreground mb-1.5">
        {label}
      </span>
      {children}
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </label>
  );
}

function CopyRow({ value, secret = false }: { value: string; secret?: boolean }) {
  const [shown, setShown] = useState(!secret);
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-xs font-mono truncate">
        {shown ? value : "•".repeat(Math.min(value.length, 40))}
      </code>
      {secret && (
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          className="rounded-md border border-border bg-background px-3 py-2 text-xs hover:bg-secondary"
        >
          {shown ? "Hide" : "Show"}
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(value);
          toast.success("Copied");
        }}
        className="rounded-md border border-border bg-background px-3 py-2 text-xs hover:bg-secondary inline-flex items-center gap-1"
      >
        <Copy className="h-3 w-3" /> Copy
      </button>
    </div>
  );
}
