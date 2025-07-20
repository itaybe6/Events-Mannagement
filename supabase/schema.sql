-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table for authentication and profile
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    user_type VARCHAR(50) NOT NULL CHECK (user_type IN ('couple', 'admin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Events table
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    location VARCHAR(255) NOT NULL,
    image VARCHAR(500),
    story TEXT,
    guests_count INTEGER DEFAULT 0,
    budget DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tasks table
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    completed BOOLEAN DEFAULT FALSE,
    due_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Guests table
CREATE TABLE guests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    status VARCHAR(50) DEFAULT 'ממתין' CHECK (status IN ('מגיע', 'לא מגיע', 'ממתין')),
    table_id UUID,
    gift_amount DECIMAL(10,2) DEFAULT 0,
    message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tables table
CREATE TABLE tables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    capacity INTEGER NOT NULL,
    area VARCHAR(255),
    shape VARCHAR(50) DEFAULT 'square' CHECK (shape IN ('square', 'rectangle')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Messages table
CREATE TABLE messages (
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
CREATE TABLE gifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    guest_name VARCHAR(255) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    message TEXT,
    date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(50) DEFAULT 'בתהליך' CHECK (status IN ('התקבל', 'בתהליך')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add foreign key constraint for table_id in guests
ALTER TABLE guests ADD CONSTRAINT fk_guests_table_id 
    FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE SET NULL;

-- Create indexes for better performance
CREATE INDEX idx_events_user_id ON events(user_id);
CREATE INDEX idx_tasks_event_id ON tasks(event_id);
CREATE INDEX idx_guests_event_id ON guests(event_id);
CREATE INDEX idx_guests_table_id ON guests(table_id);
CREATE INDEX idx_tables_event_id ON tables(event_id);
CREATE INDEX idx_messages_event_id ON messages(event_id);
CREATE INDEX idx_gifts_event_id ON gifts(event_id);

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE gifts ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Admin can see all users
CREATE POLICY "Admins can view all users" ON users FOR ALL 
    USING ((SELECT user_type FROM users WHERE id = auth.uid()) = 'admin');

-- Users can only see their own data (non-admin)
CREATE POLICY "Users can view own profile" ON users FOR SELECT 
    USING (auth.uid() = id AND (SELECT user_type FROM users WHERE id = auth.uid()) != 'admin');
CREATE POLICY "Users can update own profile" ON users FOR UPDATE 
    USING (auth.uid() = id AND (SELECT user_type FROM users WHERE id = auth.uid()) != 'admin');

-- Events policies
CREATE POLICY "Users can view own events" ON events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own events" ON events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own events" ON events FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own events" ON events FOR DELETE USING (auth.uid() = user_id);

-- Tasks policies
CREATE POLICY "Users can view tasks of own events" ON tasks FOR SELECT 
    USING (EXISTS (SELECT 1 FROM events WHERE events.id = tasks.event_id AND events.user_id = auth.uid()));
CREATE POLICY "Users can insert tasks for own events" ON tasks FOR INSERT 
    WITH CHECK (EXISTS (SELECT 1 FROM events WHERE events.id = tasks.event_id AND events.user_id = auth.uid()));
CREATE POLICY "Users can update tasks of own events" ON tasks FOR UPDATE 
    USING (EXISTS (SELECT 1 FROM events WHERE events.id = tasks.event_id AND events.user_id = auth.uid()));
CREATE POLICY "Users can delete tasks of own events" ON tasks FOR DELETE 
    USING (EXISTS (SELECT 1 FROM events WHERE events.id = tasks.event_id AND events.user_id = auth.uid()));

-- Guests policies
CREATE POLICY "Users can view guests of own events" ON guests FOR SELECT 
    USING (EXISTS (SELECT 1 FROM events WHERE events.id = guests.event_id AND events.user_id = auth.uid()));
CREATE POLICY "Users can insert guests for own events" ON guests FOR INSERT 
    WITH CHECK (EXISTS (SELECT 1 FROM events WHERE events.id = guests.event_id AND events.user_id = auth.uid()));
CREATE POLICY "Users can update guests of own events" ON guests FOR UPDATE 
    USING (EXISTS (SELECT 1 FROM events WHERE events.id = guests.event_id AND events.user_id = auth.uid()));
CREATE POLICY "Users can delete guests of own events" ON guests FOR DELETE 
    USING (EXISTS (SELECT 1 FROM events WHERE events.id = guests.event_id AND events.user_id = auth.uid()));

-- Tables policies
CREATE POLICY "Users can view tables of own events" ON tables FOR SELECT 
    USING (EXISTS (SELECT 1 FROM events WHERE events.id = tables.event_id AND events.user_id = auth.uid()));
CREATE POLICY "Users can insert tables for own events" ON tables FOR INSERT 
    WITH CHECK (EXISTS (SELECT 1 FROM events WHERE events.id = tables.event_id AND events.user_id = auth.uid()));
CREATE POLICY "Users can update tables of own events" ON tables FOR UPDATE 
    USING (EXISTS (SELECT 1 FROM events WHERE events.id = tables.event_id AND events.user_id = auth.uid()));
CREATE POLICY "Users can delete tables of own events" ON tables FOR DELETE 
    USING (EXISTS (SELECT 1 FROM events WHERE events.id = tables.event_id AND events.user_id = auth.uid()));

-- Messages policies
CREATE POLICY "Users can view messages of own events" ON messages FOR SELECT 
    USING (EXISTS (SELECT 1 FROM events WHERE events.id = messages.event_id AND events.user_id = auth.uid()));
CREATE POLICY "Users can insert messages for own events" ON messages FOR INSERT 
    WITH CHECK (EXISTS (SELECT 1 FROM events WHERE events.id = messages.event_id AND events.user_id = auth.uid()));
CREATE POLICY "Users can update messages of own events" ON messages FOR UPDATE 
    USING (EXISTS (SELECT 1 FROM events WHERE events.id = messages.event_id AND events.user_id = auth.uid()));
CREATE POLICY "Users can delete messages of own events" ON messages FOR DELETE 
    USING (EXISTS (SELECT 1 FROM events WHERE events.id = messages.event_id AND events.user_id = auth.uid()));

-- Gifts policies
CREATE POLICY "Users can view gifts of own events" ON gifts FOR SELECT 
    USING (EXISTS (SELECT 1 FROM events WHERE events.id = gifts.event_id AND events.user_id = auth.uid()));
CREATE POLICY "Users can insert gifts for own events" ON gifts FOR INSERT 
    WITH CHECK (EXISTS (SELECT 1 FROM events WHERE events.id = gifts.event_id AND events.user_id = auth.uid()));
CREATE POLICY "Users can update gifts of own events" ON gifts FOR UPDATE 
    USING (EXISTS (SELECT 1 FROM events WHERE events.id = gifts.event_id AND events.user_id = auth.uid()));
CREATE POLICY "Users can delete gifts of own events" ON gifts FOR DELETE 
    USING (EXISTS (SELECT 1 FROM events WHERE events.id = gifts.event_id AND events.user_id = auth.uid()));

-- Functions for updating updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_guests_updated_at BEFORE UPDATE ON guests 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tables_updated_at BEFORE UPDATE ON tables 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); 