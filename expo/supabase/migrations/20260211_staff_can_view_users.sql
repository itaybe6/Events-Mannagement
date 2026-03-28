-- Allow staff (admin/employee) to read users.
-- Needed so employee UI can display event owner name via join (events.user_id -> users.id).

DROP POLICY IF EXISTS "Staff can view users" ON public.users;
CREATE POLICY "Staff can view users" ON public.users
  FOR SELECT
  USING (public.is_staff());

