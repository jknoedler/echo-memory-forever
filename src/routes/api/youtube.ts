// POST /api/youtube — ingest a YouTube URL.
//
// Returns { videoId, title, author, transcript, thumbnails }.
// Auth: requires a Supabase bearer token (same convention as /api/chat).
// We do not store anything here — the client takes the ingest result and
// composes it into the next user message (transcript text + thumbnail
// images), so it flows through the normal chat path.

import { createFileRoute } from "@tanstack/react-router";
import { YoutubeTranscript } from "youtube-transcript";
import { createClient } from "@supabase/supabase-js";
import {
  canonicalThumbnails,
  extractYouTubeIds,
  type YouTubeIngest,
} from "@/lib/youtube";
import type { Database } from "@/integrations/supabase/types";

function isNewKey(v: string) {
  return v.startsWith("sb_publishable_") || v.startsWith("sb_secret_");
}
function supaFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    if (isNewKey(key) && headers.get("Authorization") === `Bearer ${key}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

function makeUserSupabase(token: string) {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(url, key, {
    global: {
      fetch: supaFetch(key),
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

async function fetchOEmbed(
  videoId: string,
): Promise<{ title: string | null; author: string | null }> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${videoId}`,
      )}&format=json`,
      { headers: { "User-Agent": "Mement0/1.0" } },
    );
    if (!res.ok) return { title: null, author: null };
    const j = (await res.json()) as { title?: string; author_name?: string };
    return { title: j.title ?? null, author: j.author_name ?? null };
  } catch {
    return { title: null, author: null };
  }
}

async function fetchTranscript(videoId: string): Promise<string | null> {
  try {
    const chunks = await YoutubeTranscript.fetchTranscript(videoId);
    if (!chunks?.length) return null;
    // Stitch into one block with rough timestamps every ~30s.
    let last = -Infinity;
    const lines: string[] = [];
    for (const c of chunks) {
      const t = Math.floor((c.offset ?? 0) / 1000);
      if (t - last >= 30) {
        const m = Math.floor(t / 60);
        const s = (t % 60).toString().padStart(2, "0");
        lines.push(`\n[${m}:${s}]`);
        last = t;
      }
      lines.push(c.text.replace(/\s+/g, " ").trim());
    }
    return lines.join(" ").trim();
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/youtube")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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

        let body: { url?: string };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }
        const url = (body.url ?? "").toString().trim();
        if (!url) return new Response("url required", { status: 400 });

        const ids = extractYouTubeIds(url);
        if (!ids.length) {
          return Response.json(
            { error: "No YouTube video id found in url" },
            { status: 400 },
          );
        }
        const videoId = ids[0];

        const [meta, transcript] = await Promise.all([
          fetchOEmbed(videoId),
          fetchTranscript(videoId),
        ]);

        const out: YouTubeIngest = {
          videoId,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          title: meta.title,
          author: meta.author,
          transcript,
          transcriptSource: transcript ? "captions" : "none",
          thumbnails: canonicalThumbnails(videoId),
        };

        return Response.json(out);
      },
    },
  },
});
