// POST /api/tts — text-to-speech via OpenAI directly.
// Body: JSON { text: string, voice?: string }
// Response: audio/mpeg bytes.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
        const token = auth.slice(7).trim();
        const supa = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
        );
        const { data: claims, error: aerr } = await supa.auth.getClaims(token);
        if (aerr || !claims?.claims?.sub) return new Response("Unauthorized", { status: 401 });

        const openaiKey = process.env.OPENAI_API_KEY;
        if (!openaiKey) {
          return new Response("TTS unavailable — OPENAI_API_KEY not configured", { status: 503 });
        }

        let body: { text?: string; voice?: string };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }
        const text = (body.text ?? "").trim().slice(0, 3500);
        if (!text) return new Response("text required", { status: 400 });

        const upstream = await fetch("https://api.openai.com/v1/audio/speech", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini-tts",
            input: text,
            voice: body.voice || "alloy",
            response_format: "mp3",
          }),
        });
        if (!upstream.ok) {
          const t = await upstream.text().catch(() => "");
          return new Response(`TTS failed: ${t}`, { status: upstream.status });
        }
        return new Response(upstream.body, {
          headers: {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
