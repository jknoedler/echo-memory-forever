import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock, X } from "lucide-react";
import { toast } from "sonner";
import { decideStagedTask, listStagedTasks } from "@/lib/tasks.functions";

export const Route = createFileRoute("/_authenticated/tasks")({
  component: TasksPage,
});

function TasksPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["staged_tasks"], queryFn: () => listStagedTasks() });
  const m = useMutation({
    mutationFn: (vars: { id: string; decision: "approved" | "rejected" }) =>
      decideStagedTask({ data: vars }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staged_tasks"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const groups = {
    pending: q.data?.filter((t) => t.status === "pending") ?? [],
    done: q.data?.filter((t) => t.status !== "pending") ?? [],
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-5 py-10">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-widest text-primary">HOTL</p>
          <h1 className="mt-1 text-3xl font-display tracking-tight">Staged for delivery</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Drafts the agent has prepared on your behalf. Approve to commit. Reject to discard.
          </p>
        </header>

        <Section title="Pending" count={groups.pending.length}>
          {groups.pending.length === 0 ? (
            <Empty body="Nothing staged. The agent is waiting." />
          ) : (
            <ul className="space-y-3">
              {groups.pending.map((t) => (
                <li
                  key={t.id}
                  className="rounded-lg border border-border bg-card p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-medium">{t.title}</h3>
                      {t.description && (
                        <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
                          {t.description}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(t.created_at).toLocaleString()}
                        </span>
                        {t.due_at && <span>due {new Date(t.due_at).toLocaleString()}</span>}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => m.mutate({ id: t.id, decision: "approved" })}
                        className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                      >
                        <Check className="h-3 w-3" /> Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => m.mutate({ id: t.id, decision: "rejected" })}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-secondary"
                      >
                        <X className="h-3 w-3" /> Reject
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {groups.done.length > 0 && (
          <Section title="Resolved" count={groups.done.length}>
            <ul className="space-y-2">
              {groups.done.map((t) => (
                <li
                  key={t.id}
                  className="rounded-md border border-border bg-card/40 px-4 py-3 text-sm flex items-center justify-between"
                >
                  <span className="truncate">{t.title}</span>
                  <span className="text-xs text-muted-foreground uppercase tracking-widest">
                    {t.status}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">
        {title} <span className="ml-1 text-foreground">{count}</span>
      </h2>
      {children}
    </section>
  );
}

function Empty({ body }: { body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      {body}
    </div>
  );
}
