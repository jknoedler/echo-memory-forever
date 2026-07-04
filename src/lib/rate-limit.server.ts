// Per-user hourly rate limit check for paid model tiers.
//
// Uses the SECURITY DEFINER `bump_model_usage(tier, limit)` RPC we added
// in migration 20260704. Atomic: increments the hourly counter and returns
// whether the user is still under the tier's cap. If they're over, the
// increment is rolled back so honest retries don't dig the hole deeper.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type UsageCheck = {
  allowed: boolean;
  currentCount: number;
};

export async function bumpModelUsage(
  supabase: SupabaseClient<Database>,
  tier: string,
  hourlyLimit: number,
): Promise<UsageCheck> {
  try {
    const { data, error } = await (supabase as unknown as {
      rpc: (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{
        data: Array<{ allowed: boolean; current_count: number }> | null;
        error: { message: string } | null;
      }>;
    }).rpc("bump_model_usage", { _tier: tier, _limit: hourlyLimit });
    if (error) {
      console.warn(`[rate-limit] bump_model_usage(${tier}) failed:`, error.message);
      // Fail-open: don't lock users out if the DB helper hiccups.
      return { allowed: true, currentCount: 0 };
    }
    const row = data?.[0];
    return {
      allowed: row?.allowed ?? true,
      currentCount: row?.current_count ?? 0,
    };
  } catch (e) {
    console.warn(`[rate-limit] bump_model_usage(${tier}) threw:`, e);
    return { allowed: true, currentCount: 0 };
  }
}
