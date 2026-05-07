-- Ensure reminder_1 automation defaults are applied automatically (safe re-run)
--
-- Goals:
-- - New/updated reminder_1 settings default to recipient_mode='all' (all guests)
-- - Catch-up is enabled by default (so late-added guests get queued once notification_date has passed)
--
-- Notes:
-- - `late_catchup_*` fields are only used by reminder_1 catch-up logic; harmless for other types.

-- Default catch-up to true going forward (existing rows unchanged).
ALTER TABLE public.notification_settings
  ALTER COLUMN late_catchup_enabled SET DEFAULT true;

-- Make existing reminder_1 rows opt-in automatically (safe re-run).
UPDATE public.notification_settings
SET late_catchup_enabled = true
WHERE notification_type = 'reminder_1'
  AND COALESCE(channel, 'SMS') = 'SMS'
  AND COALESCE(late_catchup_enabled, false) IS NOT TRUE;

-- Trigger: if reminder_1 has no recipient_mode, force 'all'
CREATE OR REPLACE FUNCTION public.notification_settings_reminder1_defaults_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF NEW.notification_type = 'reminder_1'
       AND COALESCE(NEW.channel, 'SMS') = 'SMS' THEN
      IF NEW.recipient_mode IS NULL OR NULLIF(TRIM(NEW.recipient_mode), '') IS NULL THEN
        NEW.recipient_mode := 'all';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notification_settings_reminder1_defaults ON public.notification_settings;
CREATE TRIGGER trg_notification_settings_reminder1_defaults
BEFORE INSERT OR UPDATE ON public.notification_settings
FOR EACH ROW
EXECUTE FUNCTION public.notification_settings_reminder1_defaults_trg();

