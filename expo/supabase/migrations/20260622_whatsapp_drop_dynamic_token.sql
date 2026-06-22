-- Drop the dynamic (temporary) WhatsApp access token storage.
-- ---------------------------------------------------------------------------
-- The system now uses a single permanent WhatsApp token stored as the
-- WHATSAPP_ACCESS_TOKEN Edge secret. The previous mechanism stored an
-- encrypted, manager-uploaded temporary token directly on whatsapp_settings.
-- That token storage is no longer used and is removed here.
--
-- Safe to re-run.

ALTER TABLE public.whatsapp_settings
  DROP COLUMN IF EXISTS access_token_ciphertext,
  DROP COLUMN IF EXISTS access_token_iv,
  DROP COLUMN IF EXISTS access_token_hint,
  DROP COLUMN IF EXISTS access_token_updated_at;
