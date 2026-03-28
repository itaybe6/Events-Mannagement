-- Create storage bucket for event images (safe re-run)
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('event-images', 'event-images', true)
  ON CONFLICT (id) DO UPDATE SET public = true;
EXCEPTION
  WHEN undefined_table THEN
    -- storage schema may not be available in some environments
    NULL;
END $$;

-- Public read policy for event images (safe re-run)
DO $$
BEGIN
  CREATE POLICY "Public read event-images"
    ON storage.objects
    FOR SELECT
    TO public
    USING (bucket_id = 'event-images');
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

