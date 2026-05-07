-- Allow admins to manage all events (safe re-run)
DROP POLICY IF EXISTS "Admins can manage events" ON events;
CREATE POLICY "Admins can manage events" ON events
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
