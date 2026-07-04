
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS is_paid boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.user_model_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier text NOT NULL,
  hour_bucket timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, tier, hour_bucket)
);

GRANT SELECT ON public.user_model_usage TO authenticated;
GRANT ALL ON public.user_model_usage TO service_role;

ALTER TABLE public.user_model_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own usage read" ON public.user_model_usage
  FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_model_usage_bucket
  ON public.user_model_usage (hour_bucket);

-- Atomic increment + check helper. SECURITY DEFINER so it can write on
-- behalf of the authenticated user without needing a separate insert policy.
CREATE OR REPLACE FUNCTION public.bump_model_usage(_tier text, _limit int)
RETURNS TABLE(allowed boolean, current_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  bucket timestamptz := date_trunc('hour', now());
  new_count int;
BEGIN
  IF uid IS NULL THEN
    RETURN QUERY SELECT false, 0;
    RETURN;
  END IF;

  INSERT INTO public.user_model_usage (user_id, tier, hour_bucket, count)
  VALUES (uid, _tier, bucket, 1)
  ON CONFLICT (user_id, tier, hour_bucket)
  DO UPDATE SET count = user_model_usage.count + 1
  RETURNING count INTO new_count;

  IF new_count > _limit THEN
    -- roll back the increment so honest retries don't burn the quota further
    UPDATE public.user_model_usage
    SET count = count - 1
    WHERE user_id = uid AND tier = _tier AND hour_bucket = bucket;
    RETURN QUERY SELECT false, _limit;
  END IF;

  RETURN QUERY SELECT true, new_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bump_model_usage(text, int) TO authenticated, service_role;
