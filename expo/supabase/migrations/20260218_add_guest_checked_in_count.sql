-- Add guest check-in count (actual arrived people) field.
-- Safe to re-run.

ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS checked_in_count INTEGER;

-- Optional: basic sanity constraint (non-negative)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'guests_checked_in_count_nonnegative'
  ) THEN
    ALTER TABLE public.guests
      ADD CONSTRAINT guests_checked_in_count_nonnegative
      CHECK (checked_in_count IS NULL OR checked_in_count >= 0);
  END IF;
END $$;

