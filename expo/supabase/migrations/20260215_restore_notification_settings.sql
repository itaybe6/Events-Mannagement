-- Restore notification_settings table (was dropped by 20260211_remove_notifications.sql)
-- Safe to re-run.

-- Ensure UUID generator exists (used by DEFAULT uuid_generate_v4()).
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.notification_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL,
  days_from_wedding INTEGER DEFAULT 0,
  notification_date TIMESTAMP WITH TIME ZONE,
  channel VARCHAR(20) DEFAULT 'SMS' CHECK (channel IN ('SMS', 'WHATSAPP')),
  title VARCHAR(255) NOT NULL,
  -- Keep content non-null to simplify clients; empty string means "no template yet".
  message_content TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(event_id, notification_type)
);

-- RLS
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist (safe re-run)
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

