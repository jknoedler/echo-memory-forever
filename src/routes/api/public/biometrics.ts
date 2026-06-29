// POST /api/public/biometrics
//
// External / on-device ingestion of biometric readings (heart rate, sleep, HRV,
// typing rhythm, etc.). Authenticated with the user's per-account shared
// secret + HMAC-SHA256 over the raw body. This avoids needing a full Supabase
// session from the device (e.g. an Apple Watch shortcut or a future native
// Mement0 shell can post here directly).
//
// Header: X-Mement0-User: <user_id>
// Header: X-Mement0-Signature: <hex hmac sha256 of body using biometrics_secret>
// Body: { readings: [{ kind: string, value: any, recorded_at?: iso }] }

import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/biometrics")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = request.headers.get("x-mement0-user");
        const signature = request.headers.get("x-mement0-signature");
        const raw = await request.text();

        if (!userId || !signature) {
          return jsonResp({ error: "Missing auth headers" }, 401);
        }

        // Load secret with the admin client (caller is not signed in)
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: settings, error: sErr } = await supabaseAdmin
          .from("user_settings")
          .select("biometrics_secret")
          .eq("user_id", userId)
          .maybeSingle();

        if (sErr || !settings?.biometrics_secret) {
          return jsonResp({ error: "Unknown user" }, 401);
        }

        const expected = createHmac("sha256", settings.biometrics_secret).update(raw).digest("hex");
        const sig = Buffer.from(signature, "hex");
        const exp = Buffer.from(expected, "hex");
        if (sig.length !== exp.length || !timingSafeEqual(sig, exp)) {
          return jsonResp({ error: "Invalid signature" }, 401);
        }

        let body: { readings?: Array<{ kind: string; value: unknown; recorded_at?: string }> };
        try {
          body = JSON.parse(raw);
        } catch {
          return jsonResp({ error: "Bad JSON" }, 400);
        }
        const readings = body.readings;
        if (!Array.isArray(readings) || readings.length === 0) {
          return jsonResp({ error: "readings[] required" }, 400);
        }
        if (readings.length > 200) {
          return jsonResp({ error: "max 200 readings per request" }, 400);
        }

        const rows = readings
          .filter((r) => r && typeof r.kind === "string")
          .slice(0, 200)
          .map((r) => ({
            user_id: userId,
            kind: r.kind.slice(0, 80),
            value: (r.value ?? null) as never,
            recorded_at: r.recorded_at ?? new Date().toISOString(),
          }));

        const { error } = await supabaseAdmin.from("biometrics").insert(rows);
        if (error) {
          console.error("[biometrics] insert", error);
          return jsonResp({ error: "Insert failed" }, 500);
        }
        return jsonResp({ ok: true, inserted: rows.length });
      },
    },
  },
});
