-- Automatic admin notifications for upcoming events
-- Creates daily reminders:
-- - 7 days before event
-- - 1 day before event
--
-- Notes:
-- - Inserts one notification per admin per event per reminder type (dedup via unique index)
-- - Uses Asia/Jerusalem date bucketing to match local expectations

-- Ensure pg_cron exists (Supabase supports it)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Prevent duplicate reminders for same admin+event+type
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_recipient_event_type
  ON public.notifications (recipient_user_id, event_id, type)
  WHERE event_id IS NOT NULL;

-- Tighten notifications RLS: only recipient (or admin) can read/update
DROP POLICY IF EXISTS "Staff can manage notifications" ON public.notifications;
DROP POLICY IF EXISTS "Recipients can read notifications" ON public.notifications;
DROP POLICY IF EXISTS "Recipients can insert own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Recipients can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Recipients can delete own notifications" ON public.notifications;

CREATE POLICY "Admins can manage notifications" ON public.notifications
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Recipients can read own notifications" ON public.notifications
  FOR SELECT
  USING (auth.uid() = recipient_user_id OR public.is_admin());

CREATE POLICY "Recipients can update own notifications" ON public.notifications
  FOR UPDATE
  USING (auth.uid() = recipient_user_id OR public.is_admin())
  WITH CHECK (auth.uid() = recipient_user_id OR public.is_admin());

-- Daily enqueue function
CREATE OR REPLACE FUNCTION public.enqueue_admin_event_reminders()
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
    - admin_event_week_before
    - admin_event_day_before
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
    admin_u.id AS recipient_user_id,
    e.user_id AS event_owner_id,
    e.id AS event_id,
    CASE
      WHEN (e.date AT TIME ZONE 'Asia/Jerusalem')::date = (today_il + 7) THEN 'admin_event_week_before'
      ELSE 'admin_event_day_before'
    END AS type,
    CASE
      WHEN (e.date AT TIME ZONE 'Asia/Jerusalem')::date = (today_il + 7) THEN 'תזכורת: אירוע בעוד שבוע'
      ELSE 'תזכורת: אירוע מחר'
    END AS title,
    CASE
      WHEN (e.date AT TIME ZONE 'Asia/Jerusalem')::date = (today_il + 7) THEN
        e.title || ' מתקיים בעוד שבוע (' ||
        to_char((e.date AT TIME ZONE 'Asia/Jerusalem'), 'DD/MM/YYYY') ||
        ') ב' || e.location ||
        COALESCE(' (' || e.city || ')', '') ||
        COALESCE('. בעל/ת האירוע: ' || owner_u.name, '')
      ELSE
        e.title || ' מתקיים מחר (' ||
        to_char((e.date AT TIME ZONE 'Asia/Jerusalem'), 'DD/MM/YYYY') ||
        ' ' || to_char((e.date AT TIME ZONE 'Asia/Jerusalem'), 'HH24:MI') ||
        ') ב' || e.location ||
        COALESCE(' (' || e.city || ')', '') ||
        COALESCE('. בעל/ת האירוע: ' || owner_u.name, '')
    END AS body,
    jsonb_build_object(
      'event_title', e.title,
      'event_date', e.date,
      'event_location', e.location,
      'event_city', e.city,
      'event_owner_id', e.user_id,
      'event_owner_name', owner_u.name,
      'reminder_date_il', today_il,
      'reminder_kind', CASE
        WHEN (e.date AT TIME ZONE 'Asia/Jerusalem')::date = (today_il + 7) THEN 'week_before'
        ELSE 'day_before'
      END
    ) AS metadata,
    now() AS created_at
  FROM public.users AS admin_u
  JOIN public.events AS e ON TRUE
  LEFT JOIN public.users AS owner_u ON owner_u.id = e.user_id
  WHERE admin_u.user_type = 'admin'
    AND e.date >= now()
    AND (
      (e.date AT TIME ZONE 'Asia/Jerusalem')::date = (today_il + 7)
      OR (e.date AT TIME ZONE 'Asia/Jerusalem')::date = (today_il + 1)
    )
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_admin_event_reminders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_admin_event_reminders() TO authenticated;

-- Schedule daily job (08:00 Israel time ≈ 06:00 UTC winter / 05:00 UTC summer).
-- We'll run at 06:05 UTC to be stable; the function itself uses Asia/Jerusalem for date logic.
DO $$
DECLARE
  existing_job_id integer;
BEGIN
  SELECT jobid INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'admin_event_reminders_daily';

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'admin_event_reminders_daily',
    '5 6 * * *',
    $cmd$SELECT public.enqueue_admin_event_reminders();$cmd$
  );
END $$;

