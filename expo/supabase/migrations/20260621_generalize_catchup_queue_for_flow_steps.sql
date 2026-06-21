-- Generalize the "new guests" catch-up queue to any catch-up-enabled flow step (safe re-run)
--
-- Until now the catch-up queue (late-added guests) only worked for the system's first-message
-- card (notification_type = 'reminder_1'), and the most recent claim RPC (whatsapp_recipient_groups)
-- dropped the catch-up logic entirely. The couple/admin "send message" wizard now lets managers
-- create custom SMS *and* WhatsApp steps (notification_type LIKE 'flow_step:%') and configure a
-- per-step queue for guests who join after the message was first sent.
--
-- This migration:
-- - enqueue trigger: enqueue new guests for EVERY enabled SMS/WhatsApp setting with late_catchup_enabled
-- - finalize: update queue rows for any catch-up-enabled SMS/WhatsApp setting
-- - backfill_catchup_queue_for_setting(): per-setting backfill used by the wizard
-- - claim RPC: keeps the WhatsApp-aware signature (channel + whatsapp_template + whatsapp_params)
--   AND claims due catch-up batches for any catch-up-enabled SMS/WhatsApp setting
--
-- Weekday numbers follow PostgreSQL EXTRACT(DOW): 0=Sunday ... 6=Saturday.

-- =========================
-- 1) Trigger enqueue (replace): all catch-up-enabled SMS/WhatsApp settings
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
  due_at timestamptz;
BEGIN
  FOR ns IN
    SELECT
      ns.id,
      ns.event_id,
      ns.notification_type,
      ns.notification_date,
      ns.late_catchup_send_time,
      ns.late_catchup_weekdays,
      COALESCE(NULLIF(TRIM(ns.late_catchup_schedule_mode), ''), 'weekdays') AS late_catchup_schedule_mode,
      COALESCE(ns.late_catchup_dates, '{}'::date[]) AS late_catchup_dates,
      (e.date AT TIME ZONE 'Asia/Jerusalem')::date AS event_date_local
    FROM public.notification_settings ns
    JOIN public.events e ON e.id = ns.event_id
    WHERE ns.event_id = NEW.event_id
      AND COALESCE(NULLIF(TRIM(ns.channel), ''), 'SMS') IN ('SMS', 'WHATSAPP')
      AND ns.enabled IS TRUE
      AND COALESCE(ns.late_catchup_enabled, false) IS TRUE
      AND (ns.notification_type = 'reminder_1' OR ns.notification_type LIKE 'flow_step:%')
  LOOP
    SELECT MAX(r.claimed_at)
    INTO last_sent_at
    FROM public.scheduled_notification_sms_runs AS r
    WHERE r.event_id = NEW.event_id
      AND r.notification_setting_id = ns.id
      AND r.status = 'sent';

    baseline_at := COALESCE(last_sent_at, ns.notification_date);
    IF baseline_at IS NULL OR baseline_at > now() THEN
      CONTINUE;
    END IF;

    IF NEW.created_at IS NOT NULL AND NEW.created_at <= baseline_at THEN
      CONTINUE;
    END IF;

    due_at := public.compute_next_sms_catchup_slot_v2(
      COALESCE(NEW.created_at, now()),
      ns.late_catchup_send_time,
      ns.late_catchup_weekdays,
      ns.late_catchup_dates,
      ns.late_catchup_schedule_mode,
      'Asia/Jerusalem',
      ns.event_date_local
    );

    IF due_at IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO public.notification_sms_catchup_queue (
      event_id, notification_setting_id, guest_id, due_at, status
    )
    VALUES (NEW.event_id, ns.id, NEW.id, due_at, 'queued')
    ON CONFLICT (notification_setting_id, guest_id) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_first_message_catchup_for_new_guest() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_first_message_catchup_for_new_guest() TO authenticated;

-- =========================
-- 2) Per-setting backfill: enqueue existing late-added guests for one setting
-- =========================

