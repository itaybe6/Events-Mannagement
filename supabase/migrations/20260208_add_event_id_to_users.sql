-- Add users.event_id to link an "event_owner" to a primary event
-- Safe to re-run.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS event_id UUID;

-- Add FK (safe to re-run)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_event_id_fkey'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_event_id_fkey
      FOREIGN KEY (event_id)
      REFERENCES public.events(id)
      ON DELETE SET NULL;
  END IF;
END $$;

