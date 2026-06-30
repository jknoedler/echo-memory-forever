// Calendar-context post-processing validator.
//
// When the system prompt includes a non-empty CALENDAR EVENTS block AND the
// user is asking about scheduling / dates / events, we expect the model to
// cite at least one ISO date (YYYY-MM-DD) that actually appears in the
// injected block. Anything else is a hallucination and we should retry with
// stricter instructions.

const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/g;

const DATE_INTENT = [
  /\b(when|date|day|schedule|calendar|event|events|upcoming|next|past|last|previous|coming|deadline|due|appointment|birthday|anniversary)\b/i,
  /\b(today|tomorrow|yesterday|this week|next week|last week|this month|next month)\b/i,
];

export function userAsksAboutDates(userText: string | null | undefined): boolean {
  if (!userText) return false;
  const head = userText.slice(0, 2000);
  return DATE_INTENT.some((p) => p.test(head));
}

export function extractIsoDates(text: string | null | undefined): string[] {
  if (!text) return [];
  return Array.from(text.matchAll(ISO_DATE)).map((m) => m[0]);
}

export type CalendarValidation =
  | { ok: true; reason: "no-events" | "no-date-intent" | "cited" }
  | { ok: false; reason: "missing-iso-date" | "wrong-date"; expected: string[] };

export function validateCalendarCitation(opts: {
  eventsBlock: string;
  userText: string;
  reply: string;
}): CalendarValidation {
  const eventDates = extractIsoDates(opts.eventsBlock);
  if (eventDates.length === 0) return { ok: true, reason: "no-events" };
  if (!userAsksAboutDates(opts.userText)) return { ok: true, reason: "no-date-intent" };

  const replyDates = extractIsoDates(opts.reply);
  if (replyDates.length === 0) {
    return { ok: false, reason: "missing-iso-date", expected: eventDates.slice(0, 10) };
  }
  const cited = replyDates.some((d) => eventDates.includes(d));
  if (cited) return { ok: true, reason: "cited" };
  return { ok: false, reason: "wrong-date", expected: eventDates.slice(0, 10) };
}

// Computes timestamp range + flags stale entries (>STALE_DAYS old). The
// chat route logs this every turn so we can spot when the injected
// calendar window has drifted out of usefulness.
export function summarizeEventsBlock(
  eventsBlock: string,
  staleDays = 365,
): {
  count: number;
  oldest: string | null;
  newest: string | null;
  staleCount: number;
  staleThresholdDays: number;
} {
  const dates = extractIsoDates(eventsBlock)
    .map((d) => new Date(d))
    .filter((d) => !Number.isNaN(d.getTime()));
  if (!dates.length) {
    return { count: 0, oldest: null, newest: null, staleCount: 0, staleThresholdDays: staleDays };
  }
  dates.sort((a, b) => a.getTime() - b.getTime());
  const cutoff = Date.now() - staleDays * 86_400_000;
  const staleCount = dates.filter((d) => d.getTime() < cutoff).length;
  return {
    count: dates.length,
    oldest: dates[0].toISOString(),
    newest: dates[dates.length - 1].toISOString(),
    staleCount,
    staleThresholdDays: staleDays,
  };
}

export const STRICT_DATE_RETRY_SUFFIX = `

### CALENDAR CITATION REQUIREMENT (RETRY)
Your previous reply failed validation: the user asked about dated material and you did not cite any ISO date (YYYY-MM-DD) that appears in the CALENDAR EVENTS block above. Try again. Rules:
- Quote at least one exact YYYY-MM-DD that appears verbatim in CALENDAR EVENTS.
- Never invent a date. If the block does not contain the answer, say so plainly.
- The CALENDAR EVENTS block is authoritative for all dates; do not estimate from training data.`;
