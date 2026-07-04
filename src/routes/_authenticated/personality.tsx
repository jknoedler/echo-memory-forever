import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { RotateCcw, Save, Trash2, X, Plus, History, Undo2 } from "lucide-react";
import { toast } from "sonner";
import {
  getPersonalityPortrait,
  updatePersonalityPortrait,
  resetPersonalityPortrait,
  getPersonalityHistory,
  rollbackPersonalityPortrait,
} from "@/lib/personality.functions";

export const Route = createFileRoute("/_authenticated/personality")({
  component: PersonalityPage,
});

type Draft = {
  energy: string;
  mood: string;
  values_worldview: string;
  interests_ideas: string;
  communication: string;
  freeform_notes: string;
  explicit_preferences: string[];
};

const EMPTY: Draft = {
  energy: "",
  mood: "",
  values_worldview: "",
  interests_ideas: "",
  communication: "",
  freeform_notes: "",
  explicit_preferences: [],
};

function PersonalityPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["personality"],
    queryFn: () => getPersonalityPortrait(),
  });

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [dirty, setDirty] = useState(false);
  const [newPref, setNewPref] = useState("");

  useEffect(() => {
    if (!q.data) return;
    const p = q.data.portrait;
    setDraft({
      energy: p.energy ?? "",
      mood: p.mood ?? "",
      values_worldview: p.values_worldview ?? "",
      interests_ideas: p.interests_ideas ?? "",
      communication: p.communication ?? "",
      freeform_notes: p.freeform_notes ?? "",
      explicit_preferences: [...(p.explicit_preferences ?? [])],
    });
    setDirty(false);
  }, [q.data]);

  const saveM = useMutation({
    mutationFn: (payload: Draft) => updatePersonalityPortrait({ data: payload }),
    onSuccess: () => {
      toast.success("Portrait saved");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["personality"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const resetM = useMutation({
    mutationFn: () => resetPersonalityPortrait(),
    onSuccess: () => {
      toast.success("Portrait cleared — will resynthesize on your next turns");
      qc.invalidateQueries({ queryKey: ["personality"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Reset failed"),
  });

  const style = q.data?.style;
  const portrait = q.data?.portrait;

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setDirty(true);
  }

  function addPref() {
    const v = newPref.trim();
    if (!v) return;
    if (draft.explicit_preferences.includes(v)) {
      setNewPref("");
      return;
    }
    setDraft((d) => ({ ...d, explicit_preferences: [...d.explicit_preferences, v] }));
    setNewPref("");
    setDirty(true);
  }

  function removePref(i: number) {
    setDraft((d) => ({
      ...d,
      explicit_preferences: d.explicit_preferences.filter((_, idx) => idx !== i),
    }));
    setDirty(true);
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-5 py-10 space-y-10">
        <header>
          <p className="text-xs uppercase tracking-widest text-primary">Personality</p>
          <h1 className="mt-1 text-3xl font-display tracking-tight">How DED reads you</h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl">
            DED builds a nuanced portrait of you from your recent messages — energy,
            mood, values, interests, how you like to be met. It refreshes every ~10
            turns or once a day. Nothing here is a hard rule unless you make it one.
            Edit anything, or clear it to start over.
          </p>
          {portrait?.last_synthesized_at ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Last synthesized {new Date(portrait.last_synthesized_at).toLocaleString()}
              {" · "}next refresh in ~{Math.max(0, 10 - (portrait.turns_since_synthesis ?? 0))} turns
            </p>
          ) : (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Not synthesized yet — keep chatting and a portrait will fill in.
            </p>
          )}
        </header>

        <section className="space-y-4">
          <SectionHeader
            title="Portrait"
            subtitle="Prose, not rules. Describe the person, not a list of do/don'ts."
          />
          <Field
            label="Energy"
            hint="Cadence, pace, intensity — when they're on vs muted."
            value={draft.energy}
            onChange={(v) => update("energy", v)}
          />
          <Field
            label="Mood"
            hint="Baseline emotional register lately."
            value={draft.mood}
            onChange={(v) => update("mood", v)}
          />
          <Field
            label="Values / worldview"
            hint="Ethics, morals, what they defend, what they mock."
            value={draft.values_worldview}
            onChange={(v) => update("values_worldview", v)}
          />
          <Field
            label="Interests / ideas"
            hint="Recurring themes, projects, obsessions."
            value={draft.interests_ideas}
            onChange={(v) => update("interests_ideas", v)}
          />
          <Field
            label="How they want to be met"
            hint="Bluntness, humor, when they want pushback vs space."
            value={draft.communication}
            onChange={(v) => update("communication", v)}
          />
          <Field
            label="Freeform notes"
            hint="Anything else worth remembering."
            value={draft.freeform_notes}
            onChange={(v) => update("freeform_notes", v)}
          />
        </section>

        <section className="space-y-3">
          <SectionHeader
            title="Explicit preferences"
            subtitle="Only things you literally told DED to do or not do. DED treats these as binding."
          />
          <div className="space-y-2">
            {draft.explicit_preferences.length === 0 ? (
              <p className="rounded-md border border-dashed border-border bg-card px-4 py-6 text-center text-xs text-muted-foreground">
                No explicit preferences. Add one below, or tell DED in chat and it may be picked up on the next synthesis.
              </p>
            ) : (
              draft.explicit_preferences.map((p, i) => (
                <div
                  key={`${p}-${i}`}
                  className="flex items-start gap-2 rounded-md border border-border bg-card p-3 text-sm"
                >
                  <span className="flex-1 whitespace-pre-wrap">{p}</span>
                  <button
                    type="button"
                    onClick={() => removePref(i)}
                    className="rounded-md p-1 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
                    aria-label="Remove"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="flex gap-2">
            <input
              value={newPref}
              onChange={(e) => setNewPref(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addPref();
                }
              }}
              placeholder='e.g. "never call me chief"'
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={addPref}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-secondary"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-6">
          <button
            type="button"
            onClick={() => saveM.mutate(draft)}
            disabled={!dirty || saveM.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            <Save className="h-4 w-4" />
            {saveM.isPending ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (q.data) {
                const p = q.data.portrait;
                setDraft({
                  energy: p.energy ?? "",
                  mood: p.mood ?? "",
                  values_worldview: p.values_worldview ?? "",
                  interests_ideas: p.interests_ideas ?? "",
                  communication: p.communication ?? "",
                  freeform_notes: p.freeform_notes ?? "",
                  explicit_preferences: [...(p.explicit_preferences ?? [])],
                });
                setDirty(false);
              }
            }}
            disabled={!dirty}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-4 py-2 text-sm hover:bg-secondary disabled:opacity-40"
          >
            <RotateCcw className="h-4 w-4" />
            Discard
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => {
              if (confirm("Clear the entire portrait? DED will resynthesize it from your recent messages over the next few turns.")) {
                resetM.mutate();
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-background px-3 py-2 text-xs text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear portrait
          </button>
        </div>

        {style && style.sample_count > 0 && (
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-display font-semibold uppercase tracking-widest text-muted-foreground">
              Style fingerprint
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Statistical mannerism averages over your last ~{Math.min(style.sample_count, 40)}{" "}
              messages. DED mirrors these numbers when it writes back.
            </p>
            <dl className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <Stat label="Avg length" value={`${Math.round(style.avg_message_length)} ch`} />
              <Stat label="Profanity" value={`${(style.profanity_rate * 100).toFixed(1)}% words`} />
              <Stat label="Emoji" value={`${(style.emoji_rate * 1000).toFixed(1)} /1k`} />
              <Stat label="Caps" value={`${(style.caps_rate * 100).toFixed(1)}%`} />
              <Stat label="Contractions" value={`${(style.contraction_rate * 100).toFixed(1)}% words`} />
              <Stat label="Exclaim" value={`${(style.exclamation_rate * 1000).toFixed(1)} /1k`} />
              <Stat label="Questions" value={`${(style.question_rate * 1000).toFixed(1)} /1k`} />
              <Stat label="Samples" value={`${style.sample_count}`} />
            </dl>
          </section>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className="text-sm font-display font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </h2>
      {subtitle && <p className="mt-1 text-xs text-muted-foreground max-w-xl">{subtitle}</p>}
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </label>
        {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder="—"
        className="mt-2 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-mono">{value}</p>
    </div>
  );
}
