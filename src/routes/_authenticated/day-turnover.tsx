import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { getOrCreateTodayThread } from "@/lib/threads.functions";
import { Mement0Wordmark } from "@/components/mement0-logo";

export const Route = createFileRoute("/_authenticated/day-turnover")({
  component: DayTurnover,
});

// Transient landing page shown at local midnight. Reads today's daily root
// (creating it if the client is the first to notice the rollover), then
// forwards to /c/{todayId}. Any in-flight draft the user was typing is
// preserved in sessionStorage under `mement0_pending_prompt` and picked up
// by the chat page on mount.
function DayTurnover() {
  const navigate = useNavigate();
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    let tz = "UTC";
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz;
    } catch {}
    void (async () => {
      try {
        const t = await getOrCreateTodayThread({ data: { tz } });
        if (t) {
          navigate({ to: "/c/$threadId", params: { threadId: t.id }, replace: true });
          return;
        }
      } catch {
        /* fall through to /app which will retry */
      }
      navigate({ to: "/app", replace: true });
    })();
  }, [navigate]);

  return (
    <div className="flex flex-1 items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card ember-glow">
          <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-primary">New day</p>
          <p className="mt-1 text-2xl font-display tracking-tight">
            <Mement0Wordmark /> is turning the page…
          </p>
          <p className="mt-2 text-sm text-muted-foreground max-w-xs mx-auto">
            Your draft is safe. Continuity is preserved.
          </p>
        </div>
      </div>
    </div>
  );
}
