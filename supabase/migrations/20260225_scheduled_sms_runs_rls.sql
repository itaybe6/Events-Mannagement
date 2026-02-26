-- Secure scheduled_notification_sms_runs for client reads (safe re-run)

ALTER TABLE public.scheduled_notification_sms_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners/admins can read scheduled sms runs" ON public.scheduled_notification_sms_runs;
CREATE POLICY "Owners/admins can read scheduled sms runs"
  ON public.scheduled_notification_sms_runs
  FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.events
      WHERE public.events.id = public.scheduled_notification_sms_runs.event_id
        AND public.events.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "No inserts for scheduled sms runs" ON public.scheduled_notification_sms_runs;
CREATE POLICY "No inserts for scheduled sms runs"
  ON public.scheduled_notification_sms_runs
  FOR INSERT
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "No updates for scheduled sms runs" ON public.scheduled_notification_sms_runs;
CREATE POLICY "No updates for scheduled sms runs"
  ON public.scheduled_notification_sms_runs
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

