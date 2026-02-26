-- Scheduled SMS notifications processor (safe re-run)
--
-- What this adds:
-- - A dedupe/ledger table: public.scheduled_notification_sms_runs
-- - A claim RPC: public.claim_due_sms_notification_settings(p_limit int)
-- - A pg_cron job that triggers an Edge Function every minute via pg_net
--
-- IMPORTANT: This migration stores scheduler secrets in a private DB table (works in Supabase Local too).
-- After running it, you must upsert:
-- - supabase_project_url                e.g. https://<project-ref>.supabase.co
-- - scheduled_sms_cron_secret           random string that matches Edge secret SCHEDULED_SMS_CRON_SECRET
--
-- The cron job calls:
--   {supabase_project_url}/functions/v1/process-scheduled-notification-sms
-- with header:
--   x-cron-secret: {scheduled_sms_cron_secret}

-- Extensions used by cron/scheduler
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Private secrets table (avoid `vault` extension dependency).
-- We keep it in a locked-down schema so app roles can't read it.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE TABLE IF NOT EXISTS private.app_secrets (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE private.app_secrets FROM PUBLIC;
REVOKE ALL ON TABLE private.app_secrets FROM anon;
REVOKE ALL ON TABLE private.app_secrets FROM authenticated;

-- Ensure recipient list column exists (safe re-run)
ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS recipient_guest_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

-- Ledger table to ensure "send once per (setting_id, scheduled_for)"
CREATE TABLE IF NOT EXISTS public.scheduled_notification_sms_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  notification_setting_id UUID NOT NULL REFERENCES public.notification_settings(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  claimed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'sending', 'sent', 'failed', 'skipped')),
  result JSONB,
  error TEXT
);

DO $$
BEGIN
  ALTER TABLE public.scheduled_notification_sms_runs
    ADD CONSTRAINT scheduled_notification_sms_runs_unique
    UNIQUE (notification_setting_id, scheduled_for);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_scheduled_sms_runs_setting ON public.scheduled_notification_sms_runs (notification_setting_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_sms_runs_scheduled_for ON public.scheduled_notification_sms_runs (scheduled_for);
CREATE INDEX IF NOT EXISTS idx_scheduled_sms_runs_status ON public.scheduled_notification_sms_runs (status);

-- Claim due jobs (atomic via INSERT ... ON CONFLICT DO NOTHING RETURNING)
-- NOTE:
-- - For reminder_2: empty recipient_guest_ids means "send to all pending"
-- - For other types: we only claim when recipient_guest_ids is non-empty
CREATE OR REPLACE FUNCTION public.claim_due_sms_notification_settings(p_limit integer DEFAULT 25)
RETURNS TABLE (
  run_id uuid,
  setting_id uuid,
  event_id uuid,
  notification_type text,
  message_content text,
  recipient_guest_ids uuid[],
  scheduled_for_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT
      ns.id                         AS notification_setting_id,
      ns.event_id                   AS event_id,
      ns.notification_type          AS notification_type,
      ns.message_content            AS message_content,
      COALESCE(ns.recipient_guest_ids, '{}'::uuid[]) AS recipient_guest_ids,
      ns.notification_date          AS scheduled_for
    FROM public.notification_settings AS ns
    WHERE ns.enabled IS TRUE
      AND COALESCE(ns.channel, 'SMS') = 'SMS'
      AND ns.notification_date IS NOT NULL
      AND ns.notification_date <= now()
      AND (
        ns.notification_type = 'reminder_2'
        OR cardinality(COALESCE(ns.recipient_guest_ids, '{}'::uuid[])) > 0
      )
  ),
  ins AS (
    INSERT INTO public.scheduled_notification_sms_runs (
      notification_setting_id,
      event_id,
      notification_type,
      scheduled_for,
      status
    )
    SELECT
      d.notification_setting_id,
      d.event_id,
      d.notification_type,
      d.scheduled_for,
      'claimed'
    FROM due AS d
    ON CONFLICT (notification_setting_id, scheduled_for) DO NOTHING
    RETURNING
      public.scheduled_notification_sms_runs.id AS run_id,
      public.scheduled_notification_sms_runs.notification_setting_id AS setting_id,
      public.scheduled_notification_sms_runs.scheduled_for AS scheduled_for_at
  )
  SELECT
    i.run_id,
    d.notification_setting_id AS setting_id,
    d.event_id,
    d.notification_type,
    d.message_content,
    d.recipient_guest_ids,
    d.scheduled_for AS scheduled_for_at
  FROM ins AS i
  JOIN due AS d
    ON d.notification_setting_id = i.setting_id
   AND d.scheduled_for = i.scheduled_for_at
  ORDER BY d.scheduled_for ASC
  LIMIT GREATEST(0, COALESCE(p_limit, 25));
END;
$$;

REVOKE ALL ON FUNCTION public.claim_due_sms_notification_settings(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_due_sms_notification_settings(integer) TO authenticated;

-- Schedule: trigger the Edge Function every minute.
-- If cron.job is unavailable (local/dev), this safely no-ops.
DO $$
DECLARE
  existing_job_id integer;
BEGIN
  BEGIN
    SELECT jobid INTO existing_job_id
    FROM cron.job
    WHERE jobname = 'scheduled_sms_notifications_minutely';

    IF existing_job_id IS NOT NULL THEN
      PERFORM cron.unschedule(existing_job_id);
    END IF;

    PERFORM cron.schedule(
      'scheduled_sms_notifications_minutely',
      '* * * * *',
      $cmd$
        SELECT
          net.http_post(
            url := (SELECT value FROM private.app_secrets WHERE name = 'supabase_project_url')
              || '/functions/v1/process-scheduled-notification-sms',
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'x-cron-secret', (SELECT value FROM private.app_secrets WHERE name = 'scheduled_sms_cron_secret')
            ),
            body := jsonb_build_object('limit', 25)
          );
      $cmd$
    );
  EXCEPTION
    WHEN undefined_table THEN
      -- cron.job table doesn't exist in some dev setups
      NULL;
  END;
END $$;

