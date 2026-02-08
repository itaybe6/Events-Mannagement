-- Automatic event-owner seating reminders
-- Creates daily reminders for each event owner:
-- - 7 days before event
-- - 3 days before event
--
-- Each notification includes the number of PEOPLE (sum of guests.number_of_people)
-- that are confirmed ("מגיע") but not yet assigned to a table (table_id IS NULL).
--
-- Dedup: relies on unique index (recipient_user_id, event_id, type) where event_id IS NOT NULL.
-- Uses Asia/Jerusalem date bucketing to match local expectations.

-- Ensure pg_cron exists (Supabase supports it)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Prevent duplicate reminders for same recipient+event+type
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_recipient_event_type
  ON public.notifications (recipient_user_id, event_id, type)
  WHERE event_id IS NOT NULL;

-- Daily enqueue function
CREATE OR REPLACE FUNCTION public.enqueue_event_owner_seating_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today_il date := (now() AT TIME ZONE 'Asia/Jerusalem')::date;
BEGIN
  /*
    Reminder types:
    - event_owner_week_before
    - event_owner_three_days_before
  */

  INSERT INTO public.notifications (
    recipient_user_id,
    event_owner_id,
    event_id,
    type,
    title,
    body,
    metadata,
    created_at
  )
  SELECT
    e.user_id AS recipient_user_id,
    e.user_id AS event_owner_id,
    e.id AS event_id,
    CASE
      WHEN (e.date AT TIME ZONE 'Asia/Jerusalem')::date = (today_il + 7) THEN 'event_owner_week_before'
      ELSE 'event_owner_three_days_before'
    END AS type,
    CASE
      WHEN (e.date AT TIME ZONE 'Asia/Jerusalem')::date = (today_il + 7) THEN 'תזכורת: האירוע בעוד שבוע'
      ELSE 'תזכורת: האירוע בעוד 3 ימים'
    END AS title,
    CASE
      WHEN (e.date AT TIME ZONE 'Asia/Jerusalem')::date = (today_il + 7) THEN
        e.title || ' מתקיים בעוד שבוע (' ||
        to_char((e.date AT TIME ZONE 'Asia/Jerusalem'), 'DD/MM/YYYY') ||
        ') ב' || e.location ||
        COALESCE(' (' || e.city || ')', '') ||
        '. טרם הושבו ' || seating.unseated_people_count || ' מוזמנים.'
      ELSE
        e.title || ' מתקיים בעוד 3 ימים (' ||
        to_char((e.date AT TIME ZONE 'Asia/Jerusalem'), 'DD/MM/YYYY') ||
        ') ב' || e.location ||
        COALESCE(' (' || e.city || ')', '') ||
        '. טרם הושבו ' || seating.unseated_people_count || ' מוזמנים.'
    END AS body,
    jsonb_build_object(
      'event_title', e.title,
      'event_date', e.date,
      'event_location', e.location,
      'event_city', e.city,
      'reminder_date_il', today_il,
      'unseated_people_count', seating.unseated_people_count,
      'reminder_kind', CASE
        WHEN (e.date AT TIME ZONE 'Asia/Jerusalem')::date = (today_il + 7) THEN 'week_before'
        ELSE 'three_days_before'
      END
    ) AS metadata,
    now() AS created_at
  FROM public.events AS e
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(SUM(COALESCE(g.number_of_people, 1)), 0)::int AS unseated_people_count
    FROM public.guests AS g
    WHERE g.event_id = e.id
      AND g.status = 'מגיע'
      AND g.table_id IS NULL
  ) AS seating ON TRUE
  WHERE e.date >= now()
    AND (
      (e.date AT TIME ZONE 'Asia/Jerusalem')::date = (today_il + 7)
      OR (e.date AT TIME ZONE 'Asia/Jerusalem')::date = (today_il + 3)
    )
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_event_owner_seating_reminders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_event_owner_seating_reminders() TO authenticated;

-- Schedule daily job (06:10 UTC).
-- The function itself uses Asia/Jerusalem for date logic.
DO $$
DECLARE
  existing_job_id integer;
BEGIN
  SELECT jobid INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'event_owner_seating_reminders_daily';

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'event_owner_seating_reminders_daily',
    '10 6 * * *',
    $cmd$SELECT public.enqueue_event_owner_seating_reminders();$cmd$
  );
END $$;

