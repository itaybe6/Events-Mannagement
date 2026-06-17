-- WhatsApp multi-group recipients
--
-- Adds a new recipient_mode = 'groups' that resolves recipients from a list of
-- status-based groups stored in recipient_rule->'groups' (a JSON array), e.g.
--   { "mode": "groups", "groups": ["pending", "maybe"] }
--
-- Group keys map to guest statuses:
--   'all'         -> every guest in the event
--   'pending'     -> 'ממתין'
--   'coming'      -> 'מגיע' / 'אישר'
--   'not_coming'  -> 'לא מגיע' / 'לא מגיעים'
--   'maybe'       -> 'אולי מגיע'
--
-- The effective recipient list is the UNION of all selected groups (no duplicates).
-- This keeps the audience dynamic at send-time (statuses can change after saving).

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
      ns.notification_type           AS notification_type,
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
        -- Legacy reminder_2 behavior: empty list means "all pending"
        WHEN b.notification_type = 'reminder_2' AND cardinality(b.manual_recipient_ids) = 0 THEN b.manual_recipient_ids

        WHEN b.recipient_mode = 'all' THEN COALESCE((
          SELECT array_agg(g.id ORDER BY g.id)
          FROM public.guests AS g
          WHERE g.event_id = b.event_id
        ), '{}'::uuid[])

        WHEN b.recipient_mode = 'pending' THEN COALESCE((
          SELECT array_agg(g.id ORDER BY g.id)
          FROM public.guests AS g
          WHERE g.event_id = b.event_id
            AND TRIM(COALESCE(g.status, '')) = 'ממתין'
        ), '{}'::uuid[])

        WHEN b.recipient_mode = 'coming' THEN COALESCE((
          SELECT array_agg(g.id ORDER BY g.id)
          FROM public.guests AS g
          WHERE g.event_id = b.event_id
            AND TRIM(COALESCE(g.status, '')) IN ('מגיע', 'אישר')
        ), '{}'::uuid[])

        WHEN b.recipient_mode = 'not_coming' THEN COALESCE((
          SELECT array_agg(g.id ORDER BY g.id)
          FROM public.guests AS g
          WHERE g.event_id = b.event_id
            AND TRIM(COALESCE(g.status, '')) IN ('לא מגיע', 'לא מגיעים')
        ), '{}'::uuid[])

        WHEN b.recipient_mode = 'maybe' THEN COALESCE((
          SELECT array_agg(g.id ORDER BY g.id)
          FROM public.guests AS g
          WHERE g.event_id = b.event_id
            AND TRIM(COALESCE(g.status, '')) = 'אולי מגיע'
        ), '{}'::uuid[])

        -- NEW: multi-group audience (union of the selected status groups)
        WHEN b.recipient_mode = 'groups' THEN COALESCE((
          SELECT array_agg(g.id ORDER BY g.id)
          FROM public.guests AS g
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

        ELSE b.manual_recipient_ids
      END AS effective_recipient_ids
    FROM base AS b
  ),
  due AS (
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
  due_limited AS (
    SELECT *
    FROM due
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
      ELSE (
        SELECT to_jsonb(t) FROM public.whatsapp_templates AS t WHERE t.id = d.whatsapp_template_id
      )
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
