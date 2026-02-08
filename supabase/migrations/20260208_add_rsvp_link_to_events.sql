-- Add RSVP link to events (per-event share link for confirmations)
-- Safe to re-run.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS rsvp_link text;

