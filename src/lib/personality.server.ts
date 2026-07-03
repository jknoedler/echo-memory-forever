// Adaptive personality engine (v2 — portrait synthesis).
//
// The old version regex-matched "don't/stop/always/please" in the user's
// latest message and turned any hit into a hardcoded DO/DON'T rule. That
// was noisy garbage: it flagged normal conversational phrases as personality
// directives and never captured nuance.
//
// This version does two things instead:
//
//   1. A cheap statistical STYLE FINGERPRINT (running EMA over mannerisms:
//      length, profanity, emoji, caps, contractions). Kept — this is
//      genuinely useful mimicry data.
//
//   2. A PORTRAIT synthesized every ~10 user turns (or every 24h) by a small
//      LLM call that reads recent messages + the existing portrait and
//      outputs updated JSON describing:
//         - energy         (cadence, intensity, pace)
//         - mood           (baseline emotional register recently)
//         - values         (morals, ethics, worldview themes)
//         - interests      (recurring ideas, projects, obsessions)
//         - communication  (how they like to be met, tone they respond to)
//         - explicit_preferences (things the user LITERALLY told the AI to
//           do or not do — only when unambiguous; not inferred)
//
// Portrait synthesis is fire-and-forget from the chat handler. If it fails
// the portrait just doesn't refresh this turn — no user-visible impact.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Sb = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// STYLE FINGERPRINT (statistical mannerism mimicry)
// ---------------------------------------------------------------------------

const PROFANITY = /\b(fuck|shit|damn|bitch|ass|hell|crap|piss|dick|bastard)\b/gi;
const EMOJI = /\p{Extended_Pictographic}/gu;
const CONTRACTION = /\b\w+'(?:t|s|re|ve|ll|d|m)\b/gi;

function sample(text: string) {
  const len = Math.max(text.length, 1);
  const wordCount = text.trim().split(/\s+/).length;
  return {
    len,
    profanity: (text.match(PROFANITY) ?? []).length / Math.max(wordCount, 1),
    emoji: (text.match(EMOJI) ?? []).length / len,
    exclam: (text.match(/!/g) ?? []).length / len,
    question: (text.match(/\?/g) ?? []).length / len,
    contractions: (text.match(CONTRACTION) ?? []).length / Math.max(wordCount, 1),
    caps: (text.match(/[A-Z]/g) ?? []).length / len,
  };
}

export async function updateStyleFingerprint(
  supabase: Sb,
  userId: string,
  text: string,
): Promise<void> {
  if (!text || text.length < 3) return;
  const s = sample(text);

  const { data: existing } = await supabase
    .from("personality_style")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  const alpha = existing && existing.sample_count > 0
    ? Math.max(0.05, 1 / Math.min(existing.sample_count + 1, 40))
    : 1;

  const blend = (old: number, next: number) =>
    Math.round(((1 - alpha) * old + alpha * next) * 10000) / 10000;

  const payload = {
    user_id: userId,
    sample_count: (existing?.sample_count ?? 0) + 1,
    avg_message_length: blend(existing?.avg_message_length ?? 0, s.len),
    profanity_rate: blend(existing?.profanity_rate ?? 0, s.profanity),
    emoji_rate: blend(existing?.emoji_rate ?? 0, s.emoji),
    exclamation_rate: blend(existing?.exclamation_rate ?? 0, s.exclam),
    question_rate: blend(existing?.question_rate ?? 0, s.question),
    contraction_rate: blend(existing?.contraction_rate ?? 0, s.contractions),
    caps_rate: blend(existing?.caps_rate ?? 0, s.caps),
  };

  await supabase.from("personality_style").upsert(payload);
}

// ---------------------------------------------------------------------------
// PORTRAIT SYNTHESIS
// ---------------------------------------------------------------------------

type Portrait = {
  energy: string;
  mood: string;
  values_worldview: string;
  interests_ideas: string;
  communication: string;
  explicit_preferences: string[];
  freeform_notes: string;
  turns_since_synthesis: number;
  last_synthesized_at: string | null;
};

const EMPTY_PORTRAIT: Portrait = {
  energy: "",
  mood: "",
  values_worldview: "",
  interests_ideas: "",
  communication: "",
  explicit_preferences: [],
  freeform_notes: "",
  turns_since_synthesis: 0,
  last_synthesized_at: null,
};

const SYNTH_MIN_TURNS = 4;         // don't synthesize a portrait from 1 line
const SYNTH_TURN_INTERVAL = 10;    // resynthesize every N user turns
const SYNTH_MAX_AGE_MS = 24 * 60 * 60 * 1000; // ...or every 24h

