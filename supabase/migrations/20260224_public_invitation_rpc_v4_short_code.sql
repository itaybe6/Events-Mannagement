-- Public RPC v4: accept either UUID token or short invitation code.
-- Keeps backward compatibility for existing UUID links, while enabling prettier short links.

DROP FUNCTION IF EXISTS public.get_invitation(uuid);
DROP FUNCTION IF EXISTS public.update_invitation_rsvp(uuid, text, int);

CREATE OR REPLACE FUNCTION public.get_invitation(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  token_text text;
  token_uuid uuid;
BEGIN
  token_text := btrim(COALESCE(p_token, ''));
  IF token_text = '' THEN
    RETURN NULL;
  END IF;

  -- Best-effort cast to uuid (for old links). If it fails, fall back to code.
  BEGIN
    token_uuid := token_text::uuid;
  EXCEPTION WHEN others THEN
    token_uuid := NULL;
  END;

  SELECT jsonb_build_object(
    'guest', jsonb_build_object(
      'id', g.id,
      'name', g.name,
      'phone', g.phone,
      'status', g.status,
      'number_of_people', COALESCE(g.number_of_people, 1),
      'invitation_token', g.invitation_token,
      'invitation_code', g.invitation_code,
      'rsvp_locked', COALESCE(g.rsvp_locked, false),
      'rsvp_submitted_at', g.rsvp_submitted_at
    ),
    'event', jsonb_build_object(
      'id', e.id,
      'title', e.title,
      'date', e.date,
      'location', e.location,
      'city', e.city,
      'groom_name', e.groom_name,
      'bride_name', e.bride_name,
      'reception_time', e.reception_time,
      'ceremony_time', e.ceremony_time,
      'bride_parents', e.bride_parents,
      'groom_parents', e.groom_parents,
      'invitation_title', e.invitation_title,
      'invitation_image_url', e.invitation_image_url
    )
  )
  INTO result
  FROM public.guests g
  JOIN public.events e ON e.id = g.event_id
  WHERE
    (token_uuid IS NOT NULL AND g.invitation_token = token_uuid)
    OR (token_uuid IS NULL AND g.invitation_code = token_text)
  LIMIT 1;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invitation(text) TO anon, authenticated;

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
  IF normalized_status NOT IN ('מגיע', 'לא מגיע', 'ממתין') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  BEGIN
    token_uuid := token_text::uuid;
  EXCEPTION WHEN others THEN
    token_uuid := NULL;
  END;

  SELECT * INTO row_before
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

  IF normalized_status = 'מגיע' THEN
    next_people := GREATEST(1, LEAST(99, COALESCE(p_people, 1)));
  END IF;

  UPDATE public.guests
  SET
    status = normalized_status,
    number_of_people = CASE
      WHEN normalized_status = 'מגיע' THEN next_people
      ELSE number_of_people
    END,
    rsvp_locked = true,
    rsvp_submitted_at = now()
  WHERE id = row_before.id
  RETURNING * INTO updated_row;

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

