-- Staff (admin/employee) guest management policies.
-- Staff could already SELECT/UPDATE guests, but INSERT/DELETE (and category writes)
-- were missing — causing 403 on add and silent failures on delete.

DROP POLICY IF EXISTS "Staff can insert guests" ON public.guests;
CREATE POLICY "Staff can insert guests" ON public.guests
  FOR INSERT
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Staff can delete guests" ON public.guests;
CREATE POLICY "Staff can delete guests" ON public.guests
  FOR DELETE
  USING (public.is_staff());

DROP POLICY IF EXISTS "Staff can insert guest categories" ON public.guest_categories;
CREATE POLICY "Staff can insert guest categories" ON public.guest_categories
  FOR INSERT
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Staff can update guest categories" ON public.guest_categories;
CREATE POLICY "Staff can update guest categories" ON public.guest_categories
  FOR UPDATE
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Staff can delete guest categories" ON public.guest_categories;
CREATE POLICY "Staff can delete guest categories" ON public.guest_categories
  FOR DELETE
  USING (public.is_staff());
