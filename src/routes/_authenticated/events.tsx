import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { createEvent, deleteEvent, listEvents } from "@/lib/events.functions";
import { BRAND, pageMeta } from "@/lib/brand-meta";

export const Route = createFileRoute("/_authenticated/events")({
  component: EventsPage,
  head: () => ({
    meta: [
      ...pageMeta({
        title: "Calendar — MementØ",
        description: "Your dated milestones, anchored for the archive.",
        ogDescription: "Private calendar anchors for your MementØ archive.",
        ogUrl: `${BRAND.domain}/events`,
      }),
    ],
    links: [{ rel: "canonical", href: `${BRAND.domain}/events` }],
  }),
});

function fmtDate(iso: string, allDay: boolean) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(allDay ? {} : { hour: "numeric", minute: "2-digit" }),
  }).format(d);
}

function EventsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listEvents);
  const create = useServerFn(createEvent);
  const del = useServerFn(deleteEvent);

  const eventsQ = useQuery({ queryKey: ["events"], queryFn: () => list({}) });

  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");

  const createM = useMutation({
    mutationFn: () =>
      create({
        data: {
          title,
          notes: notes || null,
          occurred_at: time ? `${date}T${time}` : `${date}T12:00`,
          all_day: !time,
        },
      }),
    onSuccess: () => {
      setTitle("");
      setNotes("");
      setTime("");
      qc.invalidateQueries({ queryKey: ["events"] });
      toast.success("Event saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const events = eventsQ.data ?? [];

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-5 py-8 space-y-8">
        <header className="flex items-center gap-3">
          <CalendarDays className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
            <p className="text-sm text-muted-foreground">
              Dates the archive will remember exactly. Anniversaries, trips, milestones — anything you'll want
              to ask "when did that happen?" about later.
            </p>
          </div>
        </header>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            createM.mutate();
          }}
          className="rounded-xl border border-border bg-card p-4 space-y-3"
        >
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What happened?"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              placeholder="Time (optional)"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            rows={2}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={createM.isPending || !title.trim()}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Add to archive
            </button>
          </div>
        </form>

        <ul className="space-y-2">
          {eventsQ.isLoading && <li className="text-sm text-muted-foreground">Loading…</li>}
          {!eventsQ.isLoading && events.length === 0 && (
            <li className="text-sm text-muted-foreground">No events yet.</li>
          )}
          {events.map((ev) => (
            <li
              key={ev.id}
              className="flex items-start gap-3 rounded-lg border border-border bg-card p-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{ev.title}</p>
                <p className="text-xs text-muted-foreground">{fmtDate(ev.occurred_at, ev.all_day)}</p>
                {ev.notes && (
                  <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">{ev.notes}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => delM.mutate(ev.id)}
                className="p-1.5 text-muted-foreground hover:text-destructive rounded-md"
                aria-label="Delete event"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </AppShell>
  );
}
