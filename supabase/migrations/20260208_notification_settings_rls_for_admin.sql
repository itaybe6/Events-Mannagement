-- Allow event owners and admins to manage notification_settings via RLS.
-- Fixes 42501 "new row violates row-level security policy" when admin toggles notifications.
-- Safe to re-run.

-- Ensure RLS is enabled (if already enabled, this is a no-op)
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist
DROP POLICY IF EXISTS "Users can view notification settings of own events" ON public.notification_settings;
DROP POLICY IF EXISTS "Users can insert notification settings for own events" ON public.notification_settings;
DROP POLICY IF EXISTS "Users can update notification settings of own events" ON public.notification_settings;
DROP POLICY IF EXISTS "Users can delete notification settings of own events" ON public.notification_settings;

-- Owners + admins can read settings
CREATE POLICY "Users can view notification settings of own events" ON public.notification_settings
  FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.events
      WHERE public.events.id = public.notification_settings.event_id
        AND public.events.user_id = auth.uid()
    )
  );

-- Owners + admins can create settings
CREATE POLICY "Users can insert notification settings for own events" ON public.notification_settings
  FOR INSERT
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.events
      WHERE public.events.id = public.notification_settings.event_id
        AND public.events.user_id = auth.uid()
    )
  );

-- Owners + admins can update settings
CREATE POLICY "Users can update notification settings of own events" ON public.notification_settings
  FOR UPDATE
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.events
      WHERE public.events.id = public.notification_settings.event_id
        AND public.events.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.events
      WHERE public.events.id = public.notification_settings.event_id
        AND public.events.user_id = auth.uid()
    )
  );

-- Owners + admins can delete settings
CREATE POLICY "Users can delete notification settings of own events" ON public.notification_settings
  FOR DELETE
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.events
      WHERE public.events.id = public.notification_settings.event_id
        AND public.events.user_id = auth.uid()
    )
  );

