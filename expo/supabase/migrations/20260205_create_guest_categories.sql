-- Guest categories table (safe re-run)
CREATE TABLE IF NOT EXISTS guest_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    side VARCHAR(20) NOT NULL DEFAULT 'groom' CHECK (side IN ('groom', 'bride')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure side column exists and normalized
ALTER TABLE guest_categories ADD COLUMN IF NOT EXISTS side VARCHAR(20) DEFAULT 'groom';
UPDATE guest_categories SET side = 'groom' WHERE side IN ('חתן');
UPDATE guest_categories SET side = 'bride' WHERE side IN ('כלה');
UPDATE guest_categories SET side = 'groom' WHERE side IS NULL;
ALTER TABLE guest_categories ALTER COLUMN side SET NOT NULL;
ALTER TABLE guest_categories DROP CONSTRAINT IF EXISTS guest_categories_side_check;
ALTER TABLE guest_categories
  ADD CONSTRAINT guest_categories_side_check CHECK (side IN ('groom', 'bride'));

-- Ensure timestamps exist
ALTER TABLE guest_categories ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE guest_categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_guest_categories_event_id ON guest_categories(event_id);

-- Enable Row Level Security (RLS)
ALTER TABLE guest_categories ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view guest categories of own events" ON guest_categories;
DROP POLICY IF EXISTS "Users can insert guest categories for own events" ON guest_categories;
DROP POLICY IF EXISTS "Users can update guest categories of own events" ON guest_categories;
DROP POLICY IF EXISTS "Users can delete guest categories of own events" ON guest_categories;

CREATE POLICY "Users can view guest categories of own events" ON guest_categories FOR SELECT
  USING (EXISTS (SELECT 1 FROM events WHERE events.id = guest_categories.event_id AND events.user_id = auth.uid()));
CREATE POLICY "Users can insert guest categories for own events" ON guest_categories FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM events WHERE events.id = guest_categories.event_id AND events.user_id = auth.uid()));
CREATE POLICY "Users can update guest categories of own events" ON guest_categories FOR UPDATE
  USING (EXISTS (SELECT 1 FROM events WHERE events.id = guest_categories.event_id AND events.user_id = auth.uid()));
CREATE POLICY "Users can delete guest categories of own events" ON guest_categories FOR DELETE
  USING (EXISTS (SELECT 1 FROM events WHERE events.id = guest_categories.event_id AND events.user_id = auth.uid()));

-- updated_at trigger (safe re-run)
DO $$
BEGIN
  CREATE TRIGGER update_guest_categories_updated_at BEFORE UPDATE ON guest_categories
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
