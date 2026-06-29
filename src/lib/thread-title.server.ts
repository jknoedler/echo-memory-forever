// Generates a multi-topic summary title for a thread.
// Strategy: list up to 7 topics, prioritize ones the user spent the most
// time on (longest stretches of consecutive messages on that topic),
// drop one-off questions when there are more than 7. ≤ 80 chars.

import { generateText } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

export async function summarizeThreadTitle(
  supabase: SupabaseClient,
  threadId: string,
): Promise<string | null> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey) return null;

  const { data: rows } = await supabase
    .from("messages")
    .select("role, content, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (!rows || rows.length < 2) return null;

  // Compact transcript; cap each message to keep prompt small.
  const transcript = rows
    .map((m) => `${m.role === "user" ? "U" : "A"}: ${(m.content ?? "").slice(0, 400)}`)
    .join("\n")
    .slice(0, 12_000);

  const provider = createLovableAiGatewayProvider(lovableKey);
  const model = provider.chatModel("google/gemini-3-flash-preview");

  const sys = [
    "You write short multi-topic titles for chat threads.",
    "Identify the distinct topics discussed. Order them by how much TIME (consecutive turns / word count) was spent on each — most-discussed first.",
    "If there are more than 7 topics, drop the one-off questions and keep only the longest / most important ones (max 7).",
    "Output ONLY the title: a comma-separated list of 2–7 short topic phrases (2–4 words each), lowercase, no quotes, no trailing period, ≤ 80 chars total.",
    "If the whole thread is really one topic, return that one phrase.",
    "Examples:",
    "  troubleshooting car, food prep, fox inquiry",
    "  taxes, divorce filing, sleep schedule",
  ].join("\n");

  try {
    const { text } = await generateText({
      model,
      system: sys,
      prompt: `Transcript:\n${transcript}\n\nTitle:`,
    });
    const cleaned = (text ?? "")
      .trim()
      .replace(/^["'`]+|["'`]+$/g, "")
      .replace(/\s*\n\s*/g, " ")
      .replace(/\.+$/, "")
      .slice(0, 80);
    return cleaned || null;
  } catch {
    return null;
  }
}
