// Generates a multi-topic summary title for a thread.
// Uses whichever built-in chat provider is configured (Groq → OpenAI →
// Venice → Llama). Returns null when nothing is configured.

import { generateText } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

function pickTitler(): { model: ReturnType<ReturnType<typeof createOpenAICompatible>> } | null {
  const groq = process.env.GROQ_API_KEY;
  if (groq) {
    const p = createOpenAICompatible({
      name: "groq",
      baseURL: "https://api.groq.com/openai/v1",
      headers: { Authorization: `Bearer ${groq}` },
    });
    return { model: p("llama-3.3-70b-versatile") };
  }
  const openai = process.env.OPENAI_API_KEY;
  if (openai) {
    const p = createOpenAICompatible({
      name: "openai",
      baseURL: "https://api.openai.com/v1",
      headers: { Authorization: `Bearer ${openai}` },
    });
    return { model: p("gpt-4o-mini") };
  }
  const venice = process.env.VENICE_API_KEY;
  if (venice) {
    const p = createOpenAICompatible({
      name: "venice",
      baseURL: "https://api.venice.ai/api/v1",
      headers: { Authorization: `Bearer ${venice}` },
    });
    return { model: p("venice-uncensored") };
  }
  const llama = process.env.LLAMA_API_KEY;
  if (llama) {
    const p = createOpenAICompatible({
      name: "llama",
      baseURL: "https://api.llama.com/compat/v1",
      headers: { Authorization: `Bearer ${llama}` },
    });
    return { model: p("Llama-3.3-70B-Instruct") };
  }
  return null;
}

export async function summarizeThreadTitle(
  supabase: SupabaseClient,
  threadId: string,
): Promise<string | null> {
  const picked = pickTitler();
  if (!picked) return null;

  const { data: rows } = await supabase
    .from("messages")
    .select("role, content, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (!rows || rows.length < 2) return null;

  const transcript = rows
    .map((m) => `${m.role === "user" ? "U" : "A"}: ${(m.content ?? "").slice(0, 400)}`)
    .join("\n")
    .slice(0, 12_000);

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
      model: picked.model,
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
