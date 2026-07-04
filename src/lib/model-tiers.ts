// Tiered fallback: free → ultra-cheap → cheap.
//
// When OpenRouter's free tier 429s across the board, we step down through
// paid OpenRouter models with strict per-tier price ceilings and per-user
// hourly rate limits. Chat is free software; the ceilings + limits keep
// per-user cost bounded to pennies per day even in the worst case.

export type PaidTier = "ultra_cheap" | "cheap";

export type PaidTierConfig = {
  tier: PaidTier;
  label: string;
  /** Hard ceiling on output $/M tokens. Anything above → not shipped. */
  outputCeilingPerMTokens: number;
  /** Per-user hourly message cap for this tier. */
  hourlyLimit: number;
  /** Who's allowed to reach this tier. */
  audience: "everyone" | "paid_only";
  /** Model IDs in priority order (cheapest first). All routed via OpenRouter. */
  models: string[];
};

// T1 — ultra-cheap. ≤ $0.15/M output. Available to every user.
// Verified pricing on OpenRouter (approximate, live):
//   - meta-llama/llama-3.1-8b-instruct     ~$0.02 in / $0.05 out
//   - mistralai/ministral-8b               ~$0.10 / $0.10
//   - google/gemini-2.0-flash-lite-001     ~$0.075 / $0.30 ← borderline
export const TIER_ULTRA_CHEAP: PaidTierConfig = {
  tier: "ultra_cheap",
  label: "T1 ultra-cheap",
  outputCeilingPerMTokens: 0.15,
  hourlyLimit: 20,
  audience: "everyone",
  models: [
    "meta-llama/llama-3.1-8b-instruct",
    "mistralai/ministral-8b",
  ],
};

// T2 — cheap. ≤ $1.00/M output. Paid users only.
//   - openai/gpt-4.1-nano                  $0.10 / $0.40
//   - openai/gpt-4o-mini                   $0.15 / $0.60
export const TIER_CHEAP: PaidTierConfig = {
  tier: "cheap",
  label: "T2 cheap",
  outputCeilingPerMTokens: 1.0,
  hourlyLimit: 100,
  audience: "paid_only",
  models: [
    "openai/gpt-4.1-nano",
    "openai/gpt-4o-mini",
  ],
};

export const PAID_TIERS: PaidTierConfig[] = [TIER_ULTRA_CHEAP, TIER_CHEAP];

export function tiersForUser(isPaid: boolean): PaidTierConfig[] {
  return PAID_TIERS.filter((t) => t.audience === "everyone" || isPaid);
}
