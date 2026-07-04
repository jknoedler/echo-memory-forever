import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// -------- Utilities --------

// Compute the local date (YYYY-MM-DD) in an IANA tz for a given instant.
function localDayKey(instant: Date, tz: string): string {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    // en-CA yields YYYY-MM-DD reliably
    return fmt.format(instant);
  } catch {
    return instant.toISOString().slice(0, 10);
  }
}

function todayTitleFor(dayKey: string): string {
  // "Today · Wed Nov 12" style rendered client-side later; store the ISO
  // date as the canonical title so it sorts and doesn't lie about "today"
  // once the day rolls.
  return dayKey;
}

// -------- Reads --------

export const listThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("threads")
      .select("id, title, last_message_at, created_at, continuity_status, continuity_note")
      .order("last_message_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

type GroupedRow = {
  id: string;
  title: string;
  last_message_at: string;
  created_at: string;
  continuity_status: string;
  is_daily_root: boolean;
  parent_thread_id: string | null;
  day_key: string | null;
};

export const listThreadsGrouped = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          order: (col: string, opts: { ascending: boolean; nullsFirst?: boolean }) => {
            limit: (n: number) => Promise<{ data: GroupedRow[] | null; error: { message: string } | null }>;
          };
        };
      };
    };
    const { data, error } = await sb
      .from("threads")
      .select(
        "id, title, last_message_at, created_at, continuity_status, is_daily_root, parent_thread_id, day_key",
      )
      .order("last_message_at", { ascending: false })
      .limit(400);
    if (error) throw new Error(error.message);
    const rows = data ?? [];

    // Bucket by day_key; roots first, then subs sorted by last_message_at desc.
    const byDay = new Map<string, { root: GroupedRow | null; subs: GroupedRow[] }>();
    for (const r of rows) {
      const key = r.day_key ?? r.created_at.slice(0, 10);
      if (!byDay.has(key)) byDay.set(key, { root: null, subs: [] });
      const bucket = byDay.get(key)!;
      if (r.is_daily_root) bucket.root = r;
      else bucket.subs.push(r);
    }
    const groups = Array.from(byDay.entries())
      .map(([dayKey, { root, subs }]) => ({ dayKey, root, subs }))
      .sort((a, b) => (a.dayKey < b.dayKey ? 1 : -1));
    return groups;
  });

// -------- Today root (get-or-create) --------

const TzInput = z.object({ tz: z.string().min(1).max(80) });

export const getOrCreateTodayThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => TzInput.parse(d))
  .handler(async ({ data, context }) => {
    // Loose typing — the generated Database types don't include the new
    // daily-chat columns yet. All calls go through the authenticated client.
    const sb = context.supabase as unknown as Record<string, never> & {
      from: (t: string) => any;
    };


    const dayKey = localDayKey(new Date(), data.tz);

    // 1. Existing daily root for today?
    const existing = await sb
      .from("threads")
      .select("id, title, last_message_at, created_at, continuity_status, is_daily_root, parent_thread_id, day_key")
      .eq("user_id", context.userId)
      .eq("day_key", dayKey)
      .maybeSingle();
    if (existing.data) return existing.data;

    // 2. Find yesterday's most-recent daily root to carry context from.
    const prior = await sb
      .from("threads")
      .select("id")
      .eq("user_id", context.userId)
      .eq("is_daily_root", true)
      .order("day_key", { ascending: false })
      .limit(1);
    const carriedFromThreadId = prior.data?.[0]?.id ?? null;

    // 3. Create today's root.
    const insert = await sb
      .from("threads")
      .insert({
        user_id: context.userId,
        title: todayTitleFor(dayKey),
        day_key: dayKey,
        is_daily_root: true,
        parent_thread_id: null,
        carried_from_thread_id: carriedFromThreadId,
        timezone: data.tz,
        continuity_status: "open",
      })
      .select("id, title, last_message_at, created_at, continuity_status, is_daily_root, parent_thread_id, day_key")
      .single();
    if (insert.error || !insert.data) {
      throw new Error(insert.error?.message ?? "Failed to create today's chat");
    }
    return insert.data;
  });

// -------- Sub-chat within today --------

const SubInput = z.object({
  parentId: z.string().uuid(),
  title: z.string().max(120).optional(),
});

export const createSubThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => SubInput.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, v: unknown) => {
            maybeSingle: () => Promise<{ data: GroupedRow | null; error: { message: string } | null }>;
          };
        };
        insert: (row: Record<string, unknown>) => {
          select: (c: string) => {
            single: () => Promise<{ data: GroupedRow | null; error: { message: string } | null }>;
          };
        };
      };
    };

    const parent = await sb
      .from("threads")
      .select("id, day_key, is_daily_root, continuity_status, parent_thread_id")
      .eq("id", data.parentId)
      .maybeSingle();
    if (!parent.data || !parent.data.is_daily_root) {
      throw new Error("Sub-chats can only be created under today's main chat.");
    }
    if (parent.data.continuity_status === "archived") {
      throw new Error("This day is archived. Open today's chat first.");
    }

    const insert = await sb
      .from("threads")
      .insert({
        user_id: context.userId,
        title: data.title?.trim() || "Sub-chat",
        day_key: parent.data.day_key,
        is_daily_root: false,
        parent_thread_id: parent.data.id,
        timezone: null,
        continuity_status: "open",
      })
      .select("id, title, last_message_at, created_at, continuity_status, is_daily_root, parent_thread_id, day_key")
      .single();
    if (insert.error || !insert.data) {
      throw new Error(insert.error?.message ?? "Failed to create sub-chat");
    }
    return insert.data;
  });

// -------- Continuity + rename + delete + messages --------

export const setThreadContinuity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["open", "resolved", "archived"]),
        note: z.string().max(500).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: { continuity_status: string; continuity_note?: string | null } = {
      continuity_status: data.status,
    };
    if (data.note !== undefined) patch.continuity_note = data.note;
    const { error } = await context.supabase
      .from("threads")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Kept for back-compat with callers that expect the old shape; delegates
// to getOrCreateTodayThread when the caller doesn't supply a title.
export const createThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ title: z.string().max(120).optional(), tz: z.string().max(80).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const tz = data.tz || "UTC";
    // Route through the same code path so a "create new thread" click
    // becomes a get-or-create of today's daily root.
    const sb = context.supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, v: unknown) => {
            eq: (col: string, v: unknown) => {
              maybeSingle: () => Promise<{ data: GroupedRow | null; error: { message: string } | null }>;
            };
          };
        };
        insert: (row: Record<string, unknown>) => {
          select: (c: string) => {
            single: () => Promise<{ data: GroupedRow | null; error: { message: string } | null }>;
          };
        };
      };
    };
    const dayKey = localDayKey(new Date(), tz);
    const existing = await sb
      .from("threads")
      .select("id, title, last_message_at, created_at")
      .eq("user_id", context.userId)
      .eq("day_key", dayKey)
      .maybeSingle();
    if (existing.data) return existing.data;
    const insert = await sb
      .from("threads")
      .insert({
        user_id: context.userId,
        title: data.title?.trim() || dayKey,
        day_key: dayKey,
        is_daily_root: true,
        timezone: tz,
      })
      .select("id, title, last_message_at, created_at")
      .single();
    if (insert.error || !insert.data) throw new Error(insert.error?.message ?? "Failed");
    return insert.data;
  });

export const renameThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), title: z.string().min(1).max(120) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("threads")
      .update({ title: data.title })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("threads").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getThreadMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ threadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("messages")
      .select("id, role, content, parts, created_at")
      .eq("thread_id", data.threadId)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
