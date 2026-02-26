-- Public RPC: invitation demo by event_id (no guest).
-- Allows previewing the invitation page without tying it to a specific guest token/code.

CREATE OR REPLACE FUNCTION public.get_invitation_demo(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF p_event_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
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
  FROM public.events e
  WHERE e.id = p_event_id
  LIMIT 1;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_invitation_demo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invitation_demo(uuid) TO anon, authenticated;

