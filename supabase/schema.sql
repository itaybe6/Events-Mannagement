-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table for authentication and profile
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    avatar_url VARCHAR(500),
    user_type VARCHAR(50) NOT NULL CHECK (user_type IN ('event_owner', 'admin', 'employee')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add phone column if missing (safe re-run)
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

-- Add avatar_url column if missing (safe re-run)
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);

-- Ensure user_type check constraint uses new values (safe re-run)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_user_type_check;
ALTER TABLE users
  ADD CONSTRAINT users_user_type_check
  CHECK (user_type IN ('event_owner', 'admin', 'employee'));

-- Events table
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    location VARCHAR(255) NOT NULL,
    city VARCHAR(255),
    image VARCHAR(500),
    story TEXT,
    guests_count INTEGER DEFAULT 0,
    budget DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add city column if missing (safe re-run)
ALTER TABLE events ADD COLUMN IF NOT EXISTS city VARCHAR(255);

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    completed BOOLEAN DEFAULT FALSE,
    due_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Guests table
CREATE TABLE IF NOT EXISTS guests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    status VARCHAR(50) DEFAULT 'ממתין' CHECK (status IN ('מגיע', 'לא מגיע', 'ממתין')),
    table_id UUID,
    category_id UUID,
    gift_amount DECIMAL(10,2) DEFAULT 0,
    message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Guest categories table
CREATE TABLE IF NOT EXISTS guest_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    side VARCHAR(20) NOT NULL DEFAULT 'groom' CHECK (side IN ('groom', 'bride')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add side column if missing (safe re-run)
ALTER TABLE guest_categories ADD COLUMN IF NOT EXISTS side VARCHAR(20) DEFAULT 'groom';
UPDATE guest_categories SET side = 'groom' WHERE side IN ('חתן');
UPDATE guest_categories SET side = 'bride' WHERE side IN ('כלה');
UPDATE guest_categories SET side = 'groom' WHERE side IS NULL;
ALTER TABLE guest_categories ALTER COLUMN side SET NOT NULL;
ALTER TABLE guest_categories DROP CONSTRAINT IF EXISTS guest_categories_side_check;
ALTER TABLE guest_categories
  ADD CONSTRAINT guest_categories_side_check
  CHECK (side IN ('groom', 'bride'));
ALTER TABLE guest_categories ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE guest_categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Tables table
CREATE TABLE IF NOT EXISTS tables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    number INTEGER,
    capacity INTEGER NOT NULL,
    area VARCHAR(255),
    shape VARCHAR(50) DEFAULT 'square' CHECK (shape IN ('square', 'rectangle', 'reserve')),
    x INTEGER,
    y INTEGER,
    seated_guests INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seating maps table (freeform layout + annotations)
CREATE TABLE IF NOT EXISTS seating_maps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    num_tables INTEGER NOT NULL DEFAULT 0,
    tables JSONB NOT NULL DEFAULT '[]'::jsonb,
    annotations JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(event_id)
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('SMS', 'וואטסאפ')),
    recipient VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    sent_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(100) DEFAULT 'נשלח',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Gifts table
CREATE TABLE IF NOT EXISTS gifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    guest_name VARCHAR(255) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    message TEXT,
    date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(50) DEFAULT 'בתהליך' CHECK (status IN ('התקבל', 'בתהליך')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notification settings table
CREATE TABLE IF NOT EXISTS notification_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL,
    days_from_wedding INTEGER,
    notification_date TIMESTAMP WITH TIME ZONE,
    channel VARCHAR(20) DEFAULT 'SMS' CHECK (channel IN ('SMS', 'WHATSAPP')),
    title VARCHAR(255) NOT NULL,
    message_content TEXT NOT NULL,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(event_id, notification_type)
);

-- Add foreign key constraint for table_id in guests
DO $$
BEGIN
  ALTER TABLE guests
    ADD CONSTRAINT fk_guests_table_id
    FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add column for number of people
