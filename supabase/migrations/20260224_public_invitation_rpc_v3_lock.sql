-- Public RPC v3: includes RSVP lock + prevents re-submission updates
-- Safe to re-run due to CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.get_invitation(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'guest', jsonb_build_object(
      'id', g.id,
      'name', g.name,
      'phone', g.phone,
      'status', g.status,
      'number_of_people', COALESCE(g.number_of_people, 1),
      'invitation_token', g.invitation_token,
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
  WHERE g.invitation_token = p_token
  LIMIT 1;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_invitation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invitation(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.update_invitation_rsvp(
  p_token uuid,
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
  row_before public.guests%ROWTYPE;
  updated_row public.guests%ROWTYPE;
BEGIN
  normalized_status := btrim(COALESCE(p_status, ''));
  IF normalized_status NOT IN ('מגיע', 'לא מגיע', 'ממתין') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  SELECT * INTO row_before
  FROM public.guests
  WHERE invitation_token = p_token
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
  WHERE invitation_token = p_token
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
    'rsvp_locked', COALESCE(updated_row.rsvp_locked, false),
    'rsvp_submitted_at', updated_row.rsvp_submitted_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_invitation_rsvp(uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_invitation_rsvp(uuid, text, int) TO anon, authenticated;

