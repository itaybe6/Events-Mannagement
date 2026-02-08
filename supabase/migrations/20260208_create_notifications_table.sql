-- Create notifications table (app inbox)
-- Each notification is associated with:
-- - recipient_user_id: who should see it
-- - event_owner_id: which event owner it belongs to (explicit, per requirement)
-- - event_id: optional link to a specific event

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'system',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  read_at TIMESTAMP WITH TIME ZONE
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created_at
  ON public.notifications (recipient_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_event_owner_created_at
  ON public.notifications (event_owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_event_id
  ON public.notifications (event_id);

-- Fast unread queries per recipient
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON public.notifications (recipient_user_id, created_at DESC)
  WHERE read_at IS NULL;

-- RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Ensure staff helper exists (admin or employee)
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND user_type IN ('admin', 'employee')
  );
$$;

REVOKE ALL ON FUNCTION public.is_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;

-- Policies
DROP POLICY IF EXISTS "Staff can manage notifications" ON public.notifications;
CREATE POLICY "Staff can manage notifications" ON public.notifications
  FOR ALL
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Recipients can read notifications" ON public.notifications;
CREATE POLICY "Recipients can read notifications" ON public.notifications
  FOR SELECT
  USING (auth.uid() = recipient_user_id OR auth.uid() = event_owner_id OR public.is_staff());

DROP POLICY IF EXISTS "Recipients can insert own notifications" ON public.notifications;
CREATE POLICY "Recipients can insert own notifications" ON public.notifications
  FOR INSERT
  WITH CHECK (auth.uid() = recipient_user_id OR public.is_staff());

DROP POLICY IF EXISTS "Recipients can update own notifications" ON public.notifications;
CREATE POLICY "Recipients can update own notifications" ON public.notifications
  FOR UPDATE
  USING (auth.uid() = recipient_user_id OR public.is_staff())
  WITH CHECK (auth.uid() = recipient_user_id OR public.is_staff());

DROP POLICY IF EXISTS "Recipients can delete own notifications" ON public.notifications;
CREATE POLICY "Recipients can delete own notifications" ON public.notifications
  FOR DELETE
  USING (auth.uid() = recipient_user_id OR public.is_staff());

