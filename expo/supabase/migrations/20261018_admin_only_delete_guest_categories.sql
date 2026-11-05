-- Event owners and employees could delete guest categories and did so by mistake.
-- Keep insert/update/select as they are. Delete is admin-only.

DROP POLICY IF EXISTS "Users can delete guest categories of own events" ON public.guest_categories;
DROP POLICY IF EXISTS "Staff can delete guest categories" ON public.guest_categories;

DROP POLICY IF EXISTS "Admins can delete guest categories" ON public.guest_categories;
CREATE POLICY "Admins can delete guest categories" ON public.guest_categories
  FOR DELETE
  TO authenticated
  USING ((SELECT public.is_admin()));
