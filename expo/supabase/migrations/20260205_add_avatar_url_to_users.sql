-- Add avatar_url column to users table (safe re-run)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);

