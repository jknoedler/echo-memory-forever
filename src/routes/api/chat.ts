// POST /api/chat — streaming chat with RAG memory retrieval.
//
// Body: { messages: UIMessage[], threadId: string }
//
// Flow:
//   1. Verify the caller via Supabase auth (bearer token).
//   2. Load user settings + recent biometrics.
//   3. Embed the latest user message and pull top-K relevant memories.
//   4. Build the system prompt: persona + memory context + biometric context.
//   5. Stream the model response back as an AI-SDK UI message stream.
//   6. After streaming ends, save the user message + assistant reply to the
//      messages table AND embed them into the memories table for future RAG.

import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import { resolveProvider } from "@/lib/ai-provider.server";
import { DED_PERSONA } from "@/lib/persona";
import { embedText } from "@/lib/embeddings.server";
import {
  buildPersonalityBlock,
  captureDirective,
  sweepRecalibrations,
  updateStyleFingerprint,
} from "@/lib/personality.server";
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

function formatBiometric(b: { kind: string; value: unknown; recorded_at: string }): string {
  const v = typeof b.value === "object" ? JSON.stringify(b.value) : String(b.value);
  return `[${b.recorded_at}] ${b.kind}: ${v}`;
}

function extractUserText(msg: UIMessage): string {
  if (!msg) return "";
  const parts = (msg as { parts?: Array<{ type: string; text?: string }> }).parts;
  if (Array.isArray(parts)) {
    return parts
      .filter((p) => p.type === "text")
      .map((p) => p.text ?? "")
      .join(" ")
      .trim();
  }
  return ((msg as unknown as { content?: string }).content ?? "").toString().trim();
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }
        const token = authHeader.slice("Bearer ".length).trim();
        if (!token) return new Response("Unauthorized", { status: 401 });

        let body: { messages?: UIMessage[]; threadId?: string };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }

        const messages = body.messages;
        const threadId = body.threadId;
        if (!Array.isArray(messages) || !threadId) {
          return new Response("messages[] and threadId required", { status: 400 });
        }

        const supabase = makeUserSupabase(token);

        // Verify caller + thread ownership
        const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
        if (claimsErr || !claims?.claims?.sub) {
          return new Response("Unauthorized", { status: 401 });
        }
        const userId = claims.claims.sub as string;

        const { data: thread, error: threadErr } = await supabase
          .from("threads")
          .select("id, user_id, title")
          .eq("id", threadId)
          .maybeSingle();
        if (threadErr || !thread || thread.user_id !== userId) {
          return new Response("Thread not found", { status: 404 });
        }

        // Load settings
        const { data: settings } = await supabase
          .from("user_settings")
          .select(
            "provider, model, custom_base_url, custom_api_key, custom_model_id, system_prompt_override, active_provider_id",
          )
          .eq("user_id", userId)
          .maybeSingle();

        const cfg = {
          provider: settings?.provider ?? "lovable",
          model: settings?.model ?? "google/gemini-3-flash-preview",
          custom_base_url: settings?.custom_base_url ?? null,
          custom_api_key: settings?.custom_api_key ?? null,
          custom_model_id: settings?.custom_model_id ?? null,
        };

        // If user has selected a saved provider from their library, load it.
        let activeProvider = null as null | {
          catalog_id: string;
          base_url: string | null;
          api_key: string | null;
          default_model: string | null;
        };
        if (settings?.active_provider_id) {
          const { data: ap } = await supabase
            .from("user_providers")
            .select("catalog_id, base_url, api_key, default_model")
            .eq("id", settings.active_provider_id)
            .maybeSingle();
          if (ap) activeProvider = ap;
        }


        const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
        const userText = lastUserMsg ? extractUserText(lastUserMsg) : "";

        // Retrieve memories
        let memoryBlock = "";
        if (userText) {
          const vec = await embedText(userText);
          if (vec) {
            const { data: hits } = await supabase.rpc("match_memories", {
              query_embedding: vec as unknown as string,
              match_count: 8,
            });
            if (hits && hits.length) {
              memoryBlock = hits
                .map(
                  (h: { content: string; source: string; created_at: string; similarity: number }) =>
                    `- (${h.source}, ${new Date(h.created_at).toISOString().slice(0, 10)}) ${h.content}`,
                )
                .join("\n");
            }
          }
        }

        // Recent biometrics (last 8)
        const { data: bios } = await supabase
          .from("biometrics")
          .select("kind, value, recorded_at")
          .order("recorded_at", { ascending: false })
          .limit(8);
        const bioBlock = (bios ?? []).map(formatBiometric).join("\n");

        // Pending HOTL tasks (so the model can reference them)
        const { data: pending } = await supabase
          .from("staged_tasks")
          .select("id, title, due_at")
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(10);
        const pendingBlock = (pending ?? [])
          .map((p) => `- ${p.title}${p.due_at ? ` (due ${p.due_at})` : ""}`)
          .join("\n");

        // Continuity state for this thread
        const { data: contThread } = await supabase
          .from("threads")
          .select("continuity_status, continuity_note, last_message_at")
          .eq("id", threadId)
          .maybeSingle();
        const idleMs = contThread?.last_message_at
          ? Date.now() - new Date(contThread.last_message_at).getTime()
          : 0;
        const isStaleOpen =
          contThread?.continuity_status === "open" && idleMs > 12 * 60 * 60 * 1000;
        const continuityBlock = isStaleOpen
          ? `STALE_OPEN=true. This thread was abandoned ${Math.round(idleMs / 3_600_000)}h ago with unresolved material${contThread?.continuity_note ? ` (note: ${contThread.continuity_note})` : ""}. Lead the next assistant turn with a direct, blunt check-in that references the unresolved thread — no greeting, no preamble.`
          : `STALE_OPEN=false. status=${contThread?.continuity_status ?? "open"}.`;

        const baseSystem = settings?.system_prompt_override?.trim() || DED_PERSONA;
        const system = [
          baseSystem,
          "",
          "### RETRIEVED MEMORY CONTEXT",
          memoryBlock || "(no relevant memories retrieved)",
          "",
          "### RECENT BIOMETRICS",
          bioBlock || "(no biometric data)",
          "",
          "### STAGED TASKS PENDING APPROVAL",
          pendingBlock || "(none)",
          "",
          "### CONTINUITY",
          continuityBlock,
        ].join("\n");

        // Resolve provider
        let model;
        try {
          const resolved = resolveProvider(cfg, {
            lovableApiKey: process.env.LOVABLE_API_KEY,
            openaiApiKey: process.env.OPENAI_API_KEY,
            activeProvider,
          });
          model = resolved.model;
        } catch (e) {
          return new Response(
            `Provider error: ${e instanceof Error ? e.message : String(e)}`,
            { status: 500 },
          );
        }

        // Save the user message now (before streaming) so it shows up even
        // if the stream fails midway.
        if (lastUserMsg && userText) {
          await supabase.from("messages").insert({
            thread_id: threadId,
            user_id: userId,
            role: "user",
            content: userText,
            parts: (lastUserMsg as unknown as { parts?: unknown }).parts as never,
          });
          // Embed user message into memory (best-effort, no await blocking the response).
          embedText(userText).then(async (vec) => {
            if (!vec) return;
            await supabase.from("memories").insert({
              user_id: userId,
              thread_id: threadId,
              source: "message",
              content: userText,
              embedding: vec as unknown as string,
              metadata: { role: "user" },
            });
          }).catch(() => {});

          // Bump thread title from first user message if still default
          if (thread.title === "New conversation") {
            const title = userText.slice(0, 80);
            await supabase
              .from("threads")
              .update({ title, last_message_at: new Date().toISOString() })
              .eq("id", threadId);
          } else {
            await supabase
              .from("threads")
              .update({ last_message_at: new Date().toISOString() })
              .eq("id", threadId);
          }
        }

        const result = streamText({
          model,
          system,
          messages: await convertToModelMessages(messages),
          onFinish: async (event) => {
            const assistantText = event.text ?? "";
            if (!assistantText) return;
            await supabase.from("messages").insert({
              thread_id: threadId,
              user_id: userId,
              role: "assistant",
              content: assistantText,
              parts: null,
            });
            const vec = await embedText(assistantText);
            if (vec) {
              await supabase.from("memories").insert({
                user_id: userId,
                thread_id: threadId,
                source: "message",
                content: assistantText,
                embedding: vec as unknown as string,
                metadata: { role: "assistant" },
              });
            }
            await supabase
              .from("threads")
              .update({ last_message_at: new Date().toISOString() })
              .eq("id", threadId);
          },
        });

        return result.toUIMessageStreamResponse({ originalMessages: messages });
      },
    },
  },
});
