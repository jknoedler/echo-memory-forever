import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, RotateCcw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  deletePersonalityRule,
  listPersonalityRules,
  updatePersonalityRule,
} from "@/lib/personality.functions";

export const Route = createFileRoute("/_authenticated/personality")({
  component: PersonalityPage,
});

function PersonalityPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["personality"],
    queryFn: () => listPersonalityRules(),
  });

  const updateM = useMutation({
    mutationFn: (vars: { id: string; status: "active" | "under_review" | "confirmed" | "revoked" }) =>
      updatePersonalityRule({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["personality"] });
    },
  });

  const removeM = useMutation({
    mutationFn: (id: string) => deletePersonalityRule({ data: { id } }),
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["personality"] });
    },
  });

  const rules = q.data?.rules ?? [];
  const style = q.data?.style;
  const provisional = rules.filter((r) => r.status === "under_review");
  const active = rules.filter((r) => r.status === "active" || r.status === "confirmed");
  const revoked = rules.filter((r) => r.status === "revoked");

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-5 py-10 space-y-10">
        <header>
          <p className="text-xs uppercase tracking-widest text-primary">Personality</p>
          <h1 className="mt-1 text-3xl font-display tracking-tight">How DED reads you</h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl">
            DED tunes itself to your mannerisms and absorbs your direct corrections. Rules
            captured while you were emotionally activated stay provisional until a 24h
            recalibration check-in confirms or revokes them.
          </p>
        </header>

        {style && style.sample_count > 0 && (
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-display font-semibold uppercase tracking-widest text-muted-foreground">
              Your style fingerprint
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Rolling average over your last ~{Math.min(style.sample_count, 40)} messages.
              DED mirrors this in its replies.
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

        {provisional.length > 0 && (
          <Section
            title="Provisional rules (awaiting recalibration)"
            subtitle="You set these while you were heated. DED is honoring them for now and will surface a check-in task ~24h after capture."
          >
            {provisional.map((r) => (
              <RuleRow
                key={r.id}
                rule={r}
                onConfirm={() => updateM.mutate({ id: r.id, status: "confirmed" })}
                onRevoke={() => updateM.mutate({ id: r.id, status: "revoked" })}
                onDelete={() => removeM.mutate(r.id)}
              />
            ))}
          </Section>
        )}

        <Section
          title="Active rules"
          subtitle="DED treats these as binding. Edit by telling DED in chat, or remove here."
        >
          {active.length === 0 ? (
            <Empty>No rules captured yet. Tell DED in chat — "don't X anymore" or "always be Y" — and they'll appear here.</Empty>
          ) : (
            active.map((r) => (
              <RuleRow
                key={r.id}
                rule={r}
                onReview={() => updateM.mutate({ id: r.id, status: "under_review" })}
                onDelete={() => removeM.mutate(r.id)}
              />
            ))
          )}
        </Section>

        {revoked.length > 0 && (
          <Section title="Revoked" subtitle="No longer applied.">
            {revoked.map((r) => (
              <RuleRow
                key={r.id}
                rule={r}
                onConfirm={() => updateM.mutate({ id: r.id, status: "active" })}
                onDelete={() => removeM.mutate(r.id)}
              />
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-display font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-xs text-muted-foreground max-w-xl">{subtitle}</p>}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
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

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-border bg-card px-4 py-6 text-center text-xs text-muted-foreground">
      {children}
    </p>
  );
}

type Rule = {
  id: string;
  directive: string;
  polarity: string;
  status: string;
  emotion_score: number;
  reason: string | null;
  created_at: string;
  recalibrate_after: string | null;
};

function RuleRow({
  rule,
  onConfirm,
  onRevoke,
  onReview,
  onDelete,
}: {
  rule: Rule;
  onConfirm?: () => void;
  onRevoke?: () => void;
  onReview?: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm">
            <span
              className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest mr-2 ${
                rule.polarity === "dont"
                  ? "bg-destructive/15 text-destructive"
                  : "bg-primary/15 text-primary"
              }`}
            >
              {rule.polarity === "dont" ? "Don't" : "Do"}
            </span>
            {rule.directive}
          </p>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {new Date(rule.created_at).toLocaleString()}
            {" · "}emotion {(rule.emotion_score * 100).toFixed(0)}%
            {rule.recalibrate_after && (
              <> · recalibrates {new Date(rule.recalibrate_after).toLocaleString()}</>
            )}
          </p>
          {rule.reason && (
            <p className="mt-1 text-[11px] text-muted-foreground italic">{rule.reason}</p>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          {onConfirm && (
            <button
              type="button"
              onClick={onConfirm}
              className="rounded-md border border-border bg-background p-1.5 text-xs hover:bg-primary hover:text-primary-foreground"
              aria-label="Confirm"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          )}
          {onRevoke && (
            <button
              type="button"
              onClick={onRevoke}
              className="rounded-md border border-border bg-background p-1.5 text-xs hover:bg-destructive hover:text-destructive-foreground"
              aria-label="Revoke"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {onReview && (
            <button
              type="button"
              onClick={onReview}
              className="rounded-md border border-border bg-background p-1.5 text-xs hover:bg-secondary"
              aria-label="Send back to review"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md border border-border bg-background p-1.5 text-xs hover:bg-destructive hover:text-destructive-foreground"
            aria-label="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