async function loadPortrait(supabase: Sb, userId: string): Promise<Portrait> {
  // The generated Database types may not include this table yet — cast.
  const client = supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (col: string, v: string) => { maybeSingle: () => Promise<{ data: Portrait | null }> };
      };
    };
  };
  const { data } = await client
    .from("personality_portrait")
    .select("energy,mood,values_worldview,interests_ideas,communication,explicit_preferences,freeform_notes,turns_since_synthesis,last_synthesized_at")
    .eq("user_id", userId)
    .maybeSingle();
  return data ?? { ...EMPTY_PORTRAIT };
}

async function upsertPortrait(
  supabase: Sb,
  userId: string,
  patch: Partial<Portrait>,
): Promise<void> {
  const client = supabase as unknown as {
    from: (t: string) => {
      upsert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
    };
  };
  await client.from("personality_portrait").upsert({
    user_id: userId,
    ...patch,
    updated_at: new Date().toISOString(),
  });
}

/**
 * Called on every user turn from the chat pipeline. Cheap — usually just
 * bumps a counter. Every SYNTH_TURN_INTERVAL turns (or after 24h) it kicks
 * off an actual LLM synthesis using recent messages.
 *
 * Non-blocking: caller wraps in fire-and-forget. Errors are swallowed.
 */
export async function maybeSynthesizePortrait(
  supabase: Sb,
  userId: string,
  openrouterApiKey: string | undefined,
): Promise<void> {
  const current = await loadPortrait(supabase, userId);
  const nextTurns = current.turns_since_synthesis + 1;

  const lastAt = current.last_synthesized_at ? Date.parse(current.last_synthesized_at) : 0;
  const ageMs = Date.now() - lastAt;
  const dueByCount = nextTurns >= SYNTH_TURN_INTERVAL;
  const dueByAge = lastAt > 0 && ageMs >= SYNTH_MAX_AGE_MS;
  const firstTimeReady = lastAt === 0 && nextTurns >= SYNTH_MIN_TURNS;
  const shouldSynthesize = dueByCount || dueByAge || firstTimeReady;

  if (!shouldSynthesize || !openrouterApiKey) {
    await upsertPortrait(supabase, userId, { turns_since_synthesis: nextTurns });
    return;
  }

  // Pull recent user + assistant messages for context. Cap tokens hard.
  const { data: msgs } = await supabase
    .from("messages")
    .select("role, content, created_at")
    .eq("user_id", userId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(60);

  const recent = (msgs ?? []).reverse();
  if (recent.length < SYNTH_MIN_TURNS) {
    await upsertPortrait(supabase, userId, { turns_since_synthesis: nextTurns });
    return;
  }

  const transcript = recent
    .map((m) => `${m.role === "user" ? "USER" : "ASSISTANT"}: ${String(m.content).slice(0, 800)}`)
    .join("\n")
    .slice(-14000);

  const currentJson = JSON.stringify({
    energy: current.energy,
    mood: current.mood,
    values_worldview: current.values_worldview,
    interests_ideas: current.interests_ideas,
    communication: current.communication,
    explicit_preferences: current.explicit_preferences,
    freeform_notes: current.freeform_notes,
  }, null, 2);

  const system = `You are a nuanced portrait-writer studying a single person via their chat transcripts. You DO NOT invent hard rules. You DO NOT flatten personality into "do X / don't Y". You write short, human, observant prose about who this person seems to be right now.

Return STRICT JSON matching this shape (all fields required, use empty string / empty array if you truly have nothing to say):
{
  "energy": "1-3 sentences on cadence, pace, intensity, when they're on vs muted",
  "mood": "1-3 sentences on baseline emotional register lately — steady, restless, grieving, hyped, etc.",
  "values_worldview": "1-3 sentences on ethics, morals, politics, what they defend, what they mock",
  "interests_ideas": "1-3 sentences on recurring themes, projects, obsessions, curiosities",
  "communication": "1-3 sentences on how they want to be met — bluntness, humor, formality, when they want space vs pushback",
  "explicit_preferences": ["ONLY things the user has LITERALLY told the AI to do or not do, unambiguous, quoted-ish. Empty array if none. Do NOT infer preferences from vibe."],
  "freeform_notes": "Anything else worth remembering that doesn't fit above — max 2 sentences"
}

Rules:
- Merge with the existing portrait; refine, don't erase what still fits.
- If evidence contradicts an old note, update it. If evidence is thin, keep the old note.
- Never moralize about the person. Describe, don't judge.
- Never fabricate. If a field has no evidence, leave it as the current value or empty.
- explicit_preferences is the ONLY place for do/don't statements, and only when the user actually said them. Not vibes. Not inferred rules.`;

  const user = `CURRENT PORTRAIT (may be empty):
${currentJson}

RECENT TRANSCRIPT (oldest to newest):
${transcript}

Return updated portrait JSON now.`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openrouterApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.3-70b-instruct:free",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
        temperature: 0.4,
        max_tokens: 800,
      }),
    });
    if (!res.ok) {
      await upsertPortrait(supabase, userId, { turns_since_synthesis: nextTurns });
      return;
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = json.choices?.[0]?.message?.content ?? "";
    const parsed = safeParsePortrait(raw);
    if (!parsed) {
      await upsertPortrait(supabase, userId, { turns_since_synthesis: nextTurns });
      return;
    }
    await upsertPortrait(supabase, userId, {
      energy: parsed.energy,
      mood: parsed.mood,
      values_worldview: parsed.values_worldview,
      interests_ideas: parsed.interests_ideas,
      communication: parsed.communication,
      explicit_preferences: parsed.explicit_preferences,
      freeform_notes: parsed.freeform_notes,
      turns_since_synthesis: 0,
      last_synthesized_at: new Date().toISOString(),
    });
  } catch {
    await upsertPortrait(supabase, userId, { turns_since_synthesis: nextTurns });
  }
}

