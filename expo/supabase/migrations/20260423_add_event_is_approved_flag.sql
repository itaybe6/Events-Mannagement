-- Adds an approval flag to events so self-registered events can be reviewed by staff.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT FALSE;

-- Existing events were all created by admins, so keep them approved.
UPDATE public.events SET is_approved = TRUE WHERE is_approved IS DISTINCT FROM TRUE;

-- From now on, new rows default to FALSE (unapproved) unless explicitly set.
ALTER TABLE public.events ALTER COLUMN is_approved SET DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_events_is_approved ON public.events(is_approved);
