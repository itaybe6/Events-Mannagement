import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppKeyboardAwareScrollView } from '@/components/AppKeyboardAware';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { buildDirectionsDetailsText, normalizeBaseUrl } from '@/lib/navigationLinks';
import { supabase } from '@/lib/supabase';
import { useUserStore } from '@/store/userStore';
import { useLayoutStore } from '@/store/layoutStore';
import { useEventSelectionStore } from '@/store/eventSelectionStore';
import { ALIGN_LEFT, ALIGN_RIGHT, ROW_DIR } from '@/lib/rtl';

type NotificationSettingRow = {
  id?: string;
  event_id?: string;
  notification_type: string;
  title: string;
  enabled?: boolean;
  message_content?: string;
  days_from_wedding?: number;
  channel?: 'SMS' | 'WHATSAPP';
  // Stored in DB as TIMESTAMPTZ (ISO string on the client).
  notification_date?: string | null;
  recipient_guest_ids?: string[] | null;
  recipient_mode?: 'manual' | 'all' | 'pending' | 'prev_pending' | string | null;
  late_catchup_enabled?: boolean | null;
  late_catchup_send_time?: string | null; // "HH:MM:SS" or "HH:MM"
  late_catchup_weekdays?: number[] | null; // 0=Sun ... 6=Sat
};

const DEFAULT_TEMPLATES: Array<Omit<NotificationSettingRow, 'id' | 'event_id'>> = [
  { notification_type: 'reminder_1', title: 'הודעה רגילה 1 (לפני האירוע)', days_from_wedding: -30, channel: 'SMS', enabled: false, message_content: '' },
  // Default: 14 days after message #1 (-30 + 14 = -16), can be edited manually.
  { notification_type: 'reminder_2', title: 'הודעה שנייה (לממתינים)', days_from_wedding: -16, channel: 'SMS', enabled: false, message_content: 'תזכורת: אם עדיין לא אישרתם הגעה נשמח לאישור.' },
  { notification_type: 'whatsapp_event_day', title: 'וואטסאפ ביום האירוע', days_from_wedding: 0, channel: 'WHATSAPP', enabled: false, message_content: 'היום האירוע! נתראה שם' },
  { notification_type: 'after_1', title: 'הודעה רגילה אחרי האירוע', days_from_wedding: 1, channel: 'SMS', enabled: false, message_content: 'תודה שבאתם! היה לנו כיף גדול איתכם.' },
];

