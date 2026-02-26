-- UI hide/delete support for notification cards (safe re-run)
--
-- Allows "deleting" built-in notification cards from the UI by marking them hidden.
-- We keep rows for audit/history but they won't render in the editor page.

ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS ui_hidden boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_notification_settings_ui_hidden
  ON public.notification_settings (event_id, ui_hidden);

