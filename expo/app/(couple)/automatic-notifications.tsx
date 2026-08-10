import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/constants/colors';
import { AppLoader, AppLoaderScreen } from '@/components/AppLoader';
import { supabase } from '@/lib/supabase';
import { eventService } from '@/lib/services/eventService';
import { useUserStore } from '@/store/userStore';
import { useEventSelectionStore } from '@/store/eventSelectionStore';
import { Event } from '@/types';
import { ALIGN_RIGHT, ROW_DIR } from '@/lib/rtl';
import { getFloatingTabBarContentPadding } from '@/lib/floatingTabBarInset';

type NotificationTemplate = {
  notification_type: string;
  title: string;
  days_from_wedding: number; // negative = before event, 0 = event day, positive = after
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
  const eventNoun =
    kind === 'wedding' ? 'החתונה' : kind === 'brit' ? 'הברית/ה' : kind === 'barMitzvah' ? 'בר/בת המצווה' : 'האירוע';

  switch (notificationType) {
    case 'reminder_1':
      if (kind === 'wedding') {
        return normalizeMessage(
          'אורחים יקרים,\n' +
            'בתאריך {{תאריך}} תיערך החתונה של {{שמות_חתן_כלה}} ב{{מיקום}}.\n' +
            'לאישור הגעה: [הדביקו כאן קישור]\n' +
            'להנחיות הגעה: [הדביקו כאן קישור]\n' +
            'נשמח לראותכם!'
        );
      }
      return normalizeMessage(
        'שלום,\n' +
          `בתאריך {{תאריך}} ייערך ${eventNoun} ({{שם_אירוע}}) ב{{מיקום}}.\n` +
          'לאישור הגעה: [הדביקו כאן קישור]\n' +
          'להנחיות הגעה: [הדביקו כאן קישור]\n' +
          'נשמח לראותכם!'
      );

    case 'reminder_2':
      return normalizeMessage(
        'תזכורת:\n' +
          '{{שם_אירוע}} בעוד שבועיים ({{תאריך}}).\n' +
          'נשמח לאישור הגעה בקישור: [הדביקו כאן קישור]'
      );

    case 'reminder_3':
      return normalizeMessage(
        'עוד שבוע ל{{שם_אירוע}} ({{תאריך}}).\n' + 'אם עדיין לא אישרתם הגעה: [הדביקו כאן קישור]'
      );

    case 'whatsapp_event_day':
      return normalizeMessage('היום זה היום!\n' + '{{שם_אירוע}} מתקיים היום.\n' + 'לכניסה מהירה והנחיות: [הדביקו כאן קישור]');

    case 'after_1':
      return normalizeMessage('תודה שבאתם ל{{שם_אירוע}}.\n' + 'היה לנו כיף גדול איתכם, תודה על האיחולים והאהבה.');

    default:
      return normalizeMessage('שלום,\n' + '{{שם_אירוע}} ב{{מיקום}} בתאריך {{תאריך}}.\n' + 'נשמח לראותכם!');
  }
}

const NOTIFICATION_TEMPLATES: NotificationTemplate[] = [
  { notification_type: 'reminder_1', title: 'הודעה ראשונה', days_from_wedding: -30, channel: 'SMS', defaultMessage: undefined },
  { notification_type: 'reminder_2', title: 'הודעה שנייה', days_from_wedding: -14, channel: 'SMS', defaultMessage: undefined },
  { notification_type: 'reminder_3', title: 'הודעה שלישית', days_from_wedding: -7, channel: 'SMS', defaultMessage: undefined },
  { notification_type: 'whatsapp_event_day', title: 'וואטסאפ ביום האירוע', days_from_wedding: 0, channel: 'WHATSAPP', defaultMessage: undefined },
  { notification_type: 'after_1', title: 'הודעה רגילה אחרי האירוע', days_from_wedding: 1, channel: 'SMS', defaultMessage: undefined },
];

const LEGACY_DEFAULT_MESSAGES: Record<string, Set<string>> = {
  reminder_1: new Set([normalizeMessage('שלום! רצינו להזכיר לכם על האירוע הקרוב שלנו.')]),
  reminder_2: new Set([normalizeMessage('היי! האירוע בעוד שבועיים, מחכים לראות אתכם!')]),
  reminder_3: new Set([normalizeMessage('תזכורת אחרונה: האירוע בעוד שבוע. נשמח לראותכם!')]),
  whatsapp_event_day: new Set([normalizeMessage('היום האירוע! נתראה שם')]),
  after_1: new Set([normalizeMessage('תודה שבאתם! היה לנו כיף גדול איתכם.')]),
};

