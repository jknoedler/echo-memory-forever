
CREATE TABLE public.personality_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  directive text not null,
  polarity text not null check (polarity in ('do','dont')),
  emotion_score real not null default 0,
  status text not null default 'active' check (status in ('active','under_review','confirmed','revoked')),
  reason text,
  source_message text,
  thread_id uuid references public.threads(id) on delete set null,
  recalibrate_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE INDEX personality_rules_user_status_idx ON public.personality_rules(user_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.personality_rules TO authenticated;
GRANT ALL ON public.personality_rules TO service_role;
ALTER TABLE public.personality_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own personality rules" ON public.personality_rules
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER personality_rules_touch
  BEFORE UPDATE ON public.personality_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.personality_style (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sample_count int not null default 0,
  avg_message_length real not null default 0,
  profanity_rate real not null default 0,
  emoji_rate real not null default 0,
  exclamation_rate real not null default 0,
  question_rate real not null default 0,
  contraction_rate real not null default 0,
  caps_rate real not null default 0,
  traits jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personality_style TO authenticated;
GRANT ALL ON public.personality_style TO service_role;
ALTER TABLE public.personality_style ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own personality style" ON public.personality_style
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER personality_style_touch
  BEFORE UPDATE ON public.personality_style
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
