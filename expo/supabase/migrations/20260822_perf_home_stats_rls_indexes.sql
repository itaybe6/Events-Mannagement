-- Server-side home stats, cheaper RLS, and indexes for couple home + check-in.
-- Applied to production via MCP as perf_home_stats_rls_indexes.

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = (SELECT auth.uid())
      AND user_type IN ('admin', 'employee')
  );
$$;

REVOKE ALL ON FUNCTION public.is_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = (SELECT auth.uid())
      AND user_type = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.get_events_guest_people_stats(p_event_ids uuid[] DEFAULT NULL)
RETURNS TABLE (
  event_id uuid,
  invited_people bigint,
  coming_people bigint,
  seated_people bigint,
  guest_rows bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    g.event_id,
    COALESCE(SUM(GREATEST(COALESCE(g.number_of_people, 1), 1)), 0)::bigint,
    COALESCE(SUM(CASE WHEN g.status = 'מגיע'
                      THEN GREATEST(COALESCE(g.number_of_people, 1), 1)
                      ELSE 0 END), 0)::bigint,
    COALESCE(SUM(CASE WHEN g.status = 'מגיע' AND g.table_id IS NOT NULL
                      THEN GREATEST(COALESCE(g.number_of_people, 1), 1)
                      ELSE 0 END), 0)::bigint,
    COUNT(*)::bigint
  FROM public.guests g
  WHERE p_event_ids IS NULL OR g.event_id = ANY (p_event_ids)
  GROUP BY g.event_id;
$$;

REVOKE ALL ON FUNCTION public.get_events_guest_people_stats(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_events_guest_people_stats(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_event_guest_home_stats(p_event_id uuid)
RETURNS TABLE (
  invite_count bigint,
  coming bigint,
  maybe bigint,
  pending bigint,
  declined bigint,
  confirmed_people bigint,
  seated_people bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    COUNT(*)::bigint,
    COALESCE(SUM(CASE WHEN g.status = 'מגיע'
                      THEN GREATEST(COALESCE(g.number_of_people, 1), 1) ELSE 0 END), 0)::bigint,
    COALESCE(SUM(CASE WHEN g.status = 'אולי מגיע'
                      THEN GREATEST(COALESCE(g.number_of_people, 1), 1) ELSE 0 END), 0)::bigint,
    COALESCE(SUM(CASE WHEN g.status = 'ממתין'
                      THEN GREATEST(COALESCE(g.number_of_people, 1), 1) ELSE 0 END), 0)::bigint,
    COALESCE(SUM(CASE WHEN g.status = 'לא מגיע'
                      THEN GREATEST(COALESCE(g.number_of_people, 1), 1) ELSE 0 END), 0)::bigint,
    COALESCE(SUM(CASE WHEN g.status = 'מגיע'
                      THEN GREATEST(COALESCE(g.number_of_people, 1), 1) ELSE 0 END), 0)::bigint,
    COALESCE(SUM(CASE WHEN g.status = 'מגיע' AND g.table_id IS NOT NULL
                      THEN GREATEST(COALESCE(g.number_of_people, 1), 1) ELSE 0 END), 0)::bigint
  FROM public.guests g
  WHERE g.event_id = p_event_id;
$$;

REVOKE ALL ON FUNCTION public.get_event_guest_home_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_event_guest_home_stats(uuid) TO authenticated;

DROP POLICY IF EXISTS "Staff can view guests" ON public.guests;
CREATE POLICY "Staff can view guests" ON public.guests
  FOR SELECT USING ((SELECT public.is_staff()));

DROP POLICY IF EXISTS "Users can view guests of own events" ON public.guests;
CREATE POLICY "Users can view guests of own events" ON public.guests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = guests.event_id
        AND e.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Staff can insert guests" ON public.guests;
CREATE POLICY "Staff can insert guests" ON public.guests
  FOR INSERT WITH CHECK ((SELECT public.is_staff()));

DROP POLICY IF EXISTS "Users can insert guests for own events" ON public.guests;
CREATE POLICY "Users can insert guests for own events" ON public.guests
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = guests.event_id
        AND e.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Staff can update guests" ON public.guests;
CREATE POLICY "Staff can update guests" ON public.guests
  FOR UPDATE
  USING ((SELECT public.is_staff()))
  WITH CHECK ((SELECT public.is_staff()));

DROP POLICY IF EXISTS "Users can update guests of own events" ON public.guests;
CREATE POLICY "Users can update guests of own events" ON public.guests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = guests.event_id
        AND e.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = guests.event_id
        AND e.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Staff can delete guests" ON public.guests;
CREATE POLICY "Staff can delete guests" ON public.guests
  FOR DELETE USING ((SELECT public.is_staff()));

DROP POLICY IF EXISTS "Users can delete guests of own events" ON public.guests;
CREATE POLICY "Users can delete guests of own events" ON public.guests
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = guests.event_id
        AND e.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Admins can manage events" ON public.events;
CREATE POLICY "Admins can manage events" ON public.events
  FOR ALL
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Staff can view events" ON public.events;
CREATE POLICY "Staff can view events" ON public.events
  FOR SELECT USING ((SELECT public.is_staff()));

DROP POLICY IF EXISTS "Users can view own events" ON public.events;
CREATE POLICY "Users can view own events" ON public.events
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own events" ON public.events;
CREATE POLICY "Users can insert own events" ON public.events
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own events" ON public.events;
CREATE POLICY "Users can update own events" ON public.events
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own events" ON public.events;
CREATE POLICY "Users can delete own events" ON public.events
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Staff can manage tables" ON public.tables;
CREATE POLICY "Staff can manage tables" ON public.tables
  FOR ALL
  USING ((SELECT public.is_staff()))
  WITH CHECK ((SELECT public.is_staff()));

DROP POLICY IF EXISTS "Users can view tables of own events" ON public.tables;
CREATE POLICY "Users can view tables of own events" ON public.tables
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = tables.event_id
        AND e.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can insert tables for own events" ON public.tables;
CREATE POLICY "Users can insert tables for own events" ON public.tables
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = tables.event_id
        AND e.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update tables of own events" ON public.tables;
CREATE POLICY "Users can update tables of own events" ON public.tables
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = tables.event_id
        AND e.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = tables.event_id
        AND e.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can delete tables of own events" ON public.tables;
CREATE POLICY "Users can delete tables of own events" ON public.tables
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = tables.event_id
        AND e.user_id = (SELECT auth.uid())
    )
  );

CREATE INDEX IF NOT EXISTS idx_guests_event_id_updated_at
  ON public.guests (event_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_guests_event_id_name
  ON public.guests (event_id, name);
