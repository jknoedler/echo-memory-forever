import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listUserProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_providers")
      .select("id, catalog_id, label, base_url, default_model, created_at, api_key")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    // Don't return the raw key — just whether one is set.
    return (data ?? []).map((row) => ({
      id: row.id,
      catalog_id: row.catalog_id,
      label: row.label,
      base_url: row.base_url,
      default_model: row.default_model,
      created_at: row.created_at,
      has_key: !!row.api_key,
    }));
  });

const AddProvider = z.object({
  catalog_id: z.string().min(1).max(64),
  label: z.string().min(1).max(120),
  api_key: z.string().max(500).nullable().optional(),
  base_url: z.string().url().max(500).nullable().optional(),
  default_model: z.string().max(200).nullable().optional(),
});

export const addUserProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => AddProvider.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("user_providers")
      .upsert(
        {
          user_id: context.userId,
          catalog_id: data.catalog_id,
          label: data.label,
          api_key: data.api_key ?? null,
          base_url: data.base_url ?? null,
          default_model: data.default_model ?? null,
        },
        { onConflict: "user_id,catalog_id" },
      )
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteUserProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("user_providers")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setActiveProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      provider_id: z.string().uuid().nullable(),
      provider_kind: z.enum(["lovable", "openai", "groq", "llama", "custom"]).optional(),
      model: z.string().max(200).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const providerName =
      data.provider_id !== null
        ? "custom"
        : (data.provider_kind ?? "lovable");
    const update: {
      active_provider_id: string | null;
      provider: string;
      model?: string;
    } = {
      active_provider_id: data.provider_id,
      provider: providerName,
    };
    if (data.model) update.model = data.model;
    const { error } = await context.supabase
      .from("user_settings")
      .update(update)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listEnvProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return {
      openai: !!process.env.OPENAI_API_KEY,
      groq: !!process.env.GROQ_API_KEY,
      llama: !!process.env.LLAMA_API_KEY,
    };
  });
