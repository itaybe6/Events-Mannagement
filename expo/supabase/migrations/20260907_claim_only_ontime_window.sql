-- Do not send leftover / missed slots.
-- A scheduled or catch-up job is claimable only within 10 minutes of its due time.
-- Older due items are sealed as skipped/cancelled and never sent.

UPDATE public.notification_sms_catchup_queue
SET
  status = 'cancelled',
  last_error = 'missed_slot',
  updated_at = now()
WHERE status = 'queued'
  AND due_at < now() - interval '10 minutes';

INSERT INTO public.scheduled_notification_sms_runs (
  notification_setting_id,
  event_id,
  notification_type,
  scheduled_for,
  status,
  error
)
SELECT
  ns.id,
  ns.event_id,
  ns.notification_type::text,
  ns.notification_date,
  'skipped',
  'missed_slot'
FROM public.notification_settings AS ns
WHERE ns.enabled IS TRUE
  AND ns.notification_date IS NOT NULL
  AND ns.notification_date < now() - interval '10 minutes'
ON CONFLICT (notification_setting_id, scheduled_for) DO NOTHING;

CREATE OR REPLACE FUNCTION public.claim_due_notification_jobs(
  p_limit integer DEFAULT 25,
  p_mode text DEFAULT 'all'
)
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
DECLARE
  v_mode text := lower(nullif(trim(p_mode), ''));
  v_limit integer := GREATEST(0, COALESCE(p_limit, 25));
BEGIN
  IF v_mode IS NULL OR v_mode NOT IN ('scheduled', 'catchup', 'all') THEN
    v_mode := 'all';
  END IF;

  -- Seal missed slots without sending.
  INSERT INTO public.scheduled_notification_sms_runs (
    notification_setting_id, event_id, notification_type, scheduled_for, status, error
  )
  SELECT
    ns.id,
    ns.event_id,
    ns.notification_type::text,
    ns.notification_date,
    'skipped',
    'missed_slot'
  FROM public.notification_settings AS ns
  WHERE ns.enabled IS TRUE
    AND ns.notification_date IS NOT NULL
    AND ns.notification_date < now() - interval '10 minutes'
  ON CONFLICT (notification_setting_id, scheduled_for) DO NOTHING;

  UPDATE public.notification_sms_catchup_queue AS q
  SET
    status = 'cancelled',
    last_error = 'missed_slot',
    updated_at = now()
  WHERE q.status = 'queued'
    AND q.due_at < now() - interval '10 minutes';

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
      AND ns.notification_date >= now() - interval '10 minutes'
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
            WHERE r.event_id = b.event_id
              AND r.notification_setting_id = b.depends_on_setting_id
              AND r.status = 'sent'
            ORDER BY r.claimed_at DESC LIMIT 1
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
    AND NOT EXISTS (
      SELECT 1
      FROM public.scheduled_notification_sms_runs AS r
      WHERE r.notification_setting_id = c.notification_setting_id
        AND r.scheduled_for = c.scheduled_for
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
      ON q.notification_setting_id = ns.id
     AND q.status = 'queued'
     AND q.due_at <= now()
     AND q.due_at >= now() - interval '10 minutes'
    WHERE ns.enabled IS TRUE
      AND COALESCE(NULLIF(TRIM(ns.channel), ''), 'SMS') IN ('SMS', 'WHATSAPP')
      AND (ns.notification_type = 'reminder_1' OR ns.notification_type LIKE 'flow_step:%')
      AND COALESCE(ns.late_catchup_enabled, false) IS TRUE
      AND NOT EXISTS (
        SELECT 1
        FROM public.scheduled_notification_sms_runs AS r
        WHERE r.notification_setting_id = ns.id
          AND r.scheduled_for = q.due_at
      )
    GROUP BY ns.id, ns.event_id, ns.notification_type, ns.channel, ns.message_content, q.due_at, ns.whatsapp_template_id, ns.whatsapp_params
    HAVING COUNT(*) > 0
  ),
  scheduled_limited AS (
    SELECT * FROM base_due
    WHERE v_mode IN ('scheduled', 'all')
    ORDER BY scheduled_for ASC
    LIMIT v_limit
  ),
  catchup_limited AS (
    SELECT * FROM catchup_due
    WHERE v_mode IN ('catchup', 'all')
    ORDER BY scheduled_for ASC
    LIMIT CASE
      WHEN v_mode = 'catchup' THEN v_limit
      ELSE GREATEST(0, v_limit - (SELECT COUNT(*) FROM scheduled_limited))
    END
  ),
  due_limited AS (
    SELECT * FROM scheduled_limited
    UNION ALL
    SELECT * FROM catchup_limited
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
