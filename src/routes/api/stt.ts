// POST /api/stt — speech-to-text via Lovable AI Gateway.
// Body: multipart/form-data with `file` audio blob.
// Auth: Bearer token (Supabase access token).
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/stt")({
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
        const { data: claims, error } = await supa.auth.getClaims(token);
        if (error || !claims?.claims?.sub) return new Response("Unauthorized", { status: 401 });

        const lovableKey = process.env.LOVABLE_API_KEY;
        if (!lovableKey) return new Response("LOVABLE_API_KEY missing", { status: 500 });

        let inForm: FormData;
        try {
          inForm = await request.formData();
        } catch {
          return new Response("Expected multipart/form-data", { status: 400 });
        }
        const file = inForm.get("file");
        if (!(file instanceof File) || file.size < 256) {
          return new Response("Empty or missing audio file", { status: 400 });
        }

        const out = new FormData();
        out.append("model", "openai/gpt-4o-mini-transcribe");
        // Name the part for its container; webm default.
        const mime = file.type || "audio/webm";
        const ext =
          mime.includes("wav") ? "wav" :
          mime.includes("mp3") || mime.includes("mpeg") ? "mp3" :
          mime.includes("mp4") || mime.includes("m4a") ? "m4a" :
          mime.includes("ogg") ? "ogg" : "webm";
        out.append("file", file, `recording.${ext}`);

        const upstream = await fetch(
          "https://ai.gateway.lovable.dev/v1/audio/transcriptions",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${lovableKey}` },
            body: out,
          },
        );
        if (!upstream.ok) {
          const txt = await upstream.text().catch(() => "");
          return new Response(`Transcription failed: ${txt}`, { status: upstream.status });
        }
        const json = (await upstream.json()) as { text?: string };
        return new Response(JSON.stringify({ text: json.text ?? "" }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
