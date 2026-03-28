-- Add notification_date column to notification_settings (safe re-run)
ALTER TABLE notification_settings
  ADD COLUMN IF NOT EXISTS notification_date TIMESTAMP WITH TIME ZONE;

-- Make legacy offset optional for the new date-based flow
ALTER TABLE notification_settings
  ALTER COLUMN days_from_wedding DROP NOT NULL;

-- Backfill notification_date using event date + offset
UPDATE notification_settings ns
SET notification_date = (e.date + (ns.days_from_wedding || ' days')::interval)
FROM events e
WHERE ns.event_id = e.id
  AND ns.notification_date IS NULL
  AND ns.days_from_wedding IS NOT NULL;

-- Fallback: if still null, default to event date
UPDATE notification_settings ns
SET notification_date = e.date
FROM events e
WHERE ns.event_id = e.id
  AND ns.notification_date IS NULL;
