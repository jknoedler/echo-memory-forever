
CREATE TABLE public.pending_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.threads(id) ON DELETE SET NULL,
  topic text NOT NULL,
  cue text,
  keywords text[] NOT NULL DEFAULT '{}',
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved','dismissed','raised')),
  resolved_source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  raised_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_followups TO authenticated;
GRANT ALL ON public.pending_followups TO service_role;

ALTER TABLE public.pending_followups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own followups"
  ON public.pending_followups
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX pending_followups_user_status_due
  ON public.pending_followups (user_id, status, due_at);
