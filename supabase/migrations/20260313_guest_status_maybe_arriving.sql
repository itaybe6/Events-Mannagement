-- Allow the new RSVP status "אולי מגיע" in guests.status
-- and in the public invitation RSVP RPC.

DO $$
DECLARE
  status_check_name text;
BEGIN
  FOR status_check_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel
      ON rel.oid = con.conrelid
    JOIN pg_namespace nsp
      ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'guests'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%status%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.guests DROP CONSTRAINT IF EXISTS %I',
      status_check_name
    );
  END LOOP;
END $$;

-- Normalize legacy / unexpected RSVP statuses before adding the new constraint.
UPDATE public.guests
SET status = CASE
  WHEN btrim(COALESCE(status, '')) IN ('מגיע', 'אולי מגיע', 'לא מגיע', 'ממתין') THEN btrim(status)
  WHEN btrim(COALESCE(status, '')) IN ('אישר') THEN 'מגיע'
  WHEN btrim(COALESCE(status, '')) IN ('לא מגיעים') THEN 'לא מגיע'
  WHEN btrim(COALESCE(status, '')) IN ('מתלבטים', 'אולי') THEN 'אולי מגיע'
  WHEN btrim(COALESCE(status, '')) IN ('נשלחה הודעה', '') THEN 'ממתין'
  ELSE 'ממתין'
END
WHERE btrim(COALESCE(status, '')) NOT IN ('מגיע', 'אולי מגיע', 'לא מגיע', 'ממתין');

ALTER TABLE public.guests
  ADD CONSTRAINT guests_status_check
  CHECK (status IN ('מגיע', 'אולי מגיע', 'לא מגיע', 'ממתין'));

CREATE OR REPLACE FUNCTION public.update_invitation_rsvp(
  p_token text,
  p_status text,
  p_people int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_status text;
  next_people int;
  token_text text;
  token_uuid uuid;
  row_before public.guests%ROWTYPE;
  updated_row public.guests%ROWTYPE;
BEGIN
  token_text := btrim(COALESCE(p_token, ''));
  IF token_text = '' THEN
    RETURN NULL;
  END IF;

  normalized_status := btrim(COALESCE(p_status, ''));
  IF normalized_status NOT IN ('מגיע', 'אולי מגיע', 'לא מגיע', 'ממתין') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  BEGIN
    token_uuid := token_text::uuid;
  EXCEPTION WHEN others THEN
    token_uuid := NULL;
  END;

  SELECT *
  INTO row_before
  FROM public.guests
  WHERE
    (token_uuid IS NOT NULL AND invitation_token = token_uuid)
    OR (token_uuid IS NULL AND invitation_code = token_text)
  LIMIT 1;

  IF row_before.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- If already locked, do NOT allow changes. Return current snapshot.
  IF COALESCE(row_before.rsvp_locked, false) = true THEN
    RETURN jsonb_build_object(
      'id', row_before.id,
      'name', row_before.name,
      'phone', row_before.phone,
      'status', row_before.status,
      'number_of_people', COALESCE(row_before.number_of_people, 1),
      'invitation_token', row_before.invitation_token,
      'invitation_code', row_before.invitation_code,
      'rsvp_locked', true,
      'rsvp_submitted_at', row_before.rsvp_submitted_at
    );
  END IF;

  IF normalized_status IN ('מגיע', 'אולי מגיע') THEN
    next_people := GREATEST(1, LEAST(99, COALESCE(p_people, 1)));
  END IF;

  UPDATE public.guests
  SET
    status = normalized_status,
    number_of_people = CASE
      WHEN normalized_status IN ('מגיע', 'אולי מגיע') THEN next_people
      ELSE number_of_people
    END,
    rsvp_locked = true,
    rsvp_submitted_at = now()
  WHERE id = row_before.id
  RETURNING *
  INTO updated_row;

  IF updated_row.id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', updated_row.id,
    'name', updated_row.name,
    'phone', updated_row.phone,
    'status', updated_row.status,
    'number_of_people', COALESCE(updated_row.number_of_people, 1),
    'invitation_token', updated_row.invitation_token,
    'invitation_code', updated_row.invitation_code,
    'rsvp_locked', COALESCE(updated_row.rsvp_locked, false),
    'rsvp_submitted_at', updated_row.rsvp_submitted_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_invitation_rsvp(text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_invitation_rsvp(text, text, int) TO anon, authenticated;
