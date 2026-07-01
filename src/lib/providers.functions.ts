import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sanitizeOpenRouterModel } from "./openrouter-free";

export const listUserProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_providers")
      .select("id, catalog_id, label, base_url, default_model, created_at, api_key")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
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
      // Legacy kinds still accepted; anything not custom/openrouter is
      // coerced to openrouter so old clients keep working.
      provider_kind: z
        .enum(["lovable", "openai", "groq", "llama", "venice", "gemini", "openrouter", "custom"])
        .optional(),
      model: z.string().max(200).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let providerName: string;
    if (data.provider_id !== null) {
      providerName = "custom";
    } else {
      const kind = data.provider_kind ?? "openrouter";
      providerName = kind === "custom" ? "custom" : "openrouter";
    }
    const update: {
      active_provider_id: string | null;
      provider: string;
      model?: string;
    } = {
      active_provider_id: data.provider_id,
      provider: providerName,
    };
    if (data.model) {
      update.model =
        providerName === "openrouter" ? sanitizeOpenRouterModel(data.model) : data.model;
    }
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
    // We only ship OpenRouter now. Other flags are kept `false` so any
    // stale UI that reads them just hides those sections.
    return {
      openai: false,
      groq: false,
      llama: false,
      venice: false,
      gemini: false,
      openrouter: !!process.env.OPENROUTER_API_KEY,
    };
  });
