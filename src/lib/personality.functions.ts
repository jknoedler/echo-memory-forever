import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type PortraitRow = {
  user_id: string;
  energy: string;
  mood: string;
  values_worldview: string;
  interests_ideas: string;
  communication: string;
  explicit_preferences: string[];
  freeform_notes: string;
  last_synthesized_at: string | null;
  turns_since_synthesis: number;
  updated_at: string;
};

export const getPersonalityPortrait = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, v: string) => { maybeSingle: () => Promise<{ data: PortraitRow | null }> };
        };
      };
    };
    const { data: portrait } = await sb
      .from("personality_portrait")
      .select("energy,mood,values_worldview,interests_ideas,communication,explicit_preferences,freeform_notes,last_synthesized_at,turns_since_synthesis,updated_at")
      .eq("user_id", context.userId)
      .maybeSingle();

    const { data: style } = await context.supabase
      .from("personality_style")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();

    return {
      portrait: portrait ?? {
        energy: "",
        mood: "",
        values_worldview: "",
        interests_ideas: "",
        communication: "",
        explicit_preferences: [],
        freeform_notes: "",
        last_synthesized_at: null,
        turns_since_synthesis: 0,
      },
      style: style ?? null,
    };
  });

const UpdatePortrait = z.object({
  energy: z.string().max(2000).optional(),
  mood: z.string().max(2000).optional(),
  values_worldview: z.string().max(2000).optional(),
  interests_ideas: z.string().max(2000).optional(),
  communication: z.string().max(2000).optional(),
  freeform_notes: z.string().max(2000).optional(),
  explicit_preferences: z.array(z.string().min(1).max(240)).max(30).optional(),
});

export const updatePersonalityPortrait = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => UpdatePortrait.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as {
      from: (t: string) => {
        upsert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      };
    };
    const { error } = await sb.from("personality_portrait").upsert({
      user_id: context.userId,
      ...data,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetPersonalityPortrait = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as {
      from: (t: string) => {
        delete: () => { eq: (col: string, v: string) => Promise<{ error: { message: string } | null }> };
      };
    };
    const { error } = await sb.from("personality_portrait").delete().eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// PORTRAIT HISTORY
// ---------------------------------------------------------------------------

type HistoryRow = {
  id: string;
  energy: string;
  mood: string;
  values_worldview: string;
  interests_ideas: string;
  communication: string;
  explicit_preferences: string[];
  freeform_notes: string;
  change_source: string;
  snapshot_at: string;
};

export const getPersonalityHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, v: string) => {
            order: (col: string, opts: { ascending: boolean }) => {
              limit: (n: number) => Promise<{ data: HistoryRow[] | null }>;
            };
          };
        };
      };
    };
    const { data } = await sb
      .from("personality_portrait_history")
      .select("id,energy,mood,values_worldview,interests_ideas,communication,explicit_preferences,freeform_notes,change_source,snapshot_at")
      .eq("user_id", context.userId)
      .order("snapshot_at", { ascending: false })
      .limit(50);
    return { history: (data ?? []) as HistoryRow[] };
  });

const RollbackInput = z.object({ id: z.string().uuid() });

export const rollbackPersonalityPortrait = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RollbackInput.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, v: string) => {
            eq: (col: string, v: string) => {
              maybeSingle: () => Promise<{ data: HistoryRow | null }>;
            };
          };
        };
        upsert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      };
    };
    const { data: snap } = await sb
      .from("personality_portrait_history")
      .select("energy,mood,values_worldview,interests_ideas,communication,explicit_preferences,freeform_notes")
      .eq("user_id", context.userId)
      .eq("id", data.id)
      .maybeSingle();
    if (!snap) throw new Error("Version not found");
    const { error } = await sb.from("personality_portrait").upsert({
      user_id: context.userId,
      energy: snap.energy,
      mood: snap.mood,
      values_worldview: snap.values_worldview,
      interests_ideas: snap.interests_ideas,
      communication: snap.communication,
      explicit_preferences: snap.explicit_preferences,
      freeform_notes: snap.freeform_notes,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
