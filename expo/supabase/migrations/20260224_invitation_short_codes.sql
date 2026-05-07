-- Add short, URL-friendly invitation codes for prettier links.
-- Keeps existing UUID `invitation_token` for backward compatibility.

-- Needed for gen_random_bytes(). In Supabase, extensions are typically installed in `extensions` schema.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Generate a URL-safe short code (default 12 chars) and ensure uniqueness.
CREATE OR REPLACE FUNCTION public.generate_invitation_code(p_len int DEFAULT 12)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  code text;
  n int;
BEGIN
  n := GREATEST(8, LEAST(32, COALESCE(p_len, 12)));
  LOOP
    -- 9 random bytes -> ~12 base64 chars (after stripping '=')
    code := encode(extensions.gen_random_bytes(9), 'base64');
    code := replace(replace(code, '+', '-'), '/', '_');
    code := regexp_replace(code, '=', '', 'g');
    code := substr(code, 1, n);

    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.guests g WHERE g.invitation_code = code
    );
  END LOOP;
  RETURN code;
END;
$$;

ALTER TABLE public.guests
ADD COLUMN IF NOT EXISTS invitation_code text;

-- Backfill existing rows
UPDATE public.guests
SET invitation_code = public.generate_invitation_code(12)
WHERE invitation_code IS NULL;

-- Enforce uniqueness and non-null going forward
CREATE UNIQUE INDEX IF NOT EXISTS guests_invitation_code_key ON public.guests (invitation_code);

ALTER TABLE public.guests
ALTER COLUMN invitation_code SET NOT NULL;

ALTER TABLE public.guests
ALTER COLUMN invitation_code SET DEFAULT public.generate_invitation_code(12);

