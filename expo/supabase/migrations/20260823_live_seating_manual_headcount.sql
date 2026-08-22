-- Live seating map: how many people actually sit at each table during the event.
--
-- The seated count is derived from check-in (guests.checked_in / checked_in_count),
-- but ushers walking the hall regularly find a table holding more or fewer people
-- than the list says — a plus-one nobody registered, or a guest who moved chairs.
-- `live_extra_seated` is that manual correction: a signed delta on top of the
-- check-in total, so later check-ins keep adding on top of it instead of being
-- overwritten by a frozen absolute number.
--
-- Safe to re-run.

ALTER TABLE public.tables
  ADD COLUMN IF NOT EXISTS live_extra_seated INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.tables
  ADD COLUMN IF NOT EXISTS live_extra_updated_at TIMESTAMP WITH TIME ZONE;

-- Guests of one table, filtered to arrivals — the read the live map does per table.
CREATE INDEX IF NOT EXISTS idx_guests_table_id_checked_in
  ON public.guests(table_id)
  WHERE checked_in = true;

-- Realtime so every usher station (and the admin watching from the office) sees
-- the same numbers without polling. `guests` is already published; add `tables`
-- for the manual adjustments.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'tables'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tables;
  END IF;
END $$;

-- UPDATE payloads must carry every column for the client-side merge.
ALTER TABLE public.tables REPLICA IDENTITY FULL;

/*
 * Atomic +/- on one table's manual correction.
 *
 * Two ushers tapping "+1" on the same table at the same moment would each read
 * the old value and write old+1, losing one of the taps. Doing the arithmetic in
 * the database keeps both.
 *
 * The result is clamped so the live total (check-in + delta) can never go
 * negative: you cannot subtract more people than actually arrived.
 *
 * SECURITY INVOKER (the default): the caller's RLS on public.tables still
 * applies, so only staff and the event owner can move these numbers.
 */
CREATE OR REPLACE FUNCTION public.adjust_table_live_seated(
  p_table_id UUID,
  p_delta INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_checked_in INTEGER;
  v_next INTEGER;
BEGIN
  SELECT COALESCE(
           SUM(GREATEST(COALESCE(g.checked_in_count, g.number_of_people, 1), 0)),
           0
         )
    INTO v_checked_in
    FROM public.guests g
   WHERE g.table_id = p_table_id
     AND g.checked_in = true;

  UPDATE public.tables t
     SET live_extra_seated = GREATEST(COALESCE(t.live_extra_seated, 0) + p_delta, -v_checked_in),
         live_extra_updated_at = NOW()
   WHERE t.id = p_table_id
  RETURNING t.live_extra_seated INTO v_next;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'table % not found or not writable', p_table_id
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN v_next;
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_table_live_seated(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_table_live_seated(UUID, INTEGER) TO authenticated;

-- Clear every manual correction for one event (used by "reset" on the live map).
CREATE OR REPLACE FUNCTION public.reset_event_live_seated(p_event_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH cleared AS (
    UPDATE public.tables t
       SET live_extra_seated = 0,
           live_extra_updated_at = NOW()
     WHERE t.event_id = p_event_id
       AND COALESCE(t.live_extra_seated, 0) <> 0
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM cleared;

  RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.reset_event_live_seated(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_event_live_seated(UUID) TO authenticated;
