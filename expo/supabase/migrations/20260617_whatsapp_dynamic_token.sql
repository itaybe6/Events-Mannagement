-- WhatsApp dynamic access token (encrypted at rest)
-- ---------------------------------------------------------------------------
-- Until the Meta business is approved, the manager uploads a temporary access
-- token from the UI. The raw token is NEVER stored in plaintext: it's encrypted
-- (AES-256-GCM) inside the `set-whatsapp-token` Edge Function and only the
-- ciphertext + iv are stored here. A short hint (last 4 chars) is kept for the
-- UI so the manager can recognize the active token.
--
-- The ciphertext is meaningless without the encryption key, which lives only in
-- the Edge Function environment (WHATSAPP_TOKEN_ENC_KEY, or derived from the
-- service-role key) and is never exposed to clients.
--
-- Safe to re-run.

ALTER TABLE public.whatsapp_settings
  ADD COLUMN IF NOT EXISTS access_token_ciphertext text,
  ADD COLUMN IF NOT EXISTS access_token_iv text,
  ADD COLUMN IF NOT EXISTS access_token_hint text,
  ADD COLUMN IF NOT EXISTS access_token_updated_at timestamptz;
