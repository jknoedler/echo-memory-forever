import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sanitizeOpenRouterModel } from "./openrouter-free";

export const getMySettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const cols =
      "provider, model, custom_base_url, custom_api_key, custom_model_id, system_prompt_override, hotl_auto_execute, biometrics_secret, active_provider_id, fallback_provider_id, fallback_provider_kind";
    const { data, error } = await context.supabase
      .from("user_settings")
      .select(cols)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      // Fallback in case the signup trigger didn't fire
      const { data: ins, error: insErr } = await context.supabase
        .from("user_settings")
        .insert({ user_id: context.userId })
        .select(cols)
        .single();
      if (insErr) throw new Error(insErr.message);
      return ins;
    }
    return data;
  });

const SettingsUpdate = z.object({
  provider: z.enum(["lovable", "openai", "groq", "llama", "venice", "gemini", "openrouter", "custom"]).optional(),
  model: z.string().max(200).optional(),
  custom_base_url: z.string().url().nullable().optional(),
  custom_api_key: z.string().max(500).nullable().optional(),
  custom_model_id: z.string().max(200).nullable().optional(),
  system_prompt_override: z.string().max(8000).nullable().optional(),
  hotl_auto_execute: z.boolean().optional(),
  fallback_provider_id: z.string().uuid().nullable().optional(),
  fallback_provider_kind: z.enum(["groq", "openai", "llama", "venice", "gemini", "openrouter"]).nullable().optional(),
});


export const updateMySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => SettingsUpdate.parse(d))
  .handler(async ({ data, context }) => {
    // Guard our project OpenRouter key: only free-tier models allowed.
    const patch = { ...data };
    if (patch.provider === "openrouter" && patch.model !== undefined) {
      patch.model = sanitizeOpenRouterModel(patch.model);
    }
    if (patch.fallback_provider_kind === "openrouter") {
      // Nothing to sanitize here (no model column on fallback), but the
      // chat route sanitizes at request time too.
    }
    const { error } = await context.supabase
      .from("user_settings")
      .update(patch)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const rotateBiometricsSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    const { error } = await context.supabase
      .from("user_settings")
      .update({ biometrics_secret: hex })
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { secret: hex };
  });
