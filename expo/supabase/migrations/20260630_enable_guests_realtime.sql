-- Enable Supabase Realtime for guest check-in sync across multiple usher stations.
-- Safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'guests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.guests;
  END IF;
END $$;

-- Ensure UPDATE payloads include all columns for client-side merge.
ALTER TABLE public.guests REPLICA IDENTITY FULL;
