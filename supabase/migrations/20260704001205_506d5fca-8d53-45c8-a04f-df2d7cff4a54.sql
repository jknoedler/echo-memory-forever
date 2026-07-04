
-- 1. Lock down chat_jobs writes to owner
CREATE POLICY "Users insert own chat jobs" ON public.chat_jobs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own chat jobs" ON public.chat_jobs
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own chat jobs" ON public.chat_jobs
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 2. Personality portrait version history
CREATE TABLE public.personality_portrait_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  energy TEXT NOT NULL DEFAULT '',
  mood TEXT NOT NULL DEFAULT '',
  values_worldview TEXT NOT NULL DEFAULT '',
  interests_ideas TEXT NOT NULL DEFAULT '',
  communication TEXT NOT NULL DEFAULT '',
  explicit_preferences TEXT[] NOT NULL DEFAULT '{}',
  freeform_notes TEXT NOT NULL DEFAULT '',
  change_source TEXT NOT NULL DEFAULT 'synthesis',
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX personality_portrait_history_user_time_idx
  ON public.personality_portrait_history (user_id, snapshot_at DESC);

GRANT SELECT, INSERT, DELETE ON public.personality_portrait_history TO authenticated;
GRANT ALL ON public.personality_portrait_history TO service_role;

ALTER TABLE public.personality_portrait_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own portrait history" ON public.personality_portrait_history
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users insert own portrait history" ON public.personality_portrait_history
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own portrait history" ON public.personality_portrait_history
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 3. Snapshot trigger: capture previous state on every update
CREATE OR REPLACE FUNCTION public.snapshot_personality_portrait()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Skip if nothing meaningful changed (avoid counter-bump noise)
  IF TG_OP = 'UPDATE' AND
     OLD.energy IS NOT DISTINCT FROM NEW.energy AND
     OLD.mood IS NOT DISTINCT FROM NEW.mood AND
     OLD.values_worldview IS NOT DISTINCT FROM NEW.values_worldview AND
     OLD.interests_ideas IS NOT DISTINCT FROM NEW.interests_ideas AND
     OLD.communication IS NOT DISTINCT FROM NEW.communication AND
     OLD.explicit_preferences IS NOT DISTINCT FROM NEW.explicit_preferences AND
     OLD.freeform_notes IS NOT DISTINCT FROM NEW.freeform_notes THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.personality_portrait_history (
    user_id, energy, mood, values_worldview, interests_ideas,
    communication, explicit_preferences, freeform_notes, change_source
  ) VALUES (
    OLD.user_id,
    COALESCE(OLD.energy, ''),
    COALESCE(OLD.mood, ''),
    COALESCE(OLD.values_worldview, ''),
    COALESCE(OLD.interests_ideas, ''),
    COALESCE(OLD.communication, ''),
    COALESCE(OLD.explicit_preferences, '{}'),
    COALESCE(OLD.freeform_notes, ''),
    CASE
      WHEN TG_OP = 'DELETE' THEN 'reset'
      WHEN OLD.last_synthesized_at IS DISTINCT FROM NEW.last_synthesized_at THEN 'synthesis'
      ELSE 'manual_edit'
    END
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER personality_portrait_snapshot
  BEFORE UPDATE OR DELETE ON public.personality_portrait
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_personality_portrait();

-- Cap history at 50 rows per user
CREATE OR REPLACE FUNCTION public.prune_personality_portrait_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.personality_portrait_history
  WHERE user_id = NEW.user_id
    AND id NOT IN (
      SELECT id FROM public.personality_portrait_history
      WHERE user_id = NEW.user_id
      ORDER BY snapshot_at DESC
      LIMIT 50
    );
  RETURN NEW;
END;
$$;

CREATE TRIGGER personality_portrait_history_prune
  AFTER INSERT ON public.personality_portrait_history
  FOR EACH ROW EXECUTE FUNCTION public.prune_personality_portrait_history();
