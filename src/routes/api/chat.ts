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
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
} from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createClient } from "@supabase/supabase-js";
import { resolveProvider } from "@/lib/ai-provider.server";
import { parseModelSwitch } from "@/lib/model-switch";
import { DED_PERSONA } from "@/lib/persona";
import { embedText } from "@/lib/embeddings.server";
import {
  buildPersonalityBlock,
  maybeSynthesizePortrait,
  updateStyleFingerprint,
} from "@/lib/personality.server";
import { FALLBACK_SYSTEM_SUFFIX, looksLikeRefusal, shouldPreemptToFallback } from "@/lib/refusal";
import {
  STRICT_DATE_RETRY_SUFFIX,
  summarizeEventsBlock,
  validateCalendarCitation,
} from "@/lib/calendar-validator";
import {
  autoResolveFollowups,
  buildFollowupBlock,
  extractAndSaveTurn,
} from "@/lib/followups.server";
import type { Database } from "@/integrations/supabase/types";

// Detect upstream 402 (credits exhausted) / 429 (rate-limited) failures so
// we can route straight to the configured fallback (Venice by default)
// instead of surfacing the gateway error to the user.
function isCreditsOrRateLimitError(e: unknown): boolean {
  const anyE = e as { statusCode?: number; status?: number; message?: string; cause?: { statusCode?: number } } | null;
  const code = anyE?.statusCode ?? anyE?.status ?? anyE?.cause?.statusCode;
  if (code === 402 || code === 429) return true;
  const msg = (anyE?.message ?? "").toLowerCase();
  return /\b(402|429)\b/.test(msg) || msg.includes("insufficient_quota") || msg.includes("rate limit") || msg.includes("credits");
}

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

function stripFallbackBanner(text: string): string {
  return text.replace(
    /^\s*↻?\s*Primary model declined\s+[—-]\s*capability fallback engaged\.\s*/i,
    "",
  );
}