function formatDate(d: Date) {
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDmySlashes(d: Date) {
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function computeSendDate(eventDate: Date, daysOffset: number) {
  const d = new Date(eventDate);
  d.setDate(d.getDate() + daysOffset);
  return d;
}

function formatTime(d: Date) {
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function parseTimeHm(value: string): { h: number; m: number } | null {
  const s = String(value || '').trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(min)) return null;
  if (h < 0 || h > 23) return null;
  if (min < 0 || min > 59) return null;
  return { h, m: min };
}

function normalizeTimeToDb(value: string) {
  const hm = parseTimeHm(value);
  if (!hm) return null;
  const hh = String(hm.h).padStart(2, '0');
  const mm = String(hm.m).padStart(2, '0');
  return `${hh}:${mm}:00`;
}

function formatHeDateTimeShort(value: unknown) {
  const d = value instanceof Date ? value : new Date(String(value ?? ''));
  if (!Number.isFinite(d.getTime())) return '';
  const date = d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
  const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
}

function parseYmd(ymd: string): { y: number; m: number; d: number } | null {
  const s = String(ymd || '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isInteger(y) || !Number.isInteger(mo) || !Number.isInteger(d)) return null;
  if (mo < 1 || mo > 12) return null;
  if (d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

function formatDmyFromYmd(ymd: string) {
  const p = parseYmd(ymd);
  if (!p) return '';
  const dd = String(p.d).padStart(2, '0');
  const mm = String(p.m).padStart(2, '0');
  return `${dd}/${mm}/${String(p.y)}`;
}

function startOfDayLocal(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function diffDaysLocal(a: Date, b: Date) {
  const ms = startOfDayLocal(a).getTime() - startOfDayLocal(b).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

function formatOffsetLabel(days: number) {
  if (!Number.isFinite(days)) return '';
  if (days === 0) return 'ביום האירוע';
  const abs = Math.abs(days);
  return days < 0 ? `${abs} ימים לפני האירוע` : `${abs} ימים אחרי האירוע`;
}

function toLocalYmd(d: Date) {
  if (!Number.isFinite(d.getTime())) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const isMissingColumn = (err: any, column: string) =>
  String(err?.code) === '42703' && String(err?.message || '').toLowerCase().includes(column.toLowerCase());

export default function NotificationEditorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setTabBarVisible } = useLayoutStore();
  const { userData } = useUserStore();
  const activeUserId = useEventSelectionStore((s) => s.activeUserId);
  const activeEventId = useEventSelectionStore((s) => s.activeEventId);

  const { notificationType, eventId } = useLocalSearchParams<{ notificationType?: string; eventId?: string }>();

  const resolvedEventId = useMemo(() => {
    return (
      String(
        eventId ||
          (userData?.id && activeUserId === userData.id ? activeEventId : null) ||
          userData?.event_id ||
          ''
      ).trim() || null
    );
  }, [activeEventId, activeUserId, eventId, userData?.event_id, userData?.id]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [eventDate, setEventDate] = useState<Date | null>(null);
  const [row, setRow] = useState<NotificationSettingRow | null>(null);

  const [editedSendDateYmd, setEditedSendDateYmd] = useState<string>('');
  const [editedTimeHm, setEditedTimeHm] = useState('11:00');
  const [editedMessage, setEditedMessage] = useState('');
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const dateInputRef = useRef<TextInput | null>(null);
  const timeInputRef = useRef<TextInput | null>(null);

  const webNativeOverlayInputStyle = useMemo(
    () =>
      Platform.OS === 'web'
        ? ({
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'block',
            opacity: 0.001,
            cursor: 'pointer',
            zIndex: 10,
          } as any)
        : null,
    []
  );

  const [guestFilter, setGuestFilter] = useState<'all' | 'מגיע' | 'אולי מגיע' | 'ממתין' | 'לא מגיע'>(
    notificationType === 'reminder_2' ? 'ממתין' : 'all'
  );
  const [allGuests, setAllGuests] = useState<
    Array<{ id: string; name: string; phone?: string; status: 'מגיע' | 'אולי מגיע' | 'לא מגיע' | 'ממתין' }>
  >([]);
  const [selectedGuestIds, setSelectedGuestIds] = useState<Set<string>>(() => new Set());
  const [sendingNow, setSendingNow] = useState(false);
  const [importingPrev, setImportingPrev] = useState(false);

  const isFirstMessage = useMemo(() => String(notificationType || '').trim() === 'reminder_1', [notificationType]);
  const [autoAllRecipients, setAutoAllRecipients] = useState<boolean>(isFirstMessage);

  const [catchupEnabled, setCatchupEnabled] = useState<boolean>(true);
  const [catchupTimeHm, setCatchupTimeHm] = useState<string>('12:00');
  const [catchupWeekdays, setCatchupWeekdays] = useState<Set<number>>(() => new Set([0, 1, 2, 3, 4])); // Sun-Thu
  const [catchupLoading, setCatchupLoading] = useState(false);
  const [catchupQueueRows, setCatchupQueueRows] = useState<
    Array<{ guestId: string; name: string; phone?: string; dueAt: string; lastError?: string | null }>
  >([]);

  type WizardStepId = 'schedule' | 'recipients' | 'catchup' | 'message';
  const wizardSteps = useMemo<WizardStepId[]>(() => {
    const steps: WizardStepId[] = ['schedule'];
    if (String(row?.channel || 'SMS') === 'SMS') steps.push('recipients');
    if (String(notificationType || '').trim() === 'reminder_1' && String(row?.channel || 'SMS') === 'SMS') steps.push('catchup');
    steps.push('message');
    return steps;
  }, [notificationType, row?.channel]);
  const [wizardStepIdx, setWizardStepIdx] = useState(0);
  const wizardStepId = wizardSteps[Math.min(wizardStepIdx, Math.max(0, wizardSteps.length - 1))] ?? 'schedule';
  const wizardIsLast = wizardStepIdx >= wizardSteps.length - 1;

  useEffect(() => {
    setWizardStepIdx(0);
  }, [notificationType]);

  const previousNotificationType = useMemo(() => {
    const nt = String(notificationType || '').trim();
    if (nt === 'reminder_2') return 'reminder_1';
    return null;
  }, [notificationType]);

  const loadCatchupQueue = useCallback(async () => {
    if (!resolvedEventId) return;
    if (!isFirstMessage) return;
    if (!row?.id) return;
    setCatchupLoading(true);
    try {
      const { data: qRows, error: qError } = await supabase
        .from('notification_sms_catchup_queue')
        .select('guest_id, due_at, last_error')
        .eq('event_id', resolvedEventId)
        .eq('notification_setting_id', row.id)
        .eq('status', 'queued')
        .order('due_at', { ascending: true });

      if (qError) {
        // Backward compatibility: table may not exist in older DBs
        const msg = String((qError as any)?.message ?? '').toLowerCase();
        if (msg.includes('notification_sms_catchup_queue') || msg.includes('does not exist')) {
          setCatchupQueueRows([]);
          return;
        }
        throw qError;
      }

      const list = ((qRows as any[]) || []).map((r) => ({
        guestId: String((r as any).guest_id),
        dueAt: String((r as any).due_at),
        lastError: (r as any).last_error ? String((r as any).last_error) : null,
      }));
      const ids = list.map((x) => x.guestId).filter(Boolean);
      const byId = new Map<string, { name: string; phone?: string }>();
      if (ids.length > 0) {
        const { data: gRows, error: gError } = await supabase
          .from('guests')
          .select('id, name, phone')
          .eq('event_id', resolvedEventId)
          .in('id', ids);
        if (!gError) {
          for (const g of (gRows as any[]) || []) {
            byId.set(String((g as any).id), {
              name: String((g as any).name ?? ''),
              phone: (g as any).phone ? String((g as any).phone) : undefined,
            });
          }
        }
      }

      setCatchupQueueRows(
        list.map((r) => {
          const g = byId.get(r.guestId);
          return {
            guestId: r.guestId,
            name: g?.name || '—',
            phone: g?.phone,
            dueAt: r.dueAt,
            lastError: r.lastError,
          };
        })
      );
    } catch (e) {
      console.warn('Failed to load catchup queue:', e);
      setCatchupQueueRows([]);
    } finally {
      setCatchupLoading(false);
    }
  }, [isFirstMessage, resolvedEventId, row?.id]);

  const backfillCatchupQueue = useCallback(async () => {
    if (!resolvedEventId) return;
    setCatchupLoading(true);
    try {
      const { data, error } = await supabase.rpc('backfill_first_message_catchup_queue', { p_event_id: resolvedEventId });
      if (error) {
        const msg = String((error as any)?.message ?? '').toLowerCase();
        if (msg.includes('backfill_first_message_catchup_queue') || msg.includes('does not exist')) {
          Alert.alert('לא זמין', 'הפיצ׳ר עדיין לא הופעל בבסיס הנתונים (חסר מיגרציה).');
          return;
        }
        throw error;
      }
      const n = Number(data ?? 0) || 0;
      Alert.alert('עודכן', `נוספו לתור ${n} אורחים.`);
      await loadCatchupQueue();
    } catch (e: any) {
      const message = e?.message ? String(e.message) : 'שגיאה לא ידועה';
      Alert.alert('שגיאה', `לא ניתן לעדכן את התור.\n\n${message}`);
    } finally {
      setCatchupLoading(false);
    }
  }, [loadCatchupQueue, resolvedEventId]);

  const ui = useMemo(() => {
    return {
      primary: '#1d4ed8',
      primaryHover: '#1e40af',
      bg: '#FFFFFF',
      surface: '#FFFFFF',
      surfaceMuted: '#F3F4F6',
      softBlue: '#EFF6FF',
      text: '#111827',
      sub: '#6B7280',
      border: '#E5E7EB',
      faint: 'rgba(107,114,128,0.85)',
      iconMuted: '#9CA3AF',
      danger: '#EF4444',
    };
  }, []);

  const isWeb = Platform.OS === 'web';

  const wizardStepLabel = useMemo(() => {
    const s = wizardStepId;
    // Match the wizard wording in the provided design (web).
    if (s === 'schedule') return isWeb ? 'הגדרות' : 'תזמון';
    if (s === 'recipients') return isWeb ? 'נמענים' : 'מוזמנים';
    if (s === 'catchup') return 'אורחים חדשים';
    return 'תוכן';
  }, [isWeb, wizardStepId]);

  const wizardStepTitleText = useMemo(() => {
    return `שלב ${Math.min(wizardStepIdx + 1, wizardSteps.length)} מתוך ${wizardSteps.length}: ${wizardStepLabel}`;
  }, [wizardStepIdx, wizardStepLabel, wizardSteps.length]);

  const wizardStepSubtitleText = useMemo(() => {
    if (wizardStepId === 'recipients') return 'בחירת מוזמנים להודעה';
    if (wizardStepId === 'schedule') return 'בחירת זמנים להודעה';
    if (wizardStepId === 'catchup') return 'בחירת מוזמנים להודעה (אוטומציה)';
    return 'עריכת תוכן הודעה';
  }, [wizardStepId]);

  const wizardProgressPct = useMemo(() => {
    const n = Math.max(1, wizardSteps.length);
    const pct = ((Math.min(wizardStepIdx + 1, n) as number) / n) * 100;
    return Math.max(0, Math.min(100, Math.round(pct)));
  }, [wizardStepIdx, wizardSteps.length]);

  useFocusEffect(
    useCallback(() => {
      // Full screen editor: hide tab bar while focused.
      setTabBarVisible(false);
      return () => setTabBarVisible(true);
    }, [setTabBarVisible])
  );

  useEffect(() => {
    const load = async () => {
      if (!resolvedEventId) {
        setLoading(false);
        Alert.alert('שגיאה', 'לא נמצא אירוע למשתמש');
        router.back();
        return;
      }
      if (!notificationType) {
        setLoading(false);
        router.back();
        return;
      }

      setLoading(true);
      try {
        const { data: eventData, error: eventError } = await supabase
          .from('events')
          .select('id, date')
          .eq('id', resolvedEventId)
          .single();
        if (eventError) throw eventError;
        const d = new Date((eventData as any)?.date);
        setEventDate(d);

        const { data: guestRows, error: guestError } = await supabase
          .from('guests')
          .select('id, name, phone, status')
          .eq('event_id', resolvedEventId)
          .order('name', { ascending: true });
        if (guestError) {
          console.warn('Failed to load guests (editor):', guestError);
          setAllGuests([]);
        } else {
          setAllGuests(
            ((guestRows as any[]) || []).map((g) => ({
              id: String(g.id),
              name: String(g.name ?? ''),
              phone: g.phone ? String(g.phone) : undefined,
              status: (g.status as any) || 'ממתין',
            }))
          );
        }

        const { data: existing, error: rowError } = await supabase
          .from('notification_settings')
          .select('*')
          .eq('event_id', resolvedEventId)
          .eq('notification_type', notificationType)
          .maybeSingle();
        if (rowError) {
          console.warn('Failed to load notification setting (editor):', rowError);
        }

        const tpl = DEFAULT_TEMPLATES.find((t) => t.notification_type === notificationType);
        const base: NotificationSettingRow =
          (existing as any) ??
          (tpl
            ? ({
                ...tpl,
                notification_type: tpl.notification_type,
              } as any)
            : ({
                notification_type: notificationType,
                title: 'עריכת הודעה',
                enabled: false,
                message_content: '',
                days_from_wedding: 0,
                channel: 'SMS',
              } as NotificationSettingRow));

        const days = typeof base.days_from_wedding === 'number' ? base.days_from_wedding : 0;
        const recipientIds = Array.isArray((base as any).recipient_guest_ids)
          ? ((base as any).recipient_guest_ids as any[]).map((x) => String(x))
          : [];
        const recipientModeRaw = (base as any)?.recipient_mode;
        const recipientMode = recipientModeRaw === null || recipientModeRaw === undefined ? null : String(recipientModeRaw);
        const lateCatchupEnabled = (base as any)?.late_catchup_enabled;
        const lateCatchupSendTime = (base as any)?.late_catchup_send_time;
        const lateCatchupWeekdays = Array.isArray((base as any)?.late_catchup_weekdays)
          ? ((base as any).late_catchup_weekdays as any[]).map((x) => Number(x)).filter((n) => Number.isFinite(n))
          : null;
        setRow({
          id: (base as any).id,
          event_id: resolvedEventId,
          notification_type: base.notification_type,
          title: String((base as any).title ?? tpl?.title ?? ''),
          enabled: Boolean((base as any).enabled),
          message_content: String((base as any).message_content ?? ''),
          days_from_wedding: days,
          channel: ((base as any).channel as any) || (tpl?.channel as any) || 'SMS',
          notification_date: (base as any).notification_date ? String((base as any).notification_date) : null,
          recipient_guest_ids: recipientIds,
          recipient_mode: recipientMode,
          late_catchup_enabled: lateCatchupEnabled === null || lateCatchupEnabled === undefined ? null : Boolean(lateCatchupEnabled),
          late_catchup_send_time: lateCatchupSendTime ? String(lateCatchupSendTime) : null,
          late_catchup_weekdays: lateCatchupWeekdays,
        });
        setSelectedGuestIds(new Set(recipientIds));

        // Initialize automation controls for reminder_1 (first message).
        if (String(notificationType || '').trim() === 'reminder_1') {
          setAutoAllRecipients(String(recipientMode || '').trim() === 'all' || recipientMode === null);
          setCatchupEnabled(Boolean(lateCatchupEnabled === null || lateCatchupEnabled === undefined ? true : lateCatchupEnabled));
          const timeRaw = lateCatchupSendTime ? String(lateCatchupSendTime) : '12:00:00';
          const timeHm = timeRaw.includes(':') ? timeRaw.split(':').slice(0, 2).join(':') : '12:00';
          setCatchupTimeHm(timeHm || '12:00');
          const dows = Array.isArray(lateCatchupWeekdays) && lateCatchupWeekdays.length > 0 ? lateCatchupWeekdays : [0, 1, 2, 3, 4];
          setCatchupWeekdays(new Set(dows.map((n) => Math.max(0, Math.min(6, Number(n) || 0)))));
        }

        {
          const existingDtRaw = (base as any)?.notification_date;
          const existingDt = existingDtRaw ? new Date(String(existingDtRaw)) : null;
          const hasRealTime =
            existingDt && Number.isFinite(existingDt.getTime()) && (existingDt.getHours() !== 0 || existingDt.getMinutes() !== 0);
          setEditedTimeHm(hasRealTime && existingDt ? formatTime(existingDt) : '11:00');
          if (existingDt && Number.isFinite(existingDt.getTime())) {
            setEditedSendDateYmd(toLocalYmd(existingDt) || '');
          } else if (d && Number.isFinite(d.getTime())) {
            const fallback = computeSendDate(d, days);
            setEditedSendDateYmd(toLocalYmd(fallback) || '');
          } else {
            setEditedSendDateYmd('');
          }
        }
        setEditedMessage(String((base as any).message_content ?? ''));
      } catch (e) {
        console.error('Editor load error:', e);
        Alert.alert('שגיאה', 'לא ניתן לטעון את ההודעה');
        router.back();
      } finally {
        setLoading(false);
      }
    };

    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedEventId, notificationType]);

  useEffect(() => {
    if (!isFirstMessage) return;
    if (!row?.id) return;
    void loadCatchupQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFirstMessage, row?.id]);

  const computedSendAt = useMemo(() => {
    if (!eventDate) return null;
    const ymd = parseYmd(editedSendDateYmd);
    const hm = parseTimeHm(editedTimeHm);
    if (!ymd || !hm) return null;
    return new Date(ymd.y, ymd.m - 1, ymd.d, hm.h, hm.m, 0, 0);
  }, [editedSendDateYmd, editedTimeHm, eventDate]);

  const offsetDays = useMemo(() => {
    if (!eventDate || !computedSendAt) return null;
    return diffDaysLocal(computedSendAt, eventDate);
  }, [computedSendAt, eventDate]);

  const maxChars = 160;
  const charsCount = editedMessage.length;
  const isOverLimit = charsCount > maxChars;

  const onChangeTimeHm = (txt: string) => setEditedTimeHm(String(txt || ''));

  const previewMessage = useMemo(() => {
    const raw = String(editedMessage || '');
    const fullName = String(allGuests?.[0]?.name || 'ישראל ישראלי');
    const sampleFirstName = fullName ? fullName.split(/\s+/)[0] : 'ישראל';
    const sampleLink = 'https://example.com';
    const sampleDirections = buildDirectionsDetailsText('https://moon-events.co.il', 'demo123');
    const sampleDate = eventDate ? formatDate(eventDate) : '01/01/2026';
    const sampleTime = editedTimeHm || '19:30';
    const sampleLocation = 'מיקום האירוע';
    return raw
      .replaceAll('{name}', fullName)
      .replaceAll('{link}', sampleLink)
      .replaceAll('{פרטי הגעה}', sampleDirections)
      .replaceAll('{פרטי_הגעה}', sampleDirections)
      .replaceAll('{event_date}', sampleDate)
      .replaceAll('{תאריך}', sampleDate)
      .replaceAll('{שם_פרטי}', sampleFirstName)
      .replaceAll('{שעה}', sampleTime)
      .replaceAll('{מיקום}', sampleLocation);
  }, [allGuests, editedMessage, eventDate, editedTimeHm]);

  const save = async (opts?: { recipientGuestIds?: string[]; navigateBack?: boolean }) => {
    if (!resolvedEventId || !row) return;
    if (saving) return;
    const navigateBack = opts?.navigateBack !== false;
    const msg = (editedMessage || '').trim();
    if (!msg) {
      Alert.alert('שגיאה', 'יש להזין תוכן הודעה');
      return;
    }
    if (msg.length > maxChars) {
      Alert.alert('שגיאה', `תוכן ההודעה ארוך מדי (${msg.length}/${maxChars})`);
      return;
    }

    if (!eventDate) return;
    if (!computedSendAt || offsetDays === null) {
      Alert.alert('שגיאה', 'בחר תאריך ושעה תקינים לשליחה');
      return;
    }
    const daysToSave = offsetDays;

    setSaving(true);
    try {
      const isFirst = String(notificationType || '').trim() === 'reminder_1';
      const recipientModeToSave = isFirst ? (autoAllRecipients ? 'all' : 'manual') : undefined;
      const catchupEnabledToSave = isFirst ? Boolean(catchupEnabled) : undefined;
      const catchupSendTimeToSave = isFirst ? normalizeTimeToDb(catchupTimeHm) : undefined;
      const catchupWeekdaysToSave = isFirst ? Array.from(catchupWeekdays).sort((a, b) => a - b) : undefined;

      if (row.id) {
        const updatePayload: any = { message_content: msg, days_from_wedding: daysToSave, channel: row.channel, enabled: true };
        updatePayload.notification_date = computedSendAt.toISOString();
        if (opts?.recipientGuestIds) updatePayload.recipient_guest_ids = opts.recipientGuestIds;
        if (recipientModeToSave) updatePayload.recipient_mode = recipientModeToSave;
        if (catchupEnabledToSave !== undefined) updatePayload.late_catchup_enabled = catchupEnabledToSave;
        if (catchupSendTimeToSave) updatePayload.late_catchup_send_time = catchupSendTimeToSave;
        if (catchupWeekdaysToSave) updatePayload.late_catchup_weekdays = catchupWeekdaysToSave;
        let { error } = await supabase.from('notification_settings').update(updatePayload).eq('id', row.id);
        if (error && isMissingColumn(error, 'channel')) {
          delete updatePayload.channel;
          const retry = await supabase.from('notification_settings').update(updatePayload).eq('id', row.id);
          error = retry.error as any;
        }
        if (error && isMissingColumn(error, 'notification_date')) {
          delete updatePayload.notification_date;
          const retry = await supabase.from('notification_settings').update(updatePayload).eq('id', row.id);
          error = retry.error as any;
        }
        if (error && isMissingColumn(error, 'recipient_guest_ids')) {
          delete updatePayload.recipient_guest_ids;
          const retry = await supabase.from('notification_settings').update(updatePayload).eq('id', row.id);
          error = retry.error as any;
        }
        if (error && isMissingColumn(error, 'recipient_mode')) {
          delete updatePayload.recipient_mode;
          const retry = await supabase.from('notification_settings').update(updatePayload).eq('id', row.id);
          error = retry.error as any;
        }
        if (error && isMissingColumn(error, 'late_catchup_enabled')) {
          delete updatePayload.late_catchup_enabled;
          delete updatePayload.late_catchup_send_time;
          delete updatePayload.late_catchup_weekdays;
          const retry = await supabase.from('notification_settings').update(updatePayload).eq('id', row.id);
          error = retry.error as any;
        }
        if (error) throw error;
      } else {
        const insertPayload: any = {
          event_id: resolvedEventId,
          notification_type: row.notification_type,
          title: row.title,
          enabled: true,
          message_content: msg,
          days_from_wedding: daysToSave,
          channel: row.channel || 'SMS',
        };
        insertPayload.notification_date = computedSendAt.toISOString();
        if (opts?.recipientGuestIds) insertPayload.recipient_guest_ids = opts.recipientGuestIds;
        if (recipientModeToSave) insertPayload.recipient_mode = recipientModeToSave;
        if (catchupEnabledToSave !== undefined) insertPayload.late_catchup_enabled = catchupEnabledToSave;
        if (catchupSendTimeToSave) insertPayload.late_catchup_send_time = catchupSendTimeToSave;
        if (catchupWeekdaysToSave) insertPayload.late_catchup_weekdays = catchupWeekdaysToSave;
        let { data, error } = await supabase.from('notification_settings').insert(insertPayload).select().single();
        if (error && isMissingColumn(error, 'channel')) {
          delete insertPayload.channel;
          const retry = await supabase.from('notification_settings').insert(insertPayload).select().single();
          data = retry.data as any;
          error = retry.error as any;
        }
        if (error && isMissingColumn(error, 'notification_date')) {
          delete insertPayload.notification_date;
          const retry = await supabase.from('notification_settings').insert(insertPayload).select().single();
          data = retry.data as any;
          error = retry.error as any;
        }
        if (error && isMissingColumn(error, 'recipient_guest_ids')) {
          delete insertPayload.recipient_guest_ids;
          const retry = await supabase.from('notification_settings').insert(insertPayload).select().single();
          data = retry.data as any;
          error = retry.error as any;
        }
        if (error && isMissingColumn(error, 'recipient_mode')) {
          delete insertPayload.recipient_mode;
          const retry = await supabase.from('notification_settings').insert(insertPayload).select().single();
          data = retry.data as any;
          error = retry.error as any;
        }
        if (error && isMissingColumn(error, 'late_catchup_enabled')) {
          delete insertPayload.late_catchup_enabled;
          delete insertPayload.late_catchup_send_time;
          delete insertPayload.late_catchup_weekdays;
          const retry = await supabase.from('notification_settings').insert(insertPayload).select().single();
          data = retry.data as any;
          error = retry.error as any;
        }
        if (error) throw error;
        setRow((prev) => (prev ? { ...prev, ...(data as any) } : prev));
      }

      if (navigateBack) router.back();
    } catch (e) {
      console.error('Editor save error:', e);
      Alert.alert('שגיאה', 'לא ניתן לשמור שינויים');
    } finally {
      setSaving(false);
    }
  };

  const filteredGuests = useMemo(() => {
    const all = Array.isArray(allGuests) ? allGuests : [];
    if (guestFilter === 'all') return all;
    return all.filter((g) => g.status === guestFilter);
  }, [allGuests, guestFilter]);

  const selectedCount = selectedGuestIds.size;
  const selectedPendingCount = useMemo(() => {
    const byId = new Map(allGuests.map((g) => [String(g.id), g.status]));
    let n = 0;
    for (const id of selectedGuestIds) if (byId.get(String(id)) === 'ממתין') n += 1;
    return n;
  }, [allGuests, selectedGuestIds]);

  const toggleGuest = (guestId: string) => {
    const id = String(guestId || '').trim();
    if (!id) return;
    setSelectedGuestIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedGuestIds((prev) => {
      const next = new Set(prev);
      for (const g of filteredGuests) next.add(String(g.id));
      return next;
    });
  };

  const clearSelection = () => setSelectedGuestIds(new Set());

  const keepOnlyPendingFromSelection = () => {
    const byId = new Map(allGuests.map((g) => [String(g.id), g.status]));
    setSelectedGuestIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) if (byId.get(String(id)) === 'ממתין') next.add(String(id));
      return next;
    });
  };

  const importFromPrevious = async () => {
    if (!resolvedEventId) return;
    if (!previousNotificationType) return;
    if (importingPrev) return;
    setImportingPrev(true);
    try {
      const { data, error } = await supabase
        .from('notification_settings')
        .select('recipient_guest_ids')
        .eq('event_id', resolvedEventId)
        .eq('notification_type', previousNotificationType)
        .maybeSingle();
      if (error) throw error;
      const prevIds = Array.isArray((data as any)?.recipient_guest_ids)
        ? ((data as any).recipient_guest_ids as any[]).map((x) => String(x))
        : [];
      if (prevIds.length === 0) {
        Alert.alert('אין רשימה קודמת', 'לא נמצאה רשימת מוזמנים שמורה להודעה הקודמת.');
        return;
      }
      const byId = new Map(allGuests.map((g) => [String(g.id), g.status]));
      const pendingOnly = prevIds.filter((id) => byId.get(String(id)) === 'ממתין');
      setSelectedGuestIds(new Set(pendingOnly));
      setGuestFilter('ממתין');
      Alert.alert('נטען', `נטענו ${pendingOnly.length} ממתינים מההודעה הקודמת`);
    } catch (e: any) {
      const message = e?.message ? String(e.message) : 'שגיאה לא ידועה';
      Alert.alert('שגיאה', `לא ניתן לטעון רשימה קודמת.\n\n${message}`);
    } finally {
      setImportingPrev(false);
    }
  };

  const sendNow = async () => {
    if (!resolvedEventId || !row) return;
    if (sendingNow) return;
    const msg = (editedMessage || '').trim();
    if (!msg) {
      Alert.alert('שגיאה', 'יש להזין תוכן הודעה');
      return;
    }
    const nt = String(notificationType || '').trim();
    const isAutoPending = nt === 'reminder_2';
    const isAutoAll = nt === 'reminder_1' && Boolean(autoAllRecipients);
    const ids = Array.from(selectedGuestIds);
    if (ids.length === 0 && !isAutoPending && !isAutoAll) {
      Alert.alert('בחר מוזמנים', 'בחר לפחות מוזמן אחד לשליחה.');
      return;
    }

    setSendingNow(true);
    try {
      // Persist current selection (empty list is meaningful for reminder_2: "all pending").
      await save({ recipientGuestIds: isAutoAll ? undefined : ids, navigateBack: false });

      const sessionRes = await supabase.auth.getSession();
      const accessToken = sessionRes.data.session?.access_token;
      if (!accessToken) throw new Error('לא נמצא חיבור משתמש (נא להתחבר מחדש)');

      const origin =
        Platform.OS === 'web' && typeof window !== 'undefined' ? String(window.location.origin) : '';
      const configuredBaseUrl = normalizeBaseUrl(process.env.EXPO_PUBLIC_SITE_BASE_URL);
      const baseUrl =
        origin && !origin.includes('localhost') && !origin.includes('127.0.0.1') ? normalizeBaseUrl(origin) : configuredBaseUrl || undefined;

      const { data, error } = await supabase.functions.invoke('send-invitation-sms', {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: {
          eventId: resolvedEventId,
          guestIds: isAutoAll ? undefined : ids.length > 0 ? ids : undefined,
          filterStatus: isAutoPending ? 'pending' : 'all',
          messageTemplate: msg,
          baseUrl,
        },
      });
      if (error) throw error;
      const result = (data as any)?.result;
      Alert.alert('נשלח', `נשלחו ${Number(result?.sent) || 0} · נכשלו ${Number(result?.failed) || 0}`);
    } catch (e: any) {
      const message = e?.message ? String(e.message) : 'שגיאה לא ידועה';
      Alert.alert('שגיאה', `לא ניתן לשלוח.\n\n${message}`);
    } finally {
      setSendingNow(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.page, { backgroundColor: ui.bg }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={ui.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const bottomSafe = Math.max(14, insets.bottom + 14);

  if (isWeb) {
    return (
      <SafeAreaView style={[styles.page, { backgroundColor: ui.bg }]}>
        <Stack.Screen options={{ headerShown: false }} />

        <View style={styles.webOverlay}>
          <View style={styles.webCard}>
            <View style={styles.webHeader}>
              <Pressable
                onPress={() => router.back()}
                accessibilityRole="button"
                accessibilityLabel="סגור"
                style={({ pressed }: any) => [styles.webCloseBtn, pressed ? { opacity: 0.9 } : null]}
              >
                <Ionicons name="close" size={18} color={ui.text} />
              </Pressable>

              <View style={{ flex: 1, minWidth: 0, alignItems: 'flex-start', justifyContent: 'flex-start' }}>
                <View style={{ flexDirection: ROW_DIR, alignItems: 'center', gap: 8 }}>
                  <Text style={[styles.webTitle, { color: ui.text }]} numberOfLines={1}>
                    {wizardStepId === 'message' ? 'עריכת הודעה' : wizardStepTitleText}
                  </Text>
                  {wizardStepId === 'message' ? <Ionicons name="pencil" size={16} color={ui.sub} /> : null}
                </View>
                <Text style={[styles.webSubTitle, { color: ui.sub }]} numberOfLines={1}>
                  {wizardStepId === 'message' ? `שלב ${wizardStepIdx + 1} מתוך ${wizardSteps.length}` : wizardStepSubtitleText}
                </Text>
              </View>
            </View>

            {wizardStepId !== 'message' ? (
            <View style={styles.webProgressWrap}>
              <View style={styles.webProgressLabels}>
                <Text style={[styles.webProgressPctText, { color: ui.sub }]}>{`${wizardProgressPct}%`}</Text>
                <Text style={[styles.webProgressStepText, { color: ui.sub }]}>{wizardStepLabel}</Text>
              </View>
              <View style={styles.webProgressBar}>
                <View style={[styles.webProgressFill, { width: `${wizardProgressPct}%`, backgroundColor: ui.primary }]} />
              </View>
            </View>
            ) : null}

            <View style={styles.webBody}>
              <ScrollView
                contentContainerStyle={[styles.webContent, wizardStepId === 'message' && { flexGrow: 1 }]}
                showsVerticalScrollIndicator={false}
              >
                {wizardStepId === 'schedule' ? (
                  <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: ui.text }]}>תזמון</Text>

                    <View style={styles.scheduleRow}>
                      <View style={styles.dateCol}>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => {
                            const el = dateInputRef.current as any;
                            el?.showPicker?.();
                            el?.click?.();
                            el?.focus?.();
                          }}
                          style={({ pressed }) => [
                            styles.scheduleCard,
                            { backgroundColor: ui.surface, borderColor: ui.border },
                            pressed ? { opacity: 0.96 } : null,
                          ]}
                        >
                          <View style={styles.scheduleCardTop}>
                            <Text style={[styles.daysMeta, { color: ui.sub }]}>תאריך לשליחה</Text>
                            <Ionicons name="calendar-outline" size={18} color={ui.sub} />
                          </View>

                          {/* @ts-expect-error web-only element */}
                          <input
                            ref={dateInputRef as any}
                            value={editedSendDateYmd || ''}
                            onChange={(e: any) => setEditedSendDateYmd(String(e?.target?.value || ''))}
                            type="date"
                            style={webNativeOverlayInputStyle}
                          />

                          <Text style={[styles.scheduleValueText, { color: ui.text }]}>
                            {editedSendDateYmd ? formatDmyFromYmd(editedSendDateYmd) : 'בחר תאריך'}
                          </Text>
                        </Pressable>

                        <Text style={[styles.offsetBelow, { color: ui.sub }]} numberOfLines={1}>
                          {offsetDays === null ? '—' : formatOffsetLabel(offsetDays)}
                        </Text>
                      </View>

                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          const el = timeInputRef.current as any;
                          el?.showPicker?.();
                          el?.click?.();
                          el?.focus?.();
                        }}
                        style={({ pressed }) => [
                          styles.scheduleCardSmall,
                          { backgroundColor: ui.surface, borderColor: ui.border },
                          pressed ? { opacity: 0.96 } : null,
                        ]}
                      >
                        <View style={styles.scheduleCardTop}>
                          <Text style={[styles.daysMeta, { color: ui.sub }]}>שעה</Text>
                          <Ionicons name="alarm-outline" size={18} color={ui.sub} />
                        </View>

                        {/* @ts-expect-error web-only element */}
                        <input
                          ref={timeInputRef as any}
                          value={editedTimeHm || ''}
                          onChange={(e: any) => onChangeTimeHm(String(e?.target?.value || ''))}
                          type="time"
                          step={60}
                          style={webNativeOverlayInputStyle}
                        />

                        <Text style={[styles.scheduleValueText, { color: ui.text }]}>{editedTimeHm || 'בחר שעה'}</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}

                {wizardStepId === 'catchup' && row?.channel === 'SMS' && isFirstMessage ? (
                  <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: ui.text }]}>אורחים חדשים</Text>
                    <View style={[styles.automationCard, { backgroundColor: 'rgba(29,78,216,0.06)', borderColor: 'rgba(29,78,216,0.16)' }]}>
                      <View style={styles.automationTopRow}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[styles.automationTitle, { color: ui.text }]} numberOfLines={2}>
                            הוסף אורחים אוטומטית להודעה
                          </Text>
                          <Text style={[styles.automationHint, { color: ui.sub }]} numberOfLines={3}>
                            כשפעיל: ההודעה הראשונה נשלחת לכל האורחים בזמן השליחה, וכל אורח שנוסף אחרי שההודעה כבר יצאה נכנס לתור של “אורחים חדשים”.
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => setAutoAllRecipients((v) => !v)}
                          style={({ pressed }) => [
                            styles.togglePill,
                            autoAllRecipients ? styles.togglePillOn : styles.togglePillOff,
                            pressed ? { opacity: 0.92 } : null,
                          ]}
                        >
                          <Text style={[styles.togglePillText, autoAllRecipients ? styles.togglePillTextOn : styles.togglePillTextOff]}>
                            {autoAllRecipients ? 'פעיל' : 'כבוי'}
                          </Text>
                        </Pressable>
                      </View>

                      <View style={styles.automationDivider} />

                      <View style={styles.automationTopRow}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[styles.automationTitle, { color: ui.text }]} numberOfLines={1}>
                            תור אורחים חדשים (אחרי שההודעה יצאה)
                          </Text>
                          <Text style={[styles.automationHint, { color: ui.sub }]} numberOfLines={2}>
                            שולח רק בימים א׳–ה׳ בשעה קבועה. ניתן לשנות.
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => setCatchupEnabled((v) => !v)}
                          style={({ pressed }) => [
                            styles.togglePill,
                            catchupEnabled ? styles.togglePillOn : styles.togglePillOff,
                            pressed ? { opacity: 0.92 } : null,
                          ]}
                        >
                          <Text style={[styles.togglePillText, catchupEnabled ? styles.togglePillTextOn : styles.togglePillTextOff]}>
                            {catchupEnabled ? 'פעיל' : 'כבוי'}
                          </Text>
                        </Pressable>
                      </View>

                      {catchupEnabled ? (
                        <>
                          <View style={styles.catchupRow}>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={[styles.catchupLabel, { color: ui.sub }]}>שעה</Text>
                              <TextInput
                                value={catchupTimeHm}
                                onChangeText={setCatchupTimeHm}
                                placeholder="12:00"
                                placeholderTextColor={ui.iconMuted}
                                style={[
                                  styles.catchupInput,
                                  { borderColor: 'rgba(17,24,39,0.10)', backgroundColor: 'rgba(255,255,255,0.88)', color: ui.text },
                                ]}
                              />
                            </View>
                            <View style={{ flex: 2, minWidth: 0 }}>
                              <Text style={[styles.catchupLabel, { color: ui.sub }]}>ימים</Text>
                              <View style={styles.weekdaysRow}>
                                {[
                                  { dow: 0, label: 'א׳' },
                                  { dow: 1, label: 'ב׳' },
                                  { dow: 2, label: 'ג׳' },
                                  { dow: 3, label: 'ד׳' },
                                  { dow: 4, label: 'ה׳' },
                                ].map((d) => {
                                  const on = catchupWeekdays.has(d.dow);
                                  return (
                                    <Pressable
                                      key={d.dow}
                                      onPress={() =>
                                        setCatchupWeekdays((prev) => {
                                          const next = new Set(prev);
                                          if (next.has(d.dow)) next.delete(d.dow);
                                          else next.add(d.dow);
                                          return next;
                                        })
                                      }
                                      style={({ pressed }) => [
                                        styles.weekdayPill,
                                        on ? styles.weekdayPillOn : styles.weekdayPillOff,
                                        pressed ? { opacity: 0.92 } : null,
                                      ]}
                                    >
                                      <Text style={[styles.weekdayText, on ? styles.weekdayTextOn : styles.weekdayTextOff]}>{d.label}</Text>
                                    </Pressable>
                                  );
                                })}
                              </View>
                            </View>
                          </View>
                          <Text style={[styles.automationTiny, { color: ui.sub }]}>
                            טיפ: כל אורח שנוסף אחרי השליחה נכנס אוטומטית לתור של “היום הבא” לפי הימים והשעה כאן.
                          </Text>
                        </>
                      ) : null}
                    </View>

                    <View style={styles.queueHeaderRow}>
                      <Text style={[styles.sectionTitle, { color: ui.text }]}>
                        אורחים חדשים שממתינים לשליחה {catchupQueueRows.length ? `(${catchupQueueRows.length})` : ''}
                      </Text>
                      <View style={{ flexDirection: ROW_DIR, gap: 8 }}>
                        <Pressable onPress={() => void loadCatchupQueue()} style={({ pressed }) => [styles.smallBtn, pressed ? { opacity: 0.92 } : null]}>
                          <Ionicons name="refresh-outline" size={16} color={ui.primary} />
                          <Text style={[styles.smallBtnText, { color: ui.primary }]}>רענן</Text>
                        </Pressable>
                        <Pressable onPress={() => void backfillCatchupQueue()} style={({ pressed }) => [styles.smallBtn, pressed ? { opacity: 0.92 } : null]}>
                          <Ionicons name="add-circle-outline" size={16} color={ui.primary} />
                          <Text style={[styles.smallBtnText, { color: ui.primary }]}>הכנס לתור</Text>
                        </Pressable>
                      </View>
                    </View>

                    {catchupLoading ? (
                      <View style={{ paddingVertical: 8, alignItems: 'center', justifyContent: 'center' }}>
                        <ActivityIndicator />
                      </View>
                    ) : catchupQueueRows.length === 0 ? (
                      <Text style={[styles.helperText, { color: ui.sub }]}>אין כרגע אורחים חדשים שממתינים.</Text>
                    ) : (
                      <View style={{ gap: 10 }}>
                        {catchupQueueRows.slice(0, 30).map((g) => (
                          <View
                            key={g.guestId}
                            style={[styles.queueRow, { borderColor: 'rgba(17,24,39,0.08)', backgroundColor: 'rgba(255,255,255,0.92)' }]}
                          >
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={[styles.recipientName, { color: ui.text }]} numberOfLines={1}>
                                {g.name}
                              </Text>
                              <Text style={[styles.recipientMeta, { color: ui.sub }]} numberOfLines={2}>
                                {`${g.phone ? g.phone : 'אין טלפון'} · מתוזמן ל־${formatHeDateTimeShort(g.dueAt)}${g.lastError ? ` · ${g.lastError}` : ''}`}
                              </Text>
                            </View>
                            <Ionicons name="time-outline" size={18} color={ui.iconMuted} />
                          </View>
                        ))}
                        {catchupQueueRows.length > 30 ? <Text style={[styles.helperText, { color: ui.sub }]}>מוצגים 30 ראשונים…</Text> : null}
                      </View>
                    )}
                  </View>
                ) : null}

                {wizardStepId === 'recipients' && row?.channel === 'SMS' ? (
                  <View style={styles.webRecipientsWrap}>
                    <View style={styles.webRecipientsSummaryCard}>
                      <View style={styles.webRecipientsSummaryIcon}>
                        <Ionicons name="people-outline" size={18} color={ui.primary} />
                      </View>
                      <View style={{ flex: 1 }} />
                      <View style={{ justifyContent: 'flex-start', alignItems: 'flex-start' }}>
                        <Text style={[styles.webRecipientsSummaryLabel, { color: ui.sub }]}>מוזמנים נבחרו</Text>
                        <Text style={[styles.webRecipientsSummaryValue, { color: ui.text }]}>{selectedCount}</Text>
                      </View>
                    </View>

                    <View style={styles.webChipsRow}>
                      {(
                        [
                          { key: 'all' as const, label: 'הכל', icon: 'checkmark-circle-outline' as const },
                          { key: 'ממתין' as const, label: 'ממתין', icon: 'time-outline' as const },
                          { key: 'מגיע' as const, label: 'מגיע', icon: 'checkmark-outline' as const },
                          { key: 'לא מגיע' as const, label: 'לא מגיע', icon: 'close-outline' as const },
                        ] as const
                      ).map((k) => {
                        const active = guestFilter === k.key;
                        return (
                          <Pressable
                            key={k.key}
                            onPress={() => setGuestFilter(k.key)}
                            style={({ pressed }) => [
                              styles.webChip,
                              active ? { backgroundColor: ui.primary, borderColor: ui.primary } : null,
                              pressed ? { opacity: 0.92 } : null,
                            ]}
                          >
                            <Ionicons name={k.icon as any} size={16} color={active ? '#fff' : ui.text} />
                            <Text style={[styles.webChipText, { color: active ? '#fff' : ui.text }]}>{k.label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    <View style={styles.webQuickActionsRow}>
                      <Pressable
                        onPress={selectAllFiltered}
                        style={({ pressed }) => [styles.webLinkBtn, pressed ? { opacity: 0.92 } : null]}
                      >
                        <Text style={[styles.webLinkText, { color: ui.primary }]}>בחר הכל</Text>
                      </Pressable>

                      <Pressable onPress={clearSelection} style={({ pressed }) => [styles.webLinkBtn, pressed ? { opacity: 0.92 } : null]}>
                        <Text style={[styles.webLinkText, { color: ui.primary }]}>נקה בחירה</Text>
                      </Pressable>

                      {previousNotificationType ? (
                        <Pressable
                          onPress={() => void importFromPrevious()}
                          disabled={importingPrev}
                          style={({ pressed }) => [styles.webLinkBtn, pressed ? { opacity: 0.92 } : null, importingPrev ? { opacity: 0.6 } : null]}
                        >
                          <Ionicons name="download-outline" size={16} color={ui.primary} />
                          <Text style={[styles.webLinkText, { color: ui.primary }]}>יבא הודעה קודמת</Text>
                        </Pressable>
                      ) : null}
                    </View>

                    <View style={styles.webTableWrap}>
                      <View style={styles.webTableHeaderRow}>
                        <View style={[styles.webTableCell, styles.webCellStatus]}>
                          <Text style={[styles.webTableHeaderText, { color: ui.sub }]}>סטטוס</Text>
                        </View>
                        <View style={[styles.webTableCell, styles.webCellPhone]}>
                          <Text style={[styles.webTableHeaderText, { color: ui.sub }]}>טלפון</Text>
                        </View>
                        <View style={[styles.webTableCell, styles.webCellName]}>
                          <Text style={[styles.webTableHeaderText, { color: ui.sub }]}>שם מלא</Text>
                        </View>
                        <Pressable
                          onPress={() => {
                            const allVisibleSelected =
                              filteredGuests.length > 0 && filteredGuests.every((g) => selectedGuestIds.has(String(g.id)));
                            if (allVisibleSelected) {
                              setSelectedGuestIds((prev) => {
                                const next = new Set(prev);
                                for (const g of filteredGuests) next.delete(String(g.id));
                                return next;
                              });
                            } else {
                              selectAllFiltered();
                            }
                          }}
                          style={({ pressed }) => [styles.webTableCheckboxHead, pressed ? { opacity: 0.92 } : null]}
                        >
                          <Ionicons
                            name={
                              filteredGuests.length > 0 && filteredGuests.every((g) => selectedGuestIds.has(String(g.id)))
                                ? 'checkbox'
                                : 'square-outline'
                            }
                            size={18}
                            color={ui.primary}
                          />
                        </Pressable>
                      </View>

                      {filteredGuests.map((g) => {
                        const checked = selectedGuestIds.has(String(g.id));
                        const status = g.status;
                        const statusTheme =
                          status === 'מגיע'
                            ? { bg: 'rgba(34,197,94,0.14)', text: 'rgba(22,163,74,1)', dot: 'rgba(34,197,94,1)' }
                            : status === 'לא מגיע'
                              ? { bg: 'rgba(239,68,68,0.12)', text: 'rgba(220,38,38,1)', dot: 'rgba(239,68,68,1)' }
                              : { bg: 'rgba(234,179,8,0.18)', text: 'rgba(161,98,7,1)', dot: 'rgba(234,179,8,1)' };

                        const name = String(g.name || '').trim() || '—';
                        const initial = name ? Array.from(name)[0] : '•';
                        return (
                          <Pressable
                            key={g.id}
                            onPress={() => toggleGuest(String(g.id))}
                            style={({ pressed }) => [
                              styles.webTableRow,
                              checked ? { backgroundColor: 'rgba(29,78,216,0.05)' } : null,
                              pressed ? { opacity: 0.98 } : null,
                            ]}
                          >
                            <View style={[styles.webTableCell, styles.webCellStatus]}>
                              <View style={[styles.webStatusPill, { backgroundColor: statusTheme.bg }]}>
                                <View style={[styles.webStatusDot, { backgroundColor: statusTheme.dot }]} />
                                <Text style={[styles.webStatusText, { color: statusTheme.text }]}>{status}</Text>
                              </View>
                            </View>

                            <View style={[styles.webTableCell, styles.webCellPhone]}>
                              <Text style={[styles.webCellText, { color: ui.sub }]} numberOfLines={1}>
                                {g.phone ? String(g.phone) : '—'}
                              </Text>
                            </View>

                            <View style={[styles.webTableCell, styles.webCellName]}>
                              <View style={styles.webNameRow}>
                                <View style={styles.webAvatar}>
                                  <Text style={[styles.webAvatarText, { color: ui.text }]}>{initial}</Text>
                                </View>
                                <Text style={[styles.webCellText, { color: ui.text }]} numberOfLines={1}>
                                  {name}
                                </Text>
                              </View>
                            </View>

                            <View style={styles.webTableCheckboxCell}>
                              <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={18} color={checked ? ui.primary : '#CBD5E1'} />
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ) : null}

                {wizardStepId === 'message' ? (
                  <View style={styles.step4TwoCol}>
                    {/* Left: תצוגה מקדימה + phone mockup */}
                    <View style={[styles.step4PreviewCol, { backgroundColor: ui.surface, borderColor: ui.border }]}>
                      <Text style={[styles.step4PreviewTitle, { color: ui.text }]}>תצוגה מקדימה</Text>
                      <Text style={[styles.step4PreviewSubtitle, { color: ui.sub }]}>כך ההודעה תראה במכשיר הנייד</Text>
                      <View style={styles.step4PhoneMockup}>
                        <View style={styles.step4PhoneScreen}>
                          <Text style={styles.step4PhoneTime}>{'היום '}{editedTimeHm || '14:30'}</Text>
                          <View style={[styles.step4BubbleIn, { backgroundColor: 'rgba(226,232,240,1)' }]}>
                            <Text style={[styles.step4BubbleText, { color: ui.text }]}>{previewMessage || '—'}</Text>
                            <Text style={styles.step4BubbleTime}>14:31</Text>
                          </View>
                          <View style={[styles.step4BubbleOut, { backgroundColor: 'rgba(59,130,246,1)' }]}>
                            <Text style={styles.step4BubbleTextOut}>תודה רבה! אגיע בזמן.</Text>
                            <Text style={styles.step4BubbleTimeOut}>14:35</Text>
                          </View>
                        </View>
                      </View>
                    </View>

                    {/* Right: תוכן ותצוגה מקדימה + משתנים + textarea */}
                    <View style={styles.step4ContentCol}>
                      <Text style={[styles.sectionTitle, { color: ui.text }]}>תוכן ותצוגה מקדימה</Text>
                      <Text style={[styles.step4Instruction, { color: ui.sub }]}>
                        הכנס את תוכן ההודעה שלך והשתמש במשתנים כדי להתאים אותה אישית.
                      </Text>

                      <Text style={[styles.step4VarsLabel, { color: ui.text }]}>משתנים זמינים</Text>
                      <View style={styles.step4VarsRow}>
                        {[
                          { label: 'שם_פרטי', placeholder: '{שם_פרטי}' },
                          { label: 'שם_משפחה', placeholder: '{name}' },
                          { label: 'תאריך_אירוע', placeholder: '{event_date}' },
                          { label: 'שעה', placeholder: '{שעה}' },
                          { label: 'מיקום', placeholder: '{מיקום}' },
                          { label: 'פרטי_הגעה', placeholder: '{פרטי הגעה}' },
                        ].map((v) => (
                          <TouchableOpacity
                            key={v.placeholder}
                            style={[styles.step4VarTag, { backgroundColor: ui.surfaceMuted, borderColor: ui.border }]}
                            activeOpacity={0.92}
                            onPress={() => setEditedMessage((prev) => `${prev}${prev ? ' ' : ''}${v.placeholder}`)}
                            accessibilityRole="button"
                            accessibilityLabel={`הוסף ${v.label}`}
                          >
                            <Ionicons name="add" size={14} color={ui.primary} />
                            <Text style={[styles.step4VarTagText, { color: ui.text }]}>({v.label})</Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      <Text style={[styles.sectionTitle, { color: ui.text, marginTop: 16 }]}>תוכן ההודעה</Text>
                      <View style={styles.textareaWrap}>
                        <TextInput
                          value={editedMessage}
                          onChangeText={setEditedMessage}
                          placeholder={'היי {שם_פרטי},\nתודה שנרשמת לאירוע שלנו ב-{תאריך_אירוע}.\nנשמח לראותך בשעה {שעה}.\nלפרטים נוספים השב להודעה זו.\nנתראה!'}
                          placeholderTextColor={ui.iconMuted}
                          style={[
                            styles.textarea,
                            styles.step4Textarea,
                            { color: ui.text, backgroundColor: ui.surfaceMuted, borderColor: isOverLimit ? ui.danger : 'rgba(17,24,39,0.10)' },
                          ]}
                          multiline
                          textAlign="right"
                          textAlignVertical="top"
                          maxLength={5000}
                        />
                      </View>
                    </View>
                  </View>
                ) : null}
              </ScrollView>
            </View>

            <View style={styles.webFooter}>
              <View style={styles.webFooterRow}>
                <Pressable
                  onPress={() => {
                    if (wizardStepIdx > 0) setWizardStepIdx((i) => Math.max(0, i - 1));
                    else router.back();
                  }}
                  style={({ pressed }) => [styles.webFooterSecondary, pressed ? { opacity: 0.92 } : null]}
                >
                  {wizardStepId === 'message' ? <Ionicons name="chevron-back" size={18} color={ui.text} /> : null}
                  <Text style={[styles.webFooterSecondaryText, { color: ui.text }]}>הקודם</Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    if (!wizardIsLast) {
                      setWizardStepIdx((i) => Math.min(wizardSteps.length - 1, i + 1));
                      return;
                    }
                    void save({ recipientGuestIds: Array.from(selectedGuestIds) });
                  }}
                  disabled={saving || (!wizardIsLast && !wizardSteps.length)}
                  style={({ pressed }) => [
                    styles.webFooterPrimary,
                    { backgroundColor: saving ? ui.primaryHover : ui.primary },
                    pressed ? { opacity: 0.94 } : null,
                    saving ? { opacity: 0.85 } : null,
                  ]}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name={wizardStepId === 'message' ? 'save-outline' : 'chevron-forward'} size={18} color="#fff" />
                      <Text style={styles.webFooterPrimaryText}>{wizardStepId === 'message' && wizardIsLast ? 'שמור שינויים' : wizardIsLast ? 'שמור' : 'הבא'}</Text>
                    </>
                  )}
                </Pressable>

                <Pressable
                  onPress={() => void sendNow()}
                  disabled={sendingNow || (wizardStepId === 'recipients' && selectedGuestIds.size === 0)}
                  style={({ pressed }) => [
                    styles.webFooterLink,
                    pressed ? { opacity: 0.92 } : null,
                    sendingNow || (wizardStepId === 'recipients' && selectedGuestIds.size === 0) ? { opacity: 0.5 } : null,
                  ]}
                >
                  <Ionicons name="paper-plane-outline" size={16} color={ui.primary} />
                  <Text style={[styles.webFooterLinkText, { color: ui.primary }]}>{sendingNow ? 'שולח...' : 'שלח עכשיו'}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.page, { backgroundColor: ui.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View
        style={[
          styles.headerWrap,
          {
            paddingTop: Math.max(12, insets.top + 10),
            backgroundColor: '#FFFFFF',
            borderBottomColor: 'rgba(229,231,235,0.95)',
          },
        ]}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }: any) => [
              styles.headerBtn,
              styles.backBtnAbs,
              { backgroundColor: 'rgba(255,255,255,0.78)', borderColor: 'rgba(17,24,39,0.10)' },
              pressed ? { opacity: 0.92 } : null,
            ]}
          >
            <Ionicons name="chevron-back" size={20} color={ui.text} />
          </Pressable>

          <View style={styles.headerTitles}>
            <Text style={[styles.headerTitle, { color: ui.text }]}>עריכת הודעה</Text>
            <View style={[styles.headerSubtitlePill, { backgroundColor: 'rgba(255,255,255,0.75)', borderColor: 'rgba(17,24,39,0.10)' }]}>
              <Text style={[styles.headerSubtitle, { color: ui.sub }]} numberOfLines={1}>
                {row?.title || 'הודעה'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Content */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.flex}>
            <AppKeyboardAwareScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              <View style={styles.wizardTop}>
                <View style={styles.stepperRow}>
                  {wizardSteps.map((s, idx) => {
                    const active = idx === wizardStepIdx;
                    const done = idx < wizardStepIdx;
                    const label =
                      s === 'schedule'
                        ? 'תזמון'
                        : s === 'recipients'
                          ? 'מוזמנים'
                          : s === 'catchup'
                            ? 'אורחים חדשים'
                            : 'תוכן';
                    return (
                      <View key={`${s}:${idx}`} style={styles.stepperItem}>
                        <View
                          style={[
                            styles.stepDot,
                            done ? { backgroundColor: ui.primary, borderColor: ui.primary } : null,
                            active && !done ? { borderColor: ui.primary } : null,
                          ]}
                        >
                          {done ? <Ionicons name="checkmark" size={14} color="#fff" /> : <Text style={styles.stepDotText}>{idx + 1}</Text>}
                        </View>
                        <Text style={[styles.stepLabel, active ? { color: ui.text } : { color: ui.sub }]} numberOfLines={1}>
                          {label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              {wizardStepId === 'schedule' ? (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: ui.text }]}>תזמון</Text>

                <View style={styles.scheduleRow}>
                  <View style={styles.dateCol}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        if (Platform.OS !== 'web') {
                          setDatePickerOpen(true);
                          return;
                        }
                        const el = dateInputRef.current as any;
                        el?.showPicker?.();
                        el?.click?.();
                        el?.focus?.();
                      }}
                      style={({ pressed }) => [
                        styles.scheduleCard,
                        { backgroundColor: ui.surface, borderColor: ui.border },
                        pressed && Platform.OS !== 'web' ? { opacity: 0.92 } : null,
                      ]}
                    >
                      <View style={styles.scheduleCardTop}>
                        <Text style={[styles.daysMeta, { color: ui.sub }]}>תאריך לשליחה</Text>
                        <Ionicons name="calendar-outline" size={18} color={ui.sub} />
                      </View>

                      {Platform.OS === 'web' ? (
                        // RN TextInput + type="date" doesn't reliably open a calendar on click; use a real input overlay.
                        // @ts-expect-error web-only element
                        <input
                          ref={dateInputRef as any}
                          value={editedSendDateYmd || ''}
                          onChange={(e: any) => setEditedSendDateYmd(String(e?.target?.value || ''))}
                          type="date"
                          style={webNativeOverlayInputStyle}
                        />
                      ) : (
                        <Text style={[styles.scheduleValueText, { color: ui.text }]}>
                          {computedSendAt ? formatDmySlashes(computedSendAt) : editedSendDateYmd ? formatDmyFromYmd(editedSendDateYmd) : 'בחר תאריך'}
                        </Text>
                      )}

                      {Platform.OS === 'web' ? (
                        <Text style={[styles.scheduleValueText, { color: ui.text }]}>
                          {editedSendDateYmd ? formatDmyFromYmd(editedSendDateYmd) : 'בחר תאריך'}
                        </Text>
                      ) : null}
                    </Pressable>

                    <Text style={[styles.offsetBelow, { color: ui.sub }]} numberOfLines={1}>
                      {offsetDays === null ? '—' : formatOffsetLabel(offsetDays)}
                    </Text>
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      if (Platform.OS !== 'web') {
                        setTimePickerOpen(true);
                        return;
                      }
                      const el = timeInputRef.current as any;
                      el?.showPicker?.();
                      el?.click?.();
                      el?.focus?.();
                    }}
                    style={({ pressed }) => [
                      styles.scheduleCardSmall,
                      { backgroundColor: ui.surface, borderColor: ui.border },
                      pressed && Platform.OS !== 'web' ? { opacity: 0.92 } : null,
                    ]}
                  >
                    <View style={styles.scheduleCardTop}>
                      <Text style={[styles.daysMeta, { color: ui.sub }]}>שעה</Text>
                      <Ionicons name="alarm-outline" size={18} color={ui.sub} />
                    </View>

                    {Platform.OS === 'web' ? (
                      // @ts-expect-error web-only element
                      <input
                        ref={timeInputRef as any}
                        value={editedTimeHm || ''}
                        onChange={(e: any) => onChangeTimeHm(String(e?.target?.value || ''))}
                        type="time"
                        step={60}
                        style={webNativeOverlayInputStyle}
                      />
                    ) : (
                      <Text style={[styles.scheduleValueText, { color: ui.text }]}>{editedTimeHm || 'בחר שעה'}</Text>
                    )}
                  </Pressable>
                </View>
              </View>
              ) : null}

              {wizardStepId === 'message' ? (
              <View style={styles.section}>
                <View style={styles.messageHeaderRow}>
                  <Text style={[styles.sectionTitle, { color: ui.text }]}>תוכן ההודעה</Text>
                  <View style={styles.messageTools}>
                    <TouchableOpacity
                      style={[styles.toolBtn, { backgroundColor: ui.surfaceMuted, borderColor: 'rgba(17,24,39,0.06)' }]}
                      activeOpacity={0.92}
                      onPress={() => setEditedMessage((prev) => `${prev}${prev ? ' ' : ''}{event_date}`)}
                      accessibilityRole="button"
                      accessibilityLabel="הוסף תאריך"
                    >
                      <Ionicons name="calendar-outline" size={18} color={ui.sub} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.toolBtn, { backgroundColor: ui.surfaceMuted, borderColor: 'rgba(17,24,39,0.06)' }]}
                      activeOpacity={0.92}
                      onPress={() => setEditedMessage((prev) => `${prev}${prev ? ' ' : ''}{name}`)}
                      accessibilityRole="button"
                      accessibilityLabel="הוסף שם"
                    >
                      <Ionicons name="person-add-outline" size={18} color={ui.sub} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.textareaWrap}>
                  <TextInput
                    value={editedMessage}
                    onChangeText={setEditedMessage}
                    placeholder="הקלד את ההודעה כאן..."
                    placeholderTextColor={ui.iconMuted}
                    style={[
                      styles.textarea,
                      {
                        color: ui.text,
                        backgroundColor: ui.surfaceMuted,
                        borderColor: isOverLimit ? ui.danger : 'rgba(17,24,39,0.10)',
                      },
                    ]}
                    multiline
                    textAlign="right"
                    textAlignVertical="top"
                    maxLength={5000}
                  />
                  <View style={[styles.charCountPill, { borderColor: 'rgba(17,24,39,0.08)' }]}>
                    <Text style={[styles.charCountText, { color: isOverLimit ? ui.danger : ui.sub }]}>
                      {`${charsCount}/${maxChars} תווים`}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.helperText, { color: ui.sub }]}>
                  * שימוש במשתנים דינמיים עשוי לשנות את אורך ההודעה הסופי.
                </Text>

                <View style={[styles.previewCard, { backgroundColor: ui.surface, borderColor: ui.border }]}>
                  <View style={styles.previewHeaderRow}>
                    <Ionicons name="eye-outline" size={16} color={ui.sub} />
                    <Text style={[styles.previewTitle, { color: ui.text }]}>תצוגה מקדימה</Text>
                  </View>
                  <Text style={[styles.previewText, { color: ui.text }]}>{previewMessage || '—'}</Text>
                  <Text style={[styles.previewHint, { color: ui.sub }]}>
                    דוגמה בלבד (שם/קישור/תאריך משתנים לפי מוזמן).
                  </Text>
                </View>
              </View>
              ) : null}

              {wizardStepId === 'catchup' && row?.channel === 'SMS' && isFirstMessage ? (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: ui.text }]}>אורחים חדשים</Text>

                  <View style={[styles.automationCard, { backgroundColor: 'rgba(29,78,216,0.06)', borderColor: 'rgba(29,78,216,0.16)' }]}>
                    <View style={styles.automationTopRow}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.automationTitle, { color: ui.text }]} numberOfLines={2}>
                          הוסף אורחים אוטומטית להודעה
                        </Text>
                        <Text style={[styles.automationHint, { color: ui.sub }]} numberOfLines={3}>
                          כשפעיל: ההודעה הראשונה נשלחת לכל האורחים בזמן השליחה, וכל אורח שנוסף אחרי שההודעה כבר יצאה נכנס לתור של “אורחים חדשים”.
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => setAutoAllRecipients((v) => !v)}
                        style={({ pressed }) => [
                          styles.togglePill,
                          autoAllRecipients ? styles.togglePillOn : styles.togglePillOff,
                          pressed ? { opacity: 0.92 } : null,
                        ]}
                      >
                        <Text style={[styles.togglePillText, autoAllRecipients ? styles.togglePillTextOn : styles.togglePillTextOff]}>
                          {autoAllRecipients ? 'פעיל' : 'כבוי'}
                        </Text>
                      </Pressable>
                    </View>

                    <View style={styles.automationDivider} />

                    <View style={styles.automationTopRow}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.automationTitle, { color: ui.text }]} numberOfLines={1}>
                          תור אורחים חדשים (אחרי שההודעה יצאה)
                        </Text>
                        <Text style={[styles.automationHint, { color: ui.sub }]} numberOfLines={2}>
                          שולח רק בימים א׳–ה׳ בשעה קבועה. ניתן לשנות.
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => setCatchupEnabled((v) => !v)}
                        style={({ pressed }) => [
                          styles.togglePill,
                          catchupEnabled ? styles.togglePillOn : styles.togglePillOff,
                          pressed ? { opacity: 0.92 } : null,
                        ]}
                      >
                        <Text style={[styles.togglePillText, catchupEnabled ? styles.togglePillTextOn : styles.togglePillTextOff]}>
                          {catchupEnabled ? 'פעיל' : 'כבוי'}
                        </Text>
                      </Pressable>
                    </View>

                    {catchupEnabled ? (
                      <>
                        <View style={styles.catchupRow}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={[styles.catchupLabel, { color: ui.sub }]}>שעה</Text>
                            <TextInput
                              value={catchupTimeHm}
                              onChangeText={setCatchupTimeHm}
                              placeholder="12:00"
                              placeholderTextColor={ui.iconMuted}
                              style={[styles.catchupInput, { borderColor: 'rgba(17,24,39,0.10)', backgroundColor: 'rgba(255,255,255,0.88)', color: ui.text }]}
                            />
                          </View>
                          <View style={{ flex: 2, minWidth: 0 }}>
                            <Text style={[styles.catchupLabel, { color: ui.sub }]}>ימים</Text>
                            <View style={styles.weekdaysRow}>
                              {[
                                { dow: 0, label: 'א׳' },
                                { dow: 1, label: 'ב׳' },
                                { dow: 2, label: 'ג׳' },
                                { dow: 3, label: 'ד׳' },
                                { dow: 4, label: 'ה׳' },
                              ].map((d) => {
                                const on = catchupWeekdays.has(d.dow);
                                return (
                                  <Pressable
                                    key={d.dow}
                                    onPress={() =>
                                      setCatchupWeekdays((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(d.dow)) next.delete(d.dow);
                                        else next.add(d.dow);
                                        return next;
                                      })
                                    }
                                    style={({ pressed }) => [
                                      styles.weekdayPill,
                                      on ? styles.weekdayPillOn : styles.weekdayPillOff,
                                      pressed ? { opacity: 0.92 } : null,
                                    ]}
                                  >
                                    <Text style={[styles.weekdayText, on ? styles.weekdayTextOn : styles.weekdayTextOff]}>{d.label}</Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          </View>
                        </View>
                        <Text style={[styles.automationTiny, { color: ui.sub }]}>
                          טיפ: כל אורח שנוסף אחרי השליחה נכנס אוטומטית לתור של “היום הבא” לפי הימים והשעה כאן.
                        </Text>
                      </>
                    ) : null}
                  </View>

                  <View style={styles.queueHeaderRow}>
                    <Text style={[styles.sectionTitle, { color: ui.text }]}>
                      אורחים חדשים שממתינים לשליחה {catchupQueueRows.length ? `(${catchupQueueRows.length})` : ''}
                    </Text>
                    <View style={{ flexDirection: ROW_DIR, gap: 8 }}>
                      <Pressable
                        onPress={() => void loadCatchupQueue()}
                        style={({ pressed }) => [styles.smallBtn, pressed ? { opacity: 0.92 } : null]}
                      >
                        <Ionicons name="refresh-outline" size={16} color={ui.primary} />
                        <Text style={[styles.smallBtnText, { color: ui.primary }]}>רענן</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => void backfillCatchupQueue()}
                        style={({ pressed }) => [styles.smallBtn, pressed ? { opacity: 0.92 } : null]}
                      >
                        <Ionicons name="add-circle-outline" size={16} color={ui.primary} />
                        <Text style={[styles.smallBtnText, { color: ui.primary }]}>הכנס לתור</Text>
                      </Pressable>
                    </View>
                  </View>

                  {catchupLoading ? (
                    <View style={{ paddingVertical: 8, alignItems: 'center', justifyContent: 'center' }}>
                      <ActivityIndicator />
                    </View>
                  ) : catchupQueueRows.length === 0 ? (
                    <Text style={[styles.helperText, { color: ui.sub }]}>אין כרגע אורחים חדשים שממתינים.</Text>
                  ) : (
                    <View style={{ gap: 10 }}>
                      {catchupQueueRows.slice(0, 30).map((g) => (
                        <View key={g.guestId} style={[styles.queueRow, { borderColor: 'rgba(17,24,39,0.08)', backgroundColor: 'rgba(255,255,255,0.92)' }]}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={[styles.recipientName, { color: ui.text }]} numberOfLines={1}>
                              {g.name}
                            </Text>
                            <Text style={[styles.recipientMeta, { color: ui.sub }]} numberOfLines={2}>
                              {`${g.phone ? g.phone : 'אין טלפון'} · מתוזמן ל־${formatHeDateTimeShort(g.dueAt)}${g.lastError ? ` · ${g.lastError}` : ''}`}
                            </Text>
                          </View>
                          <Ionicons name="time-outline" size={18} color={ui.iconMuted} />
                        </View>
                      ))}
                      {catchupQueueRows.length > 30 ? (
                        <Text style={[styles.helperText, { color: ui.sub }]}>מוצגים 30 ראשונים…</Text>
                      ) : null}
                    </View>
                  )}
                </View>
              ) : null}

              {wizardStepId === 'recipients' && row?.channel === 'SMS' ? (
                <View style={styles.section}>
                  <View style={styles.recipientsHeaderRow}>
                    <Text style={[styles.sectionTitle, { color: ui.text }]}>בחירת מוזמנים</Text>
                    <View style={styles.recipientsBadge}>
                      <Text style={styles.recipientsBadgeText}>{selectedCount}</Text>
                      <Text style={styles.recipientsBadgeText}>נבחרו</Text>
                    </View>
                  </View>

                  <Text style={[styles.helperText, { color: ui.sub }]}>
                    משתנים שימושיים: <Text style={styles.mono}>{'{name}'}</Text> · <Text style={styles.mono}>{'{link}'}</Text> ·{' '}
                    <Text style={styles.mono}>{'{פרטי הגעה}'}</Text>
                  </Text>

                  {isFirstMessage && autoAllRecipients ? (
                    <Text style={[styles.helperText, { color: ui.sub }]}>
                      מצב אוטומטי פעיל: אין צורך לבחור ידנית — ההודעה תישלח לכל האורחים בזמן השליחה.
                    </Text>
                  ) : (
                    <>
                      <View style={styles.filtersRow}>
                    {(['all', 'ממתין', 'אולי מגיע', 'מגיע', 'לא מגיע'] as const).map((k) => (
                      <Pressable
                        key={k}
                        onPress={() => setGuestFilter(k)}
                        style={({ pressed }) => [
                          styles.filterPill,
                          guestFilter === k ? styles.filterPillActive : null,
                          pressed ? { opacity: 0.92 } : null,
                        ]}
                      >
                        <Text style={[styles.filterText, guestFilter === k ? styles.filterTextActive : null]}>
                          {k === 'all' ? 'הכל' : k}
                        </Text>
                      </Pressable>
                    ))}
                    <View style={{ flex: 1 }} />
                    <Pressable onPress={selectAllFiltered} style={({ pressed }) => [styles.smallBtn, pressed ? { opacity: 0.92 } : null]}>
                      <Ionicons name="checkbox-outline" size={16} color={ui.primary} />
                      <Text style={[styles.smallBtnText, { color: ui.primary }]}>בחר הכל</Text>
                    </Pressable>
                    <Pressable onPress={clearSelection} style={({ pressed }) => [styles.smallBtn, pressed ? { opacity: 0.92 } : null]}>
                      <Ionicons name="close-circle-outline" size={16} color={ui.primary} />
                      <Text style={[styles.smallBtnText, { color: ui.primary }]}>נקה</Text>
                    </Pressable>
                  </View>
                    </>
                  )}

                  <View style={styles.recipientsActionsRow}>
                    {previousNotificationType ? (
                      <Pressable
                        onPress={() => void importFromPrevious()}
                        disabled={importingPrev}
                        style={({ pressed }) => [
                          styles.keepPendingBtn,
                          pressed ? { opacity: 0.92 } : null,
                          importingPrev ? { opacity: 0.6 } : null,
                        ]}
                      >
                        {importingPrev ? (
                          <ActivityIndicator />
                        ) : (
                          <Ionicons name="download-outline" size={16} color={ui.text} />
                        )}
                        <Text style={[styles.keepPendingText, { color: ui.text }]}>ייבא מהודעה קודמת (ממתינים)</Text>
                      </Pressable>
                    ) : null}
                    <Pressable onPress={keepOnlyPendingFromSelection} style={({ pressed }) => [styles.keepPendingBtn, pressed ? { opacity: 0.92 } : null]}>
                      <Ionicons name="time-outline" size={16} color={ui.text} />
                      <Text style={[styles.keepPendingText, { color: ui.text }]}>השאר רק ממתינים ({selectedPendingCount})</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => void sendNow()}
                      disabled={sendingNow || selectedCount === 0}
                      style={({ pressed }) => [
                        styles.sendNowBtn,
                        { backgroundColor: ui.primary },
                        pressed ? { opacity: 0.92 } : null,
                        sendingNow || selectedCount === 0 ? { opacity: 0.6 } : null,
                      ]}
                    >
                      {sendingNow ? <ActivityIndicator color="#fff" /> : <Ionicons name="paper-plane-outline" size={18} color="#fff" />}
                      <Text style={styles.sendNowText}>{sendingNow ? 'שולח...' : 'שלח עכשיו'}</Text>
                    </Pressable>
                  </View>

                  {isFirstMessage && autoAllRecipients ? null : (
                  <View style={{ gap: 10 }}>
                    {filteredGuests.map((g) => {
                      const checked = selectedGuestIds.has(String(g.id));
                      return (
                        <Pressable
                          key={g.id}
                          onPress={() => toggleGuest(g.id)}
                          style={({ pressed }) => [
                            styles.recipientRow,
                            { borderColor: checked ? 'rgba(29,78,216,0.25)' : 'rgba(17,24,39,0.08)' },
                            { backgroundColor: checked ? 'rgba(29,78,216,0.06)' : 'rgba(255,255,255,0.92)' },
                            pressed ? { opacity: 0.96 } : null,
                          ]}
                        >
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={[styles.recipientName, { color: ui.text }]} numberOfLines={1}>
                              {g.name}
                            </Text>
                            <Text style={[styles.recipientMeta, { color: ui.sub }]} numberOfLines={1}>
                              {g.status}
                              {g.phone ? ` · ${g.phone}` : ' · אין טלפון'}
                            </Text>
                          </View>
                          <Ionicons name={checked ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={checked ? ui.primary : ui.iconMuted} />
                        </Pressable>
                      );
                    })}
                  </View>
                  )}
                </View>
              ) : null}
            </AppKeyboardAwareScrollView>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      {Platform.OS === 'web' ? null : (
        <>
          <DateTimePickerModal
            isVisible={datePickerOpen}
            mode="date"
            date={computedSendAt ?? eventDate ?? new Date()}
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onConfirm={(d) => {
              setDatePickerOpen(false);
              const next = toLocalYmd(d);
              if (next) setEditedSendDateYmd(next);
            }}
            onCancel={() => setDatePickerOpen(false)}
          />

          <DateTimePickerModal
            isVisible={timePickerOpen}
            mode="time"
            date={computedSendAt ?? eventDate ?? new Date()}
            display={Platform.OS === 'ios' ? 'spinner' : 'spinner'}
            onConfirm={(d) => {
              setTimePickerOpen(false);
              setEditedTimeHm(formatTime(d));
            }}
            onCancel={() => setTimePickerOpen(false)}
          />
        </>
      )}

      {/* Bottom actions */}
      <View
        style={[
          styles.bottomBar,
          {
            paddingBottom: bottomSafe,
            borderTopColor: 'rgba(229,231,235,0.85)',
            backgroundColor: '#FFFFFF',
          },
        ]}
      >
        <View style={[styles.bottomBarInner, { paddingBottom: bottomSafe }]}>
          <View style={styles.bottomButtonsRow}>
            <TouchableOpacity
              style={[styles.bottomBtnSecondary, { borderColor: ui.border, backgroundColor: 'rgba(255,255,255,0.92)' }]}
              onPress={() => {
                if (wizardStepIdx > 0) setWizardStepIdx((i) => Math.max(0, i - 1));
                else router.back();
              }}
              activeOpacity={0.92}
            >
              <Text style={[styles.bottomBtnSecondaryText, { color: ui.text }]}>{wizardStepIdx > 0 ? 'הקודם' : 'ביטול'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.bottomBtnPrimary, { backgroundColor: saving ? ui.primaryHover : ui.primary }]}
              onPress={() => {
                if (!wizardIsLast) {
                  setWizardStepIdx((i) => Math.min(wizardSteps.length - 1, i + 1));
                  return;
                }
                void save({ recipientGuestIds: Array.from(selectedGuestIds) });
              }}
              activeOpacity={0.92}
              disabled={saving || (!wizardIsLast && !wizardSteps.length)}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="save-outline" size={18} color="#fff" />
                  <Text style={styles.bottomBtnPrimaryText}>{wizardIsLast ? 'שמור שינויים' : 'המשך'}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  webOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    ...(Platform.OS === 'web'
      ? ({ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 } as any)
      : ({ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as any)),
  },
  webCard: {
    width: '100%',
    maxWidth: 920,
    maxHeight: '92%',
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(2,6,23,0.08)',
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 18px 50px rgba(2,6,23,0.12)' } as any) : null),
  },
  webHeader: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 10,
    flexDirection: ROW_DIR,
    alignItems: 'flex-start',
    gap: 12,
  },
  webCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.10)',
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  webTitle: { fontSize: 16, fontWeight: '900', textAlign: 'right' },
  webSubTitle: { marginTop: 2, fontSize: 12, fontWeight: '700', textAlign: 'right' },
  webProgressWrap: { paddingHorizontal: 18, paddingBottom: 12, gap: 8 },
  webProgressLabels: { flexDirection: ROW_DIR, alignItems: 'center', justifyContent: 'space-between' },
  webProgressPctText: { fontSize: 12, fontWeight: '800' },
  webProgressStepText: { fontSize: 12, fontWeight: '800' },
  webProgressBar: {
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(148,163,184,0.25)',
    overflow: 'hidden',
    alignItems: ALIGN_RIGHT,
    justifyContent: 'center',
  },
  webProgressFill: { height: 6, borderRadius: 999 },
  webBody: { flex: 1, minHeight: 0, backgroundColor: '#FFFFFF' },
  webContent: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 16, gap: 16 },

  webRecipientsWrap: { gap: 14 },
  webRecipientsSummaryCard: {
    height: 86,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,1)',
    backgroundColor: '#fff',
    flexDirection: ROW_DIR,
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 12,
  },
  webRecipientsSummaryIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(29,78,216,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  webRecipientsSummaryLabel: { fontSize: 12, fontWeight: '800', textAlign: 'right' },
  webRecipientsSummaryValue: { marginTop: 2, fontSize: 26, fontWeight: '900', textAlign: 'right', writingDirection: 'ltr' },

  webChipsRow: { flexDirection: 'row', flexWrap: 'nowrap', gap: 10, alignItems: 'flex-start', justifyContent: 'flex-start' },
  webChip: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,1)',
    backgroundColor: '#fff',
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 8,
  },
  webChipText: { fontSize: 12, fontWeight: '900', textAlign: 'right' },

  webQuickActionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'flex-start' },
  webLinkBtn: { flexDirection: ROW_DIR, alignItems: 'center', gap: 6 },
  webLinkText: { fontSize: 12, fontWeight: '900', textAlign: 'right' },

  webTableWrap: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,1)',
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  webTableHeaderRow: {
    height: 44,
    backgroundColor: 'rgba(248,250,252,1)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(226,232,240,1)',
    flexDirection: ROW_DIR,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  webTableHeaderText: { fontSize: 12, fontWeight: '800', textAlign: 'right' },
  webTableCell: { paddingHorizontal: 10, justifyContent: 'center' },
  webCellStatus: { width: 120, flexDirection: 'row' },
  webCellPhone: { width: 170 },
  webCellName: { flex: 1, minWidth: 0 },
  webTableCheckboxHead: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },

  webTableRow: {
    minHeight: 54,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(241,245,249,1)',
  },
  webTableCheckboxCell: { width: 38, height: 44, alignItems: 'center', justifyContent: 'center' },
  webCellText: { fontSize: 13, fontWeight: '800', textAlign: 'right' },
  webNameRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, minWidth: 0 },
  webAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(226,232,240,1)', alignItems: 'center', justifyContent: 'center' },
  webAvatarText: { fontSize: 12, fontWeight: '900' },
  webStatusPill: { height: 22, paddingHorizontal: 10, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 8, flexWrap: 'nowrap' },
  webStatusDot: { width: 6, height: 6, borderRadius: 3 },
  webStatusText: { fontSize: 12, fontWeight: '900', textAlign: 'right' },

  webFooter: { borderTopWidth: 1, borderTopColor: 'rgba(226,232,240,1)', backgroundColor: 'rgba(255,255,255,0.92)' },
  webFooterRow: { paddingHorizontal: 18, paddingVertical: 14, flexDirection: ROW_DIR, alignItems: 'center', gap: 12 },
  webFooterSecondary: { flexDirection: ROW_DIR, height: 44, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(226,232,240,1)', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', gap: 8 },
  webFooterSecondaryText: { fontSize: 14, fontWeight: '900', textAlign: 'center' },
  webFooterLink: { flexDirection: ROW_DIR, alignItems: 'center', gap: 8, paddingHorizontal: 10, height: 44 },
  webFooterLinkText: { fontSize: 14, fontWeight: '900', textAlign: 'right' },
  webFooterPrimary: { marginRight: 'auto', height: 44, paddingHorizontal: 18, borderRadius: 12, flexDirection: ROW_DIR, alignItems: 'center', justifyContent: 'center', gap: 8 },
  webFooterPrimaryText: { fontSize: 14, fontWeight: '900', color: '#fff', textAlign: 'center' },

  headerWrap: {
    position: 'relative',
    zIndex: 5,
    borderBottomWidth: 1,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  header: { paddingHorizontal: 18, paddingBottom: 16, alignItems: 'center', justifyContent: 'center' },
  headerBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  backBtnAbs: { position: 'absolute', left: 18, top: 0, zIndex: 10 },
  headerTitles: { flex: 1, alignItems: 'center', gap: 6 },
  headerTitle: { fontSize: 18, fontWeight: '900', textAlign: 'center' },
  headerSubtitlePill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, maxWidth: '92%' },
  headerSubtitle: { fontSize: 12, fontWeight: '800', textAlign: 'center' },

  content: { paddingHorizontal: 16, paddingTop: 18, gap: 18, maxWidth: 720, width: '100%', alignSelf: 'center' },

  section: { paddingHorizontal: 2, gap: 12 },
  sectionTitle: { fontSize: 13, fontWeight: '900', textAlign: 'right', paddingHorizontal: 2 },

  scheduleRow: { flexDirection: ROW_DIR, alignItems: 'stretch', gap: 12 },
  dateCol: { flex: 2, gap: 8 },
  scheduleCard: { position: 'relative', flex: 2, minHeight: 92, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, gap: 6 },
  scheduleCardSmall: { position: 'relative', flex: 1, minHeight: 92, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, gap: 6 },
  scheduleCardTop: { flexDirection: ROW_DIR, alignItems: 'center', justifyContent: 'space-between' },
  scheduleValueText: { fontSize: 18, fontWeight: '900', textAlign: 'right', writingDirection: 'ltr' },
  scheduleSubText: { fontSize: 12, fontWeight: '800', textAlign: 'right', opacity: 0.85 },
  offsetBelow: { fontSize: 12, fontWeight: '800', textAlign: 'right', opacity: 0.85 },
  scheduleValueInput: {
    fontSize: 16,
    fontWeight: '900',
    paddingVertical: 0,
    paddingHorizontal: 0,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null),
  },

  segmentWrap: { flexDirection: ROW_DIR, padding: 4, borderRadius: 16, borderWidth: 1 },
  segmentBtn: { flex: 1, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  segmentBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  segmentText: { fontSize: 13, fontWeight: '800' },

  cardsRow: { flexDirection: ROW_DIR, alignItems: 'center', gap: 12 },
  computedCard: { flex: 1, height: 76, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  computedLabel: { fontSize: 11, fontWeight: '800' },
  computedValue: { fontSize: 18, fontWeight: '900', textAlign: 'center', writingDirection: 'ltr' },
  sideCardsCol: { flex: 1, gap: 12 },
  daysCard: { flex: 1, height: 76, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, justifyContent: 'space-between' },
  timeCard: { flex: 1, height: 76, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, justifyContent: 'space-between' },
  daysCardTop: { flexDirection: ROW_DIR, alignItems: 'center', justifyContent: 'space-between' },
  daysMeta: { fontSize: 11, fontWeight: '800' },
  daysValue: { fontSize: 22, fontWeight: '900', paddingVertical: 0, paddingHorizontal: 0 },

  messageHeaderRow: { flexDirection: ROW_DIR, alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  messageTools: { flexDirection: ROW_DIR, gap: 8, flexWrap: 'wrap' },
  toolBtn: { width: 36, height: 36, borderRadius: 14, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  textareaWrap: { position: 'relative' },
  textarea: { borderRadius: 20, paddingHorizontal: 18, paddingVertical: 16, fontSize: 16, fontWeight: '700', minHeight: 280, lineHeight: 24, writingDirection: 'rtl', borderWidth: 1 },
  charCountPill: { position: 'absolute', left: 12, bottom: 12, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.86)', borderWidth: 1 },
  charCountText: { fontSize: 12, fontWeight: '800' },
  helperText: { fontSize: 12, fontWeight: '600', textAlign: 'right', opacity: 0.75, paddingHorizontal: 2, lineHeight: 18 },

  wizardTop: { paddingHorizontal: 2 },
  stepperRow: { flexDirection: ROW_DIR, alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 2 },
  stepperItem: { alignItems: 'center', justifyContent: 'center', gap: 6, flex: 1, minWidth: 0 },
  stepDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(17,24,39,0.14)', backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
  stepDotText: { fontSize: 12, fontWeight: '900', color: 'rgba(17,24,39,0.75)' },
  stepLabel: { fontSize: 11, fontWeight: '900', textAlign: 'center' },

  previewCard: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  previewHeaderRow: { flexDirection: ROW_DIR, alignItems: 'center', justifyContent: 'flex-start', gap: 8 },
  previewTitle: { fontSize: 12, fontWeight: '900', textAlign: 'right' },
  previewText: { fontSize: 14, fontWeight: '800', textAlign: 'right', lineHeight: 22, writingDirection: 'rtl' },
  previewHint: { fontSize: 11, fontWeight: '700', textAlign: 'right', opacity: 0.8 },

  step4TwoCol: { flexDirection: ROW_DIR, flex: 1, minHeight: 0, gap: 24, paddingHorizontal: 2 },
  step4PreviewCol: { flex: 1, minWidth: 0, maxWidth: 460, borderRadius: 20, borderWidth: 0, padding: 18, gap: 12, alignItems: 'center', backgroundColor: '#f2f2f2' },
  step4PreviewTitle: { fontSize: 15, fontWeight: '900', textAlign: 'right', alignSelf: 'stretch' },
  step4PreviewSubtitle: { fontSize: 12, fontWeight: '700', textAlign: 'right', alignSelf: 'stretch', marginBottom: 8 },
  step4PhoneMockup: { width: '100%', maxWidth: 340, borderRadius: 28, borderWidth: 10, borderColor: '#1f2937', backgroundColor: '#111827', padding: 12, alignItems: 'center' },
  step4PhoneScreen: { width: '100%', minHeight: 380, backgroundColor: '#f8fafc', borderRadius: 18, padding: 16, gap: 12 },
  step4PhoneTime: { fontSize: 12, fontWeight: '800', color: 'rgba(71,85,105,1)', textAlign: 'center' },
  step4BubbleIn: { alignSelf: ALIGN_LEFT, maxWidth: '90%', padding: 14, borderRadius: 16, borderTopRightRadius: 4, gap: 4 },
  step4BubbleOut: { alignSelf: ALIGN_RIGHT, maxWidth: '90%', padding: 14, borderRadius: 16, borderTopLeftRadius: 4, gap: 4 },
  step4BubbleText: { fontSize: 14, fontWeight: '700', textAlign: 'right', lineHeight: 22 },
  step4BubbleTextOut: { fontSize: 14, fontWeight: '700', color: '#fff', textAlign: 'right', lineHeight: 22 },
  step4BubbleTime: { fontSize: 10, fontWeight: '800', color: 'rgba(100,116,139,1)', textAlign: 'left' },
  step4BubbleTimeOut: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.85)', textAlign: 'left' },
  step4ContentCol: { flex: 1.2, minWidth: 0, gap: 10 },
  step4Instruction: { fontSize: 13, fontWeight: '700', textAlign: 'right', lineHeight: 20 },
  step4VarsLabel: { fontSize: 13, fontWeight: '900', textAlign: 'right' },
  step4VarsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  step4VarTag: { flexDirection: ROW_DIR, alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  step4VarTagText: { fontSize: 12, fontWeight: '800', textAlign: 'right' },
  step4Textarea: { minHeight: 280 },
  step4CharRow: { flexDirection: ROW_DIR, alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10, paddingHorizontal: 2 },
  step4CharPill: { flexDirection: ROW_DIR, alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.86)', borderWidth: 1 },
  step4CharDot: { width: 8, height: 8, borderRadius: 4 },
  step4SmsHint: { fontSize: 12, fontWeight: '700', textAlign: 'right' },

  mono: { fontWeight: '900' },
  recipientsHeaderRow: { flexDirection: ROW_DIR, alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  recipientsBadge: { flexDirection: ROW_DIR, gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(17,24,39,0.04)' },
  recipientsBadgeText: { fontSize: 12, fontWeight: '900', color: 'rgba(17,24,39,0.72)', textAlign: 'right' },

  filtersRow: { flexDirection: ROW_DIR, flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  filterPill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.92)', borderWidth: 1, borderColor: 'rgba(17,24,39,0.10)' },
  filterPillActive: { backgroundColor: 'rgba(29,78,216,0.10)', borderColor: 'rgba(29,78,216,0.22)' },
  filterText: { fontSize: 12, fontWeight: '900', color: 'rgba(17,24,39,0.72)', textAlign: 'right' },
  filterTextActive: { color: 'rgba(29,78,216,1)' },

  smallBtn: { flexDirection: ROW_DIR, alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.92)', borderWidth: 1, borderColor: 'rgba(29,78,216,0.18)' },
  smallBtnText: { fontSize: 12, fontWeight: '900', textAlign: 'right' },

  recipientsActionsRow: { flexDirection: ROW_DIR, alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  keepPendingBtn: { flex: 1, minWidth: 180, height: 44, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(17,24,39,0.10)', backgroundColor: 'rgba(17,24,39,0.04)', flexDirection: ROW_DIR, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
  keepPendingText: { fontSize: 12, fontWeight: '900', textAlign: 'right' },
  sendNowBtn: { height: 44, borderRadius: 14, paddingHorizontal: 14, flexDirection: ROW_DIR, alignItems: 'center', justifyContent: 'center', gap: 8 },
  sendNowText: { fontSize: 12, fontWeight: '900', color: '#fff', textAlign: 'right' },

  automationCard: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 14, gap: 12 },
  automationTopRow: { flexDirection: ROW_DIR, alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  automationTitle: { fontSize: 13, fontWeight: '900', textAlign: 'right' },
  automationHint: { marginTop: 4, fontSize: 12, fontWeight: '700', textAlign: 'right', opacity: 0.85, lineHeight: 18 },
  automationTiny: { fontSize: 12, fontWeight: '700', textAlign: 'right', opacity: 0.85, lineHeight: 18 },
  automationDivider: { height: 1, backgroundColor: 'rgba(17,24,39,0.08)' },

  togglePill: { minWidth: 76, height: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  togglePillOn: { backgroundColor: 'rgba(16,185,129,0.12)', borderColor: 'rgba(16,185,129,0.22)' },
  togglePillOff: { backgroundColor: 'rgba(148,163,184,0.12)', borderColor: 'rgba(148,163,184,0.22)' },
  togglePillText: { fontSize: 12, fontWeight: '900', textAlign: 'center' },
  togglePillTextOn: { color: 'rgba(16,185,129,1)' },
  togglePillTextOff: { color: 'rgba(100,116,139,1)' },

  catchupRow: { flexDirection: ROW_DIR, alignItems: 'flex-start', gap: 12 },
  catchupLabel: { fontSize: 11, fontWeight: '800', textAlign: 'right' },
  catchupInput: { marginTop: 6, height: 44, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, fontSize: 14, fontWeight: '900', textAlign: 'right', writingDirection: 'ltr' },
  weekdaysRow: { marginTop: 6, flexDirection: ROW_DIR, flexWrap: 'wrap', gap: 8 },
  weekdayPill: { height: 34, minWidth: 38, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  weekdayPillOn: { backgroundColor: 'rgba(29,78,216,0.12)', borderColor: 'rgba(29,78,216,0.22)' },
  weekdayPillOff: { backgroundColor: 'rgba(255,255,255,0.92)', borderColor: 'rgba(17,24,39,0.10)' },
  weekdayText: { fontSize: 12, fontWeight: '900', textAlign: 'center' },
  weekdayTextOn: { color: 'rgba(29,78,216,1)' },
  weekdayTextOff: { color: 'rgba(17,24,39,0.70)' },

  queueHeaderRow: { flexDirection: ROW_DIR, alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  queueRow: { flexDirection: ROW_DIR, alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 16, borderWidth: 1 },

  recipientRow: { flexDirection: ROW_DIR, alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 16, borderWidth: 1 },
  recipientName: { fontSize: 13, fontWeight: '900', textAlign: 'right' },
  recipientMeta: { marginTop: 3, fontSize: 12, fontWeight: '700', textAlign: 'right' },

  bottomBar: { position: 'relative', borderTopWidth: 1 },
  bottomBarInner: { paddingHorizontal: 16, paddingTop: 12 },
  bottomButtonsRow: { flexDirection: ROW_DIR, gap: 12, maxWidth: 720, width: '100%', alignSelf: 'center' },
  bottomBtnSecondary: { flex: 1, height: 58, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  bottomBtnSecondaryText: { fontSize: 16, fontWeight: '900' },
  bottomBtnPrimary: { flex: 2, height: 58, borderRadius: 16, justifyContent: 'center', alignItems: 'center', flexDirection: ROW_DIR, gap: 10 },
  bottomBtnPrimaryText: { fontSize: 16, fontWeight: '900', color: '#fff' },
});

