-- Add city column to events table (safe re-run)
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS city VARCHAR(255);
