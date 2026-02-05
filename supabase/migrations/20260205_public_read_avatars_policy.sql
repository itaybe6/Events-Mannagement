-- Allow public read access to avatars bucket objects (safe re-run)
DO $$
BEGIN
  -- In Supabase, storage.objects is protected by RLS by default.
  -- This policy allows anyone (public) to SELECT objects from the 'avatars' bucket.
  CREATE POLICY "Public read avatars"
    ON storage.objects
    FOR SELECT
    TO public
    USING (bucket_id = 'avatars');
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

