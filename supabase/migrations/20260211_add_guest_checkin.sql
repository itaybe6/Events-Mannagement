-- Add guest check-in (arrival to venue) fields.
-- Safe to re-run.

ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS checked_in BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMP WITH TIME ZONE;

-- Helpful index for common queries (optional)
CREATE INDEX IF NOT EXISTS guests_event_id_checked_in_idx
  ON public.guests (event_id, checked_in);

