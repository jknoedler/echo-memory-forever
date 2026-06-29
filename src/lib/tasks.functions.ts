import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listStagedTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("staged_tasks")
      .select("id, thread_id, title, description, payload, status, due_at, created_at, decided_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const CreateTask = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  due_at: z.string().datetime().optional(),
  thread_id: z.string().uuid().optional(),
});

export const createStagedTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CreateTask.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("staged_tasks")
      .insert({
        user_id: context.userId,
        title: data.title,
        description: data.description ?? null,
        payload: data.payload ?? {},
        due_at: data.due_at ?? null,
        thread_id: data.thread_id ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const decideStagedTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), decision: z.enum(["approved", "rejected"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("staged_tasks")
      .update({ status: data.decision, decided_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