function sanitizeMessageForModel(msg: UIMessage): UIMessage {
  const parts = (msg as { parts?: UIMessage["parts"] }).parts;
  if (!Array.isArray(parts)) return msg;
  return {
    ...msg,
    parts: parts.map((part) =>
      part.type === "text"
        ? { ...part, text: stripFallbackBanner(part.text) }
        : part,
    ),
  };
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

        let body: { messages?: UIMessage[]; threadId?: string; tz?: string };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }

        const messages = body.messages;
        const threadId = body.threadId;
        const userTz = (typeof body.tz === "string" && body.tz) || "America/Los_Angeles";
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

        const threadRes = await (supabase as unknown as {
          from: (t: string) => {
            select: (c: string) => {
              eq: (col: string, v: unknown) => {
                maybeSingle: () => Promise<{
                  data:
                    | {
                        id: string;
                        user_id: string;
                        title: string;
                        is_daily_root: boolean | null;
                        carried_from_thread_id: string | null;
                        day_key: string | null;
                      }
                    | null;
                  error: { message: string } | null;
                }>;
              };
            };
          };
        })
          .from("threads")
          .select("id, user_id, title, is_daily_root, carried_from_thread_id, day_key")
          .eq("id", threadId)
          .maybeSingle();
        const thread = threadRes.data;
        if (threadRes.error || !thread || thread.user_id !== userId) {
          return new Response("Thread not found", { status: 404 });
        }



        // Load settings
        const { data: settings } = await supabase
          .from("user_settings")
          .select(
            "provider, model, custom_base_url, custom_api_key, custom_model_id, system_prompt_override, active_provider_id, fallback_provider_id, fallback_provider_kind",
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

        // Capability-fallback provider. Shipped built-ins are OpenRouter-free
        // only; the fallback path either uses another OR free model on the
        // project key or (if the user configured one) a saved BYO provider.
        let fallbackProvider = null as null | {
          catalog_id: string;
          base_url: string | null;
          api_key: string | null;
          default_model: string | null;
        };
        type FbKind = "openrouter";
        const FB_ENV: Record<FbKind, string | undefined> = {
          openrouter: process.env.OPENROUTER_API_KEY,
        };
        let fallbackEnvKind: FbKind | null = null;
        const requested = settings?.fallback_provider_kind as FbKind | undefined;
        if (requested && FB_ENV[requested]) {
          fallbackEnvKind = requested;
        } else if (
          settings?.fallback_provider_id &&
          settings.fallback_provider_id !== settings.active_provider_id
        ) {
          const { data: fb } = await supabase
            .from("user_providers")
            .select("catalog_id, base_url, api_key, default_model")
            .eq("id", settings.fallback_provider_id)
            .maybeSingle();
          if (fb) fallbackProvider = fb;
        } else if (!settings?.fallback_provider_kind && !settings?.fallback_provider_id) {
          // No explicit fallback configured — default to OpenRouter free.
          if (FB_ENV.openrouter) fallbackEnvKind = "openrouter";
        }






        const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
        const userText = lastUserMsg ? extractUserText(lastUserMsg) : "";

        // Create a chat_jobs row up front. If this request completes normally,
        // we mark it 'complete' at the end. If the client disconnects and the
        // Worker terminates before we finish, the background cron worker
        // (/api/public/hooks/process-chat-jobs) reclaims the row after 90s
        // and finishes the reply so it's waiting for the user on reload.
        let jobId: string | null = null;
        try {
          const { data: job } = await supabase
            .from("chat_jobs")
            .insert({
              user_id: userId,
              thread_id: threadId,
              status: "processing",
              request_payload: { messages, tz: userTz } as unknown as never,
              started_at: new Date().toISOString(),
              locked_at: new Date().toISOString(),
              attempts: 1,
            })
            .select("id")
            .maybeSingle();
          jobId = job?.id ?? null;
        } catch (e) {
          console.warn("[chat] failed to create chat_jobs row (continuing):", e);
        }


        // If the user brought a staged follow-up topic up on their own,
        // resolve it now — before the model sees the pending block — so
        // it doesn't ask a redundant "hey, whatever happened with X".
        const autoResolved = userText
          ? await autoResolveFollowups(supabase, userId, userText)
          : [];
        if (autoResolved.length) {
          console.log(
            `[chat] auto-resolved ${autoResolved.length} followup(s) from user initiative: ${autoResolved.join(", ")}`,
          );
        }


        // In-chat model switch: "use gemini pro", "switch to groq", etc.
        // Apply BEFORE resolving the provider so the new model serves this turn.
        let switchedTo: { provider: string; model: string; label: string } | null = null;
        const wanted = parseModelSwitch(userText);
        if (wanted) {
          // Clear any saved library provider so the built-in kind takes over.
          cfg.provider = wanted.provider;
          cfg.model = wanted.model;
          activeProvider = null;
          switchedTo = wanted;
          await supabase
            .from("user_settings")
            .update({
              provider: wanted.provider,
              model: wanted.model,
              active_provider_id: null,
            })
            .eq("user_id", userId);
        }

        // TWO-TIER MEMORY
        //   HOT (RAM):      last 6 months, chronological, always injected.
        //                   Working recall — recent life, keeps continuity
        //                   across sessions without needing a semantic hit.
        //   COLD (ARCHIVE): everything ever recorded, retrieved by semantic
        //                   similarity only. Eternal. Surfaces "that thing
        //                   from 3 years ago" when the current turn relates.
        //
        // Both blocks are READ-ONLY context. The model recalls from them; it
        // does NOT fine-tune, "learn", or adjust its weights from anything
        // here. That separation is what keeps recall accurate instead of
        // drifting into hallucinated confabulation.
        const HOT_WINDOW_MS = 6 * 30 * 24 * 3600 * 1000; // ~6 months
        const hotCutoffIso = new Date(Date.now() - HOT_WINDOW_MS).toISOString();

        // COLD — semantic across the entire archive. Uses recall_archive so
        // each hit carries the thread_id + message-level timestamp; the
        // model can then quote and DEEP-LINK past moments back to the user
        // via [<time>](/c/<threadId>?t=<memoryId>) instead of vaguely
        // gesturing at "last week".
        let archiveBlock = "";
        if (userText) {
          const vec = await embedText(userText);
          if (vec) {
            const { data: hits } = await (supabase as unknown as {
              rpc: (name: string, args: Record<string, unknown>) => Promise<{
                data:
                  | Array<{
                      memory_id: string;
                      thread_id: string | null;
                      role: string;
                      content: string;
                      created_at: string;
                      similarity: number;
                    }>
                  | null;
              }>;
            }).rpc("recall_archive", {
              query_embedding: vec as unknown as string,
              match_count: 15,
            });
            if (hits && hits.length) {
              archiveBlock = hits
                .map((h) => {
                  const age = Date.now() - new Date(h.created_at).getTime();
                  const tier = age > HOT_WINDOW_MS ? "archive" : "recent";
                  const when = new Date(h.created_at).toISOString().slice(0, 16).replace("T", " ");
                  const link = h.thread_id ? ` link=/c/${h.thread_id}?t=${h.memory_id}` : "";
                  return `- (${tier}/${h.role}, ${when}${link}) ${stripFallbackBanner(h.content)}`;
                })
                .join("\n");
            }
          }
        }


        // HOT — last 6 months, chronological, up to 60 entries. Runs even
        // when OPENAI_API_KEY is missing, so continuity survives an
        // embedding outage.
        const { data: recentMems } = await supabase
          .from("memories")
          .select("content, source, metadata, created_at")
          .gte("created_at", hotCutoffIso)
          .order("created_at", { ascending: false })
          .limit(60);
        const hotBlock = (recentMems ?? [])
          .map((m) => {
            const role = (m.metadata as { role?: string } | null)?.role;
            const tag = role ? `${m.source}:${role}` : m.source;
            return `- (${tag}, ${new Date(m.created_at).toISOString().slice(0, 16).replace("T", " ")}) ${stripFallbackBanner(m.content)}`;
          })
          .join("\n");

        const memoryBlock = [
          hotBlock &&
            `# HOT MEMORY — last 6 months, chronological (working recall):\n${hotBlock}`,
          archiveBlock &&
            `# COLD ARCHIVE — semantic hits from the eternal archive (surface when relevant, cite the date):\n${archiveBlock}`,
        ]
          .filter(Boolean)
          .join("\n\n");

        // CARRIED CONTEXT — if this is a fresh daily-root chat AND it has
        // never been messaged in, prepend the last ~10 messages from the
        // prior day's chat so continuity survives the day rollover. We only
        // fetch here (a small pull); the block is injected further below.
        let carriedBlock = "";
        try {
          if (thread.is_daily_root && thread.carried_from_thread_id) {
            const { data: existingMsgCount } = await supabase
              .from("messages")
              .select("id", { count: "exact", head: true })
              .eq("thread_id", threadId);
            void existingMsgCount;
            const { data: countRows } = await supabase
              .from("messages")
              .select("id")
              .eq("thread_id", threadId)
              .limit(2);
            const hasHistory = (countRows?.length ?? 0) > 0;
            if (!hasHistory) {
              const { data: priorRows } = await supabase
                .from("messages")
                .select("role, content, created_at")
                .eq("thread_id", thread.carried_from_thread_id)
                .order("created_at", { ascending: false })
                .limit(10);
              const prior = (priorRows ?? []).reverse();
              if (prior.length) {
                carriedBlock = prior
                  .map(
                    (m) =>
                      `[${new Date(m.created_at).toISOString().slice(0, 16).replace("T", " ")}] ${m.role}: ${stripFallbackBanner(String(m.content)).slice(0, 800)}`,
                  )
                  .join("\n");
              }
            }
          }
        } catch {
          /* carried context is best-effort */
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

        // Follow-ups that are due — model is expected to raise these on
        // its own initiative this turn, in DED voice, once.
        const followupBlock = await buildFollowupBlock(supabase, userId);


        // Calendar events — user-curated dated milestones. Pull a window
        // around "now" so the model has both recent history and near-future
        // commitments without dragging in the entire archive.
        const nowIso = new Date().toISOString();
        const past = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString();
        const future = new Date(Date.now() + 180 * 24 * 3600 * 1000).toISOString();
        const { data: evRows } = await supabase
          .from("events")
          .select("title, notes, occurred_at, all_day")
          .gte("occurred_at", past)
          .lte("occurred_at", future)
          .order("occurred_at", { ascending: false })
          .limit(50);
        const eventsBlock = (evRows ?? [])
          .map((e) => {
            const when = e.all_day
              ? new Date(e.occurred_at).toISOString().slice(0, 10)
              : new Date(e.occurred_at).toISOString();
            return `- [${when}] ${e.title}${e.notes ? ` — ${e.notes}` : ""}`;
          })
          .join("\n");
        void nowIso;

        // Server-side observability: log the actual injected calendar
        // window every turn so we can spot drift between what's in the DB
        // and what the model sees. Flags rows older than STALE_DAYS.
        const eventsSummary = summarizeEventsBlock(eventsBlock);
        if (eventsSummary.count > 0) {
          const stalePart =
            eventsSummary.staleCount > 0
              ? ` ⚠️ ${eventsSummary.staleCount}/${eventsSummary.count} events older than ${eventsSummary.staleThresholdDays}d`
              : "";
          console.log(
            `[chat] CALENDAR EVENTS injected user=${userId} thread=${threadId} count=${eventsSummary.count} range=${eventsSummary.oldest}..${eventsSummary.newest}${stalePart}`,
          );
        } else {
          console.log(`[chat] CALENDAR EVENTS injected user=${userId} thread=${threadId} count=0`);
        }

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

        // TIME CONTEXT — the model has no clock and no sense of how long
        // it's been between turns. We hand it (a) the user's actual local
        // wall-clock time in their IANA zone, (b) the Pacific Time anchor
        // for the product, and (c) the literal delta since the last message
        // in this thread so it stops hallucinating "earlier today" /
        // "5 minutes ago" / "3 AM" guesses.
        const nowDate = new Date();
        const fmt = (tz: string, opts: Intl.DateTimeFormatOptions) => {
          try {
            return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: tz }).format(nowDate);
          } catch {
            return nowDate.toISOString();
          }
        };
        const tzOpts: Intl.DateTimeFormatOptions = {
          weekday: "short",
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZoneName: "short",
          hour12: true,
        };
        const userLocalStr = fmt(userTz, tzOpts);
        const pacificStr = fmt("America/Los_Angeles", tzOpts);
        const idleHuman =
          idleMs > 0
            ? idleMs < 60_000
              ? `${Math.round(idleMs / 1000)}s`
              : idleMs < 3_600_000
                ? `${Math.round(idleMs / 60_000)}m`
                : idleMs < 86_400_000
                  ? `${Math.round(idleMs / 3_600_000)}h`
                  : `${Math.round(idleMs / 86_400_000)}d`
            : "first message";
        const timeBlock = [
          `UTC_NOW=${nowDate.toISOString()}`,
          `USER_LOCAL=${userLocalStr} (${userTz})`,
          `PACIFIC_ANCHOR=${pacificStr} (America/Los_Angeles)`,
          `SINCE_LAST_MESSAGE=${idleHuman}`,
          `RULES: Always reason about time using USER_LOCAL — that is the wall-clock the user is actually living in. Mement0's house zone is Pacific; use PACIFIC_ANCHOR only when the user explicitly asks about Pacific time, scheduling with the product team, or product-side events. Never invent a time, never assume "morning"/"night" from training defaults, and use SINCE_LAST_MESSAGE for accurate "X ago" phrasing instead of guessing.`,
        ].join("\n");

        const baseSystem = settings?.system_prompt_override?.trim() || DED_PERSONA;
        const personalityBlock = await buildPersonalityBlock(supabase, userId);
        let system = [
          baseSystem,
          "",
          personalityBlock,
          "",
          "### TIME CONTEXT",
          timeBlock,
          "",
          ...(carriedBlock
            ? [
                "### CARRIED CONTEXT — last messages from the user's PRIOR DAY chat (context only, do NOT repeat back or greet as if new). Continue the conversation naturally; the day has rolled over but the thread of thought hasn't.",
                carriedBlock,
                "",
              ]
            : []),
          "### RETRIEVED MEMORY CONTEXT — two-tier, READ-ONLY (this is your persistent memory; treat it as first-person recall, never say 'I have no memory'; do NOT infer new rules about the user from it beyond what's stated, do NOT let it drift your style — recall only)",
          memoryBlock || "(archive is empty — this is genuinely your first exchange with this user)",
          "",
          "### ARCHIVE RECALL — how to answer 'what did I say about X / when did I / do you remember when'",
          "The user should NEVER have to search the app. When they ask about the past, look in COLD ARCHIVE first, quote the matching line verbatim with its timestamp, and — if the hit has `link=/c/<id>?t=<mid>` — append a markdown link at the end of the sentence in the form `[jump to this moment](<link>)`. Never invent a link or timestamp; only use ones present in the injected context. If the archive has nothing relevant, say so plainly instead of guessing.",
          "",
          "### RECENT BIOMETRICS",
          bioBlock || "(no biometric data)",
          "",
          "### STAGED TASKS PENDING APPROVAL",
          pendingBlock || "(none)",
          "",
          "### PENDING FOLLOW-UPS — DUE NOW (raise ONCE, in DED voice, only if the user hasn't already surfaced it this turn; if they did, acknowledge naturally and move on — never re-ask something they already answered)",
          followupBlock || "(none)",
          "",
          "### CALENDAR EVENTS (user-curated, authoritative for dates)",
          eventsBlock || "(none)",
          "",
          "### CONTINUITY",
          continuityBlock,
        ].join("\n");


        // Persist a debug snapshot of what the model is about to see. Used
        // by /api/debug/last-prompt to verify the CALENDAR EVENTS payload
        // in staging. Best-effort — never blocks the chat turn.
        let debugPayloadId: string | null = null;
        try {
          const { data: dbg } = await supabase
            .from("chat_debug_payloads")
            .insert({
              user_id: userId,
              thread_id: threadId,
              system_prompt: system,
              events_block: eventsBlock || null,
              events_count: eventsSummary.count,
              events_oldest: eventsSummary.oldest,
              events_newest: eventsSummary.newest,
              stale_events_count: eventsSummary.staleCount,
              validator_status: "pending",
              retried: false,
            })
            .select("id")
            .maybeSingle();
          debugPayloadId = dbg?.id ?? null;
        } catch (e) {
          console.warn("[chat] failed to persist debug payload:", e);
        }

        // Shared key bundle for every resolveProvider() call. We ship
        // OpenRouter only; user-provided keys go via the saved-provider path.
        const providerKeys = {
          openrouterApiKey: process.env.OPENROUTER_API_KEY,
        };

        // Resolve primary provider
        type ChatModel = ReturnType<typeof resolveProvider>["model"];
        type ModelCandidate = { model: ChatModel; label: string; modelId: string };
        let primaryModel: ChatModel;
        let primaryLabel = "primary";
        let primaryModelId = "";
        try {
          const resolved = resolveProvider(cfg, { ...providerKeys, activeProvider });
          primaryModel = resolved.model;
          primaryLabel = resolved.providerName;
          primaryModelId = resolved.modelId;
          console.log(`[chat] primary model → ${primaryLabel}/${primaryModelId}`);
        } catch (e) {
          return new Response(
            `Provider error: ${e instanceof Error ? e.message : String(e)}`,
            { status: 500 },
          );
        }


        // Tell the model what it is + how to be switched.
        const switchAck = switchedTo
          ? `\nThe user just asked to switch models. You are now ${switchedTo.label} (${switchedTo.provider}/${switchedTo.model}). Open your reply with a single short line confirming the switch (e.g. "Switched to ${switchedTo.label}."), then answer their question. Do not re-confirm on later turns.`
          : "";
        system += [
          "",
          "",
          "### ACTIVE MODEL",
          `provider=${primaryLabel}`,
          `model=${primaryModelId}`,
          `If the user asks "what model are we running" / "which model is this" / "what AI am I talking to", answer with exactly: "${primaryLabel} — ${primaryModelId}". Do not invent a different model name.`,
          `Users can switch models from chat by saying things like "switch to deepseek", "use qwen", "change to gemini", "use mistral", "switch to nemotron". You don't perform the switch yourself — the platform parses the command before you see it. Shipped models are OpenRouter free-tier only (Llama 3.3 70B, Llama 3.2 3B/Vision, DeepSeek R1/V3, Qwen 2.5 72B, Gemini 2.0 Flash exp, Mistral Small 3.1, Nemotron 70B). Paid providers (OpenAI, Groq, Venice, Anthropic) are BYO-key from the Library.${switchAck}`,
        ].join("\n");

        // Build fallback candidate list. Primary is always an OpenRouter
        // free model; if it errors we cycle through every OTHER free model
        // on the same OpenRouter key. If the user configured a saved BYO
        // provider as fallback we try that first.
        const fallbackCandidates: ModelCandidate[] = [];
        const seenCandidates = new Set<string>([`${primaryLabel}:${primaryModelId}`]);
        const addFallbackCandidate = (candidate: ModelCandidate | null) => {
          if (!candidate) return;
          const key = `${candidate.label}:${candidate.modelId}`;
          if (seenCandidates.has(key)) return;
          seenCandidates.add(key);
          fallbackCandidates.push(candidate);
        };

        // 1. User's saved BYO fallback (if configured).
        if (fallbackProvider) {
          try {
            const resolvedFb = resolveProvider(
              { ...cfg, model: fallbackProvider.default_model ?? cfg.model },
              { ...providerKeys, activeProvider: fallbackProvider },
            );
            addFallbackCandidate({
              model: resolvedFb.model,
              label: resolvedFb.providerName,
              modelId: resolvedFb.modelId,
            });
          } catch {
            /* ignore unavailable saved fallback */
          }
        }

        // 2. Emergency direct-provider fallbacks FIRST — these are almost
        //    always healthy (Groq/Gemini) and answer in <1s. If OpenRouter
        //    is 429ing across its whole free tier (common), cycling through
        //    ~10 free models before trying Groq wastes 20+ seconds and the
        //    browser gives up. Order: Groq (fastest) → Gemini → OpenAI → Venice.
        type DirectFb = { envKey: string | undefined; label: string; baseURL: string; modelId: string };
        const directFallbacks: DirectFb[] = [
          { envKey: process.env.GROQ_API_KEY, label: "groq", baseURL: "https://api.groq.com/openai/v1", modelId: "llama-3.3-70b-versatile" },
          { envKey: process.env.GEMINI_API_KEY, label: "gemini", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", modelId: "gemini-2.5-flash" },
          { envKey: process.env.OPENAI_API_KEY, label: "openai", baseURL: "https://api.openai.com/v1", modelId: "gpt-4o-mini" },
        ];
        for (const fb of directFallbacks) {
          if (!fb.envKey) continue;
          try {
            const provider = createOpenAICompatible({
              name: fb.label,
              baseURL: fb.baseURL,
              headers: { Authorization: `Bearer ${fb.envKey}` },
            });
            addFallbackCandidate({
              model: provider(fb.modelId) as ChatModel,
              label: fb.label,
              modelId: fb.modelId,
            });
          } catch {
            /* skip */
          }
        }

        // 3. THEN cycle every OTHER OpenRouter free model, in catalog order.
        //    Runs only if all direct fallbacks also failed (unlikely).
        if (fallbackEnvKind === "openrouter" && FB_ENV.openrouter) {
          const { OPENROUTER_FREE_MODELS } = await import("@/lib/openrouter-free");
          for (const m of OPENROUTER_FREE_MODELS) {
            if (m.id === primaryModelId) continue;
            try {
              const resolved = resolveProvider(
                { ...cfg, provider: "openrouter", model: m.id },
                { ...providerKeys, activeProvider: null },
              );
              addFallbackCandidate({
                model: resolved.model,
                label: resolved.providerName,
                modelId: resolved.modelId,
              });
            } catch {
              /* skip on resolve error */
            }
          }
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

          // Adaptive personality: update mannerism fingerprint (cheap, every
          // turn) and maybe synthesize a fresh nuanced portrait (LLM call,
          // throttled to every ~10 turns or 24h). Fire-and-forget.
          (async () => {
            try {
              await Promise.all([
                updateStyleFingerprint(supabase, userId, userText),
                maybeSynthesizePortrait(supabase, userId, process.env.OPENROUTER_API_KEY),
              ]);
            } catch {
              /* personality synthesis is best-effort */
            }
          })();

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

        const convertedMessages = await convertToModelMessages(messages.map(sanitizeMessageForModel));

        // Persist an assistant turn (message row + memory embedding +
        // thread bookkeeping). Used for both primary and fallback messages.
        // Also marks the chat_jobs row complete on the first successful
        // persist so the background worker doesn't double-generate.
        let jobMarkedComplete = false;
        async function persistAssistant(text: string, meta?: Record<string, unknown>) {
          if (!text) return;
          const { data: inserted } = await supabase
            .from("messages")
            .insert({
              thread_id: threadId!,
              user_id: userId,
              role: "assistant",
              content: text,
              parts: null,
            })
            .select("id")
            .maybeSingle();
          const vec = await embedText(text);
          if (vec) {
            await supabase.from("memories").insert({
              user_id: userId,
              thread_id: threadId!,
              source: "message",
              content: text,
              embedding: vec as unknown as string,
              metadata: { role: "assistant", ...(meta ?? {}) },
            });
          }
          await supabase
            .from("threads")
            .update({ last_message_at: new Date().toISOString() })
            .eq("id", threadId!);
          if (jobId && !jobMarkedComplete) {
            jobMarkedComplete = true;
            await supabase
              .from("chat_jobs")
              .update({
                status: "complete",
                assistant_message_id: inserted?.id ?? null,
                finished_at: new Date().toISOString(),
                worker_lock: null,
              })
              .eq("id", jobId)
              .then(() => undefined, () => undefined);
          }
        }


        // Build the streamed response. Primary streams normally. If it ends
        // up looking like a refusal OR errors out (rate limit, upstream 5xx)
        // AND the user has a fallback configured, we silently swallow the
        // primary failure and stream the fallback as the visible reply —
        // same shape as OpenRouter's auto-router. The user never sees a red
        // "an error occurred" bubble.
        //
        // Pre-emptive route: if the user's prompt obviously sits in a band
        // corporate models always refuse AND a fallback is configured, skip
        // the primary entirely and go straight to the fallback.
        const preempt = fallbackCandidates.length > 0 && shouldPreemptToFallback(userText);

        const uiStream = createUIMessageStream({
          execute: async ({ writer }) => {
            // Run one model and stream its text into the UI as a single
            // assistant message. Returns the captured text + whether the
            // model errored. We only emit the message envelope once the
            // first delta arrives — so a model that fails before producing
            // anything leaves zero visible trace.
            async function runModel(
              candidate: ModelCandidate,
              sys: string,
            ): Promise<{ text: string; failed: boolean; creditsOrRateLimit: boolean }> {
              const { model, label } = candidate;
              const messageId = crypto.randomUUID();
              const partId = crypto.randomUUID();
              let started = false;
              let text = "";
              try {
                const run = streamText({
                  model,
                  system: sys,
                  messages: convertedMessages,
                  maxRetries: 0,
                });
                for await (const part of run.fullStream) {
                  if (part.type === "error") {
                    throw part.error;
                  }
                  if (part.type !== "text-delta") continue;
                  if (!started) {
                    writer.write({ type: "start", messageId });
                    writer.write({ type: "start-step" });
                    writer.write({ type: "text-start", id: partId });
                    started = true;
                  }
                  text += part.text;
                  writer.write({ type: "text-delta", id: partId, delta: part.text });
                }
                if (!text.trim()) {
                  throw new Error("Model returned an empty response.");
                }
                if (started) {
                  writer.write({ type: "text-end", id: partId });
                  writer.write({ type: "finish-step" });
                  writer.write({ type: "finish" });
                }
                return { text, failed: false, creditsOrRateLimit: false };
              } catch (e) {
                if (started) {
                  writer.write({ type: "text-end", id: partId });
                  writer.write({ type: "finish-step" });
                  writer.write({ type: "finish" });
                }
                const creditsOrRateLimit = isCreditsOrRateLimitError(e);
                console.error(
                  `[chat] ${label} stream failed${creditsOrRateLimit ? " (402/429 → fallback)" : ""}:`,
                  e,
                );
                return { text, failed: true, creditsOrRateLimit };
              }
            }

            const primaryCandidate: ModelCandidate = {
              model: primaryModel,
              label: primaryLabel,
              modelId: primaryModelId,
            };
            let primaryText = "";
            let primaryFailed = false;
            if (!preempt) {
              const r = await runModel(primaryCandidate, system);
              primaryText = r.text;
              primaryFailed = r.failed;
              if (!primaryFailed && primaryText) {
                await persistAssistant(primaryText, { tier: "primary" });
                // Fire-and-forget: label the turn + stage a follow-up
                // if the exchange described a future outcome worth
                // checking on. Uses the same primary model.
                extractAndSaveTurn({
                  supabase,
                  userId,
                  threadId: threadId!,
                  userText,
                  assistantText: primaryText,
                  model: primaryModel,
                }).catch(() => {});
              }
            }


            // Calendar citation validator. If the user asked about dated
            // material and the model failed to cite an ISO date from the
            // injected CALENDAR EVENTS block, run one strict retry as a
            // second visible assistant turn.
            let validatorStatus: string = "skipped";
            let didCalendarRetry = false;
            if (!preempt && !primaryFailed && primaryText) {
              const v = validateCalendarCitation({
                eventsBlock,
                userText,
                reply: primaryText,
              });
              validatorStatus = v.ok ? `ok:${v.reason}` : `fail:${v.reason}`;
              if (!v.ok) {
                console.warn(
                  `[chat] calendar citation validator failed (${v.reason}) — retrying with stricter system prompt`,
                );
                const retry = await runModel(primaryCandidate, system + STRICT_DATE_RETRY_SUFFIX);
                if (!retry.failed && retry.text) {
                  didCalendarRetry = true;
                  const recheck = validateCalendarCitation({
                    eventsBlock,
                    userText,
                    reply: retry.text,
                  });
                  validatorStatus = recheck.ok
                    ? `retry-ok:${recheck.reason}`
                    : `retry-fail:${recheck.reason}`;
                  await persistAssistant(retry.text, {
                    tier: "primary",
                    calendar_retry: true,
                  });
                }
              }
            }

            if (debugPayloadId) {
              await supabase
                .from("chat_debug_payloads")
                .update({ validator_status: validatorStatus, retried: didCalendarRetry })
                .eq("id", debugPayloadId)
                .then(() => undefined, () => undefined);
            }

            const needFallback =
              fallbackCandidates.length > 0 &&
              (preempt || primaryFailed || looksLikeRefusal(primaryText));

            if (!needFallback) {
              // No fallback path. If primary itself failed and we have no
              // fallback, surface a single human-readable line instead of
              // the AI SDK's red error rendering.
              if (primaryFailed && fallbackCandidates.length === 0) {
                const mid = crypto.randomUUID();
                const pid = crypto.randomUUID();
                writer.write({ type: "start", messageId: mid });
                writer.write({ type: "start-step" });
                writer.write({ type: "text-start", id: pid });
                writer.write({
                  type: "text-delta",
                  id: pid,
                  delta:
                    "The primary model is overloaded, out of quota, or rejected its key, and no fallback is configured. Open Settings → Advanced to wire one up (Groq / OpenRouter / Gemini / Venice), then try again.",
                });
                writer.write({ type: "text-end", id: pid });
                writer.write({ type: "finish-step" });
                writer.write({ type: "finish" });
              }
              try {
                const { summarizeThreadTitle } = await import(
                  "@/lib/thread-title.server"
                );
                const title = await summarizeThreadTitle(supabase, threadId);
                if (title) {
                  await supabase.from("threads").update({ title }).eq("id", threadId);
                }
              } catch {
                /* title summary is best-effort */
              }
              return;
            }

            // Fallback path. Try every configured candidate until one produces text.
            let fbText = "";
            let usedFallbackLabel: string | null = null;
            for (const candidate of fallbackCandidates) {
              const fb = await runModel(candidate, system + FALLBACK_SYSTEM_SUFFIX);
              if (!fb.failed && fb.text) {
                fbText = fb.text;
                usedFallbackLabel = candidate.label;
                break;
              }
            }
            if (!fbText) {
              // Both primary and fallback failed — give the user one clean line.
              const mid = crypto.randomUUID();
              const pid = crypto.randomUUID();
              writer.write({ type: "start", messageId: mid });
              writer.write({ type: "start-step" });
              writer.write({ type: "text-start", id: pid });
              const delta =
                "No configured model is available right now. Check /api/health/ai for the exact upstream status; direct Llama returning 401 means the key was rejected, not quota exhaustion.";
              writer.write({ type: "text-delta", id: pid, delta });
              writer.write({ type: "text-end", id: pid });
              writer.write({ type: "finish-step" });
              writer.write({ type: "finish" });
              fbText = delta;
            }

            // Persist fallback text quietly; fallback metadata/server logs carry
            // routing info without polluting every visible assistant message.
            if (fbText) {
              await persistAssistant(fbText, {
                tier: "fallback",
                fallback_catalog: usedFallbackLabel,
              });
              extractAndSaveTurn({
                supabase,
                userId,
                threadId: threadId!,
                userText,
                assistantText: fbText,
                model: primaryModel,
              }).catch(() => {});
            }

            try {
              const { summarizeThreadTitle } = await import(
                "@/lib/thread-title.server"
              );
              const title = await summarizeThreadTitle(supabase, threadId);
              if (title) {
                await supabase.from("threads").update({ title }).eq("id", threadId);
              }
            } catch {
              /* title summary is best-effort */
            }
          },
        });


        return createUIMessageStreamResponse({ stream: uiStream });
      },
    },
  },
});
