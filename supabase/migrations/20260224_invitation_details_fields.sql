-- Add invitation details fields to events (safe re-run)

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS reception_time TEXT;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS ceremony_time TEXT;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS bride_parents TEXT;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS groom_parents TEXT;

