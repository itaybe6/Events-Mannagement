-- Reliable "message sent" detection per guest for an event.
--
-- Background:
-- The previous approach relied solely on `scheduled_notification_sms_run_recipients`
-- (status = 'sent'), which only covers the automatic-notifications flow. Invitation
-- SMS and other channels are logged in the `messages` table instead, keyed by phone
-- (not guest_id). As a result, events whose guests were messaged via invitation SMS
-- showed an incorrect count (e.g. only 1 "sent").
--
-- This function unions BOTH sources and returns the set of guest IDs that have at
-- least one successfully sent message:
--   1) scheduled_notification_sms_run_recipients with status = 'sent' (guest_id based)
--   2) messages with status starting with 'נשלח' (phone based, matched on the last 9
--      digits to be resilient to +972 / leading-zero formatting differences)
--
-- It is SECURITY DEFINER because `messages` has RLS that only allows the event OWNER
-- to read its rows (admins/staff cannot). The function performs its own authorization
-- check: caller must be admin/staff OR the owner of the event.

CREATE OR REPLACE FUNCTION public.get_event_messaged_guest_ids(p_event_id uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_event_id IS NULL THEN
    RETURN;
  END IF;

  -- Authorization: admin/staff, or the owner of the event.
  IF NOT (
    public.is_admin()
    OR public.is_staff()
    OR EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = p_event_id AND e.user_id = auth.uid()
    )
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH sent_keys AS (
    SELECT DISTINCT right(regexp_replace(m.phone, '\D', '', 'g'), 9) AS k
    FROM public.messages m
    WHERE m.event_id = p_event_id
      AND m.status LIKE 'נשלח%'
      AND length(regexp_replace(m.phone, '\D', '', 'g')) >= 9
  )
  SELECT g.id
  FROM public.guests g
  WHERE g.event_id = p_event_id
    AND right(regexp_replace(g.phone, '\D', '', 'g'), 9) IN (
      SELECT k FROM sent_keys WHERE k <> ''
    )
  UNION
  SELECT rr.guest_id
  FROM public.scheduled_notification_sms_run_recipients rr
  WHERE rr.event_id = p_event_id
    AND rr.status = 'sent';
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_event_messaged_guest_ids(uuid) TO authenticated, anon;
