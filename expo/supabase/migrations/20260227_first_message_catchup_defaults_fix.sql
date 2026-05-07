-- Make "first message" automation work by default (safe re-run)
--
-- Goals:
-- 1) Every new guest is implicitly included in reminder_1 (recipient_mode='all')
-- 2) Catch-up queue starts once the scheduled time has passed, even if no 'sent' run was recorded
-- 3) Enable catch-up by default for reminder_1 rows

-- 1) Defaults for existing rows: reminder_1 -> recipient_mode='all'
UPDATE public.notification_settings
SET recipient_mode = 'all'
WHERE notification_type = 'reminder_1'
  AND (recipient_mode IS NULL OR NULLIF(TRIM(recipient_mode), '') IS NULL);

-- 2) Enable catch-up for reminder_1 by default (only when SMS; safe if column doesn't exist in older DB)
UPDATE public.notification_settings
SET late_catchup_enabled = true
WHERE notification_type = 'reminder_1'
  AND COALESCE(channel, 'SMS') = 'SMS'
  AND COALESCE(late_catchup_enabled, false) IS NOT TRUE;

-- 3) Trigger logic: treat "time passed" as baseline, not only last successful send
CREATE OR REPLACE FUNCTION public.enqueue_first_message_catchup_for_new_guest()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ns record;
  last_sent_at timestamptz;
  baseline_at timestamptz;
  due_at timestamptz;
BEGIN
  -- Find the reminder_1 setting for this event (SMS only).
  SELECT
    id,
    event_id,
    notification_type,
    COALESCE(channel, 'SMS') AS channel,
    enabled,
    notification_date,
    late_catchup_enabled,
    late_catchup_send_time,
    late_catchup_weekdays
  INTO ns
  FROM public.notification_settings
  WHERE event_id = NEW.event_id
    AND notification_type = 'reminder_1'
    AND COALESCE(channel, 'SMS') = 'SMS'
    AND enabled IS TRUE
  LIMIT 1;

  IF ns.id IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(ns.late_catchup_enabled, false) IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- Baseline:
  -- Prefer a real successful send timestamp, but fall back to the scheduled time if it already passed.
  SELECT MAX(r.claimed_at)
  INTO last_sent_at
  FROM public.scheduled_notification_sms_runs AS r
  WHERE r.event_id = NEW.event_id
    AND r.notification_setting_id = ns.id
    AND r.status = 'sent';

  baseline_at := COALESCE(last_sent_at, NULLIF(ns.notification_date, NULL));
  IF baseline_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only start queueing after the baseline time has passed.
  IF baseline_at > now() THEN
    RETURN NEW;
  END IF;

  IF NEW.created_at IS NOT NULL AND NEW.created_at <= baseline_at THEN
    RETURN NEW;
  END IF;

  due_at := public.compute_next_sms_catchup_slot(
    COALESCE(NEW.created_at, now()),
    ns.late_catchup_send_time,
    ns.late_catchup_weekdays,
    'Asia/Jerusalem'
  );

  INSERT INTO public.notification_sms_catchup_queue (
    event_id,
    notification_setting_id,
    guest_id,
    due_at,
    status
  )
  VALUES (
    NEW.event_id,
    ns.id,
    NEW.id,
    due_at,
    'queued'
  )
  ON CONFLICT (notification_setting_id, guest_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_first_message_catchup_for_new_guest() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_first_message_catchup_for_new_guest() TO authenticated;

-- 4) Backfill uses same baseline rule
CREATE OR REPLACE FUNCTION public.backfill_first_message_catchup_queue(p_event_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ns_id uuid;
  notif_at timestamptz;
  last_sent_at timestamptz;
  baseline_at timestamptz;
  send_time time;
  weekdays smallint[];
  inserted_count integer := 0;
BEGIN
  SELECT ns.id, ns.notification_date, ns.late_catchup_send_time, ns.late_catchup_weekdays
  INTO ns_id, notif_at, send_time, weekdays
  FROM public.notification_settings ns
  WHERE ns.event_id = p_event_id
    AND ns.notification_type = 'reminder_1'
    AND COALESCE(ns.channel, 'SMS') = 'SMS'
  LIMIT 1;

  IF ns_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT MAX(r.claimed_at)
  INTO last_sent_at
  FROM public.scheduled_notification_sms_runs AS r
  WHERE r.event_id = p_event_id
    AND r.notification_setting_id = ns_id
    AND r.status = 'sent';

  baseline_at := COALESCE(last_sent_at, NULLIF(notif_at, NULL));
  IF baseline_at IS NULL OR baseline_at > now() THEN
    RETURN 0;
  END IF;

  INSERT INTO public.notification_sms_catchup_queue (
    event_id,
    notification_setting_id,
    guest_id,
    due_at,
    status
  )
  SELECT
    g.event_id,
    ns_id,
    g.id,
    public.compute_next_sms_catchup_slot(g.created_at, send_time, weekdays, 'Asia/Jerusalem') AS due_at,
    'queued'
  FROM public.guests AS g
  WHERE g.event_id = p_event_id
    AND g.created_at > baseline_at
    AND NOT EXISTS (
      SELECT 1
      FROM public.notification_sms_catchup_queue q
      WHERE q.notification_setting_id = ns_id
        AND q.guest_id = g.id
    )
  ON CONFLICT (notification_setting_id, guest_id) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_first_message_catchup_queue(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backfill_first_message_catchup_queue(uuid) TO authenticated;

