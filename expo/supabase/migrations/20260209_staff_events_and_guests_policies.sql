-- Staff (admin/employee) access for events + guests.
-- This enables employee UI to list all events and update guest statuses.

-- events: staff can view all events
DROP POLICY IF EXISTS "Staff can view events" ON public.events;
CREATE POLICY "Staff can view events" ON public.events
  FOR SELECT
  USING (public.is_staff());

-- guests: staff can view all guests
DROP POLICY IF EXISTS "Staff can view guests" ON public.guests;
CREATE POLICY "Staff can view guests" ON public.guests
  FOR SELECT
  USING (public.is_staff());

-- guests: staff can update guests (needed for status changes)
DROP POLICY IF EXISTS "Staff can update guests" ON public.guests;
CREATE POLICY "Staff can update guests" ON public.guests
  FOR UPDATE
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

