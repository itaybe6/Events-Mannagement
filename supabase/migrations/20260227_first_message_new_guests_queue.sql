-- First-message ("reminder_1") catch-up queue for guests added after it was sent
--
-- What this adds:
-- - notification_settings: late_catchup_* columns (enable + weekdays + time)
-- - public.notification_sms_catchup_queue: per-guest queue rows
-- - trigger on public.guests: enqueue new guests (only after reminder_1 was already sent)
-- - RPC updates:
--   - claim_due_sms_notification_settings: supports recipient_mode='all' and claims catch-up batches
--   - finalize_sms_catchup_queue_for_run: updates queue after a run
--   - backfill_first_message_catchup_queue: enqueue existing late-added guests
--
-- Weekday numbers follow PostgreSQL EXTRACT(DOW): 0=Sunday ... 6=Saturday.
-- Default weekdays {0,1,2,3,4} => Sunday-Thursday (days א-ה).

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =========================
-- 1) Config columns
-- =========================

ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS late_catchup_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS late_catchup_send_time time NOT NULL DEFAULT '12:00:00';

ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS late_catchup_weekdays smallint[] NOT NULL DEFAULT ARRAY[0,1,2,3,4]::smallint[];

CREATE INDEX IF NOT EXISTS idx_notification_settings_late_catchup
  ON public.notification_settings (event_id, notification_type, late_catchup_enabled);

-- =========================
-- 2) Queue table
-- =========================

CREATE TABLE IF NOT EXISTS public.notification_sms_catchup_queue (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  notification_setting_id uuid NOT NULL REFERENCES public.notification_settings(id) ON DELETE CASCADE,
  guest_id uuid NOT NULL REFERENCES public.guests(id) ON DELETE CASCADE,
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'cancelled')),
  queued_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  sent_run_id uuid REFERENCES public.scheduled_notification_sms_runs(id) ON DELETE SET NULL,
  last_error text,
  UNIQUE (notification_setting_id, guest_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_sms_catchup_queue_due
  ON public.notification_sms_catchup_queue (due_at)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_notification_sms_catchup_queue_setting
  ON public.notification_sms_catchup_queue (notification_setting_id, status, due_at);

CREATE INDEX IF NOT EXISTS idx_notification_sms_catchup_queue_event
  ON public.notification_sms_catchup_queue (event_id, status, due_at);

ALTER TABLE public.notification_sms_catchup_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners/admins can read sms catchup queue" ON public.notification_sms_catchup_queue;
CREATE POLICY "Owners/admins can read sms catchup queue"
  ON public.notification_sms_catchup_queue
  FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.events
      WHERE public.events.id = public.notification_sms_catchup_queue.event_id
        AND public.events.user_id = auth.uid()
    )
  );

-- Keep writes locked down for non-admin; queue is managed by trigger / service role.
DROP POLICY IF EXISTS "No inserts for regular users (sms catchup queue)" ON public.notification_sms_catchup_queue;
CREATE POLICY "No inserts for regular users (sms catchup queue)"
  ON public.notification_sms_catchup_queue
  FOR INSERT
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "No updates for regular users (sms catchup queue)" ON public.notification_sms_catchup_queue;
CREATE POLICY "No updates for regular users (sms catchup queue)"
  ON public.notification_sms_catchup_queue
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =========================
-- 3) Next-slot calculator
-- =========================