export default function AutomaticNotificationsScreen(props?: { editorPathname?: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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

  const [event, setEvent] = useState<Event | null>(null);
  const [ownerTitle, setOwnerTitle] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const [notificationSettings, setNotificationSettings] = useState<NotificationSettingRow[]>([]);
  const [lastSmsRunBySettingId, setLastSmsRunBySettingId] = useState<Record<string, SmsRunSummary | undefined>>({});
  const [queuedCatchupBySettingId, setQueuedCatchupBySettingId] = useState<
    Record<string, { count: number; nextDueAt?: string | null }>
  >({});
  const [catchupOpen, setCatchupOpen] = useState(false);
  const [catchupLoading, setCatchupLoading] = useState(false);
  const [catchupTitle, setCatchupTitle] = useState('אורחים חדשים בתור');
  const [catchupRows, setCatchupRows] = useState<Array<{ guestId: string; name: string; phone?: string; dueAt: string; lastError?: string | null }>>([]);
  const [sendStatusOpen, setSendStatusOpen] = useState(false);
  const [sendStatusLoading, setSendStatusLoading] = useState(false);
  const [sendStatusTitle, setSendStatusTitle] = useState('סטטוס שליחה');
  const [sendStatusRun, setSendStatusRun] = useState<SmsRunSummary | null>(null);
  const [sendStatusRows, setSendStatusRows] = useState<
    Array<{ guestId: string; name: string; phone?: string; guestStatus?: string; sendStatus: 'sent' | 'failed' | 'skipped'; sentAt?: string | null; error?: string | null }>
  >([]);

  const ui = useMemo(() => {
    // Light-only palette (always white UI)
    const primary = '#3b82f6';
    const whatsapp = '#25D366';
    const bg = '#FFFFFF';
    const card = '#FFFFFF';
    const text = '#111827';
    const sub = '#6B7280';
    const border = 'rgba(243,244,246,1)';
    const softShadow = '0 4px 20px -2px rgba(0, 0, 0, 0.05)';

    return {
      primary,
      whatsapp,
      bg,
      card,
      text,
      sub,
      border,
      softShadow,
    };
  }, []);

  const getDefaultMessageContent = (name?: string) => {
    const displayName = name && name.trim().length > 0 ? name.trim() : 'בעל/ת האירוע';
    return `הנכם מוזמנים לאירוע של ${displayName}\nפרטי האירוע ואישור הגעתכם בקישור\nנשמח לראותכם בין אורחינו.`;
  };

  const formatDate = (d: Date) => {
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const computeSendDate = (eventDateISO: string, days_from_wedding: number) => {
    const base = new Date(eventDateISO);
    const d = new Date(base);
    d.setDate(d.getDate() + days_from_wedding);
    return d;
  };

  const parseTimeHm = (value: string): { h: number; m: number } | null => {
    const s = String(value || '').trim();
    const m = /^(\d{1,2}):(\d{2})$/.exec(s);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (!Number.isInteger(h) || !Number.isInteger(min)) return null;
    if (h < 0 || h > 23) return null;
    if (min < 0 || min > 59) return null;
    return { h, m: min };
  };

  const computeSendDateTime = (eventDateISO: string, days_from_wedding: number, timeHm: string) => {
    const base = new Date(eventDateISO);
    if (!Number.isFinite(base.getTime())) return null;
    const hm = parseTimeHm(timeHm);
    if (!hm) return null;
    const d = new Date(base);
    d.setDate(d.getDate() + (Number(days_from_wedding) || 0));
    d.setHours(hm.h, hm.m, 0, 0);
    return d;
  };

  const toLocalYmd = (d: Date) => {
    if (!Number.isFinite(d.getTime())) return null;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const formatOffsetLabel = (days: number) => {
    if (days === 0) return 'ביום האירוע';
    const abs = Math.abs(days);
    return days < 0 ? `${abs} ימים לפני האירוע` : `${abs} ימים אחרי האירוע`;
  };

  const formatHeDateTimeShort = (value: unknown) => {
    const d = value instanceof Date ? value : new Date(String(value ?? ''));
    if (!Number.isFinite(d.getTime())) return '';
    const date = d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
    const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    return `${date} ${time}`;
  };

  const statusLabel = (s: string) => {
    const v = String(s || '').trim();
    if (v === 'sent') return { text: 'נשלח', color: '#16a34a' };
    if (v === 'failed') return { text: 'נכשל', color: '#ef4444' };
    if (v === 'sending') return { text: 'בתהליך', color: '#f59e0b' };
    if (v === 'claimed') return { text: 'ממתין', color: '#f59e0b' };
    if (v === 'skipped') return { text: 'דולג', color: '#64748b' };
    return { text: '—', color: '#64748b' };
  };

  const openSendStatus = async (row: NotificationSettingRow) => {
    if (!row?.id) return;
    const run = lastSmsRunBySettingId[String(row.id)];
    if (!run?.id) return;

    setSendStatusTitle(`סטטוס שליחה · ${row.title}`);
    setSendStatusRun(run);
    setSendStatusRows([]);
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
      const orderRank = (st: string) => (st === 'failed' ? 0 : st === 'skipped' ? 1 : 2);
      decorated.sort((a, b) => {
        const da = orderRank(String(a.sendStatus));
        const db = orderRank(String(b.sendStatus));
        if (da !== db) return da - db;
        return String(a.name || '').localeCompare(String(b.name || ''), 'he');
      });

      setSendStatusRows(decorated);
    } catch (e) {
      console.warn('Failed to load send status rows:', e);
      setSendStatusOpen(false);
    } finally {
      setSendStatusLoading(false);
    }
  };

  const openCatchupQueue = async (row: NotificationSettingRow) => {
    if (!row?.id || !resolvedEventId) return;
    setCatchupTitle(`אורחים חדשים בתור · ${row.title}`);
    setCatchupRows([]);
    setCatchupOpen(true);
    setCatchupLoading(true);
    try {
      const { data: qRows, error: qError } = await supabase
        .from('notification_sms_catchup_queue')
        .select('guest_id, due_at, last_error')
        .eq('event_id', resolvedEventId)
        .eq('notification_setting_id', String(row.id))
        .eq('status', 'queued')
        .order('due_at', { ascending: true });
      if (qError) throw qError;

      const base = ((qRows as any[]) || []).map((r) => ({
        guestId: String((r as any).guest_id),
        dueAt: String((r as any).due_at),
        lastError: (r as any).last_error ? String((r as any).last_error) : null,
      }));

      const ids = base.map((x) => x.guestId).filter(Boolean);
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

      setCatchupRows(
        base.map((r) => {
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
      setCatchupOpen(false);
    } finally {
      setCatchupLoading(false);
    }
  };

  const isMissingColumn = (err: any, column: string) =>
    String(err?.code) === '42703' && String(err?.message || '').toLowerCase().includes(column.toLowerCase());

  const loadOwnerTitle = async (eventData: Event) => {
    const groom = String((eventData as any)?.groomName ?? (eventData as any)?.groom_name ?? '').trim();
    const bride = String((eventData as any)?.brideName ?? (eventData as any)?.bride_name ?? '').trim();
    if (groom && bride) return `${groom} ו${bride}`;
    // fallback: keep user name if available
    return String(userData?.name || '').trim();
  };

  const fetchSettings = async (event_id: string, eventDateISO: string, owner?: string, eventForDefaults?: Event | null) => {
    const { data: rows, error } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('event_id', event_id)
      .order('days_from_wedding', { ascending: true });

    if (error) {
      console.error('Error fetching notification settings (couple screen):', error);
    }

    const kind = detectEventKind(eventForDefaults ?? null);

    // Match the profile screen: show exactly the rows that exist in DB for this event.
    // We still best-effort "upgrade" empty/legacy default messages for known types (UI-only).
    const nextSettings: NotificationSettingRow[] = (((rows as any[]) || []) as any[]).map((existing) => {
      const nType = String(existing?.notification_type ?? '').trim();
      const existingMsg = normalizeMessage(String(existing?.message_content ?? ''));
      const desiredDefault = nType ? defaultMessageByType({ notificationType: nType, kind }) : '';
      const shouldUpgradeMessage =
        Boolean(nType) &&
        (existingMsg.length === 0 || (LEGACY_DEFAULT_MESSAGES as any)[nType]?.has?.(existingMsg));

      return {
        id: existing?.id,
        event_id: existing?.event_id,
        notification_type: nType,
        title: String(existing?.title ?? '').trim() || 'הודעה',
        enabled: Boolean(existing?.enabled),
        message_content: shouldUpgradeMessage ? desiredDefault : String(existing?.message_content ?? ''),
        days_from_wedding: typeof existing?.days_from_wedding === 'number' ? existing.days_from_wedding : 0,
        channel: (existing?.channel as any) || null,
        notification_date: (existing?.notification_date as any) ?? null,
      };
    });

    setNotificationSettings(nextSettings);

    // Fetch last SMS runs (per setting) for status UI.
    try {
      const settingIds = nextSettings
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
            if (out[sid]) continue;
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

    // Fetch queued catch-up counts for reminder_1 (best-effort; older DBs may not have the table).
    try {
      const reminder1 = nextSettings.find((r) => r.notification_type === 'reminder_1' && r.id && (r.channel || 'SMS') === 'SMS');
      if (!reminder1?.id) {
        setQueuedCatchupBySettingId({});
      } else {
        const { data: qRows, error: qError } = await supabase
          .from('notification_sms_catchup_queue')
          .select('notification_setting_id, due_at')
          .eq('event_id', event_id)
          .eq('notification_setting_id', String(reminder1.id))
          .eq('status', 'queued')
          .order('due_at', { ascending: true });
        if (qError) {
          const msg = String((qError as any)?.message ?? '').toLowerCase();
          if (msg.includes('does not exist') || msg.includes('notification_sms_catchup_queue')) {
            setQueuedCatchupBySettingId({});
          } else {
            console.warn('Failed to load catch-up queue:', qError);
            setQueuedCatchupBySettingId({});
          }
        } else {
          const list = (qRows as any[]) || [];
          const count = list.length;
          const nextDueAt = count > 0 ? String((list[0] as any)?.due_at ?? '') : null;
          setQueuedCatchupBySettingId({
            [String(reminder1.id)]: { count, nextDueAt: nextDueAt || null },
          });
        }
      }
    } catch (e) {
      console.warn('Failed to load catch-up queue (exception):', e);
      setQueuedCatchupBySettingId({});
    }
  };

  useEffect(() => {
    const load = async () => {
      if (!resolvedEventId) {
        router.back();
        return;
      }
      setLoading(true);
      try {
        const eventData = await eventService.getEvent(resolvedEventId);
        setEvent(eventData);
        const title = await loadOwnerTitle(eventData as any);
        setOwnerTitle(title);
        if ((eventData as any)?.id && (eventData as any)?.date) {
          await fetchSettings((eventData as any).id, (eventData as any).date, title, eventData);
        }
      } finally {
        setLoading(false);
      }
    };
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedEventId]);

  const toggleNotification = async (row: NotificationSettingRow) => {
    if (!event?.id) return;
    const nextEnabled = !row.enabled;
    try {
      if (row.id) {
        const updatePayload: any = { enabled: nextEnabled };
        if (nextEnabled) {
          const existing = row.notification_date ? new Date(String(row.notification_date)) : null;
          const hasRealTime =
            existing && Number.isFinite(existing.getTime()) && (existing.getHours() !== 0 || existing.getMinutes() !== 0);
          const dt =
            hasRealTime && existing
              ? existing
              : (event as any)?.date
                ? computeSendDateTime(String((event as any).date), row.days_from_wedding ?? 0, '10:00')
                : null;
          if (dt) updatePayload.notification_date = dt.toISOString();
        }

        let { error } = await supabase.from('notification_settings').update(updatePayload).eq('id', row.id);
        if (error && isMissingColumn(error, 'notification_date')) {
          delete updatePayload.notification_date;
          const retry = await supabase.from('notification_settings').update(updatePayload).eq('id', row.id);
          error = retry.error as any;
        }
        if (error) throw error;
        setNotificationSettings((prev) =>
          prev.map((r) => (r.notification_type === row.notification_type ? { ...r, enabled: nextEnabled } : r))
        );
        return;
      }

      const tpl = NOTIFICATION_TEMPLATES.find((t) => t.notification_type === row.notification_type);
      const payload: any = {
        event_id: event.id,
        notification_type: row.notification_type,
        title: row.title,
        enabled: nextEnabled,
        message_content: row.message_content || getDefaultMessageContent(ownerTitle),
        days_from_wedding: typeof row.days_from_wedding === 'number' ? row.days_from_wedding : tpl?.days_from_wedding ?? 0,
        channel: (row.channel as any) || tpl?.channel || 'SMS',
      };
      const dt =
        (event as any)?.date ? computeSendDateTime(String((event as any).date), payload.days_from_wedding, '10:00') : null;
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
      setNotificationSettings((prev) => prev.map((r) => (r.notification_type === row.notification_type ? { ...(r as any), ...(data as any) } : r)));
    } catch (e) {
      console.error('Error toggling notification (couple screen):', e);
    }
  };

  const editorPathname = (props as any)?.editorPathname || '/(couple)/notification-editor';

  const openEdit = (row: NotificationSettingRow) => {
    if (!resolvedEventId) return;
    router.push({
      pathname: editorPathname,
      params: { eventId: resolvedEventId, notificationType: row.notification_type },
    } as any);
  };

  const regular = useMemo(() => notificationSettings.filter((r) => (r.channel || 'SMS') !== 'WHATSAPP'), [notificationSettings]);
  const whatsapp = useMemo(() => notificationSettings.filter((r) => (r.channel || 'SMS') === 'WHATSAPP'), [notificationSettings]);
  const topContentInset = Math.max(30, (insets.top || 0) + 14);

  const renderCardRow = (row: NotificationSettingRow, variant: 'regular' | 'whatsapp') => {
    const channel = (row.channel || (variant === 'whatsapp' ? 'WHATSAPP' : 'SMS')) as 'SMS' | 'WHATSAPP';
    const isWhatsapp = channel === 'WHATSAPP';
    const accent = isWhatsapp ? 'rgba(37,211,102,0.95)' : 'rgba(59,130,246,0.95)';
    const border = isWhatsapp ? 'rgba(37,211,102,0.18)' : 'rgba(59,130,246,0.18)';
    const days = typeof row.days_from_wedding === 'number' ? row.days_from_wedding : 0;
    const whenLabel =
      days === 0 ? 'ביום האירוע' : days > 0 ? `${days}+ ימים אחרי האירוע` : `${Math.abs(days)} ימים לפני האירוע`;
    const enabledLabel = row.enabled ? 'פעיל' : 'כבוי';

    return (
      <TouchableOpacity
        key={row.notification_type}
        onPress={() => openEdit(row)}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel={`עריכת ${row.title}`}
      >
        <View
          style={[
            styles.notificationCard,
            { borderColor: border, backgroundColor: 'rgba(255,255,255,0.92)' },
            isWhatsapp ? styles.notificationCardWhatsapp : null,
          ]}
        >
          <View style={[styles.whatsappAccent, { backgroundColor: accent }]} />

          <View style={styles.cardMain}>
            <Text style={[styles.cardTitle, { color: colors.gray[900] }]} numberOfLines={1}>
              {row.title}
            </Text>

            <View style={styles.cardMetaRow}>
              <TouchableOpacity
                style={styles.statusBtn}
                onPress={(e: any) => {
                  e?.stopPropagation?.();
                  e?.preventDefault?.();
                  void toggleNotification(row);
                }}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityLabel={row.enabled ? 'כיבוי הודעה' : 'הפעלת הודעה'}
              >
                <Text style={[styles.statusText, { color: row.enabled ? accent : colors.gray[400] }]}>{enabledLabel}</Text>
              </TouchableOpacity>
              <Text style={[styles.metaBullet, { color: colors.gray[400] }]}>•</Text>
              <Text style={[styles.metaText, { color: colors.gray[700] }]}>{isWhatsapp ? 'וואטסאפ' : 'SMS'}</Text>
              <Text style={[styles.metaBullet, { color: colors.gray[400] }]}>•</Text>
              <Text style={[styles.metaText, { color: colors.gray[700] }]} numberOfLines={1}>
                {whenLabel}
              </Text>
            </View>
          </View>

          <TouchableOpacity style={styles.cardChevron} onPress={() => openEdit(row)} activeOpacity={0.9}>
            <Ionicons name="chevron-back" size={20} color={colors.gray[500]} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading || !event) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: ui.bg }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <AppLoaderScreen
          variant="default"
          title="טוען הודעות"
          subtitle="מכין את ההודעות האוטומטיות"
        />
      </SafeAreaView>
    );
  }

  return (
    <View style={[styles.safe, { backgroundColor: ui.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: topContentInset,
            paddingBottom: getFloatingTabBarContentPadding(insets.bottom),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.notificationsSection}>
          <View style={styles.notifHeader}>
            <View style={styles.notifIconPill}>
              <Ionicons name="chatbubbles-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.notifHeaderText}>
              <Text style={styles.notifTitle}>הודעות אוטומטיות</Text>
              <Text style={styles.notifSubtitle} numberOfLines={1}>
                {ownerTitle ? `של ${ownerTitle}` : resolvedEventId ? `של ${resolvedEventId}` : 'ניהול הודעות SMS ווואטסאפ'}
              </Text>
            </View>
            <View style={styles.notifPill}>
              <Text style={styles.notifPillText}>ניהול</Text>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconWrap, { backgroundColor: 'rgba(59,130,246,0.08)' }]}>
                <Ionicons name="mail-outline" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.sectionTitle, { color: '#1f2937' }]}>הודעות רגילות</Text>
            </View>
            <View style={styles.itemsStack}>{regular.map((r) => renderCardRow(r, 'regular'))}</View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View
                style={[
                  styles.sectionIconWrap,
                  { backgroundColor: 'rgba(34,197,94,0.10)', borderColor: 'rgba(220,252,231,1)', borderWidth: 1 },
                ]}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={18} color={'#25D366'} />
              </View>
              <Text style={[styles.sectionTitle, { color: '#1f2937' }]}>הודעות וואטסאפ</Text>
            </View>
            <View style={styles.itemsStack}>{whatsapp.map((r) => renderCardRow(r, 'whatsapp'))}</View>
          </View>
        </View>
      </ScrollView>

      <Modal visible={sendStatusOpen} transparent animationType="fade" onRequestClose={() => setSendStatusOpen(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setSendStatusOpen(false)} />
          <View style={styles.modalCard}>
            <AppLoader
              visible={sendStatusLoading}
              variant="default"
              title="טוען סטטוס"
              subtitle="מביא את פרטי השליחה"
            />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {sendStatusTitle}
              </Text>
              <TouchableOpacity onPress={() => setSendStatusOpen(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={18} color="#111827" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              {sendStatusRun ? (
                <Text style={styles.modalHint} numberOfLines={2}>
                  {`ריצה אחרונה: ${formatHeDateTimeShort(sendStatusRun.claimed_at)} · ${statusLabel(sendStatusRun.status).text}`}
                </Text>
              ) : null}

              {sendStatusLoading ? null : sendStatusRows.length === 0 ? (
                <Text style={styles.modalEmpty}>אין נתונים להצגה.</Text>
              ) : (
                <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 10, paddingBottom: 6 }}>
                  {sendStatusRows.map((g) => {
                    const st = statusLabel(g.sendStatus);
                    const line =
                      `${g.guestStatus ? `${g.guestStatus} · ` : ''}${g.phone ? g.phone : 'אין טלפון'}` +
                      `${g.sentAt ? ` · ${formatHeDateTimeShort(g.sentAt)}` : ''}` +
                      `${g.error ? ` · ${g.error}` : ''}`;
                    return (
                      <View key={g.guestId} style={styles.modalRow}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.modalRowName} numberOfLines={1}>
                            {g.name || '—'}
                          </Text>
                          <Text style={styles.modalRowMeta} numberOfLines={2}>
                            {line}
                          </Text>
                        </View>
                        <View style={styles.modalBadge}>
                          <Text style={[styles.modalBadgeText, { color: st.color }]}>{st.text}</Text>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={catchupOpen} transparent animationType="fade" onRequestClose={() => setCatchupOpen(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setCatchupOpen(false)} />
          <View style={styles.modalCard}>
            <AppLoader
              visible={catchupLoading}
              variant="default"
              title="טוען תור"
              subtitle="מביא את רשימת האורחים בתור"
            />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {catchupTitle}
              </Text>
              <TouchableOpacity onPress={() => setCatchupOpen(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={18} color="#111827" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              {catchupLoading ? null : catchupRows.length === 0 ? (
                <Text style={styles.modalEmpty}>אין אורחים בתור כרגע.</Text>
              ) : (
                <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 10, paddingBottom: 6 }}>
                  {catchupRows.map((g) => {
                    const line =
                      `${g.phone ? g.phone : 'אין טלפון'}` +
                      `${g.dueAt ? ` · מתוזמן ל־${formatHeDateTimeShort(g.dueAt)}` : ''}` +
                      `${g.lastError ? ` · ${g.lastError}` : ''}`;
                    return (
                      <View key={g.guestId} style={styles.modalRow}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.modalRowName} numberOfLines={1}>
                            {g.name || '—'}
                          </Text>
                          <Text style={styles.modalRowMeta} numberOfLines={2}>
                            {line}
                          </Text>
                        </View>
                        <View style={styles.modalBadge}>
                          <Text style={[styles.modalBadgeText, { color: '#0f172a' }]}>בתור</Text>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' },
  topSpacer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  topRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.richBlack,
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  screenTitle: {
    flex: 1,
    fontSize: 24,
    fontWeight: '900',
    color: colors.richBlack,
    textAlign: 'right',
  },

  notificationsSection: {
    marginHorizontal: 20,
    marginBottom: 32,
  },
  notifHeader: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    shadowColor: colors.black,
    shadowOpacity: 0.05,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
    marginBottom: 12,
  },
  notifIconPill: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(6,23,62,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifHeaderText: { flex: 1, alignItems: ALIGN_RIGHT },
  notifTitle: { fontSize: 18, fontWeight: '900', color: colors.text, textAlign: 'right' },
  notifSubtitle: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
    lineHeight: 16,
  },
  notifPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(29,78,216,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(29,78,216,0.14)',
  },
  notifPillText: { fontSize: 12, fontWeight: '900', color: 'rgba(29,78,216,0.95)' },

  scroll: { flex: 1, backgroundColor: 'transparent' },
  content: {
    paddingTop: 12,
  },
  section: { marginBottom: 28 },
  sectionHeader: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    paddingHorizontal: 6,
    marginBottom: 12,
  },
  sectionIconWrap: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 18, fontWeight: '900', textAlign: 'right' },
  itemsStack: { gap: 16 },

  notificationCard: {
    position: 'relative',
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 20,
    paddingHorizontal: 20,
    shadowColor: colors.black,
    shadowOpacity: 0.05,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
    overflow: 'hidden',
  },
  notificationCardWhatsapp: {
    borderColor: 'rgba(37,211,102,0.18)',
  },
  whatsappAccent: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 4,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
  },
  cardMain: { flex: 1, alignItems: ALIGN_RIGHT },
  cardTitle: { fontSize: 18, fontWeight: '800', textAlign: 'right' },
  cardMetaRow: {
    marginTop: 8,
    alignSelf: ALIGN_RIGHT,
    flexDirection: ROW_DIR,
    alignItems: 'center',
  },
  statusBtn: { paddingVertical: 2 },
  statusText: { fontSize: 14, fontWeight: '800' },
  metaBullet: { marginHorizontal: 10, fontSize: 14, fontWeight: '800' },
  metaText: { fontSize: 14, fontWeight: '700' },
  cardChevron: { paddingStart: 4, paddingEnd: 8, justifyContent: 'center', alignItems: 'center' },

  modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 18 },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(2,6,23,0.45)' },
  modalCard: { width: '100%', maxWidth: 520, maxHeight: '86%', borderRadius: 16, backgroundColor: '#fff', overflow: 'hidden' },
  modalHeader: { paddingHorizontal: 14, paddingVertical: 12, flexDirection: ROW_DIR, alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: 'rgba(17,24,39,0.08)' },
  modalTitle: { fontSize: 14, fontWeight: '900', color: '#111827', textAlign: 'right', flex: 1 },
  modalCloseBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(17,24,39,0.04)', borderWidth: 1, borderColor: 'rgba(17,24,39,0.10)', alignItems: 'center', justifyContent: 'center' },
  modalBody: { padding: 14, gap: 10 },
  modalHint: { fontSize: 12, fontWeight: '800', color: 'rgba(2,6,23,0.62)', textAlign: 'right' },
  modalEmpty: { fontSize: 12, fontWeight: '900', color: 'rgba(2,6,23,0.62)', textAlign: 'right' },
  modalCenter: { paddingVertical: 18, alignItems: 'center', justifyContent: 'center' },
  modalRow: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.08)',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  modalRowName: { fontSize: 13, fontWeight: '900', color: '#111827', textAlign: 'right' },
  modalRowMeta: {
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
  modalBadge: { minWidth: 64, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(17,24,39,0.03)', borderWidth: 1, borderColor: 'rgba(17,24,39,0.08)', alignItems: 'center', justifyContent: 'center' },
  modalBadgeText: { fontSize: 12, fontWeight: '900', textAlign: 'center' },
});

