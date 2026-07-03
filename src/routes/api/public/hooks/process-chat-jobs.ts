// POST /api/public/hooks/process-chat-jobs
//
// Background worker: rescues chat_jobs rows that never completed because
// the client disconnected mid-generation (Cloudflare Worker terminates when
// the response stream is cancelled). Runs a slim, non-streaming model call
// against the stored request payload and writes the assistant reply so
// realtime picks it up on the client's next visit.
//
// Called by pg_cron every minute. Authenticated by the Supabase anon
// apikey header (see /api/public/* auth pattern).

import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, generateText, type UIMessage } from "ai";
import { resolveProvider } from "@/lib/ai-provider.server";
import { DED_PERSONA } from "@/lib/persona";

const MAX_ATTEMPTS = 3;

type JobRow = {
  id: string;
  user_id: string;
  thread_id: string;
  status: string;
  request_payload: { messages: UIMessage[]; tz?: string };
  attempts: number;
};

export const Route = createFileRoute("/api/public/hooks/process-chat-jobs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Verify caller — Supabase anon key is enough on /api/public routes.
        const apikey = request.headers.get("apikey");
        if (!apikey || apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        // Atomically claim a batch of stale/pending jobs.
        const { data: claimed, error: claimErr } = await supabaseAdmin.rpc(
          "claim_chat_jobs",
          { _limit: 5 },
        );
        if (claimErr) {
          console.error("[worker] claim_chat_jobs failed:", claimErr);
          return Response.json({ error: claimErr.message }, { status: 500 });
        }
        const jobs = (claimed ?? []) as unknown as JobRow[];
        if (!jobs.length) {
          return Response.json({ processed: 0, failed: 0 });
        }

        let processed = 0;
        let failed = 0;

        for (const job of jobs) {
          try {
            if (job.attempts > MAX_ATTEMPTS) {
              await supabaseAdmin
                .from("chat_jobs")
                .update({
                  status: "failed",
                  error: "max attempts exceeded",
                  finished_at: new Date().toISOString(),
                  worker_lock: null,
                })
                .eq("id", job.id);
              failed++;
              continue;
            }

            // Skip if a fresher assistant message already landed for this
            // thread after the job was created (live route beat us to it).
            const { data: latest } = await supabaseAdmin
              .from("messages")
              .select("id, role, created_at")
              .eq("thread_id", job.thread_id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (latest && latest.role === "assistant") {
              const { data: jrow } = await supabaseAdmin
                .from("chat_jobs")
                .select("created_at")
                .eq("id", job.id)
                .maybeSingle();
              if (
                jrow &&
                new Date(latest.created_at).getTime() >
                  new Date(jrow.created_at).getTime()
              ) {
                await supabaseAdmin
                  .from("chat_jobs")
                  .update({
                    status: "complete",
                    assistant_message_id: latest.id,
                    finished_at: new Date().toISOString(),
                    worker_lock: null,
                  })
                  .eq("id", job.id);
                processed++;
                continue;
              }
            }

            // Load user settings so the reply comes from the same provider
            // they've selected.
            const { data: settings } = await supabaseAdmin
              .from("user_settings")
              .select(
                "provider, model, custom_base_url, custom_api_key, custom_model_id, system_prompt_override, active_provider_id",
              )
              .eq("user_id", job.user_id)
              .maybeSingle();

            const cfg = {
              provider: settings?.provider ?? "openrouter",
              model: settings?.model ?? "meta-llama/llama-3.3-70b-instruct:free",
              custom_base_url: settings?.custom_base_url ?? null,
              custom_api_key: settings?.custom_api_key ?? null,
              custom_model_id: settings?.custom_model_id ?? null,
            };

            let activeProvider = null as null | {
              catalog_id: string;
              base_url: string | null;
              api_key: string | null;
              default_model: string | null;
            };
            if (settings?.active_provider_id) {
              const { data: ap } = await supabaseAdmin
                .from("user_providers")
                .select("catalog_id, base_url, api_key, default_model")
                .eq("id", settings.active_provider_id)
                .maybeSingle();
              if (ap) activeProvider = ap;
            }

            const { model } = resolveProvider(cfg, {
              openrouterApiKey: process.env.OPENROUTER_API_KEY,
              activeProvider,
            });

            const baseSystem =
              settings?.system_prompt_override?.trim() || DED_PERSONA;
            const rescueSystem = [
              baseSystem,
              "",
              "### RESCUE MODE",
              "You are completing a reply after the user's client disconnected. Full context retrieval was skipped for reliability. Answer the last user message concisely from what's in the conversation itself — the user's next visit is when they'll read this. Do not apologize for delay, do not mention any disconnection.",
            ].join("\n");

            const convertedMessages = await convertToModelMessages(
              job.request_payload.messages,
            );

            const result = await generateText({
              model,
              system: rescueSystem,
              messages: convertedMessages,
              maxRetries: 1,
            });
            const text = (result.text ?? "").trim();
            if (!text) throw new Error("Empty model response");

            const { data: inserted } = await supabaseAdmin
              .from("messages")
              .insert({
                thread_id: job.thread_id,
                user_id: job.user_id,
                role: "assistant",
                content: text,
                parts: null,
              })
              .select("id")
              .maybeSingle();

            await supabaseAdmin
              .from("threads")
              .update({ last_message_at: new Date().toISOString() })
              .eq("id", job.thread_id);

            await supabaseAdmin
              .from("chat_jobs")
              .update({
                status: "complete",
                assistant_message_id: inserted?.id ?? null,
                finished_at: new Date().toISOString(),
                worker_lock: null,
              })
              .eq("id", job.id);

            processed++;
            console.log(
              `[worker] rescued job ${job.id} user=${job.user_id} thread=${job.thread_id}`,
            );
          } catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            console.error(`[worker] job ${job.id} failed:`, errMsg);
            const isFinal = job.attempts >= MAX_ATTEMPTS;
            await supabaseAdmin
              .from("chat_jobs")
              .update({
                status: isFinal ? "failed" : "pending",
                error: errMsg.slice(0, 500),
                worker_lock: null,
                locked_at: null,
                finished_at: isFinal ? new Date().toISOString() : null,
              })
              .eq("id", job.id);
            if (isFinal) failed++;
          }
        }

        return Response.json({ processed, failed, claimed: jobs.length });
      },
    },
  },
});
