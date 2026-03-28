-- Add map dimension columns to seating_maps for fixed canvas sizing.
-- These represent the number of "big" grid squares on each axis.

ALTER TABLE public.seating_maps
  ADD COLUMN IF NOT EXISTS map_cols INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS map_rows INTEGER NOT NULL DEFAULT 10;

