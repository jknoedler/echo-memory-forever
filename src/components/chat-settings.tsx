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
import { OPENROUTER_FREE_MODELS, OPENROUTER_FREE_DEFAULT } from "@/lib/openrouter-free";
import { PAID_OPENROUTER_MODELS, formatPrice } from "@/lib/paid-models";
import { getMyAdminStatus } from "@/lib/admin.functions";
import { TIER_ULTRA_CHEAP, TIER_CHEAP } from "@/lib/model-tiers";

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
    mutationFn: (v: { id: string | null; kind: "openrouter" | null }) =>
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
                  Auto-cycles through the other OpenRouter free models when the
                  active one refuses, times out, or gets rate-limited. Pick a
                  saved BYO provider to try it first.
                </p>
                <select
                  className="mt-2 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                  value={
                    settingsQ.data?.fallback_provider_kind === "openrouter"
                      ? "env:openrouter"
                      : settingsQ.data?.fallback_provider_id ?? ""
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "env:openrouter") fallbackM.mutate({ id: null, kind: "openrouter" });
                    else fallbackM.mutate({ id: v || null, kind: null });
                  }}
                >
                  <option value="">
                    {envQ.data?.openrouter ? "Auto (cycle OpenRouter free)" : "Off"}
                  </option>
                  {envQ.data?.openrouter && (
                    <option value="env:openrouter">
                      OpenRouter free chain (cycle every free model)
                    </option>
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
  const adminQ = useQuery({ queryKey: ["admin_status"], queryFn: () => getMyAdminStatus() });
  const isAdmin = adminQ.data?.isAdmin ?? false;

  const activateM = useMutation({
    mutationFn: (v: {
      provider_id: string | null;
      provider_kind?: "openrouter" | "custom";
      model?: string;
    }) => setActiveProvider({ data: v }),
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
  const providerKind = settingsQ.data?.provider ?? "openrouter";
  const envOpenRouterActive = !activeId && providerKind === "openrouter";
  const activeProvider = (providersQ.data ?? []).find((p) => p.id === activeId);
  const activeCat = activeProvider ? findCatalog(activeProvider.catalog_id) : null;
  const activeFreeModel = envOpenRouterActive
    ? OPENROUTER_FREE_MODELS.find((m) => m.id === (settingsQ.data?.model ?? OPENROUTER_FREE_DEFAULT))
    : null;
  const label = activeId
    ? `${activeCat?.name ?? "Custom"} · ${settingsQ.data?.model || activeProvider?.default_model || "—"}`
    : activeFreeModel
      ? `Free · ${activeFreeModel.label}`
      : "Free · Llama 3.3 70B";

  const connectedByCat = new Map(
    (providersQ.data ?? []).map((p) => [p.catalog_id, p]),
  );

  function pickFreeModel(id: string) {
    activateM.mutate({
      provider_id: null,
      provider_kind: "openrouter",
      model: id,
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
    const ok = confirm(`Add your own ${cat?.name ?? catId} key now?`);
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
          {envQ.data?.openrouter && (
            <>
              <div className="px-3 pt-2 pb-1 text-[9px] uppercase tracking-widest text-muted-foreground/70">
                Free · included with MementØ
              </div>
              <div className="px-3 pb-1 text-[10px] text-muted-foreground/60 leading-snug">
                All routed through OpenRouter. If one fails mid-turn, the next
                one in this list picks up automatically.
              </div>
              {OPENROUTER_FREE_MODELS.map((m) => {
                const isThisActive =
                  envOpenRouterActive && (settingsQ.data?.model ?? OPENROUTER_FREE_DEFAULT) === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => pickFreeModel(m.id)}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs hover:bg-secondary ${
                      isThisActive ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block font-medium truncate">{m.label}</span>
                      <span className="block text-[10px] truncate">{m.hint}</span>
                    </span>
                    {isThisActive ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                    ) : (
                      <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
                        Free
                      </span>
                    )}
                  </button>
                );
              })}
            </>
          )}

          <div className="my-1 h-px bg-border" />
          <div className="px-3 pt-1 pb-1 text-[9px] uppercase tracking-widest text-muted-foreground/70">
            Your keys · bring your own
          </div>
          <div className="px-3 pb-1 text-[10px] text-muted-foreground/60 leading-snug">
            Paid providers (OpenAI, Anthropic, Groq, Venice, etc.) are BYO
            only — add your key in the Library.
          </div>
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
