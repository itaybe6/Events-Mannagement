import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { supabase } from '@/lib/supabase';
import { eventService } from '@/lib/services/eventService';
import { useUserStore } from '@/store/userStore';
import { useEventSelectionStore } from '@/store/eventSelectionStore';
import { Event } from '@/types';

type NotificationTemplate = {
  notification_type: string;
  title: string;
  days_from_wedding: number;
  channel: 'SMS' | 'WHATSAPP';
  defaultMessage?: string;
};

type NotificationSettingRow = {
  id?: string;
  event_id?: string;
  notification_type: string;
  title: string;
  enabled: boolean;
  message_content: string;
  days_from_wedding: number;
  channel?: 'SMS' | 'WHATSAPP';
  notification_date?: string | null;
  recipient_guest_ids?: string[] | null;
};

type SmsRunSummary = {
  id: string;
  notification_setting_id: string;
  status: string;
  claimed_at: string;
  error?: string | null;
};

const normalizeMessage = (s: string) => String(s || '').replace(/\r\n/g, '\n').trim();

type EventKind = 'wedding' | 'brit' | 'barMitzvah' | 'generic';

function detectEventKind(event: Event | null): EventKind {
  const title = String((event as any)?.title ?? '').toLowerCase();
  const groom = String((event as any)?.groomName ?? (event as any)?.groom_name ?? '').trim();
  const bride = String((event as any)?.brideName ?? (event as any)?.bride_name ?? '').trim();

  if (
    title.includes('ברית') ||
    title.includes('בריתה') ||
    title.includes('brit') ||
    title.includes('baby') ||
    title.includes('תינוק')
  )
    return 'brit';

  if (
    title.includes('בר מצ') ||
    title.includes('בת מצ') ||
    title.includes('bar mitz') ||
    title.includes('bat mitz')
  )
    return 'barMitzvah';

  if (title.includes('חתונ') || title.includes('wedding') || (groom && bride)) return 'wedding';
  return 'generic';
}

function defaultMessageByType(args: { notificationType: string; kind: EventKind }) {
  const { notificationType, kind } = args;

  // Keep messages event-type aware but resilient: prefer {{שם_אירוע}} and avoid hard-coding "חתונה"
  // unless we are confident this is a wedding.
  const eventNoun =
    kind === 'wedding' ? 'החתונה' : kind === 'brit' ? 'הברית/ה' : kind === 'barMitzvah' ? 'בר/בת המצווה' : 'האירוע';

  switch (notificationType) {
    case 'reminder_1':
      if (kind === 'wedding') {
        return normalizeMessage(
          'אורחים יקרים,\n' +
            'בתאריך {תאריך} תיערך החתונה של {שמות_חתן_כלה} ב{מיקום}.\n' +
            'לאישור הגעה: [הדביקו כאן קישור]\n' +
            'להנחיות הגעה: [הדביקו כאן קישור]\n' +
            'נשמח לראותכם!'
        );
      }
      return normalizeMessage(
        'שלום,\n' +
          `בתאריך {תאריך} ייערך ${eventNoun} ({שם_אירוע}) ב{מיקום}.\n` +
          'לאישור הגעה: [הדביקו כאן קישור]\n' +
          'להנחיות הגעה: [הדביקו כאן קישור]\n' +
          'נשמח לראותכם!'
      );

    case 'reminder_2':
      return normalizeMessage(
        'תזכורת:\n' +
          '{שם_אירוע} מתקרב ({תאריך}).\n' +
          'אם עדיין לא אישרתם הגעה, נשמח לאישור בקישור: [הדביקו כאן קישור]'
      );

    case 'whatsapp_event_day':
      return normalizeMessage('היום זה היום!\n' + '{{שם_אירוע}} מתקיים היום.\n' + 'לכניסה מהירה והנחיות: [הדביקו כאן קישור]');

    case 'after_1':
      return normalizeMessage('תודה שבאתם ל{{שם_אירוע}}.\n' + 'היה לנו כיף גדול איתכם, תודה על האיחולים והאהבה.');

    default:
      return normalizeMessage('שלום,\n' + '{שם_אירוע} ב{מיקום} בתאריך {תאריך}.\n' + 'נשמח לראותכם!');
  }
}

const NOTIFICATION_TEMPLATES: NotificationTemplate[] = [
  {
    notification_type: 'reminder_1',
    title: 'הודעה ראשונה',
    days_from_wedding: -30,
    channel: 'SMS',
    defaultMessage: undefined,
  },
  // Default: 14 days after message #1 (-30 + 14 = -16), can be edited manually.
  { notification_type: 'reminder_2', title: 'הודעה שנייה', days_from_wedding: -16, channel: 'SMS', defaultMessage: undefined },
  { notification_type: 'whatsapp_event_day', title: 'וואטסאפ ביום האירוע', days_from_wedding: 0, channel: 'WHATSAPP', defaultMessage: undefined },
  { notification_type: 'after_1', title: 'הודעה ליום אחרי האירוע', days_from_wedding: 1, channel: 'SMS', defaultMessage: undefined },
];

const LEGACY_DEFAULT_MESSAGES: Record<string, Set<string>> = {
  reminder_1: new Set([
    // Very old couple defaults
    normalizeMessage('שלום! רצינו להזכיר לכם על האירוע הקרוב שלנו.'),
    // Previous web default (wedding-oriented)
    normalizeMessage(
      'אורחים יקרים,\n' +
        'בתאריך {{תאריך}} תיערך החתונה של {{שמות_חתן_כלה}} ב{{מיקום}}.\n' +
        'למתנה באשראי: [הדביקו כאן קישור]\n' +
        'להנחיות הגעה: [הדביקו כאן קישור]\n' +
        'נשמח לראותכם :)'
    ),
  ]),
  reminder_2: new Set([normalizeMessage('היי! האירוע בעוד שבועיים, מחכים לראות אתכם!')]),
  whatsapp_event_day: new Set([normalizeMessage('היום האירוע! נתראה שם')]),
  after_1: new Set([normalizeMessage('תודה שבאתם! היה לנו כיף גדול איתכם.')]),
};

const TITLE_OVERRIDES: Record<string, string> = {
  reminder_1: 'הודעה ראשונה',
  reminder_2: 'הודעה שנייה',
};

function getDisplayTitle(row: Pick<NotificationSettingRow, 'notification_type' | 'title'>) {
  return TITLE_OVERRIDES[row.notification_type] ?? row.title;
}

function formatOffsetLabel(days: number) {
  if (!Number.isFinite(days)) return '—';
  if (days === 0) return 'ביום האירוע';
  const abs = Math.abs(days);
  return days < 0 ? `${abs} ימים לפני האירוע` : `${abs} ימים אחרי האירוע`;
}

