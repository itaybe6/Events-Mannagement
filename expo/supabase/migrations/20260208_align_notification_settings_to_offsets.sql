-- Align `notification_settings` schema with app scheduling logic (days_from_wedding + channel)
-- Safe to re-run.

-- Ensure schedule offset column exists
ALTER TABLE notification_settings
  ADD COLUMN IF NOT EXISTS days_from_wedding INTEGER;

ALTER TABLE notification_settings
  ALTER COLUMN days_from_wedding SET DEFAULT 0;

UPDATE notification_settings
  SET days_from_wedding = 0
  WHERE days_from_wedding IS NULL;

-- Add channel column to distinguish SMS vs WhatsApp
ALTER TABLE notification_settings
  ADD COLUMN IF NOT EXISTS channel VARCHAR(20);

-- Best-effort backfill for existing rows (heuristic based on notification_type)
UPDATE notification_settings
  SET channel = CASE
    WHEN notification_type ILIKE 'whatsapp%' THEN 'WHATSAPP'
    ELSE 'SMS'
  END
  WHERE channel IS NULL;

ALTER TABLE notification_settings
  ALTER COLUMN channel SET DEFAULT 'SMS';

DO $$
BEGIN
  ALTER TABLE notification_settings
    ADD CONSTRAINT notification_settings_channel_check
    CHECK (channel IN ('SMS', 'WHATSAPP'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Keep one row per event+type
DO $$
BEGIN
  ALTER TABLE notification_settings
    ADD CONSTRAINT notification_settings_event_type_unique
    UNIQUE (event_id, notification_type);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

