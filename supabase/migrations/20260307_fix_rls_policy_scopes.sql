-- Fix RLS policy scopes to avoid infinite recursion (42P17) for public invite flows.
-- Root cause: many "Users can ..." policies were created without `TO authenticated`,
-- so they applied to `anon` as well. When `events` public invite policy queries `guests`,
-- Postgres evaluates *all* guest SELECT policies for `anon`, including ones that query `events`,
-- causing a policy recursion cycle: events -> guests -> events.

-- Users table
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
CREATE POLICY "Users can insert own profile" ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Events
DROP POLICY IF EXISTS "Users can view own events" ON public.events;
CREATE POLICY "Users can view own events" ON public.events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own events" ON public.events;
CREATE POLICY "Users can insert own events" ON public.events
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own events" ON public.events;
CREATE POLICY "Users can update own events" ON public.events
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own events" ON public.events;
CREATE POLICY "Users can delete own events" ON public.events
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Tasks
DROP POLICY IF EXISTS "Users can view tasks of own events" ON public.tasks;
CREATE POLICY "Users can view tasks of own events" ON public.tasks
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = tasks.event_id AND e.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert tasks for own events" ON public.tasks;
CREATE POLICY "Users can insert tasks for own events" ON public.tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = tasks.event_id AND e.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update tasks of own events" ON public.tasks;
CREATE POLICY "Users can update tasks of own events" ON public.tasks
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = tasks.event_id AND e.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete tasks of own events" ON public.tasks;
CREATE POLICY "Users can delete tasks of own events" ON public.tasks
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = tasks.event_id AND e.user_id = auth.uid()));

-- Guests
DROP POLICY IF EXISTS "Users can view guests of own events" ON public.guests;
CREATE POLICY "Users can view guests of own events" ON public.guests
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = guests.event_id AND e.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert guests for own events" ON public.guests;
CREATE POLICY "Users can insert guests for own events" ON public.guests
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = guests.event_id AND e.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update guests of own events" ON public.guests;
CREATE POLICY "Users can update guests of own events" ON public.guests
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = guests.event_id AND e.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete guests of own events" ON public.guests;
CREATE POLICY "Users can delete guests of own events" ON public.guests
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = guests.event_id AND e.user_id = auth.uid()));

-- Guest categories
DROP POLICY IF EXISTS "Users can view guest categories of own events" ON public.guest_categories;
CREATE POLICY "Users can view guest categories of own events" ON public.guest_categories
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = guest_categories.event_id AND e.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert guest categories for own events" ON public.guest_categories;
CREATE POLICY "Users can insert guest categories for own events" ON public.guest_categories
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = guest_categories.event_id AND e.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update guest categories of own events" ON public.guest_categories;
CREATE POLICY "Users can update guest categories of own events" ON public.guest_categories
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = guest_categories.event_id AND e.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete guest categories of own events" ON public.guest_categories;
CREATE POLICY "Users can delete guest categories of own events" ON public.guest_categories
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = guest_categories.event_id AND e.user_id = auth.uid()));

-- Tables
DROP POLICY IF EXISTS "Users can view tables of own events" ON public.tables;
CREATE POLICY "Users can view tables of own events" ON public.tables
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = tables.event_id AND e.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert tables for own events" ON public.tables;
CREATE POLICY "Users can insert tables for own events" ON public.tables
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = tables.event_id AND e.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update tables of own events" ON public.tables;
CREATE POLICY "Users can update tables of own events" ON public.tables
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = tables.event_id AND e.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete tables of own events" ON public.tables;
CREATE POLICY "Users can delete tables of own events" ON public.tables
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = tables.event_id AND e.user_id = auth.uid()));

-- Seating maps
DROP POLICY IF EXISTS "Users can view seating_maps of own events" ON public.seating_maps;
CREATE POLICY "Users can view seating_maps of own events" ON public.seating_maps
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = seating_maps.event_id AND e.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert seating_maps for own events" ON public.seating_maps;
CREATE POLICY "Users can insert seating_maps for own events" ON public.seating_maps
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = seating_maps.event_id AND e.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update seating_maps of own events" ON public.seating_maps;
CREATE POLICY "Users can update seating_maps of own events" ON public.seating_maps
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = seating_maps.event_id AND e.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = seating_maps.event_id AND e.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete seating_maps of own events" ON public.seating_maps;
CREATE POLICY "Users can delete seating_maps of own events" ON public.seating_maps
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = seating_maps.event_id AND e.user_id = auth.uid()));

-- Messages
DROP POLICY IF EXISTS "Users can view messages of own events" ON public.messages;
CREATE POLICY "Users can view messages of own events" ON public.messages
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = messages.event_id AND e.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert messages for own events" ON public.messages;
CREATE POLICY "Users can insert messages for own events" ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = messages.event_id AND e.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update messages of own events" ON public.messages;
CREATE POLICY "Users can update messages of own events" ON public.messages
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = messages.event_id AND e.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete messages of own events" ON public.messages;
CREATE POLICY "Users can delete messages of own events" ON public.messages
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = messages.event_id AND e.user_id = auth.uid()));

-- Notification settings (limit to authenticated; admins are authenticated too)
DROP POLICY IF EXISTS "Users can view notification settings of own events" ON public.notification_settings;
CREATE POLICY "Users can view notification settings of own events" ON public.notification_settings
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = notification_settings.event_id
        AND e.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert notification settings for own events" ON public.notification_settings;
CREATE POLICY "Users can insert notification settings for own events" ON public.notification_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = notification_settings.event_id
        AND e.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update notification settings of own events" ON public.notification_settings;
CREATE POLICY "Users can update notification settings of own events" ON public.notification_settings
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = notification_settings.event_id
        AND e.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = notification_settings.event_id
        AND e.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete notification settings of own events" ON public.notification_settings;
CREATE POLICY "Users can delete notification settings of own events" ON public.notification_settings
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = notification_settings.event_id
        AND e.user_id = auth.uid()
    )
  );

