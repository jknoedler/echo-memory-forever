// GET /api/debug/last-prompt — returns the most recent chat system-prompt
// payload (with the injected CALENDAR EVENTS block) for the authenticated
// user. Used in staging to verify what the model actually received.
//
// Requires a bearer token. The RLS policy on chat_debug_payloads already
// scopes rows by auth.uid(), so this endpoint only ever exposes the
// caller's own payloads.

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function isNewKey(v: string) {
  return v.startsWith("sb_publishable_") || v.startsWith("sb_secret_");
}

function makeUserSupabase(token: string) {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(url, key, {
    global: {
      fetch: (input, init) => {
        const headers = new Headers(
          typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
        );
        if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
        if (isNewKey(key) && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

export const Route = createFileRoute("/api/debug/last-prompt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }
        const token = authHeader.slice("Bearer ".length).trim();
        if (!token) return new Response("Unauthorized", { status: 401 });

        const supabase = makeUserSupabase(token);
        const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
        if (claimsErr || !claims?.claims?.sub) {
          return new Response("Unauthorized", { status: 401 });
        }

        const url = new URL(request.url);
        const threadId = url.searchParams.get("threadId");

        let q = supabase
          .from("chat_debug_payloads")
          .select(
            "id, thread_id, system_prompt, events_block, events_count, events_oldest, events_newest, stale_events_count, validator_status, retried, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(1);
        if (threadId) q = q.eq("thread_id", threadId);

        const { data, error } = await q;
        if (error) {
          return Response.json({ error: error.message }, { status: 500 });
        }
        if (!data || data.length === 0) {
          return Response.json({ payload: null, message: "No chat turns recorded yet." });
        }
        return Response.json({ payload: data[0] });
      },
    },
  },
});
