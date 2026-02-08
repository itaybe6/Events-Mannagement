-- Add seating_maps table and positional columns for tables.
-- Fixes PostgREST schema cache errors (PGRST204/PGRST205) when saving seating maps.

-- 1) Add missing columns to public.tables
ALTER TABLE public.tables
  ADD COLUMN IF NOT EXISTS number INTEGER,
  ADD COLUMN IF NOT EXISTS x INTEGER,
  ADD COLUMN IF NOT EXISTS y INTEGER,
  ADD COLUMN IF NOT EXISTS seated_guests INTEGER DEFAULT 0;

-- Ensure area exists (older schemas may not have it)
ALTER TABLE public.tables
  ADD COLUMN IF NOT EXISTS area VARCHAR(255);

-- Expand shape enum/check constraint to include 'reserve'
ALTER TABLE public.tables DROP CONSTRAINT IF EXISTS tables_shape_check;
ALTER TABLE public.tables
  ADD CONSTRAINT tables_shape_check
  CHECK (shape IN ('square', 'rectangle', 'reserve'));

-- Keep table "number" unique per event when present
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS idx_tables_event_number_unique
    ON public.tables(event_id, number)
    WHERE number IS NOT NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2) Create public.seating_maps (if missing)
CREATE TABLE IF NOT EXISTS public.seating_maps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  num_tables INTEGER NOT NULL DEFAULT 0,
  tables JSONB NOT NULL DEFAULT '[]'::jsonb,
  annotations JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(event_id)
);

-- RLS for seating_maps (match other tables style)
ALTER TABLE public.seating_maps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view seating_maps of own events" ON public.seating_maps;
DROP POLICY IF EXISTS "Users can insert seating_maps for own events" ON public.seating_maps;
DROP POLICY IF EXISTS "Users can update seating_maps of own events" ON public.seating_maps;
DROP POLICY IF EXISTS "Users can delete seating_maps of own events" ON public.seating_maps;

CREATE POLICY "Users can view seating_maps of own events" ON public.seating_maps FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.events WHERE public.events.id = public.seating_maps.event_id AND public.events.user_id = auth.uid()));

CREATE POLICY "Users can insert seating_maps for own events" ON public.seating_maps FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.events WHERE public.events.id = public.seating_maps.event_id AND public.events.user_id = auth.uid()));

CREATE POLICY "Users can update seating_maps of own events" ON public.seating_maps FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.events WHERE public.events.id = public.seating_maps.event_id AND public.events.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events WHERE public.events.id = public.seating_maps.event_id AND public.events.user_id = auth.uid()));

CREATE POLICY "Users can delete seating_maps of own events" ON public.seating_maps FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.events WHERE public.events.id = public.seating_maps.event_id AND public.events.user_id = auth.uid()));

