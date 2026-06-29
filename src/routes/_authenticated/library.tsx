import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, ExternalLink, Plus, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { CATALOG, findCatalog, type CatalogEntry } from "@/lib/provider-catalog";
import {
  addUserProvider,
  deleteUserProvider,
  listUserProviders,
  setActiveProvider,
} from "@/lib/providers.functions";
import { getMySettings } from "@/lib/settings.functions";

const LibrarySearch = z.object({ focus: z.string().optional() });

export const Route = createFileRoute("/_authenticated/library")({
  validateSearch: (s) => LibrarySearch.parse(s),
  component: LibraryPage,
});

function LibraryPage() {
  const qc = useQueryClient();
  const providersQ = useQuery({
    queryKey: ["user_providers"],
    queryFn: () => listUserProviders(),
  });
  const settingsQ = useQuery({ queryKey: ["settings"], queryFn: () => getMySettings() });

  const addedByCatalog = useMemo(() => {
    const m = new Map<string, { id: string; default_model: string | null; has_key: boolean }>();
    (providersQ.data ?? []).forEach((p) =>
      m.set(p.catalog_id, {
        id: p.id,
        default_model: p.default_model,
        has_key: p.has_key,
      }),
    );
    return m;
  }, [providersQ.data]);

  const activeId = settingsQ.data?.active_provider_id ?? null;

  const removeM = useMutation({
    mutationFn: (id: string) => deleteUserProvider({ data: { id } }),
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["user_providers"] });
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  const activateM = useMutation({
    mutationFn: (vars: { provider_id: string | null; model?: string }) =>
      setActiveProvider({ data: vars }),
    onSuccess: () => {
      toast.success("Active model updated");
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  const hosted = CATALOG.filter((c) => c.kind === "hosted");
  const local = CATALOG.filter((c) => c.kind === "local");

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-5 py-10 space-y-10">
        <header>
          <p className="text-xs uppercase tracking-widest text-primary">Library</p>
          <h1 className="mt-1 text-3xl font-display tracking-tight">Models & providers</h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
            Add an API key from any frontier lab to use it as DED's brain. Or point at a
            local model running on your machine. Switch active provider anytime — your
            memory archive stays the same.
          </p>
        </header>

        {/* Active marker */}
        <section className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Active</p>
            <p className="mt-1 text-sm">
              {activeId
                ? (() => {
                    const p = (providersQ.data ?? []).find((x) => x.id === activeId);
                    const cat = p && findCatalog(p.catalog_id);
                    return cat ? `${cat.name} — ${settingsQ.data?.model || p.default_model}` : "Custom";
                  })()
                : "Claude (default gateway) — no key required"}
            </p>
          </div>
          {activeId && (
            <button
              type="button"
              onClick={() => activateM.mutate({ provider_id: null })}
              className="text-xs underline text-muted-foreground hover:text-foreground"
            >
              Reset to default
            </button>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-display font-semibold tracking-tight">Hosted APIs</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {hosted.map((c) => (
              <ProviderCard
                key={c.id}
                entry={c}
                saved={addedByCatalog.get(c.id) ?? null}
                isActive={(addedByCatalog.get(c.id)?.id ?? null) === activeId}
                onRemove={(id) => removeM.mutate(id)}
                onActivate={(id, model) => activateM.mutate({ provider_id: id, model })}
                onSaved={() => {
                  qc.invalidateQueries({ queryKey: ["user_providers"] });
                }}
              />
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-display font-semibold tracking-tight">Local runtimes</h2>
          <p className="text-sm text-muted-foreground -mt-2 max-w-2xl">
            Mement0 can't install software on your machine from the browser. Install the
            runtime once, copy the pull command for the model you want, then click
            "Connect" and we'll wire DED straight to localhost. Zero cloud, zero key.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {local.map((c) => (
              <ProviderCard
                key={c.id}
                entry={c}
                saved={addedByCatalog.get(c.id) ?? null}
                isActive={(addedByCatalog.get(c.id)?.id ?? null) === activeId}
                onRemove={(id) => removeM.mutate(id)}
                onActivate={(id, model) => activateM.mutate({ provider_id: id, model })}
                onSaved={() => {
                  qc.invalidateQueries({ queryKey: ["user_providers"] });
                }}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function ProviderCard({
  entry,
  saved,
  isActive,
  onRemove,
  onActivate,
  onSaved,
}: {
  entry: CatalogEntry;
  saved: { id: string; default_model: string | null; has_key: boolean } | null;
  isActive: boolean;
  onRemove: (id: string) => void;
  onActivate: (id: string, model?: string) => void;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(entry.baseUrl);
  const [model, setModel] = useState(saved?.default_model || entry.models[0] || "");

  const addM = useMutation({
    mutationFn: () =>
      addUserProvider({
        data: {
          catalog_id: entry.id,
          label: entry.name,
          api_key: entry.kind === "local" ? null : apiKey || null,
          base_url: baseUrl,
          default_model: model,
        },
      }),
    onSuccess: () => {
      toast.success(`${entry.name} connected`);
      setOpen(false);
      setApiKey("");
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div
      className={`rounded-xl border bg-card p-4 space-y-3 transition-colors ${
        isActive ? "border-primary/60 ring-1 ring-primary/30" : "border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-display font-semibold">{entry.name}</h3>
            {isActive && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[10px] uppercase tracking-widest">
                <Zap className="h-3 w-3" /> Active
              </span>
            )}
            {saved && !isActive && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-[10px] uppercase tracking-widest">
                <Check className="h-3 w-3" /> Saved
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{entry.tagline}</p>
        </div>
        <a
          href={entry.signupUrl}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {entry.kind === "hosted" ? "Get key" : "Install"}{" "}
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {entry.installCommand && (
        <CopyableCmd cmd={entry.installCommand} />
      )}
      {entry.notes && (
        <p className="text-xs text-muted-foreground leading-relaxed">{entry.notes}</p>
      )}

      {!open && !saved && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-border bg-background py-2 text-sm hover:bg-secondary"
        >
          <Plus className="h-3.5 w-3.5" /> {entry.kind === "hosted" ? "Add API key" : "Connect"}
        </button>
      )}

      {open && (
        <div className="space-y-2 border-t border-border pt-3">
          {entry.kind === "hosted" && (
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="API key"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-mono outline-none focus:border-primary"
            />
          )}
          <input
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-mono outline-none focus:border-primary"
          />
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary"
          >
            {entry.models.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => addM.mutate()}
              disabled={addM.isPending || (entry.kind === "hosted" && !apiKey)}
              className="flex-1 rounded-md bg-primary py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
            >
              {addM.isPending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-border bg-background px-3 py-2 text-xs hover:bg-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {saved && !open && (
        <div className="flex gap-2 pt-1">
          {!isActive && (
            <button
              type="button"
              onClick={() => onActivate(saved.id, saved.default_model ?? entry.models[0])}
              className="flex-1 rounded-md bg-primary py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              Use this
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-md border border-border bg-background px-3 py-2 text-xs hover:bg-secondary"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm(`Remove ${entry.name}?`)) onRemove(saved.id);
            }}
            className="rounded-md border border-border bg-background px-3 py-2 text-xs hover:bg-destructive hover:text-destructive-foreground"
            aria-label="Remove"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function CopyableCmd({ cmd }: { cmd: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
      <code className="flex-1 text-xs font-mono truncate">{cmd}</code>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(cmd);
          toast.success("Copied");
        }}
        className="text-muted-foreground hover:text-foreground"
        aria-label="Copy command"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
