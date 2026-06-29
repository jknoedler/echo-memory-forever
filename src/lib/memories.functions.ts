import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { embedText } from "./embeddings.server";

export const addMemoryNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ content: z.string().min(1).max(8000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const vec = await embedText(data.content);
    const { data: row, error } = await context.supabase
      .from("memories")
      .insert({
        user_id: context.userId,
        source: "note",
        content: data.content,
        embedding: vec as unknown as string,
        metadata: {},
      })
      .select("id, content, source, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listRecentMemories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("memories")
      .select("id, content, source, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listRecentBiometrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("biometrics")
      .select("id, kind, value, recorded_at")
      .order("recorded_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