ALTER TABLE guests ADD COLUMN IF NOT EXISTS number_of_people INTEGER DEFAULT 1;

-- Add column for category
ALTER TABLE guests ADD COLUMN IF NOT EXISTS category_id UUID;

-- Add foreign key constraint for category_id in guests
DO $$
BEGIN
  ALTER TABLE guests
    ADD CONSTRAINT fk_guests_category_id
    FOREIGN KEY (category_id) REFERENCES guest_categories(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_events_user_id ON events(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_event_id ON tasks(event_id);
CREATE INDEX IF NOT EXISTS idx_guests_event_id ON guests(event_id);
CREATE INDEX IF NOT EXISTS idx_guest_categories_event_id ON guest_categories(event_id);
CREATE INDEX IF NOT EXISTS idx_guests_table_id ON guests(table_id);
CREATE INDEX IF NOT EXISTS idx_guests_category_id ON guests(category_id);
CREATE INDEX IF NOT EXISTS idx_tables_event_id ON tables(event_id);
CREATE INDEX IF NOT EXISTS idx_messages_event_id ON messages(event_id);
CREATE INDEX IF NOT EXISTS idx_gifts_event_id ON gifts(event_id);

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE seating_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE gifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- IMPORTANT:
-- Avoid querying the same table inside its own RLS policy (can cause infinite recursion -> 500).
-- We'll use a SECURITY DEFINER helper to check admin status safely.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND user_type = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Drop old policies if they exist (safe re-run)
DROP POLICY IF EXISTS "Admins can view all users" ON users;
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;

-- Admins can manage all users
DROP POLICY IF EXISTS "Admins can manage all users" ON users;
CREATE POLICY "Admins can manage all users" ON users
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Users can manage their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON users;
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON users;
CREATE POLICY "Users can insert own profile" ON users
  FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Events policies
DROP POLICY IF EXISTS "Users can view own events" ON events;
DROP POLICY IF EXISTS "Users can insert own events" ON events;
DROP POLICY IF EXISTS "Users can update own events" ON events;
DROP POLICY IF EXISTS "Users can delete own events" ON events;
DROP POLICY IF EXISTS "Admins can manage events" ON events;
CREATE POLICY "Users can view own events" ON events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own events" ON events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own events" ON events FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own events" ON events FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage events" ON events
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Tasks policies
DROP POLICY IF EXISTS "Users can view tasks of own events" ON tasks;
DROP POLICY IF EXISTS "Users can insert tasks for own events" ON tasks;
DROP POLICY IF EXISTS "Users can update tasks of own events" ON tasks;
DROP POLICY IF EXISTS "Users can delete tasks of own events" ON tasks;
CREATE POLICY "Users can view tasks of own events" ON tasks FOR SELECT 
    USING (EXISTS (SELECT 1 FROM events WHERE events.id = tasks.event_id AND events.user_id = auth.uid()));
CREATE POLICY "Users can insert tasks for own events" ON tasks FOR INSERT 
    WITH CHECK (EXISTS (SELECT 1 FROM events WHERE events.id = tasks.event_id AND events.user_id = auth.uid()));
CREATE POLICY "Users can update tasks of own events" ON tasks FOR UPDATE 
    USING (EXISTS (SELECT 1 FROM events WHERE events.id = tasks.event_id AND events.user_id = auth.uid()));
CREATE POLICY "Users can delete tasks of own events" ON tasks FOR DELETE 
    USING (EXISTS (SELECT 1 FROM events WHERE events.id = tasks.event_id AND events.user_id = auth.uid()));

-- Guests policies
DROP POLICY IF EXISTS "Users can view guests of own events" ON guests;
DROP POLICY IF EXISTS "Users can insert guests for own events" ON guests;
DROP POLICY IF EXISTS "Users can update guests of own events" ON guests;
DROP POLICY IF EXISTS "Users can delete guests of own events" ON guests;
CREATE POLICY "Users can view guests of own events" ON guests FOR SELECT 
    USING (EXISTS (SELECT 1 FROM events WHERE events.id = guests.event_id AND events.user_id = auth.uid()));
CREATE POLICY "Users can insert guests for own events" ON guests FOR INSERT 
    WITH CHECK (EXISTS (SELECT 1 FROM events WHERE events.id = guests.event_id AND events.user_id = auth.uid()));
CREATE POLICY "Users can update guests of own events" ON guests FOR UPDATE 
    USING (EXISTS (SELECT 1 FROM events WHERE events.id = guests.event_id AND events.user_id = auth.uid()));
CREATE POLICY "Users can delete guests of own events" ON guests FOR DELETE 
    USING (EXISTS (SELECT 1 FROM events WHERE events.id = guests.event_id AND events.user_id = auth.uid()));

-- Guest categories policies
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

-- Tables policies
DROP POLICY IF EXISTS "Users can view tables of own events" ON tables;
DROP POLICY IF EXISTS "Users can insert tables for own events" ON tables;
DROP POLICY IF EXISTS "Users can update tables of own events" ON tables;
DROP POLICY IF EXISTS "Users can delete tables of own events" ON tables;
CREATE POLICY "Users can view tables of own events" ON tables FOR SELECT 
    USING (EXISTS (SELECT 1 FROM events WHERE events.id = tables.event_id AND events.user_id = auth.uid()));
CREATE POLICY "Users can insert tables for own events" ON tables FOR INSERT 
    WITH CHECK (EXISTS (SELECT 1 FROM events WHERE events.id = tables.event_id AND events.user_id = auth.uid()));
CREATE POLICY "Users can update tables of own events" ON tables FOR UPDATE 
    USING (EXISTS (SELECT 1 FROM events WHERE events.id = tables.event_id AND events.user_id = auth.uid()));
CREATE POLICY "Users can delete tables of own events" ON tables FOR DELETE 
    USING (EXISTS (SELECT 1 FROM events WHERE events.id = tables.event_id AND events.user_id = auth.uid()));

-- Seating maps policies
DROP POLICY IF EXISTS "Users can view seating_maps of own events" ON seating_maps;
DROP POLICY IF EXISTS "Users can insert seating_maps for own events" ON seating_maps;
DROP POLICY IF EXISTS "Users can update seating_maps of own events" ON seating_maps;
DROP POLICY IF EXISTS "Users can delete seating_maps of own events" ON seating_maps;
CREATE POLICY "Users can view seating_maps of own events" ON seating_maps FOR SELECT
    USING (EXISTS (SELECT 1 FROM events WHERE events.id = seating_maps.event_id AND events.user_id = auth.uid()));
CREATE POLICY "Users can insert seating_maps for own events" ON seating_maps FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM events WHERE events.id = seating_maps.event_id AND events.user_id = auth.uid()));
CREATE POLICY "Users can update seating_maps of own events" ON seating_maps FOR UPDATE
    USING (EXISTS (SELECT 1 FROM events WHERE events.id = seating_maps.event_id AND events.user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM events WHERE events.id = seating_maps.event_id AND events.user_id = auth.uid()));
