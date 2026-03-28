-- Catch-up scheduling modes for reminder_1 (safe re-run)
--
-- Adds:
-- - notification_settings.late_catchup_schedule_mode: 'weekdays' | 'dates'
-- - notification_settings.late_catchup_dates: date[] (explicit local dates, up to event day)
-- - compute_next_sms_catchup_slot_v2(): returns next slot after a given timestamp
-- - Updates enqueue/backfill/finalize functions to respect the schedule mode

-- =========================
-- 1) Columns
-- =========================

ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS late_catchup_schedule_mode text NOT NULL DEFAULT 'weekdays';

ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS late_catchup_dates date[] NOT NULL DEFAULT '{}'::date[];

DO $$
BEGIN
  ALTER TABLE public.notification_settings
    ADD CONSTRAINT notification_settings_late_catchup_schedule_mode_chk
    CHECK (late_catchup_schedule_mode IN ('weekdays', 'dates'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_notification_settings_late_catchup_mode
  ON public.notification_settings (event_id, notification_type, late_catchup_schedule_mode);

-- =========================
-- 2) Next-slot calculator (v2)
-- =========================

CREATE OR REPLACE FUNCTION public.compute_next_sms_catchup_slot_v2(
  p_from timestamptz,
  p_send_time time,
  p_weekdays smallint[],
  p_dates date[],
  p_mode text DEFAULT 'weekdays',
  p_tz text DEFAULT 'Asia/Jerusalem',
  p_max_date date DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  local_from timestamp;
  from_date date;
  candidate_date date;
  candidate_ts_local timestamp;
  dow int;
  i int;
BEGIN
  local_from := (p_from AT TIME ZONE p_tz);
  from_date := local_from::date;

  IF p_send_time IS NULL THEN
    p_send_time := '12:00:00'::time;
  END IF;

  -- Explicit dates mode: pick the earliest configured date where send_time is after p_from.
  IF COALESCE(NULLIF(TRIM(p_mode), ''), 'weekdays') = 'dates' THEN
    IF p_dates IS NULL OR cardinality(p_dates) = 0 THEN
      RETURN NULL;
    END IF;

    FOR candidate_date IN
      SELECT d
      FROM (
        SELECT DISTINCT unnest(p_dates) AS d
      ) x
      WHERE d IS NOT NULL
      ORDER BY d ASC
    LOOP
      IF p_max_date IS NOT NULL AND candidate_date > p_max_date THEN
        EXIT;
      END IF;

      IF candidate_date < from_date THEN
        CONTINUE;
      END IF;

      candidate_ts_local := (candidate_date::timestamp + p_send_time);
      IF candidate_ts_local > local_from THEN
        RETURN (candidate_ts_local AT TIME ZONE p_tz);
      END IF;
    END LOOP;

    RETURN NULL;
  END IF;

  -- Weekdays mode:
  IF p_weekdays IS NULL OR cardinality(p_weekdays) = 0 THEN
    p_weekdays := ARRAY[0,1,2,3,4]::smallint[]; -- default Sun-Thu
  END IF;

  -- Search forward (up to ~9 months) for the next allowed day where send_time is after p_from.
  FOR i IN 0..280 LOOP
    candidate_date := from_date + i;
    IF p_max_date IS NOT NULL AND candidate_date > p_max_date THEN
      RETURN NULL;
    END IF;

    dow := EXTRACT(DOW FROM candidate_date)::int;
    IF dow = ANY (p_weekdays::int[]) THEN
      candidate_ts_local := (candidate_date::timestamp + p_send_time);
      IF candidate_ts_local > local_from THEN
        RETURN (candidate_ts_local AT TIME ZONE p_tz);
      END IF;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.compute_next_sms_catchup_slot_v2(timestamptz, time, smallint[], date[], text, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_next_sms_catchup_slot_v2(timestamptz, time, smallint[], date[], text, text, date) TO authenticated;

-- =========================
-- 3) Trigger enqueue (replace)
-- =========================

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
  ev_local_date date;
  due_at timestamptz;
BEGIN
  SELECT
    ns.id,
    ns.event_id,
    ns.notification_type,
    COALESCE(ns.channel, 'SMS') AS channel,
    ns.enabled,
    ns.notification_date,
    ns.late_catchup_enabled,
    ns.late_catchup_send_time,
    ns.late_catchup_weekdays,
    COALESCE(NULLIF(TRIM(ns.late_catchup_schedule_mode), ''), 'weekdays') AS late_catchup_schedule_mode,
    COALESCE(ns.late_catchup_dates, '{}'::date[]) AS late_catchup_dates,
    (e.date AT TIME ZONE 'Asia/Jerusalem')::date AS event_date_local
  INTO ns
  FROM public.notification_settings ns
  JOIN public.events e ON e.id = ns.event_id
  WHERE ns.event_id = NEW.event_id
    AND ns.notification_type = 'reminder_1'
    AND COALESCE(ns.channel, 'SMS') = 'SMS'
    AND ns.enabled IS TRUE
  LIMIT 1;

  IF ns.id IS NULL THEN
    RETURN NEW;
  END IF;
  IF COALESCE(ns.late_catchup_enabled, false) IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT MAX(r.claimed_at)
  INTO last_sent_at
  FROM public.scheduled_notification_sms_runs AS r
  WHERE r.event_id = NEW.event_id
    AND r.notification_setting_id = ns.id
    AND r.status = 'sent';

  baseline_at := COALESCE(last_sent_at, ns.notification_date);
  IF baseline_at IS NULL OR baseline_at > now() THEN
    RETURN NEW;
  END IF;

  IF NEW.created_at IS NOT NULL AND NEW.created_at <= baseline_at THEN
    RETURN NEW;
  END IF;

  ev_local_date := ns.event_date_local;

  due_at := public.compute_next_sms_catchup_slot_v2(
    COALESCE(NEW.created_at, now()),
    ns.late_catchup_send_time,
    ns.late_catchup_weekdays,
    ns.late_catchup_dates,
    ns.late_catchup_schedule_mode,
    'Asia/Jerusalem',
    ev_local_date
  );

  IF due_at IS NULL THEN
    RETURN NEW;
  END IF;

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

-- =========================
-- 4) Backfill (replace)
-- =========================

CREATE OR REPLACE FUNCTION public.backfill_first_message_catchup_queue(p_event_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ns record;
  last_sent_at timestamptz;
  baseline_at timestamptz;
  inserted_count integer := 0;
BEGIN
  SELECT
    ns.id,
    ns.notification_date,
    ns.late_catchup_send_time,
    ns.late_catchup_weekdays,
    COALESCE(NULLIF(TRIM(ns.late_catchup_schedule_mode), ''), 'weekdays') AS late_catchup_schedule_mode,
    COALESCE(ns.late_catchup_dates, '{}'::date[]) AS late_catchup_dates,
    (e.date AT TIME ZONE 'Asia/Jerusalem')::date AS event_date_local
  INTO ns
  FROM public.notification_settings ns
  JOIN public.events e ON e.id = ns.event_id
  WHERE ns.event_id = p_event_id
    AND ns.notification_type = 'reminder_1'
    AND COALESCE(ns.channel, 'SMS') = 'SMS'
  LIMIT 1;

  IF ns.id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT MAX(r.claimed_at)
  INTO last_sent_at
  FROM public.scheduled_notification_sms_runs AS r
  WHERE r.event_id = p_event_id
    AND r.notification_setting_id = ns.id
    AND r.status = 'sent';

  baseline_at := COALESCE(last_sent_at, ns.notification_date);
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
    ns.id,
    g.id,
    public.compute_next_sms_catchup_slot_v2(
      g.created_at,
      ns.late_catchup_send_time,
      ns.late_catchup_weekdays,
      ns.late_catchup_dates,
      ns.late_catchup_schedule_mode,
      'Asia/Jerusalem',
      ns.event_date_local
    ) AS due_at,
    'queued'
  FROM public.guests AS g
  WHERE g.event_id = p_event_id
    AND g.created_at > baseline_at
    AND NOT EXISTS (
      SELECT 1
      FROM public.notification_sms_catchup_queue q
      WHERE q.notification_setting_id = ns.id
        AND q.guest_id = g.id
    )
  ON CONFLICT (notification_setting_id, guest_id) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_first_message_catchup_queue(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backfill_first_message_catchup_queue(uuid) TO authenticated;

-- =========================
-- 5) Finalize (replace)
-- =========================

CREATE OR REPLACE FUNCTION public.finalize_sms_catchup_queue_for_run(p_run_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  ns record;
  next_due timestamptz;
BEGIN
  SELECT id, event_id, notification_setting_id, scheduled_for
  INTO r
  FROM public.scheduled_notification_sms_runs
  WHERE id = p_run_id;

  IF r.id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    ns.late_catchup_send_time,
    ns.late_catchup_weekdays,
    COALESCE(NULLIF(TRIM(ns.late_catchup_schedule_mode), ''), 'weekdays') AS late_catchup_schedule_mode,
    COALESCE(ns.late_catchup_dates, '{}'::date[]) AS late_catchup_dates,
    (e.date AT TIME ZONE 'Asia/Jerusalem')::date AS event_date_local
  INTO ns
  FROM public.notification_settings ns
  JOIN public.events e ON e.id = ns.event_id
  WHERE ns.id = r.notification_setting_id
    AND ns.notification_type = 'reminder_1'
    AND COALESCE(ns.channel, 'SMS') = 'SMS'
    AND COALESCE(ns.late_catchup_enabled, false) IS TRUE;

  IF ns.late_catchup_send_time IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.notification_sms_catchup_queue AS q
  SET
    status = CASE rr.status
      WHEN 'sent' THEN 'sent'
      WHEN 'skipped' THEN 'cancelled'
      WHEN 'failed' THEN
        CASE
          WHEN public.compute_next_sms_catchup_slot_v2(now(), ns.late_catchup_send_time, ns.late_catchup_weekdays, ns.late_catchup_dates, ns.late_catchup_schedule_mode, 'Asia/Jerusalem', ns.event_date_local) IS NULL
            THEN 'cancelled'
          ELSE 'queued'
        END
      ELSE q.status
    END,
    updated_at = now(),
    sent_at = CASE WHEN rr.status = 'sent' THEN now() ELSE q.sent_at END,
    sent_run_id = CASE WHEN rr.status = 'sent' THEN p_run_id ELSE q.sent_run_id END,
    last_error = COALESCE(NULLIF(rr.error, ''), q.last_error),
    due_at = CASE
      WHEN rr.status = 'failed' THEN COALESCE(
        public.compute_next_sms_catchup_slot_v2(now(), ns.late_catchup_send_time, ns.late_catchup_weekdays, ns.late_catchup_dates, ns.late_catchup_schedule_mode, 'Asia/Jerusalem', ns.event_date_local),
        q.due_at
      )
      ELSE q.due_at
    END
  FROM public.scheduled_notification_sms_run_recipients AS rr
  WHERE rr.run_id = p_run_id
    AND q.notification_setting_id = r.notification_setting_id
    AND q.event_id = r.event_id
    AND q.guest_id = rr.guest_id
    AND q.status = 'queued'
    AND q.due_at = r.scheduled_for;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_sms_catchup_queue_for_run(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_sms_catchup_queue_for_run(uuid) TO authenticated;

