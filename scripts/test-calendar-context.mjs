#!/usr/bin/env node
// End-to-end check: every /api/chat turn must inject the latest CALENDAR
// EVENTS block from the database, and the model must be able to cite an
// exact ISO date from it.
//
// Usage:
//   TEST_BEARER=<supabase access token> \
//   TEST_BASE_URL=http://localhost:8080 \
//   TEST_SUPABASE_URL=https://<ref>.supabase.co \
//   TEST_SUPABASE_PUBLISHABLE_KEY=<key> \
//     node scripts/test-calendar-context.mjs
//
// The bearer must belong to a real signed-in user (the same user the
// debug endpoint scopes by). The script:
//   1. Inserts a calendar event with a unique title and a future date.
//   2. Creates a thread.
//   3. Posts a chat asking "When is <unique title>?".
//   4. Streams the response and asserts the model's reply contains the
//      injected ISO date.
//   5. Calls /api/debug/last-prompt and asserts the events_block contains
//      the same ISO date — i.e. it actually reached the system prompt.

const base = process.env.TEST_BASE_URL || "http://localhost:8080";
const bearer = process.env.TEST_BEARER;
const supaUrl = process.env.TEST_SUPABASE_URL;
const supaKey = process.env.TEST_SUPABASE_PUBLISHABLE_KEY;

if (!bearer || !supaUrl || !supaKey) {
  console.log(
    "[skip] Set TEST_BEARER, TEST_SUPABASE_URL, TEST_SUPABASE_PUBLISHABLE_KEY to run the calendar-context integration test.",
  );
  process.exit(0);
}

const supaHeaders = {
  apikey: supaKey,
  Authorization: `Bearer ${bearer}`,
  "content-type": "application/json",
};

function isoDay(daysFromNow) {
  const d = new Date(Date.now() + daysFromNow * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function assert(cond, msg) {
  if (!cond) {
    console.error("✖", msg);
    process.exit(1);
  }
  console.log("✓", msg);
}

const uniqueTitle = `cal-test-${Math.random().toString(36).slice(2, 8)}`;
const targetDate = isoDay(14);

// 1. Insert event
const evRes = await fetch(`${supaUrl}/rest/v1/events`, {
  method: "POST",
  headers: { ...supaHeaders, Prefer: "return=representation" },
  body: JSON.stringify({
    title: uniqueTitle,
    occurred_at: `${targetDate}T12:00:00.000Z`,
    all_day: true,
  }),
});
assert(evRes.ok, `insert event (${evRes.status})`);

// 2. Create thread
const thrRes = await fetch(`${supaUrl}/rest/v1/threads`, {
  method: "POST",
  headers: { ...supaHeaders, Prefer: "return=representation" },
  body: JSON.stringify({ title: "calendar-test" }),
});
assert(thrRes.ok, `create thread (${thrRes.status})`);
const [thread] = await thrRes.json();
const threadId = thread.id;

// 3. Post chat
const chatRes = await fetch(`${base}/api/chat`, {
  method: "POST",
  headers: { Authorization: `Bearer ${bearer}`, "content-type": "application/json" },
  body: JSON.stringify({
    threadId,
    messages: [
      {
        id: crypto.randomUUID(),
        role: "user",
        parts: [{ type: "text", text: `When is ${uniqueTitle} on my calendar? Give me the exact date.` }],
      },
    ],
  }),
});
assert(chatRes.ok, `POST /api/chat (${chatRes.status})`);

// Drain the UI message stream and concatenate text deltas.
let reply = "";
const reader = chatRes.body.getReader();
const decoder = new TextDecoder();
let buf = "";
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += decoder.decode(value, { stream: true });
  // SDK uses JSON-lines or SSE-style "data: {...}\n\n". Handle both.
  for (const line of buf.split("\n")) {
    const m = line.match(/"text-delta"[\s\S]*?"delta":"([^"]*)"/);
    if (m) reply += m[1];
  }
  buf = buf.split("\n").slice(-1)[0];
}

console.log(`\nModel reply (${reply.length} chars):\n${reply.slice(0, 500)}\n`);
assert(reply.includes(targetDate), `model reply cites the injected date (${targetDate})`);

// 4. Verify debug endpoint shows the event in the system prompt.
const dbg = await fetch(`${base}/api/debug/last-prompt?threadId=${threadId}`, {
  headers: { Authorization: `Bearer ${bearer}` },
});
assert(dbg.ok, `GET /api/debug/last-prompt (${dbg.status})`);
const dbgJson = await dbg.json();
assert(
  dbgJson.payload?.events_block?.includes(uniqueTitle),
  `debug payload contains the test event (${uniqueTitle})`,
);
assert(
  dbgJson.payload?.events_block?.includes(targetDate),
  `debug payload contains the target ISO date (${targetDate})`,
);

console.log("\nAll calendar-context assertions passed.");
