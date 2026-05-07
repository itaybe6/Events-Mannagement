-- Flow Builder support for scheduled notifications (safe re-run)
--
-- Adds a lightweight "builder" model on top of public.notification_settings:
-- - flow_id: groups steps into a single flow (we'll use event_id as the default flow_id in UI)
-- - sort_order: UI ordering of steps
-- - depends_on_setting_id: optional link to previous step (for "prev step pending" recipients)
-- - recipient_mode/recipient_rule: allow dynamic recipients at send-time (manual/pending/prev_pending)

-- Columns (safe re-run)
ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS flow_id uuid,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS depends_on_setting_id uuid,
  ADD COLUMN IF NOT EXISTS recipient_mode text,
  ADD COLUMN IF NOT EXISTS recipient_rule jsonb;

-- Self-reference FK (safe re-run)
DO $$
BEGIN
  ALTER TABLE public.notification_settings
    ADD CONSTRAINT notification_settings_depends_on_fk
    FOREIGN KEY (depends_on_setting_id)
    REFERENCES public.notification_settings(id)
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Helpful indexes (safe re-run)
CREATE INDEX IF NOT EXISTS idx_notification_settings_flow_id ON public.notification_settings (flow_id);
CREATE INDEX IF NOT EXISTS idx_notification_settings_sort_order ON public.notification_settings (flow_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_notification_settings_depends_on ON public.notification_settings (depends_on_setting_id);

-- Upgrade the scheduler claim RPC to support dynamic recipients for builder steps.
--
-- recipient_mode semantics:
-- - NULL / 'manual': use notification_settings.recipient_guest_ids as-is
-- - 'pending': send to all guests with status='ממתין' for the event at claim-time
-- - 'prev_pending': send to guests who were SENT in the latest run of depends_on_setting_id AND are still status='ממתין'
--
-- Backwards compatibility:
-- - reminder_2 keeps existing behavior: empty recipient_guest_ids means "all pending", evaluated inside the Edge Function.
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
      ns.id                         AS notification_setting_id,
      ns.event_id                   AS event_id,
      ns.notification_type          AS notification_type,
      ns.message_content            AS message_content,
      COALESCE(ns.recipient_guest_ids, '{}'::uuid[]) AS manual_recipient_ids,
      ns.notification_date          AS scheduled_for,
      COALESCE(NULLIF(TRIM(ns.recipient_mode), ''), 'manual') AS recipient_mode,
      ns.depends_on_setting_id      AS depends_on_setting_id
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
  due AS (
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
    d.message_content,
    d.recipient_guest_ids,
    d.scheduled_for AS scheduled_for_at
  FROM ins AS i
  JOIN due_limited AS d
    ON d.notification_setting_id = i.setting_id
   AND d.scheduled_for = i.scheduled_for_at
  ORDER BY d.scheduled_for ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_due_sms_notification_settings(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_due_sms_notification_settings(integer) TO authenticated;

