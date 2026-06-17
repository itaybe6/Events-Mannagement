-- WhatsApp dynamic messaging
-- ---------------------------------------------------------------------------
-- Adds:
--   1) whatsapp_templates       : registry of approved WhatsApp templates the
--                                 manager fills once, then picks from per step.
--   2) notification_settings.*  : per-step WhatsApp template config columns.
--   3) whatsapp_settings        : global singleton with the daily send quota.
--   4) claim_due_sms_notification_settings(): extended to also claim WhatsApp
--      steps and to support status-based recipient modes
--      (all / pending / coming / not_coming / maybe).
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1) Template registry
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label         text NOT NULL,                          -- friendly Hebrew display name
  template_name text NOT NULL,                          -- exact Meta template name
  language_code text NOT NULL DEFAULT 'he',             -- e.g. 'he' / 'en'
  category      text,                                   -- MARKETING / UTILITY (optional)
  header_type   text NOT NULL DEFAULT 'none',           -- 'none' | 'image' | 'text'
  body_text     text NOT NULL DEFAULT '',               -- preview body with {{1}} placeholders
  variables     jsonb NOT NULL DEFAULT '[]'::jsonb,     -- [{index:1,label:'..',sample:'..'}]
  buttons       jsonb NOT NULL DEFAULT '[]'::jsonb,     -- [{index:0,label:'..',kind:'invitation'|'fixed',base_url:'',suffix:''}]
  is_active     boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_active
  ON public.whatsapp_templates (is_active);

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_templates_admin_all" ON public.whatsapp_templates;
CREATE POLICY "wa_templates_admin_all" ON public.whatsapp_templates
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Event owners may read active templates so they can use them in flows.
DROP POLICY IF EXISTS "wa_templates_read_active" ON public.whatsapp_templates;
CREATE POLICY "wa_templates_read_active" ON public.whatsapp_templates
  FOR SELECT TO authenticated
  USING (is_active OR public.is_admin());

-- ---------------------------------------------------------------------------
-- 2) Per-step WhatsApp config on notification_settings
-- ---------------------------------------------------------------------------
ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS whatsapp_template_id uuid
    REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_params jsonb;

-- ---------------------------------------------------------------------------
-- 3) Global WhatsApp settings (singleton)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_settings (
  id          boolean PRIMARY KEY DEFAULT true CHECK (id),
  daily_quota integer NOT NULL DEFAULT 1000,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.whatsapp_settings (id, daily_quota)
VALUES (true, 1000)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.whatsapp_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_settings_admin_all" ON public.whatsapp_settings;
CREATE POLICY "wa_settings_admin_all" ON public.whatsapp_settings
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "wa_settings_read" ON public.whatsapp_settings;
CREATE POLICY "wa_settings_read" ON public.whatsapp_settings
  FOR SELECT TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- 4) Scheduler claim RPC: include WhatsApp + status-based recipient modes
-- ---------------------------------------------------------------------------
-- recipient_mode semantics:
--   NULL / 'manual'  -> use recipient_guest_ids as-is
--   'all'            -> all guests for the event at claim-time
--   'pending'        -> guests with status 'ממתין'
--   'coming'         -> guests with status 'מגיע' / 'אישר'
--   'not_coming'     -> guests with status 'לא מגיע' / 'לא מגיעים'
--   'maybe'          -> guests with status 'אולי מגיע'
--   'prev_pending'   -> pending guests who were SENT in the latest run of depends_on_setting_id
--
-- The function now also returns the resolved channel + WhatsApp template config
-- so the Edge Function can dispatch SMS (Pulseem) or WhatsApp (Meta Cloud API).
DROP FUNCTION IF EXISTS public.claim_due_sms_notification_settings(integer);

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

-- ---------------------------------------------------------------------------
-- 5) Helper: count WhatsApp messages already sent "today" (Asia/Jerusalem)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_sends_today()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM public.messages m
  WHERE m.type = 'וואטסאפ'
    AND m.status LIKE 'נשלח%'
    AND (m.sent_date AT TIME ZONE 'Asia/Jerusalem')::date
        = (now() AT TIME ZONE 'Asia/Jerusalem')::date;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_sends_today() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_sends_today() TO authenticated;
