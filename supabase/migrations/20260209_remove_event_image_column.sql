-- Remove event image column (no longer used)
-- Safe re-run

ALTER TABLE public.events
  DROP COLUMN IF EXISTS image;

