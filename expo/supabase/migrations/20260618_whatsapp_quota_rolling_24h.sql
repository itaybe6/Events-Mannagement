-- ---------------------------------------------------------------------------
-- WhatsApp daily quota: switch from calendar-day bucket to a rolling 24h window
-- ---------------------------------------------------------------------------
-- Previously whatsapp_sends_today() counted messages whose local (Asia/Jerusalem)
-- date matched today's date, so the counter reset at local midnight.
--
-- This redefines it to count WhatsApp messages sent in the last 24 hours
-- (a rolling window), matching the behaviour of Meta's own messaging limits.
-- Example: if the quota is exhausted at 19:00, capacity frees up gradually as
-- individual sends age past 24h; a full reset effectively happens 24h later.
--
-- The function name is intentionally unchanged so Edge Functions and the
-- frontend service that call rpc('whatsapp_sends_today') keep working as-is.
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
    AND m.sent_date >= (now() - interval '24 hours');
$$;

REVOKE ALL ON FUNCTION public.whatsapp_sends_today() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_sends_today() TO authenticated;