CREATE OR REPLACE FUNCTION public.backfill_catchup_queue_for_setting(p_setting_id uuid)
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
    ns.event_id,
    ns.notification_date,
    ns.late_catchup_send_time,
    ns.late_catchup_weekdays,
    COALESCE(NULLIF(TRIM(ns.late_catchup_schedule_mode), ''), 'weekdays') AS late_catchup_schedule_mode,
    COALESCE(ns.late_catchup_dates, '{}'::date[]) AS late_catchup_dates,
    (e.date AT TIME ZONE 'Asia/Jerusalem')::date AS event_date_local
  INTO ns
  FROM public.notification_settings ns
  JOIN public.events e ON e.id = ns.event_id
  WHERE ns.id = p_setting_id
    AND COALESCE(NULLIF(TRIM(ns.channel), ''), 'SMS') IN ('SMS', 'WHATSAPP')
  LIMIT 1;

  IF ns.id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT MAX(r.claimed_at)
  INTO last_sent_at
  FROM public.scheduled_notification_sms_runs AS r
  WHERE r.event_id = ns.event_id
    AND r.notification_setting_id = ns.id
    AND r.status = 'sent';

  baseline_at := COALESCE(last_sent_at, ns.notification_date);
  IF baseline_at IS NULL OR baseline_at > now() THEN
    RETURN 0;
  END IF;

  INSERT INTO public.notification_sms_catchup_queue (
    event_id, notification_setting_id, guest_id, due_at, status
  )
  SELECT
    g.event_id,
    ns.id,
    g.id,
    public.compute_next_sms_catchup_slot_v2(
      g.created_at, ns.late_catchup_send_time, ns.late_catchup_weekdays,
      ns.late_catchup_dates, ns.late_catchup_schedule_mode, 'Asia/Jerusalem', ns.event_date_local
    ) AS due_at,
    'queued'
  FROM public.guests AS g
  WHERE g.event_id = ns.event_id
    AND g.created_at > baseline_at
    AND public.compute_next_sms_catchup_slot_v2(
      g.created_at, ns.late_catchup_send_time, ns.late_catchup_weekdays,
      ns.late_catchup_dates, ns.late_catchup_schedule_mode, 'Asia/Jerusalem', ns.event_date_local
    ) IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.notification_sms_catchup_queue q
      WHERE q.notification_setting_id = ns.id AND q.guest_id = g.id
    )
  ON CONFLICT (notification_setting_id, guest_id) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_catchup_queue_for_setting(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backfill_catchup_queue_for_setting(uuid) TO authenticated;

-- =========================
-- 3) Finalize (replace): any catch-up-enabled SMS/WhatsApp setting
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
    AND COALESCE(NULLIF(TRIM(ns.channel), ''), 'SMS') IN ('SMS', 'WHATSAPP')
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

-- =========================
-- 4) Claim RPC (replace): WhatsApp-aware base send + catch-up batches (SMS + WhatsApp)
--    Signature matches 20260617_whatsapp_recipient_groups (channel + whatsapp_template + whatsapp_params).
-- =========================