function safeParsePortrait(raw: string): {
  energy: string;
  mood: string;
  values_worldview: string;
  interests_ideas: string;
  communication: string;
  explicit_preferences: string[];
  freeform_notes: string;
} | null {
  try {
    // Some models wrap JSON in ```json fences even with response_format
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
    const obj = JSON.parse(cleaned) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 800).trim() : "");
    const arr = (v: unknown) =>
      Array.isArray(v)
        ? v.filter((x) => typeof x === "string" && x.trim().length > 0).slice(0, 20).map((x) => String(x).slice(0, 240))
        : [];
    return {
      energy: str(obj.energy),
      mood: str(obj.mood),
      values_worldview: str(obj.values_worldview),
      interests_ideas: str(obj.interests_ideas),
      communication: str(obj.communication),
      explicit_preferences: arr(obj.explicit_preferences),
      freeform_notes: str(obj.freeform_notes),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// SYSTEM PROMPT BLOCK
// ---------------------------------------------------------------------------

export async function buildPersonalityBlock(
  supabase: Sb,
  userId: string,
): Promise<string> {
  const [portrait, styleRes] = await Promise.all([
    loadPortrait(supabase, userId),
    supabase
      .from("personality_style")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  const style = styleRes.data;

  const styleLine = style && style.sample_count > 3
    ? [
        `avg_msg_len≈${Math.round(style.avg_message_length)}ch`,
        `profanity=${pct(style.profanity_rate * 100)}`,
        `emoji=${pct(style.emoji_rate * 1000)}/1k chars`,
        `caps=${pct(style.caps_rate * 100)}`,
        `contractions=${pct(style.contraction_rate * 100)}`,
        `exclaim=${pct(style.exclamation_rate * 1000)}/1k chars`,
        `questions=${pct(style.question_rate * 1000)}/1k chars`,
      ].join(", ")
    : "(insufficient sample yet — mirror the latest user message tone)";

  const anyPortrait =
    portrait.energy || portrait.mood || portrait.values_worldview ||
    portrait.interests_ideas || portrait.communication ||
    portrait.explicit_preferences.length > 0 || portrait.freeform_notes;

  const portraitLines = anyPortrait
    ? [
        portrait.energy ? `Energy: ${portrait.energy}` : "",
        portrait.mood ? `Mood: ${portrait.mood}` : "",
        portrait.values_worldview ? `Values / worldview: ${portrait.values_worldview}` : "",
        portrait.interests_ideas ? `Interests / ideas: ${portrait.interests_ideas}` : "",
        portrait.communication ? `How they want to be met: ${portrait.communication}` : "",
        portrait.freeform_notes ? `Notes: ${portrait.freeform_notes}` : "",
      ].filter(Boolean).join("\n")
    : "(no portrait synthesized yet — read the room from this turn's tone alone)";

  const prefLines = portrait.explicit_preferences.length
    ? portrait.explicit_preferences.map((p) => `- ${p}`).join("\n")
    : "- (none — the user hasn't laid down any explicit rules; use judgment)";

  return [
    "### ADAPTIVE PERSONALITY — LEARNED FROM THIS USER",
    "This is a portrait of the person you're talking to, synthesized from their recent messages. Treat it as observational context — not a set of commandments. Match their energy, respect their values, engage their interests. Do NOT quote this back at them. Do NOT treat it as static: their mood shifts turn-to-turn.",
    "",
    "PORTRAIT:",
    portraitLines,
    "",
    "EXPLICIT PREFERENCES (things the user literally told you — honor these):",
    prefLines,
    "",
    `STYLE FINGERPRINT (statistical mimicry cues): ${styleLine}`,
  ].join("\n");
}

function pct(v: number): string {
  return `${v.toFixed(1)}`;
}
