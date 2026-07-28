-- ---------------------------------------------------------------------------
-- Performance: server-side guest aggregates, cheaper RLS, delta-sync index
-- ---------------------------------------------------------------------------
-- Three independent problems this addresses:
--
-- 1. The admin events list computed per-event guest totals by downloading every
--    guest row of every visible event (~4k rows / ~540KB, paged 1000 at a time).
--    `get_events_guest_people_stats` does the aggregation in the database and
--    returns one row per event instead.
--
-- 2. `is_staff()` / `is_admin()` were VOLATILE (the SQL default). A volatile
--    function cannot be inlined or cached by the planner, so every RLS check ran
--    the underlying `users` lookup once *per row*. Marking them STABLE and
--    wrapping the calls in a scalar subquery lets Postgres evaluate them once
--    per statement as an InitPlan.
--
-- 3. The check-in screen now syncs incrementally on `updated_at`, which needs a
--    composite index to stay a range scan.
-- ---------------------------------------------------------------------------

-- 1. Server-side guest aggregates -------------------------------------------

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
    COALESCE(SUM(CASE WHEN g.table_id IS NOT NULL
                      THEN GREATEST(COALESCE(g.number_of_people, 1), 1)
                      ELSE 0 END), 0)::bigint,
    COUNT(*)::bigint
  FROM public.guests g
  WHERE p_event_ids IS NULL OR g.event_id = ANY (p_event_ids)
  GROUP BY g.event_id;
$$;

-- SECURITY INVOKER keeps the caller's RLS on `guests`, so this returns exactly
-- the events the caller is already allowed to read.
REVOKE ALL ON FUNCTION public.get_events_guest_people_stats(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_events_guest_people_stats(uuid[]) TO authenticated;

-- 2. Make the RLS helper functions planner-friendly --------------------------

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
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;

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
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- `guests` is the hot table: rewrite its SELECT policies so the auth lookups
-- become InitPlans instead of per-row calls.
DROP POLICY IF EXISTS "Staff can view guests" ON public.guests;
CREATE POLICY "Staff can view guests" ON public.guests
  FOR SELECT
  USING ((SELECT public.is_staff()));

DROP POLICY IF EXISTS "Users can view guests of own events" ON public.guests;
CREATE POLICY "Users can view guests of own events" ON public.guests
  FOR SELECT
  TO authenticated
  USING (
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

DROP POLICY IF EXISTS "Staff can view events" ON public.events;
CREATE POLICY "Staff can view events" ON public.events
  FOR SELECT
  USING ((SELECT public.is_staff()));

-- 3. Index for incremental check-in sync -------------------------------------

CREATE INDEX IF NOT EXISTS idx_guests_event_id_updated_at
  ON public.guests (event_id, updated_at DESC);
