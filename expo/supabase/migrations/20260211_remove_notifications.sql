-- Remove notifications feature (in-app inbox + automated reminders).
-- Safe to re-run.

-- Unschedule cron jobs (if pg_cron is enabled in this project).
DO $$
DECLARE
  jid integer;
BEGIN
  -- Admin reminders job
  BEGIN
    SELECT jobid INTO jid
    FROM cron.job
    WHERE jobname = 'admin_event_reminders_daily';

    IF jid IS NOT NULL THEN
      PERFORM cron.unschedule(jid);
    END IF;
  EXCEPTION
    WHEN undefined_table THEN NULL;
  END;

  -- Event-owner seating reminders job
  BEGIN
    SELECT jobid INTO jid
    FROM cron.job
    WHERE jobname = 'event_owner_seating_reminders_daily';

    IF jid IS NOT NULL THEN
      PERFORM cron.unschedule(jid);
    END IF;
  EXCEPTION
    WHEN undefined_table THEN NULL;
  END;
END $$;

-- Drop reminder enqueue functions (if they exist)
DROP FUNCTION IF EXISTS public.enqueue_admin_event_reminders();
DROP FUNCTION IF EXISTS public.enqueue_event_owner_seating_reminders();

-- Drop tables (policies/indexes will be dropped automatically)
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.notification_settings CASCADE;

