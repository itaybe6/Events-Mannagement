-- Allow admin/employee to manage seating_maps and tables via RLS.
-- This avoids 42501 "violates row-level security policy" when staff edit events.

-- Helper: staff (admin or employee)
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

-- seating_maps: staff can manage all
DROP POLICY IF EXISTS "Staff can manage seating_maps" ON public.seating_maps;
CREATE POLICY "Staff can manage seating_maps" ON public.seating_maps
  FOR ALL
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- tables: staff can manage all
DROP POLICY IF EXISTS "Staff can manage tables" ON public.tables;
CREATE POLICY "Staff can manage tables" ON public.tables
  FOR ALL
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