CREATE OR REPLACE FUNCTION public.compute_next_sms_catchup_slot(
  p_from timestamptz,
  p_send_time time,
  p_weekdays smallint[],
  p_tz text DEFAULT 'Asia/Jerusalem'
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  local_start timestamp;
  start_date date;
  candidate date;
  dow int;
  i int;
BEGIN
  -- "Day after" semantics: always start from tomorrow in the local timezone.
  local_start := (p_from AT TIME ZONE p_tz);
  start_date := (local_start::date + 1);

  IF p_weekdays IS NULL OR cardinality(p_weekdays) = 0 THEN
    -- fallback: allow every day
    p_weekdays := ARRAY[0,1,2,3,4,5,6]::smallint[];
  END IF;

  -- Search the next 21 days for the next allowed weekday.
  FOR i IN 0..20 LOOP
    candidate := start_date + i;
    dow := EXTRACT(DOW FROM candidate)::int;
    IF dow = ANY (p_weekdays::int[]) THEN
      RETURN ((candidate::timestamp + p_send_time) AT TIME ZONE p_tz);
    END IF;
  END LOOP;

  -- Worst-case: just schedule for +21 days (should never happen).
  RETURN (((start_date + 21)::timestamp + p_send_time) AT TIME ZONE p_tz);
END;
$$;

REVOKE ALL ON FUNCTION public.compute_next_sms_catchup_slot(timestamptz, time, smallint[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_next_sms_catchup_slot(timestamptz, time, smallint[], text) TO authenticated;

-- =========================
-- 4) Trigger: enqueue late-added guests for reminder_1
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
  due_at timestamptz;
BEGIN
  -- Find the reminder_1 setting for this event (SMS only).
  SELECT
    id,
    event_id,
    notification_type,
    COALESCE(channel, 'SMS') AS channel,
    enabled,
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

  -- Enqueue only after the first message was already sent at least once.
  SELECT MAX(r.claimed_at)
  INTO last_sent_at
  FROM public.scheduled_notification_sms_runs AS r
  WHERE r.event_id = NEW.event_id
    AND r.notification_setting_id = ns.id
    AND r.status = 'sent';

  IF last_sent_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.created_at IS NOT NULL AND NEW.created_at <= last_sent_at THEN
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

DROP TRIGGER IF EXISTS trg_enqueue_first_message_catchup_for_new_guest ON public.guests;
CREATE TRIGGER trg_enqueue_first_message_catchup_for_new_guest
AFTER INSERT ON public.guests
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_first_message_catchup_for_new_guest();

-- =========================
-- 5) Backfill: enqueue existing late-added guests
-- =========================

CREATE OR REPLACE FUNCTION public.backfill_first_message_catchup_queue(p_event_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ns_id uuid;
  last_sent_at timestamptz;
  send_time time;
  weekdays smallint[];
  inserted_count integer := 0;
BEGIN
  SELECT ns.id, ns.late_catchup_send_time, ns.late_catchup_weekdays
  INTO ns_id, send_time, weekdays
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

  IF last_sent_at IS NULL THEN
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
    AND g.created_at > last_sent_at
    AND NOT EXISTS (
      SELECT 1
      FROM public.scheduled_notification_sms_runs AS r
      JOIN public.scheduled_notification_sms_run_recipients AS rr
        ON rr.run_id = r.id
       AND rr.guest_id = g.id
      WHERE r.notification_setting_id = ns_id
    )
  ON CONFLICT (notification_setting_id, guest_id) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_first_message_catchup_queue(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backfill_first_message_catchup_queue(uuid) TO authenticated;

-- =========================
-- 6) Finalize queue after a scheduled run
-- =========================

CREATE OR REPLACE FUNCTION public.finalize_sms_catchup_queue_for_run(p_run_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  send_time time;
  weekdays smallint[];
BEGIN
  SELECT id, event_id, notification_setting_id, scheduled_for
  INTO r
  FROM public.scheduled_notification_sms_runs
  WHERE id = p_run_id;

  IF r.id IS NULL THEN
    RETURN;
  END IF;

  -- Only finalize for reminder_1 settings that have catch-up enabled.
  SELECT ns.late_catchup_send_time, ns.late_catchup_weekdays
  INTO send_time, weekdays
  FROM public.notification_settings ns
  WHERE ns.id = r.notification_setting_id
    AND ns.notification_type = 'reminder_1'
    AND COALESCE(ns.channel, 'SMS') = 'SMS'
    AND COALESCE(ns.late_catchup_enabled, false) IS TRUE;

  IF send_time IS NULL THEN
    RETURN;
  END IF;

  -- Update queued rows for this exact batch (matching due_at == scheduled_for).
  UPDATE public.notification_sms_catchup_queue AS q
  SET
    status = CASE rr.status
      WHEN 'sent' THEN 'sent'
      WHEN 'skipped' THEN 'cancelled'
      WHEN 'failed' THEN 'queued'
      ELSE q.status
    END,
    updated_at = now(),
    sent_at = CASE WHEN rr.status = 'sent' THEN now() ELSE q.sent_at END,
    sent_run_id = CASE WHEN rr.status = 'sent' THEN p_run_id ELSE q.sent_run_id END,
    last_error = COALESCE(NULLIF(rr.error, ''), q.last_error),
    due_at = CASE
      WHEN rr.status = 'failed' THEN public.compute_next_sms_catchup_slot(now(), send_time, weekdays, 'Asia/Jerusalem')
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

-- =========================
-- 7) Scheduler claim RPC upgrade:
--    - recipient_mode: add 'all'
--    - claim catch-up batches (from queue)
-- =========================

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
  WITH base AS (
    SELECT
      ns.id AS notification_setting_id,
      ns.event_id AS event_id,
      ns.notification_type::text AS notification_type,
      ns.message_content::text AS message_content,
      COALESCE((
        SELECT array_agg(v::uuid ORDER BY v::uuid)
        FROM unnest(COALESCE(ns.recipient_guest_ids::text[], '{}'::text[])) AS v
        WHERE NULLIF(TRIM(v), '') IS NOT NULL
      ), '{}'::uuid[]) AS manual_recipient_ids,
      ns.notification_date AS scheduled_for,
      COALESCE(NULLIF(TRIM(ns.recipient_mode), ''), 'manual') AS recipient_mode,
      ns.depends_on_setting_id AS depends_on_setting_id
    FROM public.notification_settings AS ns
    WHERE ns.enabled IS TRUE
      AND COALESCE(ns.channel, 'SMS') = 'SMS'
      AND ns.notification_date IS NOT NULL
      AND ns.notification_date <= now()
  ),
  computed AS (
    SELECT
      b.*,
      CASE
        -- Legacy reminder_2 behavior: empty list means "all pending" (resolved in Edge Function)
        WHEN b.notification_type = 'reminder_2' AND cardinality(b.manual_recipient_ids) = 0 THEN b.manual_recipient_ids

        -- Dynamic: all guests at claim-time (used for reminder_1 auto-recipient mode)
        WHEN b.recipient_mode = 'all' THEN COALESCE((
          SELECT array_agg(g.id ORDER BY g.id)
          FROM public.guests AS g
          WHERE g.event_id = b.event_id
        ), '{}'::uuid[])

        -- Dynamic: all pending guests at claim-time
        WHEN b.recipient_mode = 'pending' THEN COALESCE((
          SELECT array_agg(g.id ORDER BY g.id)
          FROM public.guests AS g
          WHERE g.event_id = b.event_id
            AND TRIM(COALESCE(g.status, '')) = 'ממתין'
        ), '{}'::uuid[])

        -- Dynamic: pending guests among those who were SENT in the latest previous-step run
        WHEN b.recipient_mode = 'prev_pending' THEN COALESCE((
          WITH prev_run AS (
            SELECT r.id
            FROM public.scheduled_notification_sms_runs AS r
            WHERE r.event_id = b.event_id
              AND r.notification_setting_id = b.depends_on_setting_id
              AND r.status = 'sent'
            ORDER BY r.claimed_at DESC
            LIMIT 1
          )
          SELECT array_agg(DISTINCT rr.guest_id ORDER BY rr.guest_id)
          FROM public.scheduled_notification_sms_run_recipients AS rr
          JOIN prev_run AS pr ON pr.id = rr.run_id
          JOIN public.guests AS g
            ON g.id = rr.guest_id
           AND g.event_id = b.event_id
           AND TRIM(COALESCE(g.status, '')) = 'ממתין'
          WHERE rr.status = 'sent'
        ), '{}'::uuid[])

        -- Default: manual list
        ELSE b.manual_recipient_ids
      END AS effective_recipient_ids
    FROM base AS b
  ),
  base_due AS (
    SELECT
      c.notification_setting_id,
      c.event_id,
      c.notification_type,
      c.message_content,
      c.effective_recipient_ids AS recipient_guest_ids,
      c.scheduled_for
    FROM computed AS c
    WHERE (
      c.notification_type = 'reminder_2'
      OR cardinality(c.effective_recipient_ids) > 0
    )
  ),
  catchup_due AS (
    SELECT
      ns.id AS notification_setting_id,
      ns.event_id AS event_id,
      ns.notification_type::text AS notification_type,
      ns.message_content::text AS message_content,
      COALESCE(array_agg(q.guest_id ORDER BY q.guest_id), '{}'::uuid[]) AS recipient_guest_ids,
      q.due_at AS scheduled_for
    FROM public.notification_settings AS ns
    JOIN public.notification_sms_catchup_queue AS q
      ON q.notification_setting_id = ns.id
     AND q.status = 'queued'
     AND q.due_at <= now()
    WHERE ns.enabled IS TRUE
      AND COALESCE(ns.channel, 'SMS') = 'SMS'
      AND ns.notification_type = 'reminder_1'
      AND COALESCE(ns.late_catchup_enabled, false) IS TRUE
    GROUP BY ns.id, ns.event_id, ns.notification_type, ns.message_content, q.due_at
    HAVING COUNT(*) > 0
  ),
  due_all AS (
    SELECT * FROM base_due
    UNION ALL
    SELECT * FROM catchup_due
  ),
  due_limited AS (
    SELECT *
    FROM due_all
    ORDER BY scheduled_for ASC
    LIMIT GREATEST(0, COALESCE(p_limit, 25))
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
    FROM due_limited AS d
    ON CONFLICT (notification_setting_id, scheduled_for) DO NOTHING
    RETURNING
      public.scheduled_notification_sms_runs.id AS run_id,
      public.scheduled_notification_sms_runs.notification_setting_id AS setting_id,
      public.scheduled_notification_sms_runs.scheduled_for AS scheduled_for_at
  )
  SELECT
    i.run_id::uuid,
    i.setting_id::uuid,
    d.event_id::uuid,
    d.notification_type::text,
    d.message_content::text,
    d.recipient_guest_ids::uuid[],
    d.scheduled_for::timestamptz AS scheduled_for_at
  FROM ins AS i
  JOIN due_limited AS d
    ON d.notification_setting_id = i.setting_id
   AND d.scheduled_for = i.scheduled_for_at
  ORDER BY d.scheduled_for ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_due_sms_notification_settings(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_due_sms_notification_settings(integer) TO authenticated;

