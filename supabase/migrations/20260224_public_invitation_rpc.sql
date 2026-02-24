-- Public RPC for invitation landing page (no custom headers required).
-- SECURITY DEFINER functions validate by invitation_token and only expose minimal fields.

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
      'invitation_token', g.invitation_token
    ),
    'event', jsonb_build_object(
      'id', e.id,
      'title', e.title,
      'date', e.date,
      'location', e.location,
      'city', e.city,
      'groom_name', e.groom_name,
      'bride_name', e.bride_name,
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
  updated_row public.guests%ROWTYPE;
BEGIN
  normalized_status := btrim(COALESCE(p_status, ''));
  IF normalized_status NOT IN ('מגיע', 'לא מגיע', 'ממתין') THEN
    RAISE EXCEPTION 'Invalid status';
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
    END
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
    'invitation_token', updated_row.invitation_token
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_invitation_rsvp(uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_invitation_rsvp(uuid, text, int) TO anon, authenticated;

