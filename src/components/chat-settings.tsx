import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings as SettingsIcon, Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "@/lib/theme";
import { BG_PALETTES, ACCENT_PALETTES } from "@/lib/palette";
import { CATALOG, findCatalog } from "@/lib/provider-catalog";
import { listUserProviders, setActiveProvider, listEnvProviders } from "@/lib/providers.functions";
import { getMySettings, updateMySettings } from "@/lib/settings.functions";

const ADV_KEY = "mement0_advanced";

export function useAdvanced() {
  const [adv, setAdv] = useState(false);
  useEffect(() => {
    setAdv(localStorage.getItem(ADV_KEY) === "1");
  }, []);
  function update(v: boolean) {
    localStorage.setItem(ADV_KEY, v ? "1" : "0");
    setAdv(v);
  }
  return [adv, update] as const;
}

export function ChatSettings({
  advanced,
  setAdvanced,
}: {
  advanced: boolean;
  setAdvanced: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { bgPalette, accentPalette, setBgPalette, setAccentPalette } = useTheme();
  const qc = useQueryClient();
  const settingsQ = useQuery({ queryKey: ["settings"], queryFn: () => getMySettings() });
  const providersQ = useQuery({ queryKey: ["user_providers"], queryFn: () => listUserProviders() });

  const envQ = useQuery({ queryKey: ["env_providers"], queryFn: () => listEnvProviders() });

  const fallbackM = useMutation({
    mutationFn: (v: { id: string | null; kind: "groq" | "openai" | "llama" | "venice" | "gemini" | "openrouter" | null }) =>
      updateMySettings({
        data: { fallback_provider_id: v.id, fallback_provider_kind: v.kind },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Fallback updated");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });


  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);


  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
        aria-label="Settings"
      >
        <SettingsIcon className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-72 rounded-lg border border-border bg-popover p-3 shadow-xl">
          <p className="px-1 pb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
            Background
          </p>
          <div className="grid grid-cols-3 gap-1.5 px-1">

            {BG_PALETTES.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setBgPalette(p.id)}
                title={p.label}
                aria-label={`Background ${p.label}`}
                className={`flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-[11px] transition-colors ${
                  bgPalette === p.id
                    ? "border-primary/60 text-foreground"
                    : "border-border text-muted-foreground hover:bg-secondary"
                }`}
              >
                <span
                  className="h-5 w-5 rounded-full border border-border"
                  style={{ background: p.swatch }}
                />
                {p.label}
              </button>
            ))}
          </div>

          <p className="mt-3 px-1 pb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
            Accent
          </p>
          <div className="grid grid-cols-8 gap-1.5 px-1">
            {ACCENT_PALETTES.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setAccentPalette(p.id)}
                title={p.label}
                aria-label={`Accent ${p.label}`}
                className={`h-6 w-6 rounded-full border transition-transform hover:scale-110 ${
                  accentPalette === p.id ? "border-foreground ring-2 ring-foreground/40" : "border-border"
                }`}
                style={{ background: p.swatch }}
              />
            ))}
          </div>

          <div className="my-3 h-px bg-border" />

          <label className="flex items-start gap-2 cursor-pointer px-1 py-1">
            <input
              type="checkbox"
              checked={advanced}
              onChange={(e) => setAdvanced(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <span className="text-xs">
              <span className="block font-medium text-foreground">Advanced options</span>
              <span className="block text-muted-foreground mt-0.5">
                Show model selector under the composer.
              </span>
            </span>
          </label>

          {advanced && (
            <>
              <div className="my-3 h-px bg-border" />
              <div className="px-1">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Capability fallback
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground leading-snug">
                  If the primary model refuses or can't answer, auto-retry the
                  same turn on this provider.
                </p>
                <select
                  className="mt-2 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                  value={
                    settingsQ.data?.fallback_provider_kind === "venice"
                      ? "env:venice"
                      : settingsQ.data?.fallback_provider_kind === "groq"
                        ? "env:groq"
                      : settingsQ.data?.fallback_provider_kind === "openrouter"
                        ? "env:openrouter"
                        : settingsQ.data?.fallback_provider_kind === "gemini"
                          ? "env:gemini"
                          : settingsQ.data?.fallback_provider_kind === "openai"
                            ? "env:openai"
                            : settingsQ.data?.fallback_provider_kind === "llama"
                              ? "env:llama"
                              : settingsQ.data?.fallback_provider_id ?? ""
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "env:venice") fallbackM.mutate({ id: null, kind: "venice" });
                    else if (v === "env:groq") fallbackM.mutate({ id: null, kind: "groq" });
                    else if (v === "env:openrouter") fallbackM.mutate({ id: null, kind: "openrouter" });
                    else if (v === "env:gemini") fallbackM.mutate({ id: null, kind: "gemini" });
                    else if (v === "env:openai") fallbackM.mutate({ id: null, kind: "openai" });
                    else if (v === "env:llama") fallbackM.mutate({ id: null, kind: "llama" });
                    else fallbackM.mutate({ id: v || null, kind: null });
                  }}
                >
                  <option value="">
                    {envQ.data?.groq || envQ.data?.openrouter || envQ.data?.gemini ? "Auto (Groq/OpenRouter/Gemini)" : "Off"}
                  </option>
                  {envQ.data?.groq && (
                    <option value="env:groq">Groq (project key) · Llama 3.3 70B</option>
                  )}
                  {envQ.data?.openrouter && (
                    <option value="env:openrouter">OpenRouter (project key) · Llama 3.3 70B</option>
                  )}
                  {envQ.data?.gemini && (
                    <option value="env:gemini">Gemini (project key) · 2.5 Flash</option>
                  )}
                  {envQ.data?.llama && (
                    <option value="env:llama">Direct Llama (project key) · can 401</option>
                  )}
                  {envQ.data?.venice && (
                    <option value="env:venice">Venice (project key) · venice-uncensored</option>
                  )}
                  {envQ.data?.openai && (
                    <option value="env:openai">OpenAI (project key) · gpt-4o-mini</option>
                  )}
                  {(providersQ.data ?? []).map((p) => {
                    const cat = findCatalog(p.catalog_id);
                    return (
                      <option key={p.id} value={p.id}>
                        {cat?.name ?? p.label} ·{" "}
                        {p.default_model || cat?.models[0] || "default"}
                      </option>
                    );
                  })}
                </select>

              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function ModelPicker() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const settingsQ = useQuery({ queryKey: ["settings"], queryFn: () => getMySettings() });
  const providersQ = useQuery({ queryKey: ["user_providers"], queryFn: () => listUserProviders() });
  const envQ = useQuery({ queryKey: ["env_providers"], queryFn: () => listEnvProviders() });

  const activateM = useMutation({
    mutationFn: (v: { provider_id: string | null; provider_kind?: "lovable" | "openai" | "groq" | "llama" | "venice" | "gemini" | "openrouter" | "custom"; model?: string }) =>
      setActiveProvider({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Model switched");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });


  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const activeId = settingsQ.data?.active_provider_id ?? null;
  const providerKind = settingsQ.data?.provider ?? "lovable";
  const envOpenAiActive = !activeId && providerKind === "openai";
  const envGroqActive = !activeId && providerKind === "groq";
  const envLlamaActive = !activeId && providerKind === "llama";
  const envVeniceActive = !activeId && providerKind === "venice";
  const envGeminiActive = !activeId && providerKind === "gemini";
  const envOpenRouterActive = !activeId && providerKind === "openrouter";
  const activeProvider = (providersQ.data ?? []).find((p) => p.id === activeId);
  const activeCat = activeProvider ? findCatalog(activeProvider.catalog_id) : null;
  const label = activeId
    ? `${activeCat?.name ?? "Custom"} · ${settingsQ.data?.model || activeProvider?.default_model || "—"}`
    : envOpenAiActive
      ? `OpenAI · ${settingsQ.data?.model || "gpt-4o-mini"}`
      : envGroqActive
        ? `Groq · ${settingsQ.data?.model || "llama-3.3-70b-versatile"}`
        : envLlamaActive
          ? `Llama · ${settingsQ.data?.model || "Llama-3.3-70B-Instruct"}`
          : envVeniceActive
            ? `Venice · ${settingsQ.data?.model || "venice-uncensored"}`
            : envGeminiActive
              ? `Gemini · ${settingsQ.data?.model || "gemini-2.5-flash"}`
              : envOpenRouterActive
                ? `OpenRouter · ${settingsQ.data?.model || "meta-llama/llama-3.3-70b-instruct"}`
                : "Auto (recommended)";


  const connectedByCat = new Map(
    (providersQ.data ?? []).map((p) => [p.catalog_id, p]),
  );

  function pickAuto() {
    activateM.mutate({ provider_id: null, provider_kind: "lovable" });
    setOpen(false);
  }

  function pickEnvOpenAi() {
    const cat = findCatalog("openai");
    activateM.mutate({
      provider_id: null,
      provider_kind: "openai",
      model: cat?.models[0] ?? "gpt-4o-mini",
    });
    setOpen(false);
  }

  function pickEnvGroq() {
    activateM.mutate({
      provider_id: null,
      provider_kind: "groq",
      model: "llama-3.3-70b-versatile",
    });
    setOpen(false);
  }

  function pickEnvOpenRouter() {
    activateM.mutate({
      provider_id: null,
      provider_kind: "openrouter",
      model: "meta-llama/llama-3.3-70b-instruct",
    });
    setOpen(false);
  }

  function pickEnvGemini() {
    activateM.mutate({
      provider_id: null,
      provider_kind: "gemini",
      model: "gemini-2.5-flash",
    });
    setOpen(false);
  }

  function pickEnvLlama() {
    activateM.mutate({
      provider_id: null,
      provider_kind: "llama",
      model: "Llama-3.3-70B-Instruct",
    });
    setOpen(false);
  }

  function pickEnvVenice() {
    activateM.mutate({
      provider_id: null,
      provider_kind: "venice",
      model: "venice-uncensored",
    });
    setOpen(false);
  }


  function pickCatalog(catId: string) {
    const connected = connectedByCat.get(catId);
    if (connected) {
      const model = connected.default_model ?? findCatalog(catId)?.models[0] ?? "";
      activateM.mutate({ provider_id: connected.id, model });
      setOpen(false);
      return;
    }
    const cat = findCatalog(catId);
    const ok = confirm(`Model missing — download ${cat?.name ?? catId} now?`);
    if (ok) {
      setOpen(false);
      navigate({ to: "/library", search: { focus: catId } });
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        <span className="max-w-[180px] truncate">{label}</span>
      </button>
      {open && (
        <div className="absolute bottom-10 left-0 z-50 w-72 max-h-80 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-xl">
          <button
            type="button"
            onClick={pickAuto}
            className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs hover:bg-secondary ${
              !activeId ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            <span>
              <span className="block font-medium">Auto</span>
              <span className="block text-[10px] text-muted-foreground">
                DED picks the best model for the moment.
              </span>
            </span>
            {!activeId && !envOpenAiActive && !envGroqActive && !envLlamaActive && !envVeniceActive && !envGeminiActive && !envOpenRouterActive && <Check className="h-3.5 w-3.5 text-primary" />}
          </button>
          {envQ.data?.groq && !connectedByCat.get("groq") && (
            <button
              type="button"
              onClick={pickEnvGroq}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs hover:bg-secondary ${
                envGroqActive ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <span className="min-w-0">
                <span className="block font-medium truncate">Groq (project key)</span>
                <span className="block text-[10px] truncate">
                  llama-3.3-70b-versatile · hosted Llama
                </span>
              </span>
              {envGroqActive ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
              ) : (
                <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
                  Ready
                </span>
              )}
            </button>
          )}
          {envQ.data?.openrouter && !connectedByCat.get("openrouter") && (
            <button
              type="button"
              onClick={pickEnvOpenRouter}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs hover:bg-secondary ${
                envOpenRouterActive ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <span className="min-w-0">
                <span className="block font-medium truncate">OpenRouter (project key)</span>
                <span className="block text-[10px] truncate">
                  meta-llama/llama-3.3-70b-instruct
                </span>
              </span>
              {envOpenRouterActive ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
              ) : (
                <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
                  Ready
                </span>
              )}
            </button>
          )}
          {envQ.data?.gemini && (
            <button
              type="button"
              onClick={pickEnvGemini}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs hover:bg-secondary ${
                envGeminiActive ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <span className="min-w-0">
                <span className="block font-medium truncate">Gemini (project key)</span>
                <span className="block text-[10px] truncate">
                  gemini-2.5-flash · stable fallback
                </span>
              </span>
              {envGeminiActive ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
              ) : (
                <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
                  Ready
                </span>
              )}
            </button>
          )}
          {envQ.data?.venice && (
            <button
              type="button"
              onClick={pickEnvVenice}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs hover:bg-secondary ${
                envVeniceActive ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <span className="min-w-0">
                <span className="block font-medium truncate">Venice (project key)</span>
                <span className="block text-[10px] truncate">
                  venice-uncensored · default fallback
                </span>
              </span>
              {envVeniceActive ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
              ) : (
                <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
                  Ready
                </span>
              )}
            </button>
          )}

          {envQ.data?.llama && !connectedByCat.get("llama") && (
            <button
              type="button"
              onClick={pickEnvLlama}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs hover:bg-secondary ${
                envLlamaActive ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <span className="min-w-0">
                <span className="block font-medium truncate">Llama (project key)</span>
                <span className="block text-[10px] truncate">
                  Llama-3.3-70B-Instruct · uses LLAMA_API_KEY
                </span>
              </span>
              {envLlamaActive ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
              ) : (
                <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
                  Ready
                </span>
              )}
            </button>
          )}
          {envQ.data?.openai && !connectedByCat.get("openai") && (
            <button
              type="button"
              onClick={pickEnvOpenAi}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs hover:bg-secondary ${
                envOpenAiActive ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <span className="min-w-0">
                <span className="block font-medium truncate">OpenAI (project key)</span>
                <span className="block text-[10px] truncate">
                  gpt-4o-mini · uses OPENAI_API_KEY
                </span>
              </span>
              {envOpenAiActive ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
              ) : (
                <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
                  Ready
                </span>
              )}
            </button>
          )}
          <div className="my-1 h-px bg-border" />
          {CATALOG.map((c) => {
            const conn = connectedByCat.get(c.id);
            const isActive = conn && conn.id === activeId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => pickCatalog(c.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-xs hover:bg-secondary ${
                  isActive ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                <span className="min-w-0">
                  <span className="block font-medium truncate">{c.name}</span>
                  <span className="block text-[10px] truncate">
                    {conn?.default_model || c.models[0]}
                  </span>
                </span>
                {isActive ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                ) : conn ? (
                  <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
                    Saved
                  </span>
                ) : (
                  <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
