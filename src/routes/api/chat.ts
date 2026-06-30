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
import { createClient } from "@supabase/supabase-js";
import { resolveProvider } from "@/lib/ai-provider.server";
import { parseModelSwitch } from "@/lib/model-switch";
import { DED_PERSONA } from "@/lib/persona";
import { embedText } from "@/lib/embeddings.server";
import {
  buildPersonalityBlock,
  captureDirective,
  sweepRecalibrations,
  updateStyleFingerprint,
} from "@/lib/personality.server";
import { FALLBACK_PREAMBLE, FALLBACK_SYSTEM_SUFFIX, looksLikeRefusal, shouldPreemptToFallback } from "@/lib/refusal";
import {
  STRICT_DATE_RETRY_SUFFIX,
  summarizeEventsBlock,
  validateCalendarCitation,
} from "@/lib/calendar-validator";
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

        // Capability-fallback provider — used when primary refuses. Can be
        // either a saved library row OR an env-key built-in (groq/openai).
        let fallbackProvider = null as null | {
          catalog_id: string;
          base_url: string | null;
          api_key: string | null;
          default_model: string | null;
        };
        type FbKind = "groq" | "openai" | "llama" | "venice" | "gemini" | "openrouter";
        const FB_ENV: Record<FbKind, string | undefined> = {
          groq: process.env.GROQ_API_KEY,
          openai: process.env.OPENAI_API_KEY,
          llama: process.env.LLAMA_API_KEY,
          venice: process.env.VENICE_API_KEY,
          gemini: process.env.GEMINI_API_KEY,
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
          // No explicit fallback configured — default to Venice (uncensored
          // house fallback), then Gemini, then Groq.
          if (FB_ENV.venice) fallbackEnvKind = "venice";
          else if (FB_ENV.gemini) fallbackEnvKind = "gemini";
          else if (FB_ENV.groq) fallbackEnvKind = "groq";
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
        const system = [
          baseSystem,
          "",
          personalityBlock,
          "",
          "### TIME CONTEXT",
          timeBlock,
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

        // Shared key bundle for every resolveProvider() call.
        const providerKeys = {
          openaiApiKey: process.env.OPENAI_API_KEY,
          groqApiKey: process.env.GROQ_API_KEY,
          llamaApiKey: process.env.LLAMA_API_KEY,
          veniceApiKey: process.env.VENICE_API_KEY,
          geminiApiKey: process.env.GEMINI_API_KEY,
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
        } catch (e) {
          return new Response(
            `Provider error: ${e instanceof Error ? e.message : String(e)}`,
            { status: 500 },
          );
        }

        // Resolve fallback providers (best-effort — never blocks primary).
        // One dead upstream should never make chat look dead; we walk every
        // configured built-in after the preferred fallback and stop at the
        // first provider that actually streams text.
        const fallbackCandidates: ModelCandidate[] = [];
        const seenCandidates = new Set<string>([`${primaryLabel}:${primaryModelId}`]);
        const addFallbackCandidate = (candidate: ModelCandidate | null) => {
          if (!candidate) return;
          const key = `${candidate.label}:${candidate.modelId}`;
          if (seenCandidates.has(key)) return;
          seenCandidates.add(key);
          fallbackCandidates.push(candidate);
        };

        const builtinModelId = (kind: FbKind): string => {
          switch (kind) {
            case "venice": return "venice-uncensored";
            case "groq": return "llama-3.3-70b-versatile";
            case "llama": return "Llama-3.3-70B-Instruct";
            case "gemini": return "gemini-2.5-flash";
            case "openrouter": return "meta-llama/llama-3.3-70b-instruct";
            case "openai": return "gpt-4o-mini";
          }
        };

        if (fallbackEnvKind) {
          try {
            const resolvedFb = resolveProvider(
              { ...cfg, provider: fallbackEnvKind, model: builtinModelId(fallbackEnvKind) },
              { ...providerKeys, activeProvider: null },
            );
            addFallbackCandidate({
              model: resolvedFb.model,
              label: resolvedFb.providerName,
              modelId: resolvedFb.modelId,
            });
          } catch {
            /* ignore unavailable preferred fallback */
          }
        } else if (fallbackProvider) {
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

        const addBuiltinFallback = (kind: FbKind) => {
          if (!FB_ENV[kind]) return;
          try {
            const resolved = resolveProvider(
              { ...cfg, provider: kind, model: builtinModelId(kind) },
              { ...providerKeys, activeProvider: null },
            );
            addFallbackCandidate({
              model: resolved.model,
              label: resolved.providerName,
              modelId: resolved.modelId,
            });
          } catch {
            /* ignore unavailable automatic fallback */
          }
        };
        // Walk order: free/fast first → broad catalog → paid → uncensored.
        (["groq", "gemini", "openrouter", "openai", "venice", "llama"] as const).forEach(
          addBuiltinFallback,
        );




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

          // Adaptive personality: capture directives + update mannerism
          // fingerprint + sweep ripe recalibrations. Fire-and-forget so we
          // don't block the stream.
          (async () => {
            try {
              await Promise.all([
                captureDirective(supabase, userId, threadId, userText),
                updateStyleFingerprint(supabase, userId, userText),
                sweepRecalibrations(supabase, userId),
              ]);
            } catch {
              /* personality capture is best-effort */
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

        const convertedMessages = await convertToModelMessages(messages);

        // Persist an assistant turn (message row + memory embedding +
        // thread bookkeeping). Used for both primary and fallback messages.
        async function persistAssistant(text: string, meta?: Record<string, unknown>) {
          if (!text) return;
          await supabase.from("messages").insert({
            thread_id: threadId!,
            user_id: userId,
            role: "assistant",
            content: text,
            parts: null,
          });
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
                    "The primary model is overloaded or refused, and no fallback is configured. Open Settings → Advanced to wire one up (Venice / Groq / Llama), then try again.",
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
                "No configured model is available right now: Groq is rate-limited or exhausted, Venice is out of credits, OpenAI quota is exhausted, and/or Llama rejected its key. Check /api/health/ai, then top up or replace the bad key.";
              writer.write({ type: "text-delta", id: pid, delta });
              writer.write({ type: "text-end", id: pid });
              writer.write({ type: "finish-step" });
              writer.write({ type: "finish" });
              fbText = delta;
            }

            // Ensure the persisted fallback text always carries the preamble,
            // even if the fallback model ignored the instruction to lead with it.
            if (fbText) {
              const persistedFb = fbText.startsWith(FALLBACK_PREAMBLE)
                ? fbText
                : `${FALLBACK_PREAMBLE}\n\n${fbText}`;
              await persistAssistant(persistedFb, {
                tier: "fallback",
                fallback_catalog: usedFallbackLabel,
              });
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