CREATE POLICY "Users can delete seating_maps of own events" ON seating_maps FOR DELETE
    USING (EXISTS (SELECT 1 FROM events WHERE events.id = seating_maps.event_id AND events.user_id = auth.uid()));

-- Messages policies
DROP POLICY IF EXISTS "Users can view messages of own events" ON messages;
DROP POLICY IF EXISTS "Users can insert messages for own events" ON messages;
DROP POLICY IF EXISTS "Users can update messages of own events" ON messages;
DROP POLICY IF EXISTS "Users can delete messages of own events" ON messages;
CREATE POLICY "Users can view messages of own events" ON messages FOR SELECT 
    USING (EXISTS (SELECT 1 FROM events WHERE events.id = messages.event_id AND events.user_id = auth.uid()));
CREATE POLICY "Users can insert messages for own events" ON messages FOR INSERT 
    WITH CHECK (EXISTS (SELECT 1 FROM events WHERE events.id = messages.event_id AND events.user_id = auth.uid()));
CREATE POLICY "Users can update messages of own events" ON messages FOR UPDATE 
    USING (EXISTS (SELECT 1 FROM events WHERE events.id = messages.event_id AND events.user_id = auth.uid()));
CREATE POLICY "Users can delete messages of own events" ON messages FOR DELETE 
    USING (EXISTS (SELECT 1 FROM events WHERE events.id = messages.event_id AND events.user_id = auth.uid()));

