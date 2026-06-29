// Adaptive personality engine.
// Server-only helpers used by /api/chat to:
//   1. Detect explicit directives in the user's latest message
//      ("don't correct my grammar", "stop saying X", "always be blunt").
//   2. Score how emotionally charged that message is (0..1).
//   3. Capture the directive as a personality_rules row.
//        - low emotion  → active immediately
//        - high emotion → under_review, recalibrate ~24h later
//   4. Maintain a rolling style fingerprint (personality_style)
//      so DED mimics the user's mannerisms.
//   5. Promote / revoke ripe under_review rules and stage a HOTL
//      task asking the user to confirm.
//
// Pure functions; no AI calls. Cheap, runs on every user turn.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Sb = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// EMOTION SCORING
// ---------------------------------------------------------------------------

const EMOTION_LEXICON = [
  "fuck", "shit", "damn", "hate", "furious", "angry", "pissed", "rage",
  "stop", "enough", "stfu", "shut up", "annoying", "annoyed", "frustrated",
  "leave me alone", "i can't", "i cant", "scared", "terrified", "panic",
  "anxious", "crying", "broken", "hurt", "betrayed", "wtf", "omg",
];

export function scoreEmotion(text: string): number {
  if (!text) return 0;
  const t = text.toLowerCase();
  const len = Math.max(text.length, 1);

  const exclam = (text.match(/!/g) ?? []).length;
  const caps = (text.match(/[A-Z]/g) ?? []).length;
  const capsRate = caps / len;
  const lex = EMOTION_LEXICON.reduce((n, w) => (t.includes(w) ? n + 1 : n), 0);
  const repeated = (text.match(/([!?])\1{1,}/g) ?? []).length;

  // Weighted sum, clamped 0..1.
  const raw =
    Math.min(exclam, 6) * 0.06 +
    Math.min(capsRate, 0.5) * 0.8 +
    Math.min(lex, 4) * 0.18 +
    repeated * 0.12;

  return Math.max(0, Math.min(1, raw));
}

// ---------------------------------------------------------------------------
// DIRECTIVE DETECTION
// ---------------------------------------------------------------------------

