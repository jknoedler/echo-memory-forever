
CREATE TABLE public.chat_debug_payloads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL,
  system_prompt text NOT NULL,
  events_block text,
  events_count integer NOT NULL DEFAULT 0,
  events_oldest timestamptz,
  events_newest timestamptz,
  stale_events_count integer NOT NULL DEFAULT 0,
  validator_status text,
  retried boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX chat_debug_payloads_user_created_idx
  ON public.chat_debug_payloads (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_debug_payloads TO authenticated;
GRANT ALL ON public.chat_debug_payloads TO service_role;

ALTER TABLE public.chat_debug_payloads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own debug payloads"
  ON public.chat_debug_payloads
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