-- Gifts policies
DROP POLICY IF EXISTS "Users can view gifts of own events" ON gifts;
DROP POLICY IF EXISTS "Users can insert gifts for own events" ON gifts;
DROP POLICY IF EXISTS "Users can update gifts of own events" ON gifts;
DROP POLICY IF EXISTS "Users can delete gifts of own events" ON gifts;
CREATE POLICY "Users can view gifts of own events" ON gifts FOR SELECT 
    USING (EXISTS (SELECT 1 FROM events WHERE events.id = gifts.event_id AND events.user_id = auth.uid()));
CREATE POLICY "Users can insert gifts for own events" ON gifts FOR INSERT 
    WITH CHECK (EXISTS (SELECT 1 FROM events WHERE events.id = gifts.event_id AND events.user_id = auth.uid()));
CREATE POLICY "Users can update gifts of own events" ON gifts FOR UPDATE 
    USING (EXISTS (SELECT 1 FROM events WHERE events.id = gifts.event_id AND events.user_id = auth.uid()));
CREATE POLICY "Users can delete gifts of own events" ON gifts FOR DELETE 
    USING (EXISTS (SELECT 1 FROM events WHERE events.id = gifts.event_id AND events.user_id = auth.uid()));

-- Notification settings policies
DROP POLICY IF EXISTS "Users can view notification settings of own events" ON notification_settings;
DROP POLICY IF EXISTS "Users can insert notification settings for own events" ON notification_settings;
DROP POLICY IF EXISTS "Users can update notification settings of own events" ON notification_settings;
DROP POLICY IF EXISTS "Users can delete notification settings of own events" ON notification_settings;
CREATE POLICY "Users can view notification settings of own events" ON notification_settings FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM events
      WHERE events.id = notification_settings.event_id
        AND events.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can insert notification settings for own events" ON notification_settings FOR INSERT
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM events
      WHERE events.id = notification_settings.event_id
        AND events.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can update notification settings of own events" ON notification_settings FOR UPDATE
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM events
      WHERE events.id = notification_settings.event_id
        AND events.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM events
      WHERE events.id = notification_settings.event_id
        AND events.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can delete notification settings of own events" ON notification_settings FOR DELETE
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM events
      WHERE events.id = notification_settings.event_id
        AND events.user_id = auth.uid()
    )
  );

-- Functions for updating updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
DO $$
BEGIN
  CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TRIGGER update_guests_updated_at BEFORE UPDATE ON guests
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TRIGGER update_guest_categories_updated_at BEFORE UPDATE ON guest_categories
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TRIGGER update_tables_updated_at BEFORE UPDATE ON tables
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ========= STORAGE =========
-- Public bucket for user avatars (safe re-run)
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('avatars', 'avatars', true)
  ON CONFLICT (id) DO UPDATE SET public = true;
EXCEPTION
  WHEN undefined_table THEN
    -- storage schema may not be available in some environments
    NULL;
END $$;

-- Public read access policy for avatars bucket (safe re-run)
DO $$
BEGIN
  CREATE POLICY "Public read avatars"
    ON storage.objects
    FOR SELECT
    TO public
    USING (bucket_id = 'avatars');
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;