
CREATE TABLE public.chat_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  thread_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','complete','failed')),
  request_payload jsonb NOT NULL,
  system_snapshot text,
  provider_snapshot jsonb,
  assistant_message_id uuid,
  error text,
  attempts int NOT NULL DEFAULT 0,
  worker_lock uuid,
  locked_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX chat_jobs_status_locked_idx ON public.chat_jobs (status, locked_at);
CREATE INDEX chat_jobs_thread_status_idx ON public.chat_jobs (thread_id, status);
CREATE INDEX chat_jobs_user_created_idx ON public.chat_jobs (user_id, created_at DESC);

GRANT SELECT ON public.chat_jobs TO authenticated;
GRANT ALL ON public.chat_jobs TO service_role;

ALTER TABLE public.chat_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own chat jobs"
  ON public.chat_jobs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER chat_jobs_touch_updated_at
  BEFORE UPDATE ON public.chat_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Add tables to the realtime publication so the client can subscribe to
-- assistant messages and job status transitions.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_jobs;
  END IF;
END $$;

-- Atomic claim function for the background worker. Marks stale processing
-- jobs (locked >90s ago) and any pending jobs as processing, and returns
-- them so the worker can run one model call per row.
CREATE OR REPLACE FUNCTION public.claim_chat_jobs(_limit int DEFAULT 5)
RETURNS SETOF public.chat_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.chat_jobs cj
  SET status = 'processing',
      worker_lock = gen_random_uuid(),
      locked_at = now(),
      started_at = COALESCE(cj.started_at, now()),
      attempts = cj.attempts + 1
  WHERE cj.id IN (
    SELECT id FROM public.chat_jobs
    WHERE status = 'pending'
       OR (status = 'processing' AND (locked_at IS NULL OR locked_at < now() - interval '90 seconds'))
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT _limit
  )
  RETURNING cj.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_chat_jobs(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_chat_jobs(int) TO service_role;
