-- Per-guest invitation links + public RSVP landing access
-- Adds:
-- - events.invitation_title, events.invitation_image_url
-- - guests.invitation_token (uuid, unique, not null, default uuid_generate_v4())
-- - RLS policies for anon to read/update ONLY via a matching invite token header

-- ========= Columns (safe re-run) =========

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS invitation_title TEXT;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS invitation_image_url TEXT;

ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS invitation_token UUID;

-- Backfill tokens for existing guests
UPDATE public.guests
SET invitation_token = uuid_generate_v4()
WHERE invitation_token IS NULL;

ALTER TABLE public.guests
  ALTER COLUMN invitation_token SET DEFAULT uuid_generate_v4();

ALTER TABLE public.guests
  ALTER COLUMN invitation_token SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE public.guests
    ADD CONSTRAINT guests_invitation_token_unique UNIQUE (invitation_token);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_guests_invitation_token ON public.guests(invitation_token);

-- ========= Helper (reads token from request headers) =========
-- PostgREST sets a JSON object in `request.headers`.
-- We require a valid UUID in header: x-invite-token

CREATE OR REPLACE FUNCTION public.invite_token_from_headers()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN COALESCE(current_setting('request.headers', true), '') = '' THEN NULL::uuid
    WHEN (current_setting('request.headers', true)::jsonb->>'x-invite-token') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN (current_setting('request.headers', true)::jsonb->>'x-invite-token')::uuid
    ELSE NULL::uuid
  END;
$$;

REVOKE ALL ON FUNCTION public.invite_token_from_headers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invite_token_from_headers() TO anon, authenticated;

-- ========= Privileges (column-level) =========
-- Allow anon to read limited data (RLS still applies).
GRANT SELECT ON public.events TO anon;
GRANT SELECT ON public.guests TO anon;

-- Restrict anon updates to RSVP-related columns only.
REVOKE UPDATE ON public.guests FROM anon;
GRANT UPDATE (status, number_of_people) ON public.guests TO anon;

-- ========= RLS policies =========

-- Public: read the invited guest row only when header token matches
DROP POLICY IF EXISTS "Public invite read guest" ON public.guests;
CREATE POLICY "Public invite read guest"
  ON public.guests
  FOR SELECT
  TO anon
  USING (invitation_token = public.invite_token_from_headers());

-- Public: update RSVP status/people only when header token matches
DROP POLICY IF EXISTS "Public invite update guest rsvp" ON public.guests;
CREATE POLICY "Public invite update guest rsvp"
  ON public.guests
  FOR UPDATE
  TO anon
  USING (invitation_token = public.invite_token_from_headers())
  WITH CHECK (invitation_token = public.invite_token_from_headers());

-- Public: allow reading the matching event (needed for join from guests → events)
DROP POLICY IF EXISTS "Public invite read event" ON public.events;
CREATE POLICY "Public invite read event"
  ON public.events
  FOR SELECT
  TO anon
  USING (
    id IN (
      SELECT g.event_id
      FROM public.guests g
      WHERE g.invitation_token = public.invite_token_from_headers()
    )
  );

