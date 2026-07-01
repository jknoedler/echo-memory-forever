// Follow-ups + labeled memory metadata.
//
// After each user↔assistant exchange we ask a lightweight model to label
// the turn (topics, social cues, mood, salient nuance) and — if the turn
// naturally implies a future check-in ("job interview tomorrow", "second
// date Friday", "MRI results next week") — stage a follow-up. The model
// answering the next chat turn sees any DUE follow-ups in its system
// prompt and is instructed to raise them on its own initiative, in DED
// voice. Before that, we auto-scan the user's own new message for the
// same keywords: if they already brought it up, we mark the follow-up
// resolved so the model doesn't ask redundantly. That's the "pretend
// to care" loop — proactive but not clueless.

import { generateObject } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { embedText } from "./embeddings.server";

type Supa = SupabaseClient<Database>;
// The chat pipeline resolves a streamable model via resolveProvider();
// we accept it as opaque here so we don't circular-import.
type AnyModel = Parameters<typeof generateObject>[0]["model"];

const ExtractionSchema = z.object({
  summary: z.string().min(1).max(400).describe("One-sentence recap of what was actually said."),
  topics: z.array(z.string().min(1).max(40)).max(8).describe("Concrete nouns/subjects (people, projects, events)."),
  social_cues: z.array(z.string().min(1).max(60)).max(8).describe("Emotional / relational nuance in the user's message: 'excited', 'anxious', 'venting', 'flirting', 'shutting down', 'seeking validation', etc."),
  mood: z.enum(["up", "neutral", "down", "charged", "unknown"]),
  followup: z
    .object({
      topic: z.string().min(2).max(120).describe("Short name of the thing to check on later."),
      cue: z.string().min(2).max(240).describe("What to actually ask, in one line."),
      keywords: z.array(z.string().min(2).max(40)).min(1).max(8).describe("Lowercase words to auto-detect if the user brings it up first."),
      due_in_hours: z.number().int().min(1).max(24 * 60).describe("How many hours from now to raise the check-in. Job interview outcome ~24-72h. Medical result timelines ~as-stated. Vague 'I'll try X' ~72h."),
    })
    .nullable()
    .describe("null if nothing genuinely warrants a proactive check-in."),
});

export type TurnExtraction = z.infer<typeof ExtractionSchema>;

const EXTRACT_SYSTEM = `You label a single chat exchange for Mement0's memory archive.
Return strict JSON matching the schema.
- summary: neutral third-person, factual.
- topics: nouns only, no verbs, no sentences.
- social_cues: read the USER's tone, not the assistant's.
- followup: ONLY set when the user described a future event with an outcome worth asking about (interview, date, test result, deadline, pitch, appointment). Do NOT set followups for casual chatter, ongoing hobbies, opinions, or anything without a clear "did it happen / how did it go" moment. When in doubt, null.
- keywords: lowercase, distinctive. Prefer proper nouns over generic verbs. e.g. for "job interview at Stripe Friday" → ["stripe","interview","offer","hired"].`;

/**
 * Extract labels + optional follow-up from a completed turn, persist a
 * labeled `summary` memory row, and stage a follow-up if warranted.
 * Best-effort; swallows errors so it never blocks chat.
 */
export async function extractAndSaveTurn(args: {
  supabase: Supa;
  userId: string;
  threadId: string;
  userText: string;
  assistantText: string;
  model: AnyModel;
}): Promise<void> {
  const { supabase, userId, threadId, userText, assistantText, model } = args;
  if (!userText.trim() && !assistantText.trim()) return;
  try {
    const { object } = await generateObject({
      model,
      schema: ExtractionSchema,
      system: EXTRACT_SYSTEM,
      prompt: `USER:\n${userText}\n\nASSISTANT:\n${assistantText}`,
      maxRetries: 0,
    });

    const nowIso = new Date().toISOString();

    // Labeled summary row — this is the "properly filed" archive entry.
    const summaryContent = `[${nowIso}] ${object.summary}`;
    const vec = await embedText(object.summary).catch(() => null);
    await supabase.from("memories").insert({
      user_id: userId,
      thread_id: threadId,
      source: "summary",
      content: summaryContent,
      embedding: (vec as unknown as string) ?? null,
      metadata: {
        topics: object.topics,
        social_cues: object.social_cues,
        mood: object.mood,
        recorded_at: nowIso,
        has_followup: !!object.followup,
      },
    });

    if (object.followup) {
      const dueAt = new Date(Date.now() + object.followup.due_in_hours * 3600 * 1000).toISOString();
      await supabase.from("pending_followups").insert({
        user_id: userId,
        thread_id: threadId,
        topic: object.followup.topic,
        cue: object.followup.cue,
        keywords: object.followup.keywords.map((k) => k.toLowerCase()),
        due_at: dueAt,
      });
    }
  } catch (e) {
    console.warn("[followups] extract failed:", e);
  }
}

/**
 * Scan the user's new message for keywords tied to any pending followup.
 * If the user brought a topic up on their own initiative, mark it resolved
 * so the model doesn't perform a redundant "hey, whatever happened with X"
 * check-in. Returns the topics we auto-resolved (for logging).
 */
export async function autoResolveFollowups(
  supabase: Supa,
  userId: string,
  userText: string,
): Promise<string[]> {
  const text = userText.toLowerCase();
  if (!text.trim()) return [];
  const { data: pending } = await supabase
    .from("pending_followups")
    .select("id, topic, keywords")
    .eq("user_id", userId)
    .in("status", ["pending", "raised"]);
  if (!pending?.length) return [];
  const resolved: string[] = [];
  for (const f of pending) {
    const kws = (f.keywords ?? []) as string[];
    const hit = kws.some((k) => k && text.includes(k.toLowerCase()));
    if (hit) {
      await supabase
        .from("pending_followups")
        .update({
          status: "resolved",
          resolved_source: "user_initiative",
          resolved_at: new Date().toISOString(),
        })
        .eq("id", f.id);
      resolved.push(f.topic);
    }
  }
  return resolved;
}

/**
 * Build the "PENDING FOLLOW-UPS" system-prompt block. Only surfaces
 * items whose due_at has arrived. Also marks them 'raised' so we don't
 * nag every single turn — the model gets ONE window to bring it up
 * naturally, then it goes quiet unless it becomes due again.
 */
export async function buildFollowupBlock(
  supabase: Supa,
  userId: string,
): Promise<string> {
  const nowIso = new Date().toISOString();
  const { data: due } = await supabase
    .from("pending_followups")
    .select("id, topic, cue, due_at, created_at, status")
    .eq("user_id", userId)
    .eq("status", "pending")
    .lte("due_at", nowIso)
    .order("due_at", { ascending: true })
    .limit(5);
  if (!due?.length) return "";
  const lines = due.map((f) => {
    const staged = new Date(f.created_at).toISOString().slice(0, 10);
    return `- [staged ${staged}] ${f.topic} — ${f.cue}`;
  });
  // Best-effort: flag them raised so we don't repeat next turn.
  await supabase
    .from("pending_followups")
    .update({ status: "raised", raised_at: nowIso })
    .in(
      "id",
      due.map((f) => f.id),
    );
  return lines.join("\n");
}
