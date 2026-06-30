// POST /api/stt — speech-to-text. Prefers Groq whisper-large-v3 (fast +
// cheap), falls back to OpenAI whisper-1 when no Groq key is configured.
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

        const groqKey = process.env.GROQ_API_KEY;
        const openaiKey = process.env.OPENAI_API_KEY;
        if (!groqKey && !openaiKey) {
          return new Response(
            "Transcription unavailable — configure GROQ_API_KEY or OPENAI_API_KEY",
            { status: 503 },
          );
        }

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

        const mime = file.type || "audio/webm";
        const ext =
          mime.includes("wav") ? "wav" :
          mime.includes("mp3") || mime.includes("mpeg") ? "mp3" :
          mime.includes("mp4") || mime.includes("m4a") ? "m4a" :
          mime.includes("ogg") ? "ogg" : "webm";

        const out = new FormData();
        const useGroq = !!groqKey;
        out.append("model", useGroq ? "whisper-large-v3" : "whisper-1");
        out.append("file", file, `recording.${ext}`);

        const url = useGroq
          ? "https://api.groq.com/openai/v1/audio/transcriptions"
          : "https://api.openai.com/v1/audio/transcriptions";
        const key = useGroq ? groqKey! : openaiKey!;

        const upstream = await fetch(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
          body: out,
        });
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
