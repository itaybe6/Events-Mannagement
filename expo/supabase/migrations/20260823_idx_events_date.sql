-- Upcoming events list filters and sorts by date.
CREATE INDEX IF NOT EXISTS idx_events_date ON public.events (date);
