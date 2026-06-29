import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listPersonalityRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [rules, style] = await Promise.all([
      context.supabase
        .from("personality_rules")
        .select("id, directive, polarity, status, emotion_score, reason, created_at, recalibrate_after")
        .order("updated_at", { ascending: false }),
      context.supabase
        .from("personality_style")
        .select("*")
        .eq("user_id", context.userId)
        .maybeSingle(),
    ]);
    if (rules.error) throw new Error(rules.error.message);
    return { rules: rules.data ?? [], style: style.data ?? null };
  });

const UpdateRule = z.object({
  id: z.string().uuid(),
  status: z.enum(["active", "under_review", "confirmed", "revoked"]),
});

export const updatePersonalityRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => UpdateRule.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("personality_rules")
      .update({
        status: data.status,
        recalibrate_after: data.status === "under_review" ? new Date(Date.now() + 86_400_000).toISOString() : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePersonalityRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("personality_rules")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