CREATE OR REPLACE FUNCTION public.claim_due_sms_notification_settings(p_limit integer DEFAULT 25)
RETURNS TABLE (
  run_id uuid,
  setting_id uuid,
  event_id uuid,
  notification_type text,
  channel text,
  message_content text,
  recipient_guest_ids uuid[],
  scheduled_for_at timestamptz,
  whatsapp_template jsonb,
  whatsapp_params jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      ns.id                          AS notification_setting_id,
      ns.event_id                    AS event_id,
      ns.notification_type::text     AS notification_type,
      COALESCE(NULLIF(TRIM(ns.channel), ''), 'SMS') AS channel,
      ns.message_content             AS message_content,
      COALESCE(ns.recipient_guest_ids, '{}'::uuid[]) AS manual_recipient_ids,
      ns.notification_date           AS scheduled_for,
      COALESCE(NULLIF(TRIM(ns.recipient_mode), ''), 'manual') AS recipient_mode,
      COALESCE(ns.recipient_rule, '{}'::jsonb) AS recipient_rule,
      ns.depends_on_setting_id       AS depends_on_setting_id,
      ns.whatsapp_template_id        AS whatsapp_template_id,
      ns.whatsapp_params             AS whatsapp_params
    FROM public.notification_settings AS ns
    WHERE ns.enabled IS TRUE
      AND ns.notification_date IS NOT NULL
      AND ns.notification_date <= now()
  ),
  computed AS (
    SELECT
      b.*,
      CASE
        WHEN b.notification_type = 'reminder_2' AND cardinality(b.manual_recipient_ids) = 0 THEN b.manual_recipient_ids

        WHEN b.recipient_mode = 'all' THEN COALESCE((
          SELECT array_agg(g.id ORDER BY g.id) FROM public.guests AS g WHERE g.event_id = b.event_id
        ), '{}'::uuid[])

        WHEN b.recipient_mode = 'pending' THEN COALESCE((
          SELECT array_agg(g.id ORDER BY g.id) FROM public.guests AS g
          WHERE g.event_id = b.event_id AND TRIM(COALESCE(g.status, '')) = 'ממתין'
        ), '{}'::uuid[])

        WHEN b.recipient_mode = 'coming' THEN COALESCE((
          SELECT array_agg(g.id ORDER BY g.id) FROM public.guests AS g
          WHERE g.event_id = b.event_id AND TRIM(COALESCE(g.status, '')) IN ('מגיע', 'אישר')
        ), '{}'::uuid[])

        WHEN b.recipient_mode = 'not_coming' THEN COALESCE((
          SELECT array_agg(g.id ORDER BY g.id) FROM public.guests AS g
          WHERE g.event_id = b.event_id AND TRIM(COALESCE(g.status, '')) IN ('לא מגיע', 'לא מגיעים')
        ), '{}'::uuid[])

        WHEN b.recipient_mode = 'maybe' THEN COALESCE((
          SELECT array_agg(g.id ORDER BY g.id) FROM public.guests AS g
          WHERE g.event_id = b.event_id AND TRIM(COALESCE(g.status, '')) = 'אולי מגיע'
        ), '{}'::uuid[])

        WHEN b.recipient_mode = 'groups' THEN COALESCE((
          SELECT array_agg(g.id ORDER BY g.id) FROM public.guests AS g
          WHERE g.event_id = b.event_id
            AND (
              (b.recipient_rule -> 'groups') ? 'all'
              OR ((b.recipient_rule -> 'groups') ? 'pending'    AND TRIM(COALESCE(g.status, '')) = 'ממתין')
              OR ((b.recipient_rule -> 'groups') ? 'coming'     AND TRIM(COALESCE(g.status, '')) IN ('מגיע', 'אישר'))
              OR ((b.recipient_rule -> 'groups') ? 'not_coming' AND TRIM(COALESCE(g.status, '')) IN ('לא מגיע', 'לא מגיעים'))
              OR ((b.recipient_rule -> 'groups') ? 'maybe'      AND TRIM(COALESCE(g.status, '')) = 'אולי מגיע')
            )
        ), '{}'::uuid[])

        WHEN b.recipient_mode = 'prev_pending' THEN COALESCE((
          WITH prev_run AS (
            SELECT r.id FROM public.scheduled_notification_sms_runs AS r
            WHERE r.event_id = b.event_id AND r.notification_setting_id = b.depends_on_setting_id AND r.status = 'sent'
            ORDER BY r.claimed_at DESC LIMIT 1
          )
          SELECT array_agg(DISTINCT rr.guest_id ORDER BY rr.guest_id)
          FROM public.scheduled_notification_sms_run_recipients AS rr
          JOIN prev_run AS pr ON pr.id = rr.run_id
          JOIN public.guests AS g ON g.id = rr.guest_id AND g.event_id = b.event_id AND TRIM(COALESCE(g.status, '')) = 'ממתין'
          WHERE rr.status = 'sent'
        ), '{}'::uuid[])

        ELSE b.manual_recipient_ids
      END AS effective_recipient_ids
    FROM base AS b
  ),
  base_due AS (
    SELECT
      c.notification_setting_id,
      c.event_id,
      c.notification_type,
      c.channel,
      c.message_content,
      c.effective_recipient_ids AS recipient_guest_ids,
      c.scheduled_for,
      c.whatsapp_template_id,
      c.whatsapp_params
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
      COALESCE(NULLIF(TRIM(ns.channel), ''), 'SMS') AS channel,
      ns.message_content AS message_content,
      COALESCE(array_agg(q.guest_id ORDER BY q.guest_id), '{}'::uuid[]) AS recipient_guest_ids,
      q.due_at AS scheduled_for,
      ns.whatsapp_template_id AS whatsapp_template_id,
      ns.whatsapp_params AS whatsapp_params
    FROM public.notification_settings AS ns
    JOIN public.notification_sms_catchup_queue AS q
      ON q.notification_setting_id = ns.id AND q.status = 'queued' AND q.due_at <= now()
    WHERE ns.enabled IS TRUE
      AND COALESCE(NULLIF(TRIM(ns.channel), ''), 'SMS') IN ('SMS', 'WHATSAPP')
      AND (ns.notification_type = 'reminder_1' OR ns.notification_type LIKE 'flow_step:%')
      AND COALESCE(ns.late_catchup_enabled, false) IS TRUE
    GROUP BY ns.id, ns.event_id, ns.notification_type, ns.channel, ns.message_content, q.due_at, ns.whatsapp_template_id, ns.whatsapp_params
    HAVING COUNT(*) > 0
  ),
  due_all AS (
    SELECT * FROM base_due
    UNION ALL
    SELECT * FROM catchup_due
  ),
  due_limited AS (
    SELECT * FROM due_all ORDER BY scheduled_for ASC LIMIT GREATEST(0, COALESCE(p_limit, 25))
  ),
  ins AS (
    INSERT INTO public.scheduled_notification_sms_runs (
      notification_setting_id, event_id, notification_type, scheduled_for, status
    )
    SELECT d.notification_setting_id, d.event_id, d.notification_type, d.scheduled_for, 'claimed'
    FROM due_limited AS d
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
    d.channel,
    d.message_content,
    d.recipient_guest_ids,
    d.scheduled_for AS scheduled_for_at,
    CASE
      WHEN d.whatsapp_template_id IS NULL THEN NULL
      ELSE (SELECT to_jsonb(t) FROM public.whatsapp_templates AS t WHERE t.id = d.whatsapp_template_id)
    END AS whatsapp_template,
    d.whatsapp_params
  FROM ins AS i
  JOIN due_limited AS d
    ON d.notification_setting_id = i.setting_id
   AND d.scheduled_for = i.scheduled_for_at
  ORDER BY d.scheduled_for ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_due_sms_notification_settings(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_due_sms_notification_settings(integer) TO authenticated;
