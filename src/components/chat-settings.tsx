import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings as SettingsIcon, Sun, Moon, Monitor, Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useTheme, type ThemeMode } from "@/lib/theme";
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
  const { mode, setMode } = useTheme();
  const qc = useQueryClient();
  const settingsQ = useQuery({ queryKey: ["settings"], queryFn: () => getMySettings() });
  const providersQ = useQuery({ queryKey: ["user_providers"], queryFn: () => listUserProviders() });

  const envQ = useQuery({ queryKey: ["env_providers"], queryFn: () => listEnvProviders() });

  const fallbackM = useMutation({
    mutationFn: (v: { id: string | null; kind: "groq" | "openai" | null }) =>
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

  const themes: { id: ThemeMode; label: string; icon: React.ReactNode }[] = [
    { id: "light", label: "Light", icon: <Sun className="h-3.5 w-3.5" /> },
    { id: "dark", label: "Dark", icon: <Moon className="h-3.5 w-3.5" /> },
    { id: "system", label: "Auto", icon: <Monitor className="h-3.5 w-3.5" /> },
  ];

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
        <div className="absolute right-0 top-9 z-50 w-64 rounded-lg border border-border bg-popover p-3 shadow-xl">
          <p className="px-1 pb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
            Theme
          </p>
          <div className="grid grid-cols-3 gap-1">
            {themes.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setMode(t.id)}
                className={`flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-xs transition-colors ${
                  mode === t.id
                    ? "border-primary/60 bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:bg-secondary"
                }`}
              >
                {t.icon}
                {t.label}
              </button>
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
                  same turn on this provider. Uses your library key.
                </p>
                <select
                  className="mt-2 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                  value={settingsQ.data?.fallback_provider_id ?? ""}
                  onChange={(e) =>
                    fallbackM.mutate(e.target.value || null)
                  }
                >
                  <option value="">Off</option>
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
                {(providersQ.data ?? []).length === 0 && (
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                    Add a provider in{" "}
                    <a
                      href="/library"
                      className="underline hover:text-foreground"
                    >
                      /library
                    </a>{" "}
                    first.
                  </p>
                )}
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
    mutationFn: (v: { provider_id: string | null; provider_kind?: "lovable" | "openai" | "custom"; model?: string }) =>
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
  const activeProvider = (providersQ.data ?? []).find((p) => p.id === activeId);
  const activeCat = activeProvider ? findCatalog(activeProvider.catalog_id) : null;
  const label = activeId
    ? `${activeCat?.name ?? "Custom"} · ${settingsQ.data?.model || activeProvider?.default_model || "—"}`
    : envOpenAiActive
      ? `OpenAI · ${settingsQ.data?.model || "gpt-4o-mini"}`
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
            {!activeId && !envOpenAiActive && <Check className="h-3.5 w-3.5 text-primary" />}
          </button>
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
