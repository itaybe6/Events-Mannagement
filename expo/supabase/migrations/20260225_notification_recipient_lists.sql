-- Persist per-notification recipient lists (safe re-run)

ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS recipient_guest_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

