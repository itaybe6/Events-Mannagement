-- Per-recipient send results for scheduled SMS (safe re-run)
--
-- Adds:
-- - public.scheduled_notification_sms_run_recipients: one row per (run_id, guest_id)
-- - RLS policies so event owners/admins can read their own results

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.scheduled_notification_sms_run_recipients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES public.scheduled_notification_sms_runs(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  guest_id UUID NOT NULL REFERENCES public.guests(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  phone TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (run_id, guest_id)
);

CREATE INDEX IF NOT EXISTS idx_scheduled_sms_run_recipients_run ON public.scheduled_notification_sms_run_recipients (run_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_sms_run_recipients_event ON public.scheduled_notification_sms_run_recipients (event_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_sms_run_recipients_guest ON public.scheduled_notification_sms_run_recipients (guest_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_sms_run_recipients_status ON public.scheduled_notification_sms_run_recipients (status);

ALTER TABLE public.scheduled_notification_sms_run_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners/admins can read scheduled sms recipient runs" ON public.scheduled_notification_sms_run_recipients;
CREATE POLICY "Owners/admins can read scheduled sms recipient runs"
  ON public.scheduled_notification_sms_run_recipients
  FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.events
      WHERE public.events.id = public.scheduled_notification_sms_run_recipients.event_id
        AND public.events.user_id = auth.uid()
    )
  );

-- Writes happen from Edge Function using service role (bypasses RLS),
-- but keep policies strict for regular users.
DROP POLICY IF EXISTS "No inserts for regular users" ON public.scheduled_notification_sms_run_recipients;
CREATE POLICY "No inserts for regular users"
  ON public.scheduled_notification_sms_run_recipients
  FOR INSERT
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "No updates for regular users" ON public.scheduled_notification_sms_run_recipients;
CREATE POLICY "No updates for regular users"
  ON public.scheduled_notification_sms_run_recipients
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

