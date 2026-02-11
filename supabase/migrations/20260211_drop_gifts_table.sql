-- Drop gifts table (no longer used).
-- We keep gift tracking via `guests.gift_amount`.

DO $$
BEGIN
  IF to_regclass('public.gifts') IS NOT NULL THEN
    DROP TABLE public.gifts CASCADE;
  END IF;
END $$;

