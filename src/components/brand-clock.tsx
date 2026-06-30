import { useEffect, useState } from "react";

/**
 * Lightweight wall clock for the header.
 *
 * Why this exists: the model has no internal sense of wall-clock time and
 * its perception of elapsed time between turns is warped. The chat API
 * already injects a TIME CONTEXT block on every send, but the user also
 * deserves to see the same timestamp the agent is reasoning from — that's
 * what this component renders.
 *
 * Anchor: the product is operated out of Pacific Time. We show the user's
 * own local time (so it never lies to them like a server-rendered "3 AM"
 * would) and tag the zone abbreviation, with a Pacific-anchor tooltip.
 */
export function getUserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles";
  } catch {
    return "America/Los_Angeles";
  }
}

function formatInZone(d: Date, tz: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: tz,
      timeZoneName: "short",
    }).format(d);
  } catch {
    return d.toLocaleTimeString();
  }
}

export function BrandClock({ className = "" }: { className?: string }) {
  const [now, setNow] = useState<Date>(() => new Date());
  const tz = getUserTimeZone();

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000 * 15);
    return () => window.clearInterval(id);
  }, []);

  const userLocal = formatInZone(now, tz);
  const pacific = formatInZone(now, "America/Los_Angeles");
  const sameZone = tz === "America/Los_Angeles";

  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground " +
        className
      }
      title={
        sameZone
          ? `Pacific Time · ${tz}`
          : `Your local time (${tz}). Mement0 is anchored to Pacific Time: ${pacific}.`
      }
      aria-label={`Current time ${userLocal}`}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary/70" />
      {userLocal}
    </span>
  );
}