// Common shapes:
//   "don't X anymore" / "stop X-ing" / "quit X-ing" / "never X" / "no more X"
//   "always X" / "from now on, X" / "I want you to X"
//   "I hate when you X" / "it's rude when you X"
const DONT_PATTERNS = [
  /\b(?:don'?t|do not|stop|quit|never|no longer|no more|cut(?: it)? out|knock it off|cease)\s+([^.!?\n]{3,140})/i,
  /\bi (?:hate|dislike|can'?t stand) (?:it )?when (?:you|u) ([^.!?\n]{3,140})/i,
  /\bit'?s (?:rude|annoying|condescending|patronizing) when (?:you|u) ([^.!?\n]{3,140})/i,
  /\bstop being\s+([^.!?\n]{3,80})/i,
];

const DO_PATTERNS = [
  /\b(?:always|from now on,?|going forward,?|please|i want you to|i need you to|just)\s+([^.!?\n]{3,140})/i,
  /\bbe more\s+([^.!?\n]{3,80})/i,
  /\bbe\s+(blunt|direct|chill|honest|less formal|more casual|more formal|softer|warmer|colder|funnier|nicer|meaner)\b[^.!?\n]{0,80}/i,
];

export type DetectedDirective = {
  polarity: "do" | "dont";
  directive: string;
};

export function detectDirective(text: string): DetectedDirective | null {
  if (!text || text.length < 6 || text.length > 600) return null;
  const trimmed = text.trim();

  for (const re of DONT_PATTERNS) {
    const m = trimmed.match(re);
    if (m) return { polarity: "dont", directive: cleanDirective(m[0]) };
  }
  for (const re of DO_PATTERNS) {
    const m = trimmed.match(re);
    if (m) return { polarity: "do", directive: cleanDirective(m[0]) };
  }
  return null;
}

function cleanDirective(s: string): string {
  return s.replace(/\s+/g, " ").trim().slice(0, 200);
}

// ---------------------------------------------------------------------------
// STYLE FINGERPRINT
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

  // Exponential moving average — recent behavior weighted more than ancient.
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
// CAPTURE + RECALIBRATION
// ---------------------------------------------------------------------------

const HIGH_EMOTION_THRESHOLD = 0.45;
const RECAL_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

export async function captureDirective(
  supabase: Sb,
  userId: string,
  threadId: string,
  text: string,
): Promise<{ rule?: { id: string; status: string; directive: string }; emotion: number }> {
  const emotion = scoreEmotion(text);
  const detected = detectDirective(text);
  if (!detected) return { emotion };

  const highEmotion = emotion >= HIGH_EMOTION_THRESHOLD;
  const status = highEmotion ? "under_review" : "active";
  const recalibrate_after = highEmotion
    ? new Date(Date.now() + RECAL_WINDOW_MS).toISOString()
    : null;

  const { data, error } = await supabase
    .from("personality_rules")
    .insert({
      user_id: userId,
      thread_id: threadId,
      directive: detected.directive,
      polarity: detected.polarity,
      emotion_score: emotion,
      status,
      recalibrate_after,
      source_message: text.slice(0, 1000),
      reason: highEmotion
        ? "Captured during a high-emotion moment. Honor it now, re-confirm later."
        : "Captured from explicit user directive.",
    })
    .select("id, status, directive")
    .single();

  if (error || !data) return { emotion };
  return { rule: data, emotion };
}

// Sweep ripe under_review rules: surface a HOTL task asking the user to
// confirm. Called opportunistically on each user turn — cheap when nothing
// is ripe.
export async function sweepRecalibrations(
  supabase: Sb,
  userId: string,
): Promise<void> {
  const { data: ripe } = await supabase
    .from("personality_rules")
    .select("id, directive, polarity")
    .eq("user_id", userId)
    .eq("status", "under_review")
    .lt("recalibrate_after", new Date().toISOString())
    .limit(5);
  if (!ripe || ripe.length === 0) return;

  for (const r of ripe) {
    // Avoid duplicate tasks for the same rule.
    const { data: existing } = await supabase
      .from("staged_tasks")
      .select("id")
      .eq("status", "pending")
      .ilike("title", `Recalibrate personality rule%${r.id}%`)
      .maybeSingle();
    if (existing) continue;

    await supabase.from("staged_tasks").insert({
      user_id: userId,
      title: `Recalibrate personality rule [${r.id}]`,
      summary: `Earlier you told me ${r.polarity === "dont" ? "to stop" : "to start"}: "${r.directive}". You were heated when you said it. Want me to keep this as a permanent rule, or drop it?`,
      kind: "personality_recalibration",
      payload: { rule_id: r.id },
    } as never);
  }
}

// ---------------------------------------------------------------------------
// SYSTEM PROMPT BLOCK
// ---------------------------------------------------------------------------

export async function buildPersonalityBlock(
  supabase: Sb,
  userId: string,
): Promise<string> {
  const [{ data: rules }, { data: style }] = await Promise.all([
    supabase
      .from("personality_rules")
      .select("directive, polarity, status, emotion_score")
      .eq("user_id", userId)
      .in("status", ["active", "under_review", "confirmed"])
      .order("updated_at", { ascending: false })
      .limit(40),
    supabase
      .from("personality_style")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const ruleLines = (rules ?? []).map((r) => {
    const tag =
      r.status === "under_review"
        ? "[provisional, captured while user was heated — honor it for now]"
        : r.status === "confirmed"
          ? "[confirmed]"
          : "[active]";
    return `- ${r.polarity === "dont" ? "DON'T" : "DO"} ${r.directive} ${tag}`;
  });

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

  return [
    "### ADAPTIVE PERSONALITY — LEARNED FROM THIS USER",
    "Mimic the user's mannerisms. Match cadence, profanity, formality, and energy.",
    `Style fingerprint: ${styleLine}`,
    "",
    "Personal rules (these override the default style — never relitigate them):",
    ruleLines.length ? ruleLines.join("\n") : "- (no captured rules yet)",
    "",
    "When a rule is tagged [provisional], follow it but do not treat it as permanent. The user was emotionally activated when they set it; a recalibration check-in is already scheduled.",
  ].join("\n");
}

function pct(v: number): string {
  return `${v.toFixed(1)}`;
}
