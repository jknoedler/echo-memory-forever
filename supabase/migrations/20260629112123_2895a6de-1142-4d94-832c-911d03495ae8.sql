
CREATE TABLE public.user_providers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  catalog_id text not null,
  label text not null,
  api_key text,
  base_url text,
  default_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, catalog_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_providers TO authenticated;
GRANT ALL ON public.user_providers TO service_role;

ALTER TABLE public.user_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own providers" ON public.user_providers
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER user_providers_touch
  BEFORE UPDATE ON public.user_providers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.user_settings
  ADD COLUMN active_provider_id uuid REFERENCES public.user_providers(id) ON DELETE SET NULL;
