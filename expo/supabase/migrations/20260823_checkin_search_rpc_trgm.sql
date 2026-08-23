-- Fast check-in search: trigram name index + server-side RPC.
-- Applied to production via MCP as checkin_search_rpc_trgm.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_guests_event_name_trgm
  ON public.guests USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_guests_event_phone
  ON public.guests (event_id, phone);

CREATE OR REPLACE FUNCTION public.get_event_checkin_bootstrap(p_event_id uuid)
RETURNS TABLE (
  invited_people bigint,
  arrived_people bigint,
  guest_rows bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(GREATEST(COALESCE(g.number_of_people, 1), 1)), 0)::bigint,
    COALESCE(SUM(
      CASE WHEN g.checked_in THEN GREATEST(
        COALESCE(g.checked_in_count, g.number_of_people, 1),
        0
      ) ELSE 0 END
    ), 0)::bigint,
    COUNT(*)::bigint
  FROM public.guests g
  WHERE g.event_id = p_event_id;
$$;

REVOKE ALL ON FUNCTION public.get_event_checkin_bootstrap(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_event_checkin_bootstrap(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.search_event_checkin_guests(
  p_event_id uuid,
  p_query text,
  p_limit integer DEFAULT 40
)
RETURNS TABLE (
  id uuid,
  event_id uuid,
  name character varying,
  phone character varying,
  status character varying,
  table_id uuid,
  number_of_people integer,
  category_id uuid,
  checked_in boolean,
  checked_in_at timestamp with time zone,
  checked_in_count integer,
  updated_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH q AS (
    SELECT
      btrim(COALESCE(p_query, '')) AS raw,
      regexp_replace(btrim(COALESCE(p_query, '')), '\D', '', 'g') AS digits
  )
  SELECT
    g.id,
    g.event_id,
    g.name,
    g.phone,
    g.status,
    g.table_id,
    g.number_of_people,
    g.category_id,
    g.checked_in,
    g.checked_in_at,
    g.checked_in_count,
    g.updated_at
  FROM public.guests g, q
  WHERE g.event_id = p_event_id
    AND q.raw <> ''
    AND (
      g.name ILIKE '%' || q.raw || '%'
      OR (
        q.digits <> ''
        AND regexp_replace(COALESCE(g.phone, ''), '\D', '', 'g') LIKE '%' || q.digits || '%'
      )
    )
  ORDER BY
    CASE WHEN g.name ILIKE q.raw || '%' THEN 0 ELSE 1 END,
    g.name
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 40), 80));
$$;

REVOKE ALL ON FUNCTION public.search_event_checkin_guests(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_event_checkin_guests(uuid, text, integer) TO authenticated;
