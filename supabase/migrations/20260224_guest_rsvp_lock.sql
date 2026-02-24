-- Lock invitation RSVP after first submission (safe re-run)

ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS rsvp_locked BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS rsvp_submitted_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_guests_rsvp_locked ON public.guests(rsvp_locked);

