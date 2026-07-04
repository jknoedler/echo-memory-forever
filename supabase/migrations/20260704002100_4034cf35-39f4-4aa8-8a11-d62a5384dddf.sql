
ALTER TABLE public.threads
  ADD COLUMN IF NOT EXISTS day_key date,
  ADD COLUMN IF NOT EXISTS parent_thread_id uuid REFERENCES public.threads(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_daily_root boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS carried_from_thread_id uuid REFERENCES public.threads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS timezone text;

-- Backfill day_key on any brand-new rows added since the failed run
UPDATE public.threads
SET day_key = created_at::date
WHERE day_key IS NULL;

-- Reset root flags so we can recompute cleanly
UPDATE public.threads SET is_daily_root = false, parent_thread_id = NULL;

-- Pick the most-recent thread per (user, day) as that day's root
WITH ranked AS (
  SELECT id, user_id, day_key,
         row_number() OVER (
           PARTITION BY user_id, day_key
           ORDER BY last_message_at DESC NULLS LAST, created_at DESC
         ) AS rn,
         first_value(id) OVER (
           PARTITION BY user_id, day_key
           ORDER BY last_message_at DESC NULLS LAST, created_at DESC
         ) AS root_id
  FROM public.threads
)
UPDATE public.threads t
SET is_daily_root = (ranked.rn = 1),
    parent_thread_id = CASE WHEN ranked.rn = 1 THEN NULL ELSE ranked.root_id END
FROM ranked
WHERE ranked.id = t.id;

CREATE UNIQUE INDEX IF NOT EXISTS threads_daily_root_unique
  ON public.threads (user_id, day_key)
  WHERE is_daily_root = true;

CREATE INDEX IF NOT EXISTS threads_parent_idx
  ON public.threads (parent_thread_id);

CREATE INDEX IF NOT EXISTS threads_user_day_idx
  ON public.threads (user_id, day_key DESC);

CREATE OR REPLACE FUNCTION public.archive_yesterdays_open_threads()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.threads
  SET continuity_status = 'archived',
      updated_at = now()
  WHERE is_daily_root = true
    AND continuity_status = 'open'
    AND day_key < (now() AT TIME ZONE COALESCE(timezone, 'UTC'))::date;
$$;
REVOKE EXECUTE ON FUNCTION public.archive_yesterdays_open_threads() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.recall_archive(
  query_embedding vector,
  match_count integer DEFAULT 10,
  after_ts timestamptz DEFAULT NULL,
  before_ts timestamptz DEFAULT NULL
)
RETURNS TABLE (
  memory_id uuid,
  thread_id uuid,
  role text,
  content text,
  created_at timestamptz,
  similarity double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id AS memory_id,
    m.thread_id,
    COALESCE((m.metadata->>'role')::text, m.source) AS role,
    m.content,
    m.created_at,
    1 - (m.embedding <=> query_embedding) AS similarity
  FROM public.memories m
  WHERE m.user_id = auth.uid()
    AND m.embedding IS NOT NULL
    AND (after_ts IS NULL OR m.created_at >= after_ts)
    AND (before_ts IS NULL OR m.created_at <= before_ts)
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
$$;
GRANT EXECUTE ON FUNCTION public.recall_archive(vector, integer, timestamptz, timestamptz) TO authenticated;
