-- Ensure reminder_1 defaults to recipient_mode='all' inside claim RPC (safe re-run)
--
-- This makes "first message" always include all event guests at send/claim time,
-- even if the UI/row has recipient_mode NULL.

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
      COALESCE(
        NULLIF(TRIM(ns.recipient_mode), ''),
        CASE WHEN ns.notification_type = 'reminder_1' THEN 'all' ELSE 'manual' END
      ) AS recipient_mode,
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

        -- Dynamic: all guests at claim-time
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

