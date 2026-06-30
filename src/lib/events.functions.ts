import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Calendar events — user-curated dated milestones (anniversaries, trips,
 * appointments, doctor visits, "the day I quit my job", etc.). These feed
 * back into the chat system prompt so the model can recall *exactly* when
 * something happened instead of guessing from memory creation timestamps.
 */

export const listEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("events")
      .select("id, title, notes, occurred_at, all_day, created_at")
      .order("occurred_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        title: z.string().min(1).max(200),
        notes: z.string().max(2000).optional().nullable(),
        occurred_at: z.string().min(1),
        all_day: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const iso = new Date(data.occurred_at).toISOString();
    const { data: row, error } = await context.supabase
      .from("events")
      .insert({
        user_id: context.userId,
        title: data.title.trim(),
        notes: data.notes?.trim() || null,
        occurred_at: iso,
        all_day: data.all_day ?? false,
      })
      .select("id, title, notes, occurred_at, all_day, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("events").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
