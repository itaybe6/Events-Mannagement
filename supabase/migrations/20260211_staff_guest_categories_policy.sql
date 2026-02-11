-- Allow staff (admin/employee) to read guest categories.
-- Needed so employee UI can resolve category names.

DROP POLICY IF EXISTS "Staff can view guest categories" ON public.guest_categories;
CREATE POLICY "Staff can view guest categories" ON public.guest_categories
  FOR SELECT
  USING (public.is_staff());