function formatHeDate(value: unknown) {
  const d = value instanceof Date ? value : new Date(String(value ?? ''));
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function toLocalYmd(d: Date) {
  if (!Number.isFinite(d.getTime())) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function computeNotificationDateYmd(eventDate: unknown, daysOffset: number) {
  const base = new Date(String(eventDate ?? ''));
  if (!Number.isFinite(base.getTime())) return null;
  const d = new Date(base);
  d.setDate(d.getDate() + (Number(daysOffset) || 0));
  return toLocalYmd(d);
}

function computeNotificationDate(eventDate: unknown, daysOffset: number) {
  const base = new Date(String(eventDate ?? ''));
  if (!Number.isFinite(base.getTime())) return null;
  const d = new Date(base);
  d.setDate(d.getDate() + (Number(daysOffset) || 0));
  return d;
}

function formatTime(d: Date) {
  if (!Number.isFinite(d.getTime())) return '';
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

function computeNotificationDateTime(eventDate: unknown, daysOffset: number, timeHm: string) {
  const base = new Date(String(eventDate ?? ''));
  if (!Number.isFinite(base.getTime())) return null;
  const hm = parseTimeHm(timeHm);
  if (!hm) return null;
  const d = new Date(base);
  d.setDate(d.getDate() + (Number(daysOffset) || 0));
  d.setHours(hm.h, hm.m, 0, 0);
  return d;
}

function inferTimeHmFromExisting(value: unknown) {
  const d = new Date(String(value ?? ''));
  const hasRealTime = Number.isFinite(d.getTime()) && (d.getHours() !== 0 || d.getMinutes() !== 0);
  return hasRealTime ? formatTime(d) : '11:00';
}

const isMissingColumn = (err: any, column: string) =>
  String(err?.code) === '42703' && String(err?.message || '').toLowerCase().includes(column.toLowerCase());

export default function AutomaticNotificationsWebScreen() {
  const router = useRouter();
  const { width: viewportWidth } = useWindowDimensions();
  const { userData } = useUserStore();
  const params = useLocalSearchParams<{ eventId?: string | string[] }>();
  const activeUserId = useEventSelectionStore((s) => s.activeUserId);
  const activeEventId = useEventSelectionStore((s) => s.activeEventId);

  const queryEventId = typeof params.eventId === 'string' ? params.eventId : Array.isArray(params.eventId) ? params.eventId[0] : undefined;
  const resolvedEventId = useMemo(() => {
    return (
      String(
        queryEventId ||
          (userData?.id && activeUserId === userData.id ? activeEventId : null) ||
          userData?.event_id ||
          ''
      ).trim() || null
    );
  }, [activeEventId, activeUserId, queryEventId, userData?.event_id, userData?.id]);

  const ui = useMemo(
    () => ({
      primary: '#4F46E5',
      whatsapp: '#25D366',
      bgLight: '#F9FAFB',
      card: '#FFFFFF',
      text: '#111827',
      sub: '#6B7280',
    }),
    []
  );

  const [event, setEvent] = useState<Event | null>(null);
  const [ownerTitle, setOwnerTitle] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [settingsSupported, setSettingsSupported] = useState(true);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettingRow[]>([]);
  const [selectedType, setSelectedType] = useState<string>('reminder_1');
  const [editDraft, setEditDraft] = useState<{ message: string; days: number; timeHm: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const [allGuests, setAllGuests] = useState<
    Array<{ id: string; name: string; phone?: string; status: string; invitationCode?: string; invitationToken?: string }>
  >([]);
  const [sendingNow, setSendingNow] = useState(false);

  // Recipient picking: required for message 1, optional for message 2 ("מאשרים").
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTargetType, setPickerTargetType] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerFilter, setPickerFilter] = useState<'all' | 'pending' | 'confirmed' | 'declined'>('all');
  const [pickerSelectedIds, setPickerSelectedIds] = useState<Set<string>>(() => new Set());

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorType, setEditorType] = useState<string | null>(null);
  const [dateDialogOpen, setDateDialogOpen] = useState(false);
  const [timeDialogOpen, setTimeDialogOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [timeDraft, setTimeDraft] = useState<{ h: number; m: number }>({ h: 11, m: 0 });

  const [recipientsPreviewOpen, setRecipientsPreviewOpen] = useState(false);
  const [recipientsPreviewTitle, setRecipientsPreviewTitle] = useState('מוזמנים');
  const [recipientsPreviewRows, setRecipientsPreviewRows] = useState<
    Array<{ id: string; name: string; phone?: string; status?: string }>
  >([]);
  const [recipientsPreviewHint, setRecipientsPreviewHint] = useState<string>('');
  const [recipientsPreviewSearch, setRecipientsPreviewSearch] = useState('');

  const [lastSmsRunBySettingId, setLastSmsRunBySettingId] = useState<Record<string, SmsRunSummary | undefined>>({});
  const [sendStatusOpen, setSendStatusOpen] = useState(false);
  const [sendStatusLoading, setSendStatusLoading] = useState(false);
  const [sendStatusTitle, setSendStatusTitle] = useState('סטטוס שליחה');
  const [sendStatusRun, setSendStatusRun] = useState<SmsRunSummary | null>(null);
  const [sendStatusSearch, setSendStatusSearch] = useState('');
  const [sendStatusRows, setSendStatusRows] = useState<
    Array<{ guestId: string; name: string; phone?: string; guestStatus?: string; sendStatus: 'sent' | 'failed' | 'skipped'; sentAt?: string | null; error?: string | null }>
  >([]);

  const [toastText, setToastText] = useState<string | null>(null);
  const toastTimerRef = useRef<any>(null);

  const showToast = useCallback((text: string) => {
    setToastText(text);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastText(null), 2200);
  }, []);

  const formatHeDateTimeShort = (value: unknown) => {
    const d = value instanceof Date ? value : new Date(String(value ?? ''));
    if (!Number.isFinite(d.getTime())) return '';
    const date = d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
    const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    return `${date} ${time}`;
  };

  const statusLabel = (s: string) => {
    const v = String(s || '').trim();
    if (v === 'sent') return { text: 'נשלח', color: 'rgba(22,163,74,1)' };
    if (v === 'failed') return { text: 'נכשל', color: 'rgba(239,68,68,1)' };
    if (v === 'sending') return { text: 'בתהליך', color: 'rgba(245,158,11,1)' };
    if (v === 'claimed') return { text: 'ממתין', color: 'rgba(245,158,11,1)' };
    if (v === 'skipped') return { text: 'דולג', color: 'rgba(100,116,139,1)' };
    return { text: '—', color: 'rgba(100,116,139,1)' };
  };

  const openSendStatus = async (row: NotificationSettingRow) => {
    if (!row?.id) {
      showToast('אין היסטוריית שליחה עדיין');
      return;
    }
    const run = lastSmsRunBySettingId[String(row.id)];
    if (!run?.id) {
      showToast('אין היסטוריית שליחה עדיין');
      return;
    }
    setSendStatusTitle(`סטטוס שליחה · ${getDisplayTitle(row)}`);
    setSendStatusRun(run);
    setSendStatusRows([]);
    setSendStatusSearch('');
    setSendStatusOpen(true);
    setSendStatusLoading(true);
    try {
      const { data: recRows, error: recError } = await supabase
        .from('scheduled_notification_sms_run_recipients')
        .select('guest_id, status, phone, sent_at, error')
        .eq('run_id', run.id)
        .order('created_at', { ascending: true });
      if (recError) throw recError;

      const recs = ((recRows as any[]) || []).map((r) => ({
        guestId: String((r as any).guest_id),
        sendStatus: String((r as any).status) as any,
        phone: (r as any).phone ? String((r as any).phone) : undefined,
        sentAt: (r as any).sent_at ? String((r as any).sent_at) : null,
        error: (r as any).error ? String((r as any).error) : null,
      }));
      const ids = recs.map((r) => r.guestId).filter(Boolean);
      const byId = new Map<string, { name: string; phone?: string; guestStatus?: string }>();
      if (ids.length > 0) {
        const { data: gRows, error: gError } = await supabase
          .from('guests')
          .select('id, name, phone, status')
          .eq('event_id', resolvedEventId)
          .in('id', ids);
        if (!gError) {
          for (const g of (gRows as any[]) || []) {
            byId.set(String((g as any).id), {
              name: String((g as any).name ?? ''),
              phone: (g as any).phone ? String((g as any).phone) : undefined,
              guestStatus: (g as any).status ? String((g as any).status) : undefined,
            });
          }
        }
      }

      const decorated = recs.map((r) => {
        const g = byId.get(r.guestId);
        return {
          guestId: r.guestId,
          name: g?.name || '—',
          phone: g?.phone || r.phone,
          guestStatus: g?.guestStatus,
          sendStatus: r.sendStatus,
          sentAt: r.sentAt,
          error: r.error,
        };
      });

      const orderRank = (s: string) => (s === 'failed' ? 0 : s === 'skipped' ? 1 : 2);
      decorated.sort((a, b) => {
        const da = orderRank(String(a.sendStatus));
        const db = orderRank(String(b.sendStatus));
        if (da !== db) return da - db;
        return String(a.name || '').localeCompare(String(b.name || ''), 'he');
      });

      setSendStatusRows(decorated);
    } catch (e: any) {
      console.warn('Failed to load send status rows:', e);
      showToast('לא ניתן לטעון סטטוס שליחה');
      setSendStatusOpen(false);
    } finally {
      setSendStatusLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // (editor moved to modal; keep viewportWidth for responsive cards)

  const groomName = useMemo(
    () => String((event as any)?.groomName ?? (event as any)?.groom_name ?? '').trim(),
    [event]
  );
  const brideName = useMemo(
    () => String((event as any)?.brideName ?? (event as any)?.bride_name ?? '').trim(),
    [event]
  );
  const coupleNames = useMemo(() => {
    if (groomName && brideName) return `${groomName} ו${brideName}`;
    return groomName || brideName || '';
  }, [brideName, groomName]);

  const previewVars = useMemo(() => {
    const eventTitle = subtitleFromEvent(event);
    const eventDateText = formatHeDate((event as any)?.date) || '—';
    const loc = String((event as any)?.location ?? '').trim();
    const city = String((event as any)?.city ?? '').trim();
    const eventLocationText = [loc, city].filter(Boolean).join(', ') || '—';

    const vars: Record<string, string> = {
      // שם האורח הוא דוגמה בלבד (אין לנו אורח ספציפי בתצוגה הזאת)
      '{name}': 'אורח/ת',
      '{link}': 'https://example.com/i/XXXX',

      '{שם_פרטי}': 'אורח/ת',
      '{שם_אירוע}': eventTitle,
      '{תאריך}': eventDateText,
      '{מיקום}': eventLocationText,

      // Backward-compatible (older saved templates may still contain double-braces)
      '{{שם_פרטי}}': 'אורח/ת',
      '{{שם_אירוע}}': eventTitle,
      '{{תאריך}}': eventDateText,
      '{{מיקום}}': eventLocationText,
    };
    if (groomName) {
      vars['{שם_חתן}'] = groomName;
      vars['{{שם_חתן}}'] = groomName;
    }
    if (brideName) {
      vars['{שם_כלה}'] = brideName;
      vars['{{שם_כלה}}'] = brideName;
    }
    if (coupleNames) {
      vars['{שמות_חתן_כלה}'] = coupleNames;
      vars['{{שמות_חתן_כלה}}'] = coupleNames;
    }
    return vars;
  }, [brideName, coupleNames, event, groomName]);

  const renderPreviewText = (raw: string) => {
    let out = raw;
    for (const [token, value] of Object.entries(previewVars)) {
      out = out.split(token).join(value);
    }
    return out;
  };

  const getDefaultMessageContent = (name?: string) => {
    const displayName = name && name.trim().length > 0 ? name.trim() : 'בעל/ת האירוע';
    return `הנכם מוזמנים לאירוע של ${displayName}\nפרטי האירוע ואישור הגעתכם בקישור\nנשמח לראותכם בין אורחינו.`;
  };

  const loadOwnerTitle = async (eventData: Event) => {
    const groom = String((eventData as any)?.groomName ?? (eventData as any)?.groom_name ?? '').trim();
    const bride = String((eventData as any)?.brideName ?? (eventData as any)?.bride_name ?? '').trim();
    if (groom && bride) return `${groom} ו${bride}`;
    return String(userData?.name || '').trim();
  };

  const fetchSettings = async (evtId: string, defaultOwner?: string, eventForDefaults?: Event | null) => {
    const { data: rows, error } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('event_id', evtId)
      .order('days_from_wedding', { ascending: true });

    if (error) {
      const msg = String((error as any)?.message || '').toLowerCase();
      const code = String((error as any)?.code || '');
      if (msg.includes('does not exist') || code === '42P01') {
        setSettingsSupported(false);
        setNotificationSettings([]);
        return;
      }
      console.error('Error fetching notification settings (couple web):', error);
    }

    setSettingsSupported(true);
    const existingMap = new Map<string, any>(((rows as any[]) || []).map((r) => [r.notification_type, r]));
    // Hide legacy "reminder_3" and try to disable it to avoid accidental scheduling.
    try {
      const legacy = existingMap.get('reminder_3');
      if (legacy?.id && legacy?.enabled === true) {
        await supabase.from('notification_settings').update({ enabled: false }).eq('id', legacy.id);
      }
    } catch (e) {
      console.warn('Failed to disable legacy reminder_3 (couple web):', e);
    }

    const kind = detectEventKind(eventForDefaults ?? null);
    const merged: NotificationSettingRow[] = NOTIFICATION_TEMPLATES.map((tpl) => {
      const existing = existingMap.get(tpl.notification_type);
      const desiredDefault = defaultMessageByType({ notificationType: tpl.notification_type, kind });
      if (existing) {
        const existingMsg = normalizeMessage(String(existing.message_content ?? ''));
        const shouldUpgradeMessage = existingMsg.length === 0 || LEGACY_DEFAULT_MESSAGES[tpl.notification_type]?.has(existingMsg);

        return {
          id: existing.id,
          event_id: existing.event_id,
          notification_type: existing.notification_type,
          title: TITLE_OVERRIDES[tpl.notification_type] ?? existing.title ?? tpl.title,
          enabled: Boolean(existing.enabled),
          message_content: shouldUpgradeMessage ? desiredDefault : String(existing.message_content ?? ''),
          days_from_wedding: typeof existing.days_from_wedding === 'number' ? existing.days_from_wedding : tpl.days_from_wedding,
          channel: (existing.channel as any) || tpl.channel,
          notification_date: (existing.notification_date as any) ?? null,
          recipient_guest_ids: Array.isArray((existing as any).recipient_guest_ids)
            ? ((existing as any).recipient_guest_ids as any[]).map((x) => String(x))
            : [],
        };
      }

      return {
        notification_type: tpl.notification_type,
        title: TITLE_OVERRIDES[tpl.notification_type] ?? tpl.title,
        enabled: false,
        message_content: desiredDefault,
        days_from_wedding: tpl.days_from_wedding,
        channel: tpl.channel,
        notification_date: null,
        recipient_guest_ids: [],
      };
    });

    setNotificationSettings(merged);

    // Fetch last SMS runs (per setting) for status UI.
    try {
      const settingIds = merged
        .filter((r) => r.id && (r.channel || 'SMS') === 'SMS')
        .map((r) => String(r.id));
      if (settingIds.length === 0) {
        setLastSmsRunBySettingId({});
      } else {
        const { data: runs, error: runsError } = await supabase
          .from('scheduled_notification_sms_runs')
          .select('id, notification_setting_id, status, claimed_at, error')
          .in('notification_setting_id', settingIds)
          .order('claimed_at', { ascending: false });
        if (runsError) {
          console.warn('Failed to load last sms runs:', runsError);
        } else {
          const out: Record<string, SmsRunSummary> = {};
          for (const r of (runs as any[]) || []) {
            const sid = String((r as any).notification_setting_id || '').trim();
            if (!sid) continue;
            if (out[sid]) continue; // first is newest due to ordering
            out[sid] = {
              id: String((r as any).id),
              notification_setting_id: sid,
              status: String((r as any).status ?? ''),
              claimed_at: String((r as any).claimed_at ?? ''),
              error: (r as any).error ? String((r as any).error) : null,
            };
          }
          setLastSmsRunBySettingId(out);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch last sms runs:', e);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!resolvedEventId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const eventData = await eventService.getEvent(resolvedEventId);
        if (cancelled) return;
        setEvent(eventData);
        const title = await loadOwnerTitle(eventData as any);
        if (cancelled) return;
        setOwnerTitle(title);
        await fetchSettings((eventData as any).id, title, eventData);

        const { data: guestRows, error: guestError } = await supabase
          .from('guests')
          .select('id, name, phone, status, invitation_code, invitation_token')
          .eq('event_id', (eventData as any).id)
          .order('name', { ascending: true });
        if (!cancelled) {
          if (guestError) {
            console.warn('Failed to load guests (couple web):', guestError);
            setAllGuests([]);
          } else {
            setAllGuests(
              ((guestRows as any[]) || []).map((g) => ({
                id: String(g.id),
                name: String(g.name ?? ''),
                phone: g.phone ? String(g.phone) : undefined,
                status: (g.status as any) || 'ממתין',
                invitationCode: g.invitation_code ? String(g.invitation_code) : undefined,
                invitationToken: g.invitation_token ? String(g.invitation_token) : undefined,
              }))
            );
          }
        }
      } catch (e) {
        console.warn('Failed to load couple web automatic notifications:', e);
        if (!cancelled) {
          setEvent(null);
          setOwnerTitle('');
          setNotificationSettings([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedEventId]);

  const selectedRow = useMemo(
    () => notificationSettings.find((r) => r.notification_type === selectedType) || null,
    [notificationSettings, selectedType]
  );

  const editorRow = useMemo(
    () => (editorType ? notificationSettings.find((r) => r.notification_type === editorType) || null : null),
    [editorType, notificationSettings]
  );

  const demoInvitation = useMemo(() => {
    const pickFrom = (list: any[]) => {
      for (const g of list) {
        const token = String(g?.invitationCode ?? g?.invitationToken ?? '').trim();
        if (token) return { token, guestName: String(g?.name ?? '').trim() || null };
      }
      return { token: '', guestName: null as string | null };
    };

    const nt = String(editorRow?.notification_type ?? '').trim();
    const ids = Array.isArray((editorRow as any)?.recipient_guest_ids)
      ? (((editorRow as any).recipient_guest_ids as any[]) || []).map((x) => String(x))
      : [];

    const byId = new Map(allGuests.map((g) => [String(g.id), g]));
    if (ids.length > 0) {
      return pickFrom(ids.map((id) => byId.get(String(id))).filter(Boolean) as any[]);
    }
    if (nt === 'reminder_2') {
      return pickFrom(allGuests.filter((g) => String(g.status || '').trim() === 'ממתין'));
    }
    return pickFrom(allGuests);
  }, [allGuests, editorRow]);

  const demoUrl = useMemo(() => {
    const token = String(demoInvitation.token || '').trim();
    if (!token) return '';
    const origin = typeof window !== 'undefined' ? String(window.location.origin || '').trim() : '';
    return origin ? `${origin}/i/${token}` : `/i/${token}`;
  }, [demoInvitation.token]);

  const openDemoUrl = useCallback(() => {
    if (!demoUrl) {
      showToast('לא נמצא קישור דמו (חסר קוד הזמנה למוזמנים).');
      return;
    }
    try {
      window.open(demoUrl, '_blank', 'noopener,noreferrer');
    } catch {
      try {
        (window.location as any).href = demoUrl;
      } catch {
        // ignore
      }
    }
  }, [demoUrl, showToast]);

  const normalizeTemplateToSingleBraces = (raw: string) => {
    const stripMarks = (s: string) => String(s || '').replace(/[\u200E\u200F\u202A-\u202E]/g, '').trim();
    return String(raw || '').replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_m, inner) => `{${stripMarks(inner)}}`);
  };

  const openEditor = (row: NotificationSettingRow) => {
    setSelectedType(row.notification_type);
    setEditorType(row.notification_type);
    const days = Number(row.days_from_wedding || 0);
    const abs = Math.abs(days);
    const normalizedDays = -(abs || 30); // always "before"
    setEditDraft({
      message: normalizeTemplateToSingleBraces(String(row.message_content || '')),
      days: normalizedDays,
      timeHm: inferTimeHmFromExisting((row as any).notification_date),
    });
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditorType(null);
    setDateDialogOpen(false);
    setTimeDialogOpen(false);
    setRecipientsPreviewOpen(false);
    setRecipientsPreviewSearch('');
  };

  const openRecipientsPreview = useCallback(
    (row: NotificationSettingRow) => {
      const nt = String(row.notification_type || '').trim();
      const isAutoPending = nt === 'reminder_2';
      const ids = Array.isArray((row as any).recipient_guest_ids)
        ? ((row as any).recipient_guest_ids as any[]).map((x) => String(x))
        : [];

      if (isAutoPending && ids.length === 0) {
        const pending = allGuests.filter((g) => String(g.status || '').trim() === 'ממתין');
        setRecipientsPreviewTitle('מוזמנים (ממתינים)');
        setRecipientsPreviewHint('לא נבחרה רשימה — תישלח אוטומטית לכל הממתינים.');
        setRecipientsPreviewRows(
          pending.map((g) => ({ id: String(g.id), name: String(g.name || ''), phone: g.phone, status: g.status }))
        );
      setRecipientsPreviewSearch('');
        setRecipientsPreviewOpen(true);
        return;
      }

      const byId = new Map(allGuests.map((g) => [String(g.id), g]));
      const selected = ids
        .map((id) => byId.get(String(id)))
        .filter(Boolean)
        .map((g: any) => ({ id: String(g.id), name: String(g.name || ''), phone: g.phone, status: g.status }));

      setRecipientsPreviewTitle('מוזמנים שנבחרו');
      setRecipientsPreviewHint('');
      setRecipientsPreviewRows(selected);
      setRecipientsPreviewSearch('');
      setRecipientsPreviewOpen(true);
    },
    [allGuests]
  );

  const rowsByType = useMemo(() => {
    return new Map<string, NotificationSettingRow>(notificationSettings.map((r) => [String(r.notification_type), r]));
  }, [notificationSettings]);

  const displayRows = useMemo(() => {
    const order = ['reminder_1', 'reminder_2', 'whatsapp_event_day', 'after_1'];
    return order.map((t) => rowsByType.get(t)).filter(Boolean) as NotificationSettingRow[];
  }, [rowsByType]);

  const timelineRows = displayRows;

  const iconForType = (row: NotificationSettingRow) => {
    const t = row.notification_type;
    if (String(row.channel || 'SMS') === 'WHATSAPP') return 'logo-whatsapp';
    if (t.includes('reminder_1')) return 'megaphone-outline';
    if (t.includes('reminder_2')) return 'calendar-outline';
    if (t.includes('after')) return 'heart-outline';
    return 'mail-outline';
  };

  const toggleNotification = async (row: NotificationSettingRow) => {
    if (!event?.id) return;
    const nextEnabled = !row.enabled;

    setNotificationSettings((prev) =>
      prev.map((r) => (r.notification_type === row.notification_type ? { ...r, enabled: nextEnabled } : r))
    );

    try {
      if (row.id) {
        const updatePayload: any = { enabled: nextEnabled };
        if (nextEnabled) {
          const existing = (row as any)?.notification_date ? new Date(String((row as any).notification_date)) : null;
          const hasRealTime =
            existing && Number.isFinite(existing.getTime()) && (existing.getHours() !== 0 || existing.getMinutes() !== 0);
          const dt =
            hasRealTime && existing
              ? existing
              : computeNotificationDateTime((event as any)?.date, row.days_from_wedding ?? 0, hasRealTime ? formatTime(existing as any) : '11:00');
          if (dt) updatePayload.notification_date = dt.toISOString();
        }

        let { error } = await supabase.from('notification_settings').update(updatePayload).eq('id', row.id);
        if (error && isMissingColumn(error, 'notification_date')) {
          delete updatePayload.notification_date;
          const retry = await supabase.from('notification_settings').update(updatePayload).eq('id', row.id);
          error = retry.error as any;
        }
        if (error) throw error;
        return;
      }

      const tpl = NOTIFICATION_TEMPLATES.find((t) => t.notification_type === row.notification_type);
      const payload: any = {
        event_id: event.id,
        notification_type: row.notification_type,
        title: getDisplayTitle(row),
        enabled: nextEnabled,
        message_content: row.message_content || tpl?.defaultMessage || getDefaultMessageContent(ownerTitle),
        days_from_wedding: typeof row.days_from_wedding === 'number' ? row.days_from_wedding : tpl?.days_from_wedding ?? 0,
        channel: (row.channel as any) || tpl?.channel || 'SMS',
      };
      const dt = computeNotificationDateTime((event as any)?.date, payload.days_from_wedding, '11:00');
      if (dt) payload.notification_date = dt.toISOString();

      let { data, error } = await supabase.from('notification_settings').insert(payload).select().single();
      if (error && isMissingColumn(error, 'channel')) {
        delete payload.channel;
        const retry = await supabase.from('notification_settings').insert(payload).select().single();
        data = retry.data as any;
        error = retry.error as any;
      }
      if (error && isMissingColumn(error, 'notification_date')) {
        delete payload.notification_date;
        const retry = await supabase.from('notification_settings').insert(payload).select().single();
        data = retry.data as any;
        error = retry.error as any;
      }
      if (error) throw error;

      setNotificationSettings((prev) =>
        prev.map((r) => (r.notification_type === row.notification_type ? { ...(r as any), ...(data as any) } : r))
      );
    } catch (e) {
      console.error('Error toggling notification (couple web):', e);
      setNotificationSettings((prev) =>
        prev.map((r) => (r.notification_type === row.notification_type ? { ...r, enabled: row.enabled } : r))
      );
    }
  };

  const insertVariable = (token: string) => {
    if (!editDraft) return;
    setEditDraft((d) => (d ? { ...d, message: `${d.message}${d.message ? ' ' : ''}${token}` } : d));
  };

  const openRecipientsPicker = (row: NotificationSettingRow) => {
    const nt = String(row.notification_type || '').trim();
    const shouldAutoPending = nt === 'reminder_2';
    const ids = Array.isArray((row as any).recipient_guest_ids)
      ? ((row as any).recipient_guest_ids as any[]).map((x) => String(x))
      : [];
    setPickerTargetType(nt);
    setPickerSelectedIds(new Set(ids));
    setPickerSearch('');
    setPickerFilter(shouldAutoPending ? 'pending' : 'all');
    setPickerOpen(true);
  };

  const pickerFilteredGuests = useMemo(() => {
    const q = String(pickerSearch || '').trim().toLowerCase();
    const base = Array.isArray(allGuests) ? allGuests : [];
    let out = base;
    if (pickerFilter !== 'all') {
      const status = (g: { status: string }) => String(g.status || '').trim();
      if (pickerFilter === 'pending') out = out.filter((g) => status(g) === 'ממתין');
      if (pickerFilter === 'confirmed') out = out.filter((g) => status(g) === 'מגיע' || status(g) === 'אישר');
      if (pickerFilter === 'declined') out = out.filter((g) => status(g) === 'לא מגיע' || status(g) === 'לא מגיעים');
    }
    if (q) out = out.filter((g) => String(g.name || '').toLowerCase().includes(q) || String(g.phone || '').includes(q));
    return out;
  }, [allGuests, pickerFilter, pickerSearch]);

  const pickerToggleGuest = (guestId: string) => {
    const id = String(guestId || '').trim();
    if (!id) return;
    setPickerSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pickerSelectAllFiltered = () => {
    setPickerSelectedIds((prev) => {
      const next = new Set(prev);
      for (const g of pickerFilteredGuests) next.add(String(g.id));
      return next;
    });
  };

  const pickerClear = () => setPickerSelectedIds(new Set());

  const saveDraft = async (opts?: { recipientGuestIds?: string[]; closeOnSuccess?: boolean; toastOnSuccess?: boolean }) => {
    if (!event?.id || !editorRow || !editDraft) return;
    setSaving(true);
    try {
      const payload: any = {
        title: getDisplayTitle(editorRow),
        message_content: editDraft.message,
        days_from_wedding: editDraft.days,
      };
      if (opts?.recipientGuestIds) payload.recipient_guest_ids = opts.recipientGuestIds;
      const dt = computeNotificationDateTime((event as any)?.date, editDraft.days, editDraft.timeHm);
      if (!dt) {
        alert('יש להזין שעה תקינה (למשל 10:30)');
        return;
      }
      payload.notification_date = dt.toISOString();

      if (editorRow.id) {
        let { error } = await supabase.from('notification_settings').update(payload).eq('id', editorRow.id);
        if (error && isMissingColumn(error, 'notification_date')) {
          delete payload.notification_date;
          const retry = await supabase.from('notification_settings').update(payload).eq('id', editorRow.id);
          error = retry.error as any;
        }
        if (error && isMissingColumn(error, 'recipient_guest_ids')) {
          delete payload.recipient_guest_ids;
          const retry = await supabase.from('notification_settings').update(payload).eq('id', editorRow.id);
          error = retry.error as any;
        }
        if (error) throw error;
        setNotificationSettings((p) =>
          p.map((r) => (r.notification_type === editorRow.notification_type ? { ...r, ...payload } : r))
        );
        if (opts?.toastOnSuccess) showToast('השינויים נשמרו');
        if (opts?.closeOnSuccess) closeEditor();
        return;
      }

      const tpl = NOTIFICATION_TEMPLATES.find((t) => t.notification_type === editorRow.notification_type);
      const insertPayload: any = {
        event_id: event.id,
        notification_type: editorRow.notification_type,
        title: getDisplayTitle(editorRow),
        enabled: editorRow.enabled ?? false,
        message_content: editDraft.message || tpl?.defaultMessage || getDefaultMessageContent(ownerTitle),
        days_from_wedding: editDraft.days,
        channel: (editorRow.channel as any) || tpl?.channel || 'SMS',
      };
      if (opts?.recipientGuestIds) insertPayload.recipient_guest_ids = opts.recipientGuestIds;
      insertPayload.notification_date = payload.notification_date;

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
      if (error) throw error;
      setNotificationSettings((p) =>
        p.map((r) => (r.notification_type === editorRow.notification_type ? { ...(r as any), ...(data as any) } : r))
      );
      if (opts?.toastOnSuccess) showToast('השינויים נשמרו');
      if (opts?.closeOnSuccess) closeEditor();
    } catch (e) {
      console.error('Error saving notification draft (couple web):', e);
    } finally {
      setSaving(false);
    }
  };

  const saveRecipientsForNotificationType = async (notificationType: string, guestIds: string[]) => {
    if (!event?.id) return;
    const nt = String(notificationType || '').trim();
    if (!nt) return;
    const ids = Array.isArray(guestIds) ? guestIds.map(String).map((s) => s.trim()).filter(Boolean) : [];

    const row = notificationSettings.find((r) => r.notification_type === nt) || null;
    if (!row) return;

    // Update local state immediately
    setNotificationSettings((prev) =>
      prev.map((r) => (r.notification_type === nt ? ({ ...(r as any), recipient_guest_ids: ids } as any) : r))
    );

    // Persist to DB (upsert)
    try {
      if (row.id) {
        const updatePayload: any = { recipient_guest_ids: ids };
        let { error } = await supabase.from('notification_settings').update(updatePayload).eq('id', row.id);
        if (error && isMissingColumn(error, 'recipient_guest_ids')) {
          // environment without migration
          throw error;
        }
        if (error) throw error;
        return;
      }

      const tpl = NOTIFICATION_TEMPLATES.find((t) => t.notification_type === row.notification_type);
      const insertPayload: any = {
        event_id: event.id,
        notification_type: row.notification_type,
        title: getDisplayTitle(row),
        enabled: Boolean(row.enabled ?? false),
        message_content: String(row.message_content || '').trim() || tpl?.defaultMessage || getDefaultMessageContent(ownerTitle),
        days_from_wedding: typeof row.days_from_wedding === 'number' ? row.days_from_wedding : tpl?.days_from_wedding ?? -30,
        channel: (row.channel as any) || tpl?.channel || 'SMS',
        recipient_guest_ids: ids,
      };
      const dt = computeNotificationDateTime((event as any)?.date, insertPayload.days_from_wedding, '11:00');
      if (dt) insertPayload.notification_date = dt.toISOString();

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
      if (error) throw error;

      setNotificationSettings((p) =>
        p.map((r) => (r.notification_type === nt ? { ...(r as any), ...(data as any), recipient_guest_ids: ids } : r))
      );
    } catch (e) {
      console.error('Save recipients failed (couple web):', e);
      alert('לא ניתן לשמור רשימת מוזמנים (בדוק שהרצת את המיגרציה)');
    }
  };

  const sendNow = async () => {
    if (!event?.id || !editorRow || !editDraft) return;
    if (sendingNow) return;
    if (!editDraft.message.trim()) {
      alert('יש למלא תוכן הודעה');
      return;
    }

    setSendingNow(true);
    try {
      const nt = String(editorRow.notification_type || '').trim();
      const channel = String((editorRow as any)?.channel || 'SMS').toUpperCase();
      if (channel === 'WHATSAPP') {
        alert('שליחת WhatsApp עדיין לא זמינה מהמסך הזה.');
        return;
      }
      const shouldAutoPending = nt === 'reminder_2';
      const isRequiredList = nt === 'reminder_1';
      const ids = Array.isArray((editorRow as any).recipient_guest_ids)
        ? ((editorRow as any).recipient_guest_ids as any[]).map((x) => String(x))
        : [];

      if (isRequiredList && ids.length === 0) {
        alert('להודעה הראשונה צריך לבחור מוזמנים (לחץ "הוסף מוזמנים")');
        return;
      }
      // Optional: if selected, limit sending to that list.
      if (ids.length > 0) await saveDraft({ recipientGuestIds: ids });
      else await saveDraft();

      const sessionRes = await supabase.auth.getSession();
      const accessToken = sessionRes.data.session?.access_token;
      if (!accessToken) throw new Error('לא נמצא חיבור משתמש (נא להתחבר מחדש)');

      const origin = typeof window !== 'undefined' ? String(window.location.origin) : '';
      const baseUrl =
        origin && !origin.includes('localhost') && !origin.includes('127.0.0.1') ? origin : undefined;

      const { data, error } = await supabase.functions.invoke('send-invitation-sms', {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: {
          eventId: event.id,
          guestIds: ids.length > 0 ? ids : undefined,
          filterStatus: shouldAutoPending ? 'pending' : 'all',
          messageTemplate: editDraft.message,
          baseUrl,
        },
      });
      if (error) throw error;
      const result = (data as any)?.result;
      alert(`נשלחו ${Number(result?.sent) || 0} · נכשלו ${Number(result?.failed) || 0}`);
    } catch (e: any) {
      console.error('Send SMS now failed (couple web):', e);
      let details = '';
      try {
        const ctx = e?.context;
        if (ctx && typeof ctx.text === 'function') {
          details = await ctx.text();
        }
      } catch {
        // ignore
      }
      const message = String(e?.message || e?.name || 'שגיאה לא ידועה');
      alert(`לא ניתן לשלוח.\n\n${message}${details ? `\n\nפרטים:\n${details}` : ''}`);
    } finally {
      setSendingNow(false);
    }
  };

  const scheduledSendDateTime = useMemo(() => {
    if (!event) return null;
    const dt = computeNotificationDateTime((event as any)?.date, Number(editDraft?.days ?? 0) || 0, String(editDraft?.timeHm || '11:00'));
    return dt;
  }, [editDraft?.days, editDraft?.timeHm, event]);

  const calendarSelected = useMemo(() => {
    const d = scheduledSendDateTime;
    if (!d || !Number.isFinite(d.getTime())) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  }, [scheduledSendDateTime]);

  const calendarGrid = useMemo(() => {
    const base = calendarMonth instanceof Date ? calendarMonth : new Date();
    const y = base.getFullYear();
    const m = base.getMonth();
    const first = new Date(y, m, 1);
    const firstDow = first.getDay(); // 0=Sun
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    const cells: Array<{ day: number | null; date: Date | null }> = [];
    for (let i = 0; i < firstDow; i++) cells.push({ day: null, date: null });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, date: new Date(y, m, d, 0, 0, 0, 0) });
    while (cells.length % 7 !== 0) cells.push({ day: null, date: null });

    return { y, m, cells };
  }, [calendarMonth]);

  const openDateDialog = useCallback(() => {
    const seed = calendarSelected ?? scheduledSendDateTime ?? new Date(String((event as any)?.date ?? ''));
    const base = Number.isFinite(seed.getTime()) ? seed : new Date();
    setCalendarMonth(new Date(base.getFullYear(), base.getMonth(), 1));
    setDateDialogOpen(true);
  }, [calendarSelected, event, scheduledSendDateTime]);

  const openTimeDialog = useCallback(() => {
    const hm = parseTimeHm(String(editDraft?.timeHm ?? '11:00')) ?? { h: 11, m: 0 };
    setTimeDraft({ h: hm.h, m: hm.m });
    setTimeDialogOpen(true);
  }, [editDraft?.timeHm]);



  if (loading) {
    return (
      <View style={styles.page}>
        <View style={[styles.bg, { backgroundColor: ui.bgLight }]} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={ui.primary} />
          <Text style={styles.centerText}>טוען...</Text>
        </View>
      </View>
    );
  }

  if (!resolvedEventId || !event) {
    return (
      <View style={styles.page}>
        <View style={[styles.bg, { backgroundColor: ui.bgLight }]} />
        <View style={styles.center}>
          <Text style={styles.centerText}>לא נמצא אירוע.</Text>
          <Pressable onPress={() => router.back()} style={styles.backInline}>
            <Ionicons name="arrow-forward" size={18} color={ui.primary} />
            <Text style={[styles.backInlineText, { color: ui.primary }]}>חזרה</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!settingsSupported) {
    return (
      <View style={styles.page}>
        <View style={[styles.bg, { backgroundColor: ui.bgLight }]} />
        <View style={styles.center}>
          <Text style={styles.centerText}>הגדרות הודעות לא זמינות (אין טבלה notification_settings).</Text>
          <Pressable onPress={() => router.back()} style={styles.backInline}>
            <Ionicons name="arrow-forward" size={18} color={ui.primary} />
            <Text style={[styles.backInlineText, { color: ui.primary }]}>חזרה</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <View style={[styles.bg, { backgroundColor: ui.bgLight }]} />

      <View style={styles.body}>
        {/* תוכן מרכזי */}
        <ScrollView style={styles.mainCol} contentContainerStyle={styles.mainColContent} showsVerticalScrollIndicator={false}>
          {/* Timeline */}
          <View style={styles.timelineCard}>
            <View style={styles.timelineHeaderRow}>
              <View style={{ width: 180 }} />
              <View style={styles.timelineHeaderCenter}>
                <Text style={styles.timelineHeaderTitle}>הודעות אוטומטיות</Text>
              </View>
              <View style={styles.timelineHeaderLeft}>
                <Pressable onPress={() => router.back()} style={styles.backSmall} accessibilityRole="button" accessibilityLabel="חזרה">
                  <Ionicons name="arrow-forward" size={18} color="#4b5563" />
                </Pressable>
              </View>
            </View>
            <View style={styles.timelineRow}>
              {timelineRows.map((row, idx) => {
                const active = row.notification_type === selectedType;
                const abs = Math.abs(row.days_from_wedding);
                const label =
                  row.days_from_wedding === 0 ? 'יום האירוע' : row.days_from_wedding < 0 ? `לפני ${abs} יום` : `אחרי ${abs} יום`;
                const sendAt = (() => {
                  const raw = (row as any)?.notification_date;
                  const d = raw ? new Date(String(raw)) : null;
                  if (d && Number.isFinite(d.getTime())) return d;
                  return computeNotificationDateTime((event as any)?.date, row.days_from_wedding ?? 0, '11:00');
                })();
                const dateLabel = formatHeDate(sendAt) || '—';
                const timeLabel = sendAt ? formatTime(sendAt) : '';

                return (
                  <React.Fragment key={row.notification_type}>
                    <Pressable onPress={() => setSelectedType(row.notification_type)} style={styles.timelineItem}>
                      <Text style={[styles.timelineLabel, active ? { color: ui.primary, fontWeight: '900' } : null]}>{label}</Text>
                      <View style={[styles.timelineDot, active ? { backgroundColor: ui.primary } : null]}>
                        {row.days_from_wedding === 0 ? <Ionicons name="calendar" size={20} color="#fff" /> : null}
                      </View>
                      {active ? <View style={[styles.timelineActiveLine, { backgroundColor: ui.primary }]} /> : null}
                      <Text style={[styles.timelineTitle, active ? { color: '#1f2937', fontWeight: '900' } : null]} numberOfLines={1}>
                        {getDisplayTitle(row)}
                      </Text>
                      <Text style={styles.timelineDate}>{dateLabel}</Text>
                      {timeLabel ? <Text style={styles.timelineTime}>{timeLabel}</Text> : null}
                    </Pressable>
                    {idx < timelineRows.length - 1 ? <View style={styles.timelineConnector} /> : null}
                  </React.Fragment>
                );
              })}
            </View>
          </View>

          {/* כרטיסי הודעות */}
          <View style={styles.cardsContainer}>
            <View style={styles.cardsRow}>
              {displayRows.map((row, idx) => {
                const selected = row.notification_type === selectedType;
                const number = String(idx + 1).padStart(2, '0');
                const lastRun =
                  row.id && (row.channel || 'SMS') === 'SMS' ? lastSmsRunBySettingId[String(row.id)] : undefined;
                const lastRunLabel = lastRun ? statusLabel(String(lastRun.status)) : null;
                const lastRunAt = lastRun?.claimed_at ? formatHeDateTimeShort(lastRun.claimed_at) : '';

                return (
                  <Pressable
                    key={row.notification_type}
                    onPress={() => setSelectedType(row.notification_type)}
                    style={({ hovered }: any) => [
                      styles.messageCard,
                      selected ? styles.messageCardSelected : null,
                      Platform.OS === 'web' && hovered && !selected ? styles.messageCardHover : null,
                    ]}
                  >
                    <View style={styles.cardTopRow}>
                      <Text style={styles.cardNumber}>{number}</Text>
                      <View style={[styles.cardIconWrap, selected ? { backgroundColor: ui.primary } : null]}>
                        <Ionicons name={iconForType(row) as any} size={20} color={selected ? '#fff' : ui.primary} />
                      </View>
                    </View>

                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {getDisplayTitle(row)}
                    </Text>

                    <View style={styles.cardMetaRow}>
                      <Ionicons name="time-outline" size={14} color="#9ca3af" />
                      <Text style={styles.cardMetaText}>{formatOffsetLabel(row.days_from_wedding)}</Text>
                      <Ionicons
                        name="information-circle-outline"
                        size={14}
                        color="#d1d5db"
                        style={Platform.OS === 'web' ? ({ marginInlineStart: 'auto' } as any) : ({ marginRight: 'auto' } as any)}
                      />
                    </View>

                    {(row.channel || 'SMS') === 'SMS' ? (
                      <Pressable
                        onPress={(e: any) => {
                          e?.stopPropagation?.();
                          e?.preventDefault?.();
                          void openSendStatus(row);
                        }}
                        style={({ pressed }: any) => [styles.sendStatusPill, pressed ? { opacity: 0.9 } : null]}
                      >
                        <Ionicons name="checkmark-done-outline" size={14} color={lastRunLabel?.color || 'rgba(100,116,139,1)'} />
                        <Text style={[styles.sendStatusText, { color: lastRunLabel?.color || 'rgba(100,116,139,1)' }]} numberOfLines={1}>
                          {lastRunLabel ? `${lastRunLabel.text}${lastRunAt ? ` · ${lastRunAt}` : ''}` : 'סטטוס: לא נשלח עדיין'}
                        </Text>
                      </Pressable>
                    ) : null}

                  {row.notification_type === 'reminder_1' || row.notification_type === 'reminder_2' ? (
                    <>
                      <View style={styles.cardInlineRow}>
                        <View style={styles.cardInlineMeta}>
                          <Ionicons name="people-outline" size={14} color="rgba(2,6,23,0.55)" />
                          <Text style={styles.cardInlineMetaText}>
                            {(() => {
                              const nt = String(row.notification_type || '').trim();
                              const ids = Array.isArray((row as any).recipient_guest_ids) ? (row as any).recipient_guest_ids : [];
                              if (nt === 'reminder_2' && ids.length === 0) return 'כל הממתינים';
                              return `${ids.length} מוזמנים${nt === 'reminder_1' ? '' : ' (אופציונלי)'}`;
                            })()}
                          </Text>
                        </View>
                      </View>

                      {row.notification_type === 'reminder_2' ? (
                        <View style={styles.cardAutoNote}>
                          <Ionicons name="time-outline" size={14} color="rgba(2,6,23,0.55)" />
                          <Text style={styles.cardAutoNoteText}>נשלח אוטומטית רק לממתינים (אפשר להגביל לרשימה)</Text>
                        </View>
                      ) : null}
                    </>
                  ) : null}

                    <View style={styles.cardBottomRow}>
                      <Pressable
                        onPress={(e: any) => {
                          e?.stopPropagation?.();
                          e?.preventDefault?.();
                          void toggleNotification(row);
                        }}
                        accessibilityRole="switch"
                        accessibilityState={{ checked: !!row.enabled }}
                        style={({ pressed }: any) => [styles.toggleBtn, pressed ? { opacity: 0.92 } : null]}
                      >
                        <View style={[styles.toggleTrack, row.enabled ? styles.toggleTrackOn : styles.toggleTrackOff]}>
                          <View style={[styles.toggleThumb, row.enabled ? styles.toggleThumbOn : styles.toggleThumbOff]} />
                        </View>
                        <Text style={[styles.toggleLabel, row.enabled ? styles.toggleLabelOn : styles.toggleLabelOff]}>
                          {row.enabled ? 'פעילה' : 'כבויה'}
                        </Text>
                      </Pressable>

                    <Pressable
                      onPress={(e: any) => {
                        e?.stopPropagation?.();
                        e?.preventDefault?.();
                        openEditor(row);
                      }}
                      style={({ pressed }: any) => [styles.editBtn, pressed ? { opacity: 0.9 } : null]}
                    >
                      <Ionicons name="create-outline" size={16} color={ui.primary} />
                      <Text style={[styles.editBtnText, { color: ui.primary }]}>ערוך</Text>
                    </Pressable>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </ScrollView>
      </View>

      {editorOpen && editorRow ? (
        <View style={styles.editorOverlay}>
          <Pressable style={styles.pickerBackdrop} onPress={closeEditor} />
          <View style={styles.editorCard}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>{`עריכת ${getDisplayTitle(editorRow)}`}</Text>
              <Pressable onPress={closeEditor} style={({ pressed }: any) => [styles.pickerClose, pressed ? { opacity: 0.9 } : null]}>
                <Ionicons name="close" size={18} color="#111827" />
              </Pressable>
            </View>

            <ScrollView style={styles.editorBody} contentContainerStyle={styles.editorBodyContent} showsVerticalScrollIndicator={false}>
              <View style={styles.editorSection}>
                <View style={styles.editorSectionHeader}>
                  <Ionicons name="time-outline" size={16} color="rgba(79,70,229,1)" />
                  <Text style={styles.editorSectionTitle}>תזמון</Text>
                </View>

                <View style={styles.timingRow}>
                  <View style={styles.dateInlineCol}>
                    <Pressable onPress={openDateDialog} style={({ pressed }: any) => [styles.datePillInline, pressed ? { opacity: 0.95 } : null]}>
                      <View style={styles.datePillMeta}>
                        <Ionicons name="calendar-outline" size={14} color="rgba(79,70,229,1)" />
                        <Text style={styles.datePillLabel}>תאריך שליחה</Text>
                      </View>
                      <View style={styles.dateValueChip}>
                        <Text style={styles.dateValueChipText}>
                          {scheduledSendDateTime ? formatDmyFromYmd(toLocalYmd(scheduledSendDateTime) || '') : 'בחר תאריך'}
                        </Text>
                      </View>
                    </Pressable>

                    <Text style={styles.scheduledHintText}>{formatOffsetLabel(Number(editDraft?.days ?? 0) || 0)}</Text>
                  </View>

                  <Pressable onPress={openTimeDialog} style={({ pressed }: any) => [styles.timePillInline, pressed ? { opacity: 0.95 } : null]}>
                    <View style={styles.datePillMeta}>
                      <Ionicons name="alarm-outline" size={14} color="rgba(79,70,229,1)" />
                      <Text style={styles.datePillLabel}>שעה</Text>
                    </View>
                    <View style={styles.timeValueChip}>
                      <Text style={styles.timeValueInput}>{editDraft?.timeHm ?? '11:00'}</Text>
                    </View>
                  </Pressable>
                </View>
              </View>

              <View style={styles.editorSection}>
                <View style={styles.editorSectionHeader}>
                  <Ionicons name="pricetag-outline" size={16} color="rgba(79,70,229,1)" />
                  <Text style={styles.editorSectionTitle}>משתנים</Text>
                </View>
                <Text style={styles.editorSectionHint}>הוספת משתנים תחליף אותם אוטומטית בזמן שליחה.</Text>

                <View style={styles.chips}>
                  <Pressable onPress={() => insertVariable('{שם_פרטי}')} style={({ pressed }: any) => [styles.chip, pressed ? { opacity: 0.85 } : null]}>
                    <Text style={[styles.chipText, { color: ui.primary }]}>{'{שם_פרטי}'}</Text>
                  </Pressable>
                  <Pressable onPress={() => insertVariable('{שם_אירוע}')} style={({ pressed }: any) => [styles.chip, pressed ? { opacity: 0.85 } : null]}>
                    <Text style={[styles.chipText, { color: ui.primary }]}>{'{שם_אירוע}'}</Text>
                  </Pressable>
                  {groomName ? (
                    <Pressable onPress={() => insertVariable('{שם_חתן}')} style={({ pressed }: any) => [styles.chip, pressed ? { opacity: 0.85 } : null]}>
                      <Text style={[styles.chipText, { color: ui.primary }]}>{'{שם_חתן}'}</Text>
                    </Pressable>
                  ) : null}
                  {brideName ? (
                    <Pressable onPress={() => insertVariable('{שם_כלה}')} style={({ pressed }: any) => [styles.chip, pressed ? { opacity: 0.85 } : null]}>
                      <Text style={[styles.chipText, { color: ui.primary }]}>{'{שם_כלה}'}</Text>
                    </Pressable>
                  ) : null}
                  {coupleNames ? (
                    <Pressable onPress={() => insertVariable('{שמות_חתן_כלה}')} style={({ pressed }: any) => [styles.chip, pressed ? { opacity: 0.85 } : null]}>
                      <Text style={[styles.chipText, { color: ui.primary }]}>{'{שמות_חתן_כלה}'}</Text>
                    </Pressable>
                  ) : null}
                  <Pressable onPress={() => insertVariable('{תאריך}')} style={({ pressed }: any) => [styles.chip, pressed ? { opacity: 0.85 } : null]}>
                    <Text style={[styles.chipText, { color: ui.primary }]}>{'{תאריך}'}</Text>
                  </Pressable>
                  <Pressable onPress={() => insertVariable('{מיקום}')} style={({ pressed }: any) => [styles.chip, pressed ? { opacity: 0.85 } : null]}>
                    <Text style={[styles.chipText, { color: ui.primary }]}>{'{מיקום}'}</Text>
                  </Pressable>
                  <Pressable onPress={() => insertVariable('{name}')} style={({ pressed }: any) => [styles.chip, pressed ? { opacity: 0.85 } : null]}>
                    <Text style={[styles.chipText, { color: ui.primary }]}>{'{name}'}</Text>
                  </Pressable>
                  <Pressable onPress={() => insertVariable('{link}')} style={({ pressed }: any) => [styles.chip, pressed ? { opacity: 0.85 } : null]}>
                    <Text style={[styles.chipText, { color: ui.primary }]}>{'{link}'}</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.editorSection}>
                <View style={styles.editorSectionHeader}>
                  <Ionicons name="chatbox-ellipses-outline" size={16} color="rgba(79,70,229,1)" />
                  <Text style={styles.editorSectionTitle}>תוכן ההודעה</Text>
                </View>
                <View style={styles.textareaWrap}>
                  <TextInput
                    value={editDraft?.message ?? ''}
                    onChangeText={(t) => setEditDraft((d) => (d ? { ...d, message: normalizeTemplateToSingleBraces(t) } : d))}
                    multiline
                    textAlignVertical="top"
                    style={styles.textarea}
                    placeholder="כתוב הודעה..."
                    placeholderTextColor="rgba(100,116,139,0.6)"
                  />
                  <Text style={styles.charCount}>{(editDraft?.message ?? '').length}/160 תווים</Text>
                </View>
              </View>

              {editorRow.notification_type === 'reminder_1' || editorRow.notification_type === 'reminder_2' ? (
                <View style={styles.editorSection}>
                  <View style={styles.editorSectionHeader}>
                    <Ionicons name="people-outline" size={16} color="rgba(79,70,229,1)" />
                    <Text style={styles.editorSectionTitle}>מוזמנים</Text>
                  </View>

                  {(() => {
                    const ids = Array.isArray((editorRow as any).recipient_guest_ids)
                      ? ((editorRow as any).recipient_guest_ids as any[]).map((x) => String(x))
                      : [];
                    const nt = String(editorRow.notification_type || '').trim();
                    const isAutoPending = nt === 'reminder_2';
                    const isRequired = nt === 'reminder_1';
                    const emptyMeansAllPending = isAutoPending && ids.length === 0;
                    const countLabel = emptyMeansAllPending ? 'כל הממתינים' : `${ids.length} נבחרו`;

                    return (
                      <View
                        style={[
                          styles.recipientsCard,
                          isRequired && ids.length === 0 ? styles.recipientsCardDanger : null,
                        ]}
                      >
                        <View style={styles.recipientsTopRow}>
                          <View style={styles.recipientsMetaLeft}>
                            <View style={styles.recipientsCountPill}>
                              <Text style={styles.recipientsCountText}>{countLabel}</Text>
                            </View>

                            <Pressable
                              onPress={() => openRecipientsPreview(editorRow)}
                              style={({ pressed }: any) => [styles.recipientsEyeBtn, pressed ? { opacity: 0.92 } : null]}
                              accessibilityRole="button"
                              accessibilityLabel="צפייה במוזמנים שנבחרו"
                            >
                              <Ionicons name="eye-outline" size={16} color={ui.primary} />
                              <Text style={styles.recipientsEyeText}>צפייה</Text>
                            </Pressable>
                          </View>

                          <Pressable
                            onPress={() => openRecipientsPicker(editorRow)}
                            style={({ pressed }: any) => [styles.recipientsPrimaryBtn, pressed ? { opacity: 0.92 } : null]}
                          >
                            <Ionicons name="person-add-outline" size={16} color="#fff" />
                            <Text style={styles.recipientsPrimaryBtnText}>
                              {isRequired ? 'הוסף מוזמנים' : 'בחר מוזמנים'}
                            </Text>
                          </Pressable>
                        </View>

                        {emptyMeansAllPending ? (
                          <Text style={styles.recipientsHint}>
                            אם לא תבחר רשימה — ההודעה תישלח אוטומטית לכל המוזמנים במצב <Text style={styles.recipientsHintEm}>ממתין</Text>.
                          </Text>
                        ) : null}

                        {isRequired && ids.length === 0 ? (
                          <Text style={styles.recipientsDangerText}>להודעה הראשונה חובה לבחור מוזמנים.</Text>
                        ) : null}
                      </View>
                    );
                  })()}
                </View>
              ) : null}

              <View style={styles.editorSection}>
                <View style={styles.editorSectionHeader}>
                  <Ionicons name="phone-portrait-outline" size={16} color="rgba(79,70,229,1)" />
                  <Text style={styles.editorSectionTitle}>תצוגה מקדימה</Text>
                </View>
                <View style={styles.previewBlock}>
                <View style={styles.phoneFrame}>
                  <View style={styles.phoneNotch} />
                  <View style={styles.phoneScreen}>
                    <Text style={styles.phoneTime}>09:41</Text>
                    <View style={styles.phoneStatusLeft}>
                      <View style={styles.phoneStatusDot} />
                      <View style={styles.phoneStatusDot} />
                    </View>
                    <View style={styles.phoneHeader}>
                      <View style={styles.phoneAvatar} />
                      <Text style={styles.phoneHeaderTitle} numberOfLines={1}>
                        {ownerTitle || 'אירוע'}
                      </Text>
                    </View>
                    <View style={styles.bubble}>
                      <Text style={styles.bubbleText}>
                        {renderPreviewText(editDraft?.message || getDefaultMessageContent(ownerTitle)).replace(/\n/g, '\n')}
                      </Text>
                      <Text style={styles.bubbleTime}>09:42 PM</Text>
                    </View>
                    <View style={styles.datePill}>
                      <Text style={styles.datePillText}>היום</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.demoCard}>
                  <View style={styles.demoIconWrap}>
                    <Ionicons name="globe-outline" size={18} color={ui.primary} />
                  </View>
                  <View style={styles.demoTextWrap}>
                    <Text style={styles.demoTitle}>לצפייה בדמו של דף ההזמנה</Text>
                    <Text style={styles.demoSub} numberOfLines={2}>
                      {demoInvitation.guestName
                        ? `ייפתח לפי הקוד של ${demoInvitation.guestName}.`
                        : 'ייפתח הדמו לפי אחד המוזמנים באירוע.'}
                    </Text>
                  </View>
                  <Pressable
                    onPress={openDemoUrl}
                    disabled={!demoUrl}
                    style={({ pressed }: any) => [
                      styles.demoBtn,
                      !demoUrl ? styles.demoBtnDisabled : null,
                      pressed && demoUrl ? { opacity: 0.92 } : null,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="לצפייה בדמו"
                  >
                    <Ionicons name="open-outline" size={16} color="#fff" />
                    <Text style={styles.demoBtnText}>לצפייה בדמו</Text>
                  </Pressable>
                </View>
              </View>
              </View>
            </ScrollView>

            <View style={styles.editorFooter}>
              <Pressable
                onPress={() => void saveDraft({ closeOnSuccess: true, toastOnSuccess: true })}
                disabled={saving || !editDraft}
                style={({ pressed }: any) => [styles.saveBtn, saving || !editDraft ? styles.saveBtnDisabled : null, pressed ? { opacity: 0.92 } : null]}
              >
                <Text style={styles.saveBtnText}>{saving ? 'שומר...' : 'שמור שינויים'}</Text>
              </Pressable>
              <Pressable
                onPress={() => void sendNow()}
                disabled={sendingNow || !editDraft}
                style={({ pressed }: any) => [styles.sendNowBtn, sendingNow || !editDraft ? styles.sendNowBtnDisabled : null, pressed ? { opacity: 0.92 } : null]}
              >
                <Ionicons name="paper-plane-outline" size={16} color="#fff" />
                <Text style={styles.sendNowBtnText}>{sendingNow ? 'שולח...' : 'שלח עכשיו'}</Text>
              </Pressable>
            </View>
          </View>

          {dateDialogOpen ? (
            <View style={styles.dialogOverlay}>
              <Pressable style={styles.pickerBackdrop} onPress={() => setDateDialogOpen(false)} />
              <View style={styles.dialogCard}>
                <View style={styles.dialogHeader}>
                  <Text style={styles.dialogTitle}>בחירת תאריך</Text>
                  <Pressable onPress={() => setDateDialogOpen(false)} style={styles.dialogClose}>
                    <Ionicons name="close" size={18} color="#111827" />
                  </Pressable>
                </View>

                <View style={styles.calendarHeaderRow}>
                  <Pressable onPress={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))} style={styles.navBtn}>
                    <Ionicons name="chevron-forward" size={18} color="#111827" />
                  </Pressable>
                  <Text style={styles.calendarMonthText}>
                    {new Date(calendarGrid.y, calendarGrid.m, 1).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })}
                  </Text>
                  <Pressable onPress={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))} style={styles.navBtn}>
                    <Ionicons name="chevron-back" size={18} color="#111827" />
                  </Pressable>
                </View>

                <View style={styles.calendarDowRow}>
                  {['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'].map((w) => (
                    <Text key={w} style={styles.dowText}>
                      {w}
                    </Text>
                  ))}
                </View>

                <View style={styles.calendarGrid}>
                  {calendarGrid.cells.map((c, idx) => {
                    const isSelected =
                      c.date &&
                      calendarSelected &&
                      c.date.getFullYear() === calendarSelected.getFullYear() &&
                      c.date.getMonth() === calendarSelected.getMonth() &&
                      c.date.getDate() === calendarSelected.getDate();

                    return (
                      <Pressable
                        key={idx}
                        disabled={!c.date}
                        onPress={() => {
                          const ev = new Date(String((event as any)?.date ?? ''));
                          if (!Number.isFinite(ev.getTime()) || !c.date) return;
                          const days = diffDaysLocal(c.date, ev);
                          setEditDraft((d) => (d ? { ...d, days } : d));
                          setDateDialogOpen(false);
                        }}
                        style={({ pressed }: any) => [
                          styles.dayCell,
                          isSelected ? styles.dayCellSelected : null,
                          pressed && c.date ? { opacity: 0.9 } : null,
                        ]}
                      >
                        <Text style={[styles.dayText, isSelected ? styles.dayTextSelected : null]}>{c.day ?? ''}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>
          ) : null}

          {timeDialogOpen ? (
            <View style={styles.dialogOverlay}>
              <Pressable style={styles.pickerBackdrop} onPress={() => setTimeDialogOpen(false)} />
              <View style={styles.dialogCard}>
                <View style={styles.dialogHeader}>
                  <Text style={styles.dialogTitle}>בחירת שעה</Text>
                  <Pressable onPress={() => setTimeDialogOpen(false)} style={styles.dialogClose}>
                    <Ionicons name="close" size={18} color="#111827" />
                  </Pressable>
                </View>

                <View style={styles.timePickRow}>
                  <View style={styles.wheelGroup}>
                    <Text style={styles.wheelLabel}>דקות</Text>
                    <ScrollView style={styles.wheelCol} contentContainerStyle={styles.wheelColContent} showsVerticalScrollIndicator={false}>
                      {Array.from({ length: 60 }).map((_, m) => {
                        const label = String(m).padStart(2, '0');
                        const active = timeDraft.m === m;
                        return (
                          <Pressable
                            key={m}
                            onPress={() => setTimeDraft((p) => ({ ...p, m }))}
                            style={({ pressed }: any) => [styles.wheelItem, active ? styles.wheelItemActive : null, pressed ? { opacity: 0.9 } : null]}
                          >
                            <Text style={[styles.wheelText, active ? styles.wheelTextActive : null]}>{label}</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>

                  <Text style={styles.timeSep}>:</Text>

                  <View style={styles.wheelGroup}>
                    <Text style={styles.wheelLabel}>שעות</Text>
                    <ScrollView style={styles.wheelCol} contentContainerStyle={styles.wheelColContent} showsVerticalScrollIndicator={false}>
                      {Array.from({ length: 24 }).map((_, h) => {
                        const label = String(h).padStart(2, '0');
                        const active = timeDraft.h === h;
                        return (
                          <Pressable
                            key={h}
                            onPress={() => setTimeDraft((p) => ({ ...p, h }))}
                            style={({ pressed }: any) => [styles.wheelItem, active ? styles.wheelItemActive : null, pressed ? { opacity: 0.9 } : null]}
                          >
                            <Text style={[styles.wheelText, active ? styles.wheelTextActive : null]}>{label}</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                </View>

                <View style={styles.dialogActions}>
                  <Pressable onPress={() => setTimeDialogOpen(false)} style={[styles.dialogBtn, styles.dialogBtnGhost]}>
                    <Text style={styles.dialogBtnGhostText}>ביטול</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      const hh = String(timeDraft.h).padStart(2, '0');
                      const mm = String(timeDraft.m).padStart(2, '0');
                      setEditDraft((d) => (d ? { ...d, timeHm: `${hh}:${mm}` } : d));
                      setTimeDialogOpen(false);
                    }}
                    style={[styles.dialogBtn, styles.dialogBtnPrimary]}
                  >
                    <Text style={styles.dialogBtnPrimaryText}>בחר</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      {recipientsPreviewOpen ? (
        <View style={styles.dialogOverlay}>
          <Pressable style={styles.pickerBackdrop} onPress={() => setRecipientsPreviewOpen(false)} />
          <View style={styles.dialogCard}>
            <View style={styles.dialogHeader}>
              <Text style={styles.dialogTitle}>{recipientsPreviewTitle}</Text>
              <Pressable onPress={() => setRecipientsPreviewOpen(false)} style={styles.dialogClose}>
                <Ionicons name="close" size={18} color="#111827" />
              </Pressable>
            </View>

            <View style={{ padding: 14, gap: 10 }}>
              {recipientsPreviewHint ? <Text style={styles.recipientsPreviewHint}>{recipientsPreviewHint}</Text> : null}

              <View style={styles.recipientsPreviewSearchRow}>
                <Ionicons name="search-outline" size={16} color="#64748B" />
                <TextInput
                  value={recipientsPreviewSearch}
                  onChangeText={setRecipientsPreviewSearch}
                  placeholder="חיפוש לפי שם או טלפון..."
                  placeholderTextColor="rgba(100,116,139,0.6)"
                  style={styles.recipientsPreviewSearchInput}
                />
              </View>

              {recipientsPreviewRows.length === 0 ? (
                <Text style={styles.recipientsPreviewEmpty}>לא נבחרו מוזמנים.</Text>
              ) : (
                <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ gap: 8, paddingBottom: 6 }}>
                  {recipientsPreviewRows
                    .filter((g) => {
                      const q = String(recipientsPreviewSearch || '').trim().toLowerCase();
                      if (!q) return true;
                      const name = String(g.name || '').toLowerCase();
                      const phone = String(g.phone || '').toLowerCase();
                      return name.includes(q) || phone.includes(q);
                    })
                    .map((g) => (
                    <View key={g.id} style={styles.recipientsPreviewRow}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.recipientsPreviewName} numberOfLines={1}>
                          {g.name || '—'}
                        </Text>
                        <Text style={styles.recipientsPreviewMeta} numberOfLines={1}>
                          {(g.status ? `${g.status} · ` : '') + (g.phone ? g.phone : 'אין טלפון')}
                        </Text>
                      </View>
                      <Ionicons name="person-circle-outline" size={22} color="rgba(79,70,229,0.65)" />
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>
        </View>
      ) : null}

      {sendStatusOpen ? (
        <View style={styles.dialogOverlay}>
          <Pressable style={styles.pickerBackdrop} onPress={() => setSendStatusOpen(false)} />
          <View style={styles.dialogCard}>
            <View style={styles.dialogHeader}>
              <Text style={styles.dialogTitle}>{sendStatusTitle}</Text>
              <Pressable onPress={() => setSendStatusOpen(false)} style={styles.dialogClose}>
                <Ionicons name="close" size={18} color="#111827" />
              </Pressable>
            </View>

            <View style={{ padding: 14, gap: 10 }}>
              {sendStatusRun ? (
                <Text style={styles.recipientsPreviewHint}>
                  {`ריצה אחרונה: ${formatHeDateTimeShort(sendStatusRun.claimed_at)} · ${statusLabel(sendStatusRun.status).text}`}
                </Text>
              ) : null}

              <View style={styles.recipientsPreviewSearchRow}>
                <Ionicons name="search-outline" size={16} color="#64748B" />
                <TextInput
                  value={sendStatusSearch}
                  onChangeText={setSendStatusSearch}
                  placeholder="חיפוש לפי שם או טלפון..."
                  placeholderTextColor="rgba(100,116,139,0.6)"
                  style={styles.recipientsPreviewSearchInput}
                />
              </View>

              {sendStatusLoading ? (
                <View style={{ paddingVertical: 18, alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator />
                </View>
              ) : sendStatusRows.length === 0 ? (
                <Text style={styles.recipientsPreviewEmpty}>אין נתונים להצגה.</Text>
              ) : (
                <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 8, paddingBottom: 6 }}>
                  {sendStatusRows
                    .filter((g) => {
                      const q = String(sendStatusSearch || '').trim().toLowerCase();
                      if (!q) return true;
                      const name = String(g.name || '').toLowerCase();
                      const phone = String(g.phone || '').toLowerCase();
                      return name.includes(q) || phone.includes(q);
                    })
                    .map((g) => {
                      const st = statusLabel(g.sendStatus);
                      return (
                        <View key={g.guestId} style={styles.sendStatusRow}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.recipientsPreviewName} numberOfLines={1}>
                              {g.name || '—'}
                            </Text>
                            <Text style={styles.sendStatusMeta} numberOfLines={2}>
                              {(g.guestStatus ? `${g.guestStatus} · ` : '') + (g.phone ? g.phone : 'אין טלפון')}
                              {g.sentAt ? ` · ${formatHeDateTimeShort(g.sentAt)}` : ''}
                              {g.error ? ` · ${g.error}` : ''}
                            </Text>
                          </View>
                          <View style={styles.sendStatusBadge}>
                            <Text style={[styles.sendStatusBadgeText, { color: st.color }]}>{st.text}</Text>
                          </View>
                        </View>
                      );
                    })}
                </ScrollView>
              )}
            </View>
          </View>
        </View>
      ) : null}

      {pickerOpen ? (
        <View style={styles.pickerOverlay}>
          <Pressable
            style={styles.pickerBackdrop}
            onPress={() => {
              setPickerOpen(false);
              setPickerTargetType(null);
            }}
          />
          <View style={styles.pickerCard}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>
                {`בחירת מוזמנים ל${getDisplayTitle(({ notification_type: pickerTargetType ?? 'reminder_1', title: '' } as any))}`}
              </Text>
              <Pressable
                onPress={() => {
                  setPickerOpen(false);
                  setPickerTargetType(null);
                }}
                style={({ pressed }: any) => [styles.pickerClose, pressed ? { opacity: 0.9 } : null]}
              >
                <Ionicons name="close" size={18} color="#111827" />
              </Pressable>
            </View>

            <View style={styles.pickerSearchRow}>
              <Ionicons name="search-outline" size={16} color="#64748B" />
              <TextInput
                value={pickerSearch}
                onChangeText={setPickerSearch}
                placeholder="חיפוש לפי שם או טלפון..."
                placeholderTextColor="rgba(100,116,139,0.6)"
                style={styles.pickerSearchInput}
              />
            </View>

            <View style={styles.pickerToolsRow}>
              <View style={styles.recipientsFiltersRow}>
                {(
                  [
                    { key: 'all' as const, label: 'הכל' },
                    { key: 'pending' as const, label: 'ממתינים' },
                    { key: 'confirmed' as const, label: 'מגיעים' },
                    { key: 'declined' as const, label: 'לא מגיעים' },
                  ] as const
                ).map((k) => (
                  <Pressable
                    key={k.key}
                    onPress={() => setPickerFilter(k.key)}
                    style={({ pressed }: any) => [
                      styles.recipientsPill,
                      pickerFilter === k.key ? styles.recipientsPillActive : null,
                      pressed ? { opacity: 0.9 } : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.recipientsPillText,
                        pickerFilter === k.key ? styles.recipientsPillTextActive : null,
                      ]}
                    >
                      {k.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={{ flex: 1 }} />

              <Pressable onPress={pickerSelectAllFiltered} style={({ pressed }: any) => [styles.recipientsActionBtn, pressed ? { opacity: 0.9 } : null]}>
                <Ionicons name="checkbox-outline" size={14} color="#111827" />
                <Text style={styles.recipientsActionText}>בחר הכל</Text>
              </Pressable>
              <Pressable onPress={pickerClear} style={({ pressed }: any) => [styles.recipientsActionBtn, pressed ? { opacity: 0.9 } : null]}>
                <Ionicons name="close-circle-outline" size={14} color="#111827" />
                <Text style={styles.recipientsActionText}>נקה</Text>
              </Pressable>
            </View>

            <View style={styles.pickerMetaRow}>
              <Text style={styles.pickerMetaText}>נבחרו: {pickerSelectedIds.size}</Text>
              <Text style={styles.pickerMetaText}>סה״כ בתצוגה: {pickerFilteredGuests.length}</Text>
            </View>

            <ScrollView style={styles.pickerList} contentContainerStyle={styles.pickerListContent} showsVerticalScrollIndicator={false}>
              {pickerFilteredGuests.map((g) => {
                const checked = pickerSelectedIds.has(String(g.id));
                return (
                  <Pressable
                    key={g.id}
                    onPress={() => pickerToggleGuest(g.id)}
                    style={({ pressed }: any) => [
                      styles.recipientRow,
                      checked ? styles.recipientRowActive : null,
                      pressed ? { opacity: 0.95 } : null,
                    ]}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.recipientName} numberOfLines={1}>
                        {g.name}
                      </Text>
                      <Text style={styles.recipientMeta} numberOfLines={1}>
                        {g.status}
                        {g.phone ? ` · ${g.phone}` : ' · אין טלפון'}
                      </Text>
                    </View>
                    <Ionicons name={checked ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={checked ? ui.primary : '#94A3B8'} />
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.pickerFooter}>
              <Pressable
                onPress={() => {
                  setPickerOpen(false);
                  setPickerTargetType(null);
                }}
                style={({ pressed }: any) => [styles.pickerBtnSecondary, pressed ? { opacity: 0.9 } : null]}
              >
                <Text style={styles.pickerBtnSecondaryText}>ביטול</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (pickerTargetType) {
                    void saveRecipientsForNotificationType(pickerTargetType, Array.from(pickerSelectedIds));
                  }
                  setPickerOpen(false);
                  setPickerTargetType(null);
                }}
                style={({ pressed }: any) => [styles.pickerBtnPrimary, pressed ? { opacity: 0.92 } : null]}
              >
                <Text style={styles.pickerBtnPrimaryText}>שמירה</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {toastText ? (
        <View pointerEvents="none" style={styles.toastWrap}>
          <View style={styles.toastCard}>
            <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
            <Text style={styles.toastText}>{toastText}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function subtitleFromEvent(event: Event | null) {
  if (!event) return 'האירוע שלך';
  const title = String((event as any)?.title || '').trim();
  return title || 'האירוע שלך';
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
    backgroundColor: 'transparent',
  },

  bg: {
    ...StyleSheet.absoluteFillObject,
  },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  centerText: { fontSize: 14, fontWeight: '900', color: 'rgba(100,116,139,1)', textAlign: 'center' },
  backInline: { marginTop: 12, flexDirection: 'row-reverse', gap: 8, alignItems: 'center', ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null) },
  backInlineText: { fontSize: 13, fontWeight: '900' },

  body: { flex: 1, minHeight: 0 },

  formBlock: { gap: 8 },
  timeBlock: { alignItems: 'flex-end', width: '100%' },
  label: { fontSize: 12, fontWeight: '900', color: '#374151', textAlign: 'right', textTransform: 'uppercase', letterSpacing: 0.5 },
  labelCenter: { fontSize: 12, fontWeight: '900', color: '#374151', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5 },

  editorSection: {
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(2,6,23,0.08)',
    padding: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  editorSectionHeader: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  editorSectionTitle: { fontSize: 13, fontWeight: '900', color: '#111827', textAlign: 'right' },
  editorSectionHint: { width: '100%', marginTop: -2, fontSize: 12, fontWeight: '800', color: 'rgba(2,6,23,0.55)', textAlign: 'right', lineHeight: 18 },

  timingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    gap: 10,
    flexWrap: 'wrap',
    ...(Platform.OS === 'web' ? ({ direction: 'ltr' } as any) : null),
  },
  dateInlineCol: { flexShrink: 1, gap: 8 },
  segmentWrap: {
    flexDirection: 'row-reverse',
    padding: 4,
    borderRadius: 14,
    backgroundColor: 'rgba(79,70,229,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(79,70,229,0.18)',
    gap: 4,
    minWidth: 200,
  },
  segmentBtn: { flex: 1, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  segmentBtnActive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(2,6,23,0.08)',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 10px 20px rgba(2,6,23,0.06)' } as any) : null),
  },
  segmentText: { fontSize: 13, fontWeight: '900', color: 'rgba(2,6,23,0.55)' },
  segmentTextActive: { color: '#4F46E5' },

  daysInputWrap: {
    height: 40,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(79,70,229,0.22)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', boxShadow: '0 10px 22px rgba(2,6,23,0.06)' } as any) : null),
  },
  daysInputWrapHover: { backgroundColor: 'rgba(79,70,229,0.06)', borderColor: 'rgba(79,70,229,0.32)' },
  daysInputWrapFocused: {
    borderColor: 'rgba(79,70,229,0.55)',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 0 0 4px rgba(79,70,229,0.16), 0 16px 30px rgba(2,6,23,0.08)' } as any) : null),
  },
  daysInput: {
    width: 72,
    height: 40,
    textAlign: 'center',
    fontWeight: '900',
    fontSize: 16,
    color: '#111827',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null),
  },
  daysSuffix: { fontSize: 12, fontWeight: '900', color: 'rgba(2,6,23,0.55)', textAlign: 'right' },

  dateRow: { marginTop: 2 },
  datePill: {
    width: '100%',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(100,116,139,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(100,116,139,0.12)',
  },
  datePillInline: {
    position: 'relative',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 0,
    marginBottom: 0,
    paddingHorizontal: 10,
    paddingVertical: 5,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(79,70,229,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(79,70,229,0.20)',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 10px 22px rgba(2,6,23,0.06)' } as any) : null),
  },
  timePillInline: {
    position: 'relative',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 0,
    marginBottom: 0,
    paddingHorizontal: 10,
    paddingVertical: 5,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(79,70,229,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(79,70,229,0.20)',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 10px 22px rgba(2,6,23,0.06)' } as any) : null),
  },
  datePillMeta: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, flexShrink: 1 },
  dateValueChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(79,70,229,0.22)',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 10px 20px rgba(2,6,23,0.06)' } as any) : null),
  },
  dateValueChipText: { fontSize: 12, fontWeight: '900', color: '#111827', textAlign: 'right', writingDirection: 'ltr' },
  dateValueInput: {
    minWidth: 138,
    paddingVertical: 0,
    paddingHorizontal: 0,
    fontSize: 12,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
    writingDirection: 'ltr',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null),
  },
  timeValueChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(79,70,229,0.22)',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 10px 20px rgba(2,6,23,0.06)' } as any) : null),
  },
  timeValueInput: {
    minWidth: 56,
    paddingVertical: 0,
    paddingHorizontal: 0,
    fontSize: 12,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
    writingDirection: 'ltr',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null),
  },
  datePillLabel: { fontSize: 12, fontWeight: '900', color: 'rgba(79,70,229,0.92)', textAlign: 'right' },
  datePillValue: { fontSize: 12, fontWeight: '900', color: '#111827', textAlign: 'right', writingDirection: 'ltr' },
  scheduledHintText: { marginTop: 8, fontSize: 12, fontWeight: '800', color: 'rgba(2,6,23,0.55)', textAlign: 'right' },

  // In `row-reverse`, `flex-start` pins content to the RIGHT.
  timeRow: { width: '100%', flexDirection: 'row-reverse', justifyContent: 'flex-start', gap: 8, alignItems: 'center' },
  // Keep this group compact (don't stretch and push left).
  timeRight: { flexGrow: 0, flexShrink: 0, flexDirection: 'row-reverse', gap: 8, alignItems: 'center' },
  scheduledRow: {
    marginTop: 10,
    width: '100%',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    // In `row-reverse`, `flex-start` pins content to the RIGHT.
    justifyContent: 'flex-start',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(100,116,139,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(100,116,139,0.12)',
  },
  scheduledText: { fontSize: 12, fontWeight: '900', color: '#334155', textAlign: 'right', writingDirection: 'rtl', flexShrink: 1 },
  selectLike: {
    height: 40,
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minWidth: 100,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  selectLikeHover: { backgroundColor: '#F3F4F6' },
  selectLikeText: { fontSize: 14, fontWeight: '800', color: '#111827' },
  selectLikeDisabled: { opacity: 1, ...(Platform.OS === 'web' ? ({ cursor: 'default' } as any) : null) },
  selectLikeTextDisabled: { color: '#6B7280' },

  numberInput: {
    width: 72,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    textAlign: 'center',
    fontWeight: '900',
    fontSize: 16,
    color: '#111827',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null),
  },

  chips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: 'rgba(79,70,229,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(79,70,229,0.15)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  chipText: { fontSize: 12, fontWeight: '800' },
  chipAdd: { backgroundColor: 'rgba(147,51,234,0.08)', borderColor: 'rgba(147,51,234,0.15)' },
  chipAddText: { fontSize: 12, fontWeight: '800', color: '#9333EA' },

  textareaWrap: { position: 'relative', width: '100%' },
  textarea: {
    height: 132,
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 22,
    textAlign: 'right',
    writingDirection: 'rtl',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null),
  },
  charCount: { position: 'absolute', left: 12, bottom: 10, fontSize: 12, fontWeight: '800', color: '#9CA3AF' },

  recipientsHeaderRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  recipientsBadge: { flexDirection: 'row-reverse', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(2,6,23,0.04)' },
  recipientsBadgeText: { fontSize: 12, fontWeight: '900', color: 'rgba(2,6,23,0.72)', textAlign: 'right' },
  recipientsHint: { fontSize: 12, fontWeight: '800', color: 'rgba(2,6,23,0.62)', textAlign: 'right', lineHeight: 18 },
  recipientsMono: { fontWeight: '900' },

  recipientsCard: {
    width: '100%',
    borderRadius: 14,
    padding: 12,
    backgroundColor: 'rgba(79,70,229,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(79,70,229,0.16)',
  },
  recipientsCardDanger: { backgroundColor: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.18)' },
  recipientsTopRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  recipientsMetaLeft: { flex: 1, minWidth: 0, flexDirection: 'row-reverse', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  recipientsCountPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderWidth: 1,
    borderColor: 'rgba(2,6,23,0.08)',
  },
  recipientsCountText: { fontSize: 12, fontWeight: '900', color: '#111827', textAlign: 'right' },
  recipientsEyeBtn: {
    height: 40,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderWidth: 1,
    borderColor: 'rgba(79,70,229,0.18)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  recipientsEyeText: { fontSize: 12, fontWeight: '900', color: '#4F46E5', textAlign: 'right' },
  recipientsPrimaryBtn: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#4F46E5',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  recipientsPrimaryBtnText: { fontSize: 12, fontWeight: '900', color: '#fff', textAlign: 'right' },
  recipientsHintEm: { fontWeight: '900', color: '#4F46E5' },
  recipientsDangerText: { marginTop: 10, fontSize: 12, fontWeight: '900', color: '#EF4444', textAlign: 'right' },
  recipientsPreviewHint: { fontSize: 12, fontWeight: '800', color: 'rgba(2,6,23,0.62)', textAlign: 'right', lineHeight: 18 },
  recipientsPreviewEmpty: { fontSize: 12, fontWeight: '900', color: 'rgba(2,6,23,0.62)', textAlign: 'right' },
  recipientsPreviewSearchRow: {
    width: '100%',
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(2,6,23,0.10)',
    backgroundColor: 'rgba(2,6,23,0.03)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  recipientsPreviewSearchInput: {
    flex: 1,
    height: 40,
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'right',
    writingDirection: 'rtl',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null),
  },
  recipientsPreviewRow: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(2,6,23,0.08)',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  recipientsPreviewName: { fontSize: 13, fontWeight: '900', color: '#111827', textAlign: 'right' },
  recipientsPreviewMeta: { marginTop: 3, fontSize: 12, fontWeight: '800', color: '#64748B', textAlign: 'right' },

  sendStatusRow: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(2,6,23,0.08)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sendStatusMeta: { marginTop: 3, fontSize: 12, fontWeight: '800', color: '#64748B', textAlign: 'right' },
  sendStatusBadge: {
    minWidth: 64,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(2,6,23,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(2,6,23,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendStatusBadgeText: { fontSize: 12, fontWeight: '900', textAlign: 'center' },

  recipientsToolsRow: { marginTop: 6, flexDirection: 'row-reverse', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  recipientsFiltersRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  recipientsPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  recipientsPillActive: { backgroundColor: 'rgba(79,70,229,0.10)', borderColor: 'rgba(79,70,229,0.20)' },
  recipientsPillText: { fontSize: 12, fontWeight: '900', color: 'rgba(2,6,23,0.70)', textAlign: 'right' },
  recipientsPillTextActive: { color: '#4F46E5' },

  recipientsActionBtn: { height: 32, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(2,6,23,0.10)', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null) },
  recipientsActionText: { fontSize: 12, fontWeight: '900', color: '#111827', textAlign: 'right' },

  recipientsMetaRow: { marginTop: 10, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  recipientsMetaText: { fontSize: 12, fontWeight: '900', color: 'rgba(2,6,23,0.62)', textAlign: 'right' },
  recipientsSendBtn: { height: 36, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#4F46E5', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null) },
  recipientsSendText: { fontSize: 12, fontWeight: '900', color: '#fff', textAlign: 'right' },

  recipientsList: { marginTop: 10, gap: 8 },
  recipientRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(2,6,23,0.08)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  recipientRowActive: { backgroundColor: 'rgba(79,70,229,0.06)', borderColor: 'rgba(79,70,229,0.18)' },
  recipientName: { fontSize: 13, fontWeight: '900', color: '#111827', textAlign: 'right' },
  recipientMeta: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    textAlign: 'right',
    display: 'flex',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },

  pickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    // Must sit ABOVE the editor overlay when opened from inside it.
    zIndex: 2200,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  pickerBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(2,6,23,0.48)' },
  pickerCard: {
    width: '100%',
    maxWidth: 760,
    maxHeight: '86%',
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(2,6,23,0.10)',
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 24px 70px rgba(2,6,23,0.28)' } as any) : null),
  },
  pickerHeader: { paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: 'rgba(2,6,23,0.08)' },
  pickerTitle: { fontSize: 14, fontWeight: '900', color: '#111827', textAlign: 'right' },
  pickerClose: { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(2,6,23,0.04)', borderWidth: 1, borderColor: 'rgba(2,6,23,0.10)', alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null) },

  dialogOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2250,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '86%',
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(2,6,23,0.10)',
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 24px 70px rgba(2,6,23,0.28)' } as any) : null),
  },
  dialogHeader: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(2,6,23,0.08)',
  },
  dialogTitle: { fontSize: 14, fontWeight: '900', color: '#111827', textAlign: 'right' },
  dialogClose: { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(2,6,23,0.04)', borderWidth: 1, borderColor: 'rgba(2,6,23,0.10)', alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null) },

  calendarHeaderRow: { paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  calendarMonthText: { fontSize: 13, fontWeight: '900', color: '#111827', textAlign: 'center' },
  navBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(2,6,23,0.04)', borderWidth: 1, borderColor: 'rgba(2,6,23,0.10)', alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null) },
  calendarDowRow: { paddingHorizontal: 10, flexDirection: 'row', flexWrap: 'wrap' },
  dowText: { width: '14.2857%', textAlign: 'center', fontSize: 12, fontWeight: '900', color: 'rgba(2,6,23,0.55)', paddingVertical: 8 },
  calendarGrid: { paddingHorizontal: 10, paddingBottom: 14, flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.2857%', height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  dayCellSelected: { backgroundColor: 'rgba(79,70,229,0.14)' },
  dayText: { fontSize: 13, fontWeight: '900', color: '#111827' },
  dayTextSelected: { color: '#4F46E5' },

  timePickRow: { paddingHorizontal: 14, paddingVertical: 14, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 12 },
  wheelGroup: { alignItems: 'center', gap: 8 },
  wheelLabel: { fontSize: 12, fontWeight: '900', color: 'rgba(2,6,23,0.55)', textAlign: 'center' },
  wheelCol: { width: 110, height: 260, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(2,6,23,0.10)', backgroundColor: 'rgba(2,6,23,0.02)' },
  wheelColContent: { paddingVertical: 10 },
  wheelItem: { height: 40, alignItems: 'center', justifyContent: 'center' },
  wheelItemActive: { backgroundColor: 'rgba(79,70,229,0.10)' },
  wheelText: { fontSize: 14, fontWeight: '900', color: 'rgba(2,6,23,0.70)' },
  wheelTextActive: { color: '#4F46E5' },
  timeSep: { fontSize: 18, fontWeight: '900', color: 'rgba(2,6,23,0.70)' },

  dialogActions: { padding: 14, borderTopWidth: 1, borderTopColor: 'rgba(2,6,23,0.08)', backgroundColor: 'rgba(248,250,252,1)', flexDirection: 'row-reverse', gap: 10 },
  dialogBtn: { flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null) },
  dialogBtnPrimary: { backgroundColor: '#4F46E5' },
  dialogBtnPrimaryText: { fontSize: 13, fontWeight: '900', color: '#fff', textAlign: 'right' },
  dialogBtnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(2,6,23,0.10)' },
  dialogBtnGhostText: { fontSize: 13, fontWeight: '900', color: '#334155', textAlign: 'right' },

  pickerSearchRow: { margin: 14, paddingHorizontal: 12, height: 40, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(2,6,23,0.10)', backgroundColor: 'rgba(2,6,23,0.03)', flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  pickerSearchInput: { flex: 1, height: 40, fontSize: 13, fontWeight: '800', color: '#111827', textAlign: 'right', writingDirection: 'rtl', ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null) },

  pickerToolsRow: { paddingHorizontal: 14, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  pickerMetaRow: { paddingHorizontal: 14, paddingBottom: 10, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  pickerMetaText: { fontSize: 12, fontWeight: '900', color: 'rgba(2,6,23,0.62)', textAlign: 'right' },

  pickerList: { flex: 1, minHeight: 0 },
  pickerListContent: { paddingHorizontal: 14, paddingBottom: 14, gap: 8 },

  pickerFooter: { padding: 14, borderTopWidth: 1, borderTopColor: 'rgba(2,6,23,0.08)', backgroundColor: 'rgba(248,250,252,1)', flexDirection: 'row-reverse', gap: 10 },
  pickerBtnSecondary: { flex: 1, height: 44, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(2,6,23,0.10)', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null) },
  pickerBtnSecondaryText: { fontSize: 13, fontWeight: '900', color: '#334155', textAlign: 'right' },
  pickerBtnPrimary: { flex: 1.3, height: 44, borderRadius: 12, backgroundColor: '#4F46E5', alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null) },
  pickerBtnPrimaryText: { fontSize: 13, fontWeight: '900', color: '#fff', textAlign: 'right' },

  previewBlock: { width: '100%', marginTop: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6', gap: 10, alignItems: 'center' },
  demoCard: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(79,70,229,0.16)',
    backgroundColor: 'rgba(79,70,229,0.06)',
    padding: 12,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  demoIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(79,70,229,0.18)',
  },
  demoTextWrap: { flex: 1, minWidth: 0, gap: 2 },
  demoTitle: { fontSize: 13, fontWeight: '900', color: '#111827', textAlign: 'right' },
  demoSub: { fontSize: 12, fontWeight: '800', color: 'rgba(2,6,23,0.62)', textAlign: 'right', lineHeight: 18 },
  demoBtn: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#4F46E5',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', boxShadow: '0 10px 22px rgba(79,70,229,0.22)' } as any) : null),
  },
  demoBtnDisabled: { opacity: 0.55, ...(Platform.OS === 'web' ? ({ cursor: 'default' } as any) : null) },
  demoBtnText: { fontSize: 12, fontWeight: '900', color: '#fff', textAlign: 'right' },
  phoneFrame: {
    alignSelf: 'center',
    width: 300,
    height: 420,
    borderRadius: 34,
    backgroundColor: '#1E293B',
    borderWidth: 4,
    borderColor: '#334155',
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 16px 36px rgba(0,0,0,0.2)' } as any) : null),
  },
  phoneNotch: {
    position: 'absolute',
    top: 0,
    left: '50%',
    transform: [{ translateX: -62 }],
    width: 124,
    height: 20,
    backgroundColor: '#334155',
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    zIndex: 5,
  },
  phoneScreen: { flex: 1, paddingTop: 28, paddingBottom: 12, paddingHorizontal: 14, backgroundColor: '#E5DDD5' },
  phoneTime: { position: 'absolute', top: 7, right: 14, fontSize: 11, fontWeight: '900', color: '#fff' },
  phoneStatusLeft: { position: 'absolute', top: 7, left: 14, flexDirection: 'row-reverse', gap: 5 },
  phoneStatusDot: { width: 9, height: 9, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.85)' },
  phoneHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 50,
    backgroundColor: '#075E54',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingTop: 17,
  },
  phoneAvatar: { width: 24, height: 24, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.2)', marginLeft: 8 },
  phoneHeaderTitle: { fontSize: 12, fontWeight: '900', color: '#fff', textAlign: 'right', flexShrink: 1 },

  bubble: {
    marginTop: 40,
    alignSelf: 'flex-end',
    maxWidth: '90%',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderTopRightRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 8,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 4px 12px rgba(0,0,0,0.08)' } as any) : null),
  },
  bubbleText: { fontSize: 11, lineHeight: 16, fontWeight: '800', color: '#111827', textAlign: 'right' },
  bubbleTime: { position: 'absolute', left: 10, bottom: 6, fontSize: 8, fontWeight: '900', color: '#9CA3AF' },
  datePill: { alignSelf: 'center', marginTop: 14, backgroundColor: '#DCF8C6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 7 },
  datePillText: { fontSize: 10, fontWeight: '900', color: '#475569' },

  editorOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 2100, alignItems: 'center', justifyContent: 'center', padding: 18 },
  editorCard: {
    width: '100%',
    maxWidth: 820,
    maxHeight: '88%',
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(2,6,23,0.10)',
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 24px 70px rgba(2,6,23,0.28)' } as any) : null),
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  editorBody: { flex: 1, minHeight: 0 },
  editorBodyContent: { padding: 12, paddingBottom: 12, gap: 10 },
  editorFooter: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    flexDirection: 'row-reverse',
    gap: 10,
  },
  saveBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', boxShadow: '0 12px 28px rgba(79,70,229,0.18)' } as any) : null),
  },
  saveBtnHover: { backgroundColor: '#4338CA' },
  saveBtnDisabled: { opacity: 0.6, ...(Platform.OS === 'web' ? ({ cursor: 'default' } as any) : null) },
  saveBtnText: { color: '#fff', fontSize: 13, fontWeight: '900' },

  toastWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    zIndex: 999,
  },
  toastCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(17,24,39,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 14px 30px rgba(2,6,23,0.22)' } as any) : null),
  },
  toastText: { color: '#fff', fontSize: 12, fontWeight: '900', textAlign: 'right' },
  sendNowBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row-reverse',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', boxShadow: '0 12px 28px rgba(2,6,23,0.16)' } as any) : null),
  },
  sendNowBtnHover: { backgroundColor: '#0B1220' },
  sendNowBtnDisabled: { opacity: 0.6, ...(Platform.OS === 'web' ? ({ cursor: 'default' } as any) : null) },
  sendNowBtnText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  cancelBtn: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  cancelBtnHover: { backgroundColor: '#F9FAFB' },
  cancelBtnText: { fontSize: 13, fontWeight: '900', color: '#6B7280' },

  // Main column (מרכז)
  mainCol: { flex: 1, minWidth: 0, backgroundColor: '#fff' },
  mainColContent: { padding: 24, paddingBottom: 40, gap: 20 },

  timelineCard: {
    borderRadius: 12,
    backgroundColor: '#fff',
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 4px 16px rgba(0,0,0,0.04)' } as any) : null),
  },

  timelineHeaderRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  timelineHeaderLeft: { width: 180, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start' },
  backSmall: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  timelineHeaderDivider: { width: 1, height: 22, backgroundColor: '#E5E7EB' },
  timelineHeaderCrumb: { fontSize: 12, fontWeight: '900', color: '#64748B' },
  timelineHeaderCenter: { alignItems: 'center', flex: 1 },
  timelineHeaderTitle: { fontSize: 16, fontWeight: '900', color: '#111827' },
  timelineHeaderSubtitle: { fontSize: 12, fontWeight: '800', color: '#4F46E5', marginTop: 2 },

  timelineSubtitle: { fontSize: 14, fontWeight: '800', color: '#6B7280', textAlign: 'right', marginBottom: 16 },
  // RTL is applied at the page level; for the timeline we want the first step to start on the LEFT.
  // Using a local LTR direction avoids the "double flip" effect.
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    ...(Platform.OS === 'web' ? ({ direction: 'ltr' } as any) : null),
  },
  timelineItem: { alignItems: 'center', gap: 8, flex: 1, ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null) },
  timelineLabel: { fontSize: 12, fontWeight: '800', color: '#9CA3AF', textAlign: 'center' },
  timelineDot: {
    width: 14,
    height: 14,
    borderRadius: 999,
    backgroundColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineActiveLine: { width: 2, height: 26, marginVertical: 2 },
  timelineTitle: { fontSize: 13, fontWeight: '800', color: '#9CA3AF', textAlign: 'center' },
  timelineDate: { fontSize: 11, fontWeight: '900', color: '#111827', textAlign: 'center', marginTop: 2, writingDirection: 'ltr' },
  timelineTime: { fontSize: 12, fontWeight: '900', color: '#111827', textAlign: 'center', marginTop: 1, writingDirection: 'ltr' },
  timelineConnector: { width: 60, height: 1, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 50 },

  cardsContainer: { gap: 16 },
  cardsRow: {
    ...(Platform.OS === 'web'
      ? ({
          display: 'flex',
          // RTL is already applied at the page level (`direction: rtl`).
          // Using `row-reverse` here double-flips the order and places "01" on the left.
          flexDirection: 'row',
          flexWrap: 'nowrap',
          gap: 16,
          alignItems: 'stretch',
          overflowX: 'auto',
          overflowY: 'hidden',
          paddingBottom: 4,
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'thin',
        } as any)
      : ({
          flexDirection: 'row',
          alignItems: 'stretch',
          justifyContent: 'flex-start',
          gap: 16,
          flexWrap: 'wrap',
        } as any)),
  },

  messageCard: {
    ...(Platform.OS === 'web'
      ? ({
          flexGrow: 1,
          flexBasis: 0,
          flexShrink: 0,
          minWidth: 240,
          maxWidth: 360,
        } as any)
      : ({ flexGrow: 1, flexBasis: '32%', minWidth: 240 } as any)),
    borderRadius: 14,
    backgroundColor: '#fff',
    padding: 18,
    borderWidth: 2,
    borderColor: '#F3F4F6',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', boxShadow: '0 6px 20px rgba(0,0,0,0.05)' } as any) : null),
  },
  messageCardHover: { borderColor: '#E5E7EB' },
  messageCardSelected: { borderColor: '#4F46E5', ...(Platform.OS === 'web' ? ({ boxShadow: '0 8px 28px rgba(79,70,229,0.12)' } as any) : null) },

  cardTopRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 },
  cardNumber: { fontSize: 36, fontWeight: '900', color: '#F3F4F6' },
  cardIconWrap: { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(79,70,229,0.08)', alignItems: 'center', justifyContent: 'center' },

  cardTitle: { fontSize: 20, fontWeight: '900', color: '#111827', textAlign: 'right', marginBottom: 10 },

  cardMetaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 14 },
  cardMetaText: { fontSize: 13, fontWeight: '800', color: '#6B7280', textAlign: 'right', flexShrink: 1 },

  sendStatusPill: {
    marginTop: -4,
    marginBottom: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(2,6,23,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(2,6,23,0.08)',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  sendStatusText: { fontSize: 12, fontWeight: '700', textAlign: 'right', flexShrink: 1, writingDirection: 'rtl' },

  cardInlineRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 },
  cardInlineMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  cardInlineMetaText: { fontSize: 12, fontWeight: '900', color: 'rgba(2,6,23,0.55)', textAlign: 'right', flexShrink: 1 },
  cardInlineBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: 'rgba(79,70,229,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(79,70,229,0.14)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  cardInlineBtnText: { fontSize: 12, fontWeight: '900', textAlign: 'right' },
  cardAutoNote: { flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', gap: 6, marginBottom: 12 },
  cardAutoNoteText: { fontSize: 12, fontWeight: '900', color: 'rgba(2,6,23,0.55)', textAlign: 'right', flexShrink: 1 },

  cardBottomRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 4, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' },
  statusText: { fontSize: 12, fontWeight: '900' },
  statusSuccessText: { color: '#16A34A' },
  statusOffText: { color: '#6B7280' },

  toggleBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(2,6,23,0.10)',
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', userSelect: 'none' } as any) : null),
  },
  toggleTrack: {
    width: 44,
    height: 24,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(2,6,23,0.12)',
    position: 'relative',
    ...(Platform.OS === 'web' ? ({ transition: 'background-color 120ms ease, border-color 120ms ease' } as any) : null),
  },
  toggleTrackOn: { backgroundColor: '#22C55E', borderColor: 'rgba(34,197,94,0.60)' },
  toggleTrackOff: { backgroundColor: '#E5E7EB', borderColor: 'rgba(148,163,184,0.55)' },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    position: 'absolute',
    top: 1,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 6px 14px rgba(2,6,23,0.18)', transition: 'left 120ms ease, right 120ms ease' } as any) : null),
  },
  toggleThumbOn: { right: 1 },
  toggleThumbOff: { left: 1 },
  toggleLabel: { fontSize: 12, fontWeight: '900', textAlign: 'right' },
  toggleLabelOn: { color: '#16A34A' },
  toggleLabelOff: { color: '#6B7280' },

  editBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(2,6,23,0.10)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  editBtnText: { fontSize: 14, fontWeight: '900' },

  whatsappCard: {
    borderRadius: 14,
    backgroundColor: '#F0FDF4',
    padding: 20,
    borderWidth: 1,
    borderColor: '#86EFAC',
    ...(Platform.OS === 'web'
      ? ({
          flexGrow: 1,
          flexBasis: 0,
          flexShrink: 0,
          minWidth: 240,
          maxWidth: 360,
        } as any)
      : ({ flexGrow: 1, flexBasis: '32%', minWidth: 240 } as any)),
  },
  whatsappHeader: { flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 },
  whatsappIconWrap: { width: 48, height: 48, borderRadius: 999, backgroundColor: '#25D366', alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? ({ boxShadow: '0 8px 24px rgba(37,211,102,0.25)' } as any) : null) },
  premiumBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: '#DCFCE7' },
  premiumText: { fontSize: 9, fontWeight: '900', color: '#16A34A', letterSpacing: 0.8 },

  whatsappTitle: { fontSize: 20, fontWeight: '900', color: '#111827', textAlign: 'right', marginBottom: 8 },
  whatsappDesc: { fontSize: 14, fontWeight: '700', color: '#6B7280', textAlign: 'right', marginBottom: 18, lineHeight: 22 },

  whatsappButtons: { flexDirection: 'row-reverse', gap: 10 },
  whatsappBtnPrimary: { flex: 1, height: 44, borderRadius: 10, backgroundColor: '#25D366', alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? ({ cursor: 'pointer', boxShadow: '0 8px 20px rgba(37,211,102,0.2)' } as any) : null) },
  whatsappBtnPrimaryText: { fontSize: 14, fontWeight: '900', color: '#fff' },
  whatsappBtnSecondary: { flex: 1, height: 44, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#86EFAC', alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null) },
  whatsappBtnSecondaryText: { fontSize: 14, fontWeight: '900', color: '#16A34A' },
});

