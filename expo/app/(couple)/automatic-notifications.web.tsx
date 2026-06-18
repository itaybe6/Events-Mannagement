import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useWindowDimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter, useSegments } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import AdminWebPageHeader from '@/components/desktop/AdminWebPageHeader';
import { colors } from '@/constants/colors';
import { buildDirectionsDetailsText, buildEventLocationText, normalizeBaseUrl } from '@/lib/navigationLinks';
import { exportPendingGuestsToExcel } from '@/lib/exportPendingGuestsExcel';
import { supabase } from '@/lib/supabase';
import { eventService } from '@/lib/services/eventService';
import { useUserStore } from '@/store/userStore';
import { useEventSelectionStore } from '@/store/eventSelectionStore';
import { Event } from '@/types';
import type { WhatsAppStepParams, WhatsAppTemplate } from '@/types';
import { whatsappTemplateService } from '@/lib/services/whatsappTemplateService';
import { invitationAssetService } from '@/lib/services/invitationAssetService';
import IPhoneMockup from '@/components/ui/iphone-mockup';

type WaRecipientMode = 'manual' | 'all' | 'pending' | 'coming' | 'not_coming' | 'maybe' | 'prev_pending' | 'groups';

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
  // Flow Builder fields (may be missing in older DB envs; handle gracefully)
  flow_id?: string | null;
  sort_order?: number | null;
  depends_on_setting_id?: string | null;
  recipient_mode?: WaRecipientMode | null;
  recipient_rule?: any;
  ui_hidden?: boolean | null;
  // WhatsApp template config (per step)
  whatsapp_template_id?: string | null;
  whatsapp_params?: WhatsAppStepParams | null;
  // Catch-up queue scheduling (reminder_1 only; may be missing in older DB envs)
  late_catchup_enabled?: boolean | null;
  late_catchup_send_time?: string | null; // time
  late_catchup_weekdays?: number[] | null; // 0=Sun ... 6=Sat
  late_catchup_schedule_mode?: 'weekdays' | 'dates' | null;
  late_catchup_dates?: string[] | null; // YYYY-MM-DD
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
const EVENT_TYPE_PREFIXES = ['חתונה', 'בר מצווה', 'בת מצווה', 'ברית', 'בריתה', 'אירוע חברה'] as const;

function getEventDisplayTitle(rawTitle: string) {
  const raw = String(rawTitle ?? '').trim();
  if (!raw) return 'האירוע שלך';
  for (const eventType of EVENT_TYPE_PREFIXES) {
    const withoutPrefix = raw.replace(new RegExp(`^${eventType}\\s*[–—-]\\s*`), '').trim();
    if (withoutPrefix !== raw) return withoutPrefix || raw;
  }
  return raw;
}

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

function normalizeTimeToDb(value: string) {
  const hm = parseTimeHm(value);
  if (!hm) return null;
  const hh = String(hm.h).padStart(2, '0');
  const mm = String(hm.m).padStart(2, '0');
  return `${hh}:${mm}:00`;
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

const isMissingColumn = (err: any, column: string) => {
  const code = String(err?.code || '').toUpperCase();
  const haystack = `${String(err?.message || '')} ${String(err?.details || '')} ${String(err?.hint || '')}`.toLowerCase();
  const needle = String(column || '').toLowerCase();
  if (!needle) return false;
  return (code === '42703' || code === 'PGRST204') && haystack.includes(needle);
};

const extractMissingColumnName = (err: any): string | null => {
  const code = String(err?.code || '').toUpperCase();
  if (code !== '42703' && code !== 'PGRST204') return null;
  const text = `${String(err?.message || '')} ${String(err?.details || '')} ${String(err?.hint || '')}`;
  const patterns = [
    /could not find the ['"]?([a-zA-Z0-9_]+)['"]? column/i,
    /column ['"]?([a-zA-Z0-9_]+)['"]? does not exist/i,
    /schema cache.*['"]([a-zA-Z0-9_]+)['"]/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1]) return String(match[1]);
  }
  return null;
};

const dropUnsupportedColumnFromPayload = (payload: Record<string, any>, column: string) => {
  let changed = false;
  const drop = (key: string) => {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      delete payload[key];
      changed = true;
    }
  };

  if (column === 'recipient_mode') {
    drop('recipient_mode');
    drop('recipient_rule');
    drop('depends_on_setting_id');
    return changed;
  }

  if (column === 'late_catchup_enabled') {
    drop('late_catchup_enabled');
    drop('late_catchup_send_time');
    drop('late_catchup_weekdays');
    drop('late_catchup_schedule_mode');
    drop('late_catchup_dates');
    return changed;
  }

  if (column === 'late_catchup_schedule_mode' || column === 'late_catchup_dates') {
    drop('late_catchup_schedule_mode');
    drop('late_catchup_dates');
    return changed;
  }

  drop(column);
  return changed;
};

async function runWithMissingColumnRetries<TData>(
  initialPayload: Record<string, any>,
  execute: (payload: Record<string, any>) => Promise<{ data?: TData | null; error?: any }>
) {
  const payload = { ...initialPayload };
  const removedColumns = new Set<string>();
  let lastData: TData | null | undefined = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = await execute(payload);
    lastData = result.data;
    const error = result.error as any;
    if (!error) return { data: lastData ?? null, error: null, payload };

    const missingColumn = extractMissingColumnName(error);
    if (!missingColumn || removedColumns.has(missingColumn)) {
      return { data: lastData ?? null, error, payload };
    }

    const changed = dropUnsupportedColumnFromPayload(payload, missingColumn);
    if (!changed) {
      return { data: lastData ?? null, error, payload };
    }

    removedColumns.add(missingColumn);
  }

  return { data: lastData ?? null, error: new Error('Too many missing-column retries'), payload };
}

export default function AutomaticNotificationsWebScreen() {
  const router = useRouter();
  const segments = useSegments();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const { userData, userType } = useUserStore();
  const canEdit = userType === 'admin' || userType === 'employee';
  const isReadOnly = !canEdit;
  const showAdminChrome = Platform.OS === 'web';
  const isAdminRouteContext = useMemo(() => segments.includes('(admin)'), [segments]);
  const useEmbeddedWebShell = showAdminChrome && !isAdminRouteContext;
  const params = useLocalSearchParams<{ eventId?: string | string[]; returnTo?: string | string[] }>();
  const activeUserId = useEventSelectionStore((s) => s.activeUserId);
  const activeEventId = useEventSelectionStore((s) => s.activeEventId);

  const queryEventId = typeof params.eventId === 'string' ? params.eventId : Array.isArray(params.eventId) ? params.eventId[0] : undefined;
  const queryReturnTo = typeof params.returnTo === 'string' ? params.returnTo : Array.isArray(params.returnTo) ? params.returnTo[0] : undefined;
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
  const backHref = useMemo(() => {
    if (queryReturnTo) return String(queryReturnTo);
    if (showAdminChrome) {
      return resolvedEventId ? `/(admin)/admin-event-details?id=${encodeURIComponent(resolvedEventId)}` : '/(admin)/admin-events';
    }
    return resolvedEventId ? `/(couple)?eventId=${encodeURIComponent(resolvedEventId)}` : '/(couple)';
  }, [queryReturnTo, resolvedEventId, showAdminChrome]);
  const handleBackPress = useCallback(() => {
    router.replace(backHref as any);
  }, [backHref, router]);

  const ui = useMemo(
    () => ({
      primary: '#4F46E5',
      whatsapp: '#25D366',
      bgLight: '#F9FAFB',
      card: '#FFFFFF',
      surface: '#FFFFFF',
      surfaceMuted: 'rgba(248,250,252,1)',
      border: 'rgba(148,163,184,0.30)',
      danger: '#EF4444',
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
  const [flowSteps, setFlowSteps] = useState<NotificationSettingRow[]>([]);
  const [selectedType, setSelectedType] = useState<string>('reminder_1');
  const [editDraft, setEditDraft] = useState<{ message: string; days: number; timeHm: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const [allGuests, setAllGuests] = useState<
    Array<{ id: string; name: string; phone?: string; status: string; invitationCode?: string; invitationToken?: string }>
  >([]);
  const [sendingNow, setSendingNow] = useState(false);
  const [exportingPendingGuests, setExportingPendingGuests] = useState(false);

  // Recipient picking: required for message 1, optional for message 2 ("מאשרים").
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTargetType, setPickerTargetType] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerFilter, setPickerFilter] = useState<'all' | 'pending' | 'confirmed' | 'declined'>('all');
  const [pickerSelectedIds, setPickerSelectedIds] = useState<Set<string>>(() => new Set());

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorType, setEditorType] = useState<string | null>(null);
  const [editorKind, setEditorKind] = useState<'template' | 'flow'>('template');
  type EditorWizardStepId = 'schedule' | 'recipients' | 'catchup' | 'message';
  const [editorWizardStepIdx, setEditorWizardStepIdx] = useState(0);
  const [messageSelection, setMessageSelection] = useState({ start: 0, end: 0 });
  const [recipientsWizardManual, setRecipientsWizardManual] = useState(false);
  const [flowDraft, setFlowDraft] = useState<{
    title: string;
    recipientMode: WaRecipientMode;
    recipientGroups: string[];
    dependsOnSettingId: string | null;
    whatsappTemplateId: string | null;
    whatsappParams: WhatsAppStepParams;
  } | null>(null);

  // WhatsApp template registry + daily quota (managed in /(admin)/whatsapp-templates).
  const [waTemplates, setWaTemplates] = useState<WhatsAppTemplate[]>([]);
  const [waDailyQuota, setWaDailyQuota] = useState<number>(0);
  const [waSentToday, setWaSentToday] = useState<number>(0);

  // Dynamic WhatsApp access token (encrypted at rest, uploaded by the manager).
  const [waTokenStatus, setWaTokenStatus] = useState<{ hasToken: boolean; hint: string | null; updatedAt: Date | null }>({
    hasToken: false,
    hint: null,
    updatedAt: null,
  });
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [tokenSaving, setTokenSaving] = useState(false);

  // Event details reference panel (so the manager can fill template fields).
  const [eventDetailsOpen, setEventDetailsOpen] = useState(true);
  const [waImageUploading, setWaImageUploading] = useState(false);
  const [dependsPickerOpen, setDependsPickerOpen] = useState(false);
  const [addWizardOpen, setAddWizardOpen] = useState(false);
  const [addWizardStep, setAddWizardStep] = useState<1 | 2>(1);
  const [addWizardChannel, setAddWizardChannel] = useState<'SMS' | 'WHATSAPP'>('SMS');
  const [addWizardInsertAt, setAddWizardInsertAt] = useState<number>(1);
  const [dateDialogOpen, setDateDialogOpen] = useState(false);
  const [timeDialogOpen, setTimeDialogOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [timeDraft, setTimeDraft] = useState<{ h: number; m: number }>({ h: 11, m: 0 });
  const [catchupScheduleMode, setCatchupScheduleMode] = useState<'weekdays' | 'dates'>('weekdays');
  const [catchupEnabled, setCatchupEnabled] = useState<boolean>(true);
  const [catchupTimeHm, setCatchupTimeHm] = useState<string>('12:00');
  const [catchupWeekdays, setCatchupWeekdays] = useState<Set<number>>(() => new Set([0, 1, 2, 3, 4])); // Sun-Thu
  const [catchupDates, setCatchupDates] = useState<Set<string>>(() => new Set());
  const [catchupDatesDialogOpen, setCatchupDatesDialogOpen] = useState(false);
  const [catchupCalendarMonth, setCatchupCalendarMonth] = useState(() => new Date());

  const [recipientsPreviewOpen, setRecipientsPreviewOpen] = useState(false);
  const [recipientsPreviewTitle, setRecipientsPreviewTitle] = useState('מוזמנים');
  const [recipientsPreviewRows, setRecipientsPreviewRows] = useState<
    Array<{ id: string; name: string; phone?: string; status?: string }>
  >([]);
  const [recipientsPreviewHint, setRecipientsPreviewHint] = useState<string>('');
  const [recipientsPreviewSearch, setRecipientsPreviewSearch] = useState('');

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerRow, setViewerRow] = useState<NotificationSettingRow | null>(null);
  const [viewerRecipientsLoading, setViewerRecipientsLoading] = useState(false);
  const [viewerRecipientsTitle, setViewerRecipientsTitle] = useState('מוזמנים');
  const [viewerRecipientsRows, setViewerRecipientsRows] = useState<Array<{ id: string; name: string; phone?: string; status?: string }>>(
    []
  );
  const [viewerRecipientsHint, setViewerRecipientsHint] = useState('');
  const [viewerRecipientsSearch, setViewerRecipientsSearch] = useState('');

  const [lastSmsRunBySettingId, setLastSmsRunBySettingId] = useState<Record<string, SmsRunSummary | undefined>>({});
  const [queuedCatchupBySettingId, setQueuedCatchupBySettingId] = useState<
    Record<string, { count: number; nextDueAt?: string | null }>
  >({});
  const [catchupOpen, setCatchupOpen] = useState(false);
  const [catchupLoading, setCatchupLoading] = useState(false);
  const [catchupTitle, setCatchupTitle] = useState('אורחים חדשים בתור');
  const [catchupSearch, setCatchupSearch] = useState('');
  const [catchupRows, setCatchupRows] = useState<
    Array<{ guestId: string; name: string; phone?: string; dueAt: string; lastError?: string | null }>
  >([]);
  const [stepCatchupRows, setStepCatchupRows] = useState<
    Array<{ guestId: string; name: string; phone?: string; dueAt: string; status: 'queued' | 'sent' | 'cancelled'; lastError?: string | null }>
  >([]);
  const [stepCatchupLoading, setStepCatchupLoading] = useState(false);
  const [sendStatusOpen, setSendStatusOpen] = useState(false);
  const [sendStatusLoading, setSendStatusLoading] = useState(false);
  const [sendStatusTitle, setSendStatusTitle] = useState('סטטוס שליחה');
  const [sendStatusRun, setSendStatusRun] = useState<SmsRunSummary | null>(null);
  const [sendStatusSearch, setSendStatusSearch] = useState('');
  const [sendStatusRows, setSendStatusRows] = useState<
    Array<{ guestId: string; name: string; phone?: string; guestStatus?: string; sendStatus: 'sent' | 'failed' | 'skipped'; sentAt?: string | null; error?: string | null }>
  >([]);

  const [toastText, setToastText] = useState<string | null>(null);
  const messageInputRef = useRef<TextInput | null>(null);
  const toastTimerRef = useRef<any>(null);

  const showToast = useCallback((text: string) => {
    setToastText(text);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastText(null), 2200);
  }, []);

  const handleExportPendingGuests = useCallback(() => {
    if (exportingPendingGuests) return;
    const pendingCount = allGuests.filter((guest) => String(guest.status || '').trim() === 'ממתין').length;
    if (pendingCount === 0) {
      showToast('אין מוזמנים בסטטוס ממתין לייצוא');
      return;
    }

    setExportingPendingGuests(true);
    try {
      const result = exportPendingGuestsToExcel(allGuests, {
        eventTitle: String((event as any)?.title || ownerTitle || 'אירוע'),
        eventRsvpLink: String((event as any)?.rsvpLink || ''),
      });
      showToast(`יוצאו ${result.count} מוזמנים ממתינים לאקסל`);
    } catch (error) {
      console.warn('Failed to export pending guests:', error);
      showToast('לא ניתן לייצא את רשימת הממתינים');
    } finally {
      setExportingPendingGuests(false);
    }
  }, [allGuests, event, exportingPendingGuests, ownerTitle, showToast]);

  const formatHeDateTimeShort = (value: unknown) => {
    const d = value instanceof Date ? value : new Date(String(value ?? ''));
    if (!Number.isFinite(d.getTime())) return '';
    const date = d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
    const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    return `${date} ${time}`;
  };

  const formatDueAtQueue = (dueAt: string) => {
    const d = new Date(String(dueAt ?? ''));
    if (!Number.isFinite(d.getTime())) return '—';
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dueDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = Math.round((dueDay.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
    const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    if (diff === 0) return `היום, ${time}`;
    if (diff === 1) return `מחר, ${time}`;
    const date = d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
    return `${date}, ${time}`;
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
    const sid = String(row.id);
    let run = lastSmsRunBySettingId[sid];

    // The runs map is loaded once when entering the screen; refresh it on demand so
    // newly-scheduled flow steps can show their status without a full page reload.
    if (!run?.id) {
      try {
        const { data: latest, error } = await supabase
          .from('scheduled_notification_sms_runs')
          .select('id, notification_setting_id, status, claimed_at, error')
          .eq('notification_setting_id', sid)
          .order('claimed_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!error && latest?.id) {
          run = {
            id: String((latest as any).id),
            notification_setting_id: String((latest as any).notification_setting_id || sid),
            status: String((latest as any).status ?? ''),
            claimed_at: String((latest as any).claimed_at ?? ''),
            error: (latest as any).error ? String((latest as any).error) : null,
          };
          setLastSmsRunBySettingId((prev) => ({ ...prev, [sid]: run }));
        }
      } catch (e) {
        console.warn('Failed to refresh last sms run:', e);
      }
    }

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

  const openCatchupQueue = async (row: NotificationSettingRow) => {
    if (!row?.id || !resolvedEventId) {
      showToast('אין תור להצגה עדיין');
      return;
    }
    setCatchupTitle(`אורחים חדשים בתור · ${getDisplayTitle(row)}`);
    setCatchupSearch('');
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
      showToast('לא ניתן לטעון את התור');
      setCatchupOpen(false);
    } finally {
      setCatchupLoading(false);
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

  // Full event details shown to the manager inside the editor, each copyable,
  // so they can fill the message / WhatsApp template fields easily.
  const eventDetailRows = useMemo(() => {
    const ev: any = event || {};
    const loc = String(ev?.location ?? '').trim();
    const city = String(ev?.city ?? '').trim();
    const rows: Array<{ key: string; label: string; value: string }> = [
      { key: 'title', label: 'שם האירוע', value: subtitleFromEvent(event) },
      { key: 'date', label: 'תאריך', value: formatHeDate(ev?.date) || '' },
      { key: 'reception', label: 'קבלת פנים', value: String(ev?.receptionTime ?? ev?.reception_time ?? '').trim() },
      { key: 'ceremony', label: 'חופה / טקס', value: String(ev?.ceremonyTime ?? ev?.ceremony_time ?? '').trim() },
      { key: 'location', label: 'אולם / מקום', value: loc },
      { key: 'city', label: 'עיר', value: city },
      { key: 'venueFull', label: 'מקום מלא', value: buildEventLocationText(loc, city) || '' },
      { key: 'groom', label: 'שם החתן', value: groomName },
      { key: 'bride', label: 'שם הכלה', value: brideName },
      { key: 'couple', label: 'שמות בני הזוג', value: coupleNames },
      { key: 'groomParents', label: 'הורי החתן', value: String(ev?.groomParents ?? ev?.groom_parents ?? '').trim() },
      { key: 'brideParents', label: 'הורי הכלה', value: String(ev?.brideParents ?? ev?.bride_parents ?? '').trim() },
      { key: 'rsvp', label: 'קישור לאישור הגעה', value: String(ev?.rsvpLink ?? ev?.rsvp_link ?? '').trim() },
    ];
    return rows.filter((r) => r.value && r.value !== '—');
  }, [event, groomName, brideName, coupleNames]);

  const copyEventDetail = useCallback(
    async (value: string, label: string) => {
      const text = String(value ?? '').trim();
      if (!text) return;
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
        } else if (typeof document !== 'undefined') {
          const ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        showToast(`הועתק: ${label}`);
      } catch {
        showToast('לא ניתן להעתיק');
      }
    },
    [showToast]
  );

  const previewVars = useMemo(() => {
    const eventTitle = subtitleFromEvent(event);
    const eventDateText = formatHeDate((event as any)?.date) || '—';
    const loc = String((event as any)?.location ?? '').trim();
    const city = String((event as any)?.city ?? '').trim();
    const eventLocationText = buildEventLocationText(loc, city) || '—';
    const previewDirectionsText = buildDirectionsDetailsText('https://moon-events.co.il', 'demo123');

    const vars: Record<string, string> = {
      // שם האורח הוא דוגמה בלבד (אין לנו אורח ספציפי בתצוגה הזאת)
      '{name}': 'אורח/ת',
      '{link}': 'https://example.com/i/XXXX',

      '{שם_פרטי}': 'אורח/ת',
      '{שם_אירוע}': eventTitle,
      '{תאריך}': eventDateText,
      '{מיקום}': eventLocationText,
      '{פרטי הגעה}': previewDirectionsText,
      '{פרטי_הגעה}': previewDirectionsText,

      // Backward-compatible (older saved templates may still contain double-braces)
      '{{שם_פרטי}}': 'אורח/ת',
      '{{שם_אירוע}}': eventTitle,
      '{{תאריך}}': eventDateText,
      '{{מיקום}}': eventLocationText,
      '{{פרטי הגעה}}': previewDirectionsText,
      '{{פרטי_הגעה}}': previewDirectionsText,
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
    const rawRows = (rows as any[]) || [];
    const existingMap = new Map<string, any>(rawRows.map((r) => [r.notification_type, r]));
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
        if (Boolean((existing as any)?.ui_hidden)) return null as any;
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
          recipient_mode: (existing as any)?.recipient_mode ? String((existing as any).recipient_mode) : null,
          late_catchup_enabled:
            (existing as any)?.late_catchup_enabled === null || (existing as any)?.late_catchup_enabled === undefined
              ? null
              : Boolean((existing as any).late_catchup_enabled),
          late_catchup_send_time: (existing as any)?.late_catchup_send_time ? String((existing as any).late_catchup_send_time) : null,
          late_catchup_weekdays: Array.isArray((existing as any)?.late_catchup_weekdays)
            ? ((existing as any).late_catchup_weekdays as any[]).map((x) => Number(x)).filter((n) => Number.isFinite(n))
            : null,
          late_catchup_schedule_mode: (existing as any)?.late_catchup_schedule_mode
            ? (String((existing as any).late_catchup_schedule_mode).trim() as any)
            : null,
          late_catchup_dates: Array.isArray((existing as any)?.late_catchup_dates)
            ? ((existing as any).late_catchup_dates as any[]).map((x) => String(x)).filter(Boolean)
            : null,
          ui_hidden: Boolean((existing as any)?.ui_hidden),
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
        recipient_mode: tpl.notification_type === 'reminder_1' ? 'all' : null,
        late_catchup_enabled: tpl.notification_type === 'reminder_1' ? true : null,
        late_catchup_send_time: tpl.notification_type === 'reminder_1' ? '12:00:00' : null,
        late_catchup_weekdays: tpl.notification_type === 'reminder_1' ? [0, 1, 2, 3, 4] : null,
        late_catchup_schedule_mode: tpl.notification_type === 'reminder_1' ? 'weekdays' : null,
        late_catchup_dates: tpl.notification_type === 'reminder_1' ? [] : null,
        ui_hidden: false,
      };
    }).filter(Boolean) as any;

    setNotificationSettings(merged);

    // Flow Builder steps: notification_type is unique (e.g. "flow_step:<uuid>")
    // Keep it resilient if new columns are not present yet (they'll be undefined).
    const eventDateRaw = (eventForDefaults as any)?.date;
    const evDate = eventDateRaw ? new Date(String(eventDateRaw)) : new Date('invalid');
    const flowRows = rawRows.filter((r) => String(r?.notification_type || '').startsWith('flow_step:'));
    const mappedFlow: NotificationSettingRow[] = flowRows
      .map((r) => {
        if (Boolean((r as any)?.ui_hidden)) return null as any;
        const notifDateRaw = (r as any)?.notification_date;
        const notifDate = notifDateRaw ? new Date(String(notifDateRaw)) : null;
        const computedDays =
          notifDate && Number.isFinite(notifDate.getTime()) && Number.isFinite(evDate.getTime())
            ? diffDaysLocal(notifDate, evDate)
            : 0;
        const days =
          typeof (r as any)?.days_from_wedding === 'number' ? Number((r as any).days_from_wedding) : computedDays;

        return {
          id: (r as any)?.id ? String((r as any).id) : undefined,
          event_id: (r as any)?.event_id ? String((r as any).event_id) : undefined,
          notification_type: String((r as any)?.notification_type || '').trim(),
          title: String((r as any)?.title ?? 'שלב'),
          enabled: Boolean((r as any)?.enabled),
          message_content: String((r as any)?.message_content ?? ''),
          days_from_wedding: days,
          channel: ((r as any)?.channel as any) || 'SMS',
          notification_date: (r as any)?.notification_date ? String((r as any).notification_date) : null,
          recipient_guest_ids: Array.isArray((r as any).recipient_guest_ids)
            ? ((r as any).recipient_guest_ids as any[]).map((x) => String(x))
            : [],
          flow_id: (r as any)?.flow_id ? String((r as any).flow_id) : null,
          sort_order: typeof (r as any)?.sort_order === 'number' ? Number((r as any).sort_order) : 0,
          depends_on_setting_id: (r as any)?.depends_on_setting_id ? String((r as any).depends_on_setting_id) : null,
          recipient_mode: (r as any)?.recipient_mode ? String((r as any).recipient_mode) : null,
          recipient_rule: (r as any)?.recipient_rule ?? null,
          ui_hidden: Boolean((r as any)?.ui_hidden),
        };
      })
      .filter((r) => Boolean(r.notification_type));

    mappedFlow.sort((a, b) => {
      const oa = Number((a as any).sort_order ?? 0) || 0;
      const ob = Number((b as any).sort_order ?? 0) || 0;
      if (oa !== ob) return oa - ob;
      const da = a.notification_date ? new Date(String(a.notification_date)).getTime() : 0;
      const db = b.notification_date ? new Date(String(b.notification_date)).getTime() : 0;
      return da - db;
    });
    setFlowSteps(mappedFlow);

    // Fetch last SMS runs (per setting) for status UI.
    try {
      const settingIds = [...merged, ...mappedFlow]
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

    // Fetch queued catch-up counts for reminder_1 (best-effort; DB might not have the table yet).
    try {
      const reminder1 = merged.find((r) => r.notification_type === 'reminder_1' && r.id && (r.channel || 'SMS') === 'SMS');
      if (!reminder1?.id) {
        setQueuedCatchupBySettingId({});
      } else {
        const { data: qRows, error: qError } = await supabase
          .from('notification_sms_catchup_queue')
          .select('notification_setting_id, due_at')
          .eq('event_id', evtId)
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

        // Load WhatsApp template registry + daily quota usage (best-effort).
        try {
          const [tpls, settings, today, tokenStatus] = await Promise.all([
            whatsappTemplateService.list().catch(() => []),
            whatsappTemplateService.getSettings().catch(() => ({ dailyQuota: 0 })),
            whatsappTemplateService.sentToday().catch(() => 0),
            whatsappTemplateService.getTokenStatus().catch(() => ({ hasToken: false, hint: null, updatedAt: null })),
          ]);
          if (!cancelled) {
            setWaTemplates(tpls);
            setWaDailyQuota(settings.dailyQuota || 0);
            setWaSentToday(today);
            setWaTokenStatus(tokenStatus);
          }
        } catch (e) {
          console.warn('Failed to load WhatsApp registry (couple web):', e);
        }

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

  const editorRow = useMemo(() => {
    if (!editorType) return null;
    const nt = String(editorType || '').trim();
    if (!nt) return null;
    const inTemplates = notificationSettings.find((r) => r.notification_type === nt) || null;
    if (inTemplates) return inTemplates;
    return flowSteps.find((r) => r.notification_type === nt) || null;
  }, [editorType, flowSteps, notificationSettings]);

  const loadStepCatchupQueue = useCallback(async () => {
    if (!editorRow?.id || !resolvedEventId) {
      setStepCatchupRows([]);
      return;
    }
    setStepCatchupLoading(true);
    try {
      const { data: qRows, error: qError } = await supabase
        .from('notification_sms_catchup_queue')
        .select('guest_id, due_at, last_error, status')
        .eq('event_id', resolvedEventId)
        .eq('notification_setting_id', String(editorRow.id))
        .in('status', ['queued', 'sent'])
        .order('due_at', { ascending: true });
      if (qError) throw qError;

      const base = ((qRows as any[]) || []).map((r) => ({
        guestId: String((r as any).guest_id),
        dueAt: String((r as any).due_at),
        lastError: (r as any).last_error ? String((r as any).last_error) : null,
        status: String((r as any).status || 'queued') as 'queued' | 'sent' | 'cancelled',
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

      setStepCatchupRows(
        base.map((r) => {
          const g = byId.get(r.guestId);
          return {
            guestId: r.guestId,
            name: g?.name || '—',
            phone: g?.phone,
            dueAt: r.dueAt,
            status: r.status,
            lastError: r.lastError,
          };
        })
      );
    } catch (e) {
      console.warn('Failed to load step catchup queue:', e);
      setStepCatchupRows([]);
    } finally {
      setStepCatchupLoading(false);
    }
  }, [editorRow?.id, resolvedEventId]);

  const editorWizardSteps = useMemo<EditorWizardStepId[]>(() => {
    if (!editorOpen || !editorRow || editorKind !== 'template') return ['message'];
    const nt = String(editorRow.notification_type || '').trim();
    const channel = String((editorRow as any)?.channel || 'SMS');
    const steps: EditorWizardStepId[] = ['schedule'];
    if (channel === 'SMS' && (nt === 'reminder_1' || nt === 'reminder_2')) steps.push('recipients');
    if (nt === 'reminder_1' && channel === 'SMS') steps.push('catchup');
    steps.push('message');
    return steps;
  }, [editorKind, editorOpen, editorRow]);

  const editorWizardStepId =
    editorWizardSteps[Math.min(editorWizardStepIdx, Math.max(0, editorWizardSteps.length - 1))] ?? 'schedule';
  const editorWizardIsLast = editorWizardStepIdx >= editorWizardSteps.length - 1;
  const editorIsWhatsapp = String((editorRow as any)?.channel || 'SMS').toUpperCase() === 'WHATSAPP';

  const guestIdsForGroup = useCallback(
    (group: string): string[] => {
      const byStatus = (set: string[]) =>
        allGuests.filter((g) => set.includes(String(g.status || '').trim())).map((g) => String(g.id));
      if (group === 'all') return allGuests.map((g) => String(g.id));
      if (group === 'pending') return byStatus(['ממתין']);
      if (group === 'coming') return byStatus(['מגיע', 'אישר']);
      if (group === 'not_coming') return byStatus(['לא מגיע', 'לא מגיעים']);
      if (group === 'maybe') return byStatus(['אולי מגיע']);
      return [];
    },
    [allGuests]
  );

  const waManualMode = editorIsWhatsapp && flowDraft?.recipientMode === 'manual';

  const waSelectedRecipientIds = useMemo(() => {
    if (waManualMode) return new Set(pickerSelectedIds);
    const groups = flowDraft?.recipientGroups || [];
    const set = new Set<string>();
    for (const g of groups) for (const id of guestIdsForGroup(g)) set.add(id);
    return set;
  }, [waManualMode, pickerSelectedIds, flowDraft?.recipientGroups, guestIdsForGroup]);

  const waRecipientCount = waSelectedRecipientIds.size;
  const waQuotaRemaining = Math.max(0, Number(waDailyQuota || 0) - Number(waSentToday || 0));
  const waOverQuota = Number(waDailyQuota || 0) > 0 && waRecipientCount > waQuotaRemaining;

  useEffect(() => {
    if (!editorOpen) return;
    setEditorWizardStepIdx(0);
  }, [editorKind, editorOpen, editorType]);

  useEffect(() => {
    if (
      editorOpen &&
      editorKind === 'template' &&
      editorWizardStepId === 'catchup' &&
      String(editorRow?.notification_type || '') === 'reminder_1' &&
      editorRow?.id
    ) {
      void loadStepCatchupQueue();
    }
  }, [editorOpen, editorKind, editorWizardStepId, editorRow?.id, editorRow?.notification_type, loadStepCatchupQueue]);

  const runCatchupBackfill = useCallback(async () => {
    if (!canEdit) {
      showToast('לצפייה בלבד');
      return;
    }
    if (!resolvedEventId) {
      showToast('אין אירוע פעיל');
      return;
    }
    try {
      const { error } = await supabase.rpc('backfill_first_message_catchup_queue', { p_event_id: resolvedEventId });
      if (error) throw error;
      showToast('התור עודכן');
      await loadStepCatchupQueue();
      const reminder1 = (notificationSettings || []).find((r) => r.notification_type === 'reminder_1' && r.id);
      if (reminder1?.id) {
        const { data: qRows } = await supabase
          .from('notification_sms_catchup_queue')
          .select('due_at')
          .eq('event_id', resolvedEventId)
          .eq('notification_setting_id', String(reminder1.id))
          .eq('status', 'queued')
          .order('due_at', { ascending: true });
        const list = (qRows as any[]) || [];
        setQueuedCatchupBySettingId((prev) => ({
          ...prev,
          [String(reminder1.id)]: { count: list.length, nextDueAt: list[0] ? String((list[0] as any).due_at) : null },
        }));
      }
    } catch (e) {
      console.warn('Backfill catchup queue:', e);
      showToast('לא ניתן לעדכן את התור');
    }
  }, [canEdit, resolvedEventId, loadStepCatchupQueue, notificationSettings, showToast]);

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

  const MESSAGE_MAX_CHARS = 250;

  const normalizeTemplateToSingleBraces = (raw: string) => {
    const stripMarks = (s: string) => String(s || '').replace(/[\u200E\u200F\u202A-\u202E]/g, '').trim();
    return String(raw || '').replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_m, inner) => `{${stripMarks(inner)}}`);
  };

  const focusMessageInput = useCallback((selection?: { start: number; end: number }) => {
    const run = () => {
      const input = messageInputRef.current as any;
      input?.focus?.();
      if (selection && typeof input?.setNativeProps === 'function') {
        input.setNativeProps({ selection });
      }
    };

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(run);
      return;
    }
    setTimeout(run, 0);
  }, []);

  const handleMessageSelectionChange = useCallback((e: any) => {
    const start = Math.max(0, Number(e?.nativeEvent?.selection?.start ?? 0));
    const end = Math.max(start, Number(e?.nativeEvent?.selection?.end ?? start));
    setMessageSelection({ start, end });
  }, []);

  const handleMessageChange = useCallback((text: string) => {
    const normalized = normalizeTemplateToSingleBraces(text).slice(0, MESSAGE_MAX_CHARS);
    setEditDraft((d) => (d ? { ...d, message: normalized } : d));
  }, []);

  const openEditor = (row: NotificationSettingRow) => {
    setEditorKind('template');
    setSelectedType(row.notification_type);
    setEditorType(row.notification_type);
    const days = Number(row.days_from_wedding || 0);
    const abs = Math.abs(days);
    const normalizedDays = -(abs || 30); // always "before"
    const draftMessage = normalizeTemplateToSingleBraces(String(row.message_content || '')).slice(0, MESSAGE_MAX_CHARS);
    setEditDraft({
      message: draftMessage,
      days: normalizedDays,
      timeHm: inferTimeHmFromExisting((row as any).notification_date),
    });
    setMessageSelection({ start: draftMessage.length, end: draftMessage.length });

    // Initialize catch-up schedule editor for reminder_1
    if (String(row.notification_type || '').trim() === 'reminder_1') {
      setCatchupEnabled(Boolean((row as any)?.late_catchup_enabled ?? true));
      const tRaw = String((row as any)?.late_catchup_send_time ?? '12:00:00');
      setCatchupTimeHm(tRaw.includes(':') ? tRaw.split(':').slice(0, 2).join(':') : '12:00');
      const modeRaw = String((row as any)?.late_catchup_schedule_mode ?? 'weekdays').trim();
      setCatchupScheduleMode(modeRaw === 'dates' ? 'dates' : 'weekdays');
      const wd = Array.isArray((row as any)?.late_catchup_weekdays)
        ? ((row as any).late_catchup_weekdays as any[]).map((x) => Number(x)).filter((n) => Number.isFinite(n))
        : [0, 1, 2, 3, 4];
      setCatchupWeekdays(new Set(wd.map((n) => Math.max(0, Math.min(6, Number(n) || 0)))));
      const dates = Array.isArray((row as any)?.late_catchup_dates)
        ? ((row as any).late_catchup_dates as any[]).map((x) => String(x)).filter(Boolean)
        : [];
      setCatchupDates(new Set(dates));
    }

    // Initialize recipients wizard state for template editor
    {
      const nt = String(row.notification_type || '').trim();
      const ids = Array.isArray((row as any).recipient_guest_ids)
        ? ((row as any).recipient_guest_ids as any[]).map((x) => String(x)).filter(Boolean)
        : [];
      const mode = String((row as any)?.recipient_mode ?? '').trim();
      const isAutoAll = nt === 'reminder_1' && mode !== 'manual';
      setPickerTargetType(nt);
      setPickerSelectedIds(new Set(ids));
      setPickerSearch('');
      setPickerFilter(nt === 'reminder_2' ? 'pending' : 'all');
      setRecipientsWizardManual(!isAutoAll || ids.length > 0);
    }
    setFlowDraft(null);
    setEditorWizardStepIdx(0);
    setEditorOpen(true);
  };

  const openFlowEditor = (row: NotificationSettingRow) => {
    setEditorKind('flow');
    setSelectedType(row.notification_type);
    setEditorType(row.notification_type);
    const rawDt = (row as any)?.notification_date;
    const dt = rawDt ? new Date(String(rawDt)) : null;
    const hasValidDt = dt && Number.isFinite(dt.getTime());
    const days = typeof row.days_from_wedding === 'number' ? Number(row.days_from_wedding) : 0;
    const draftMessage = normalizeTemplateToSingleBraces(String(row.message_content || '')).slice(0, MESSAGE_MAX_CHARS);
    setEditDraft({
      message: draftMessage,
      days,
      timeHm: hasValidDt ? formatTime(dt as any) : '11:00',
    });
    setMessageSelection({ start: draftMessage.length, end: draftMessage.length });
    const rowMode = (String((row as any)?.recipient_mode || 'manual') as WaRecipientMode) || 'manual';
    const isWa = String((row as any)?.channel || 'SMS').toUpperCase() === 'WHATSAPP';
    const rawRule = (row as any)?.recipient_rule;
    const ruleGroups =
      rawRule && String(rawRule.mode || '') === 'groups' && Array.isArray(rawRule.groups)
        ? (rawRule.groups as any[]).map((x) => String(x)).filter(Boolean)
        : [];
    const statusGroupKeys = ['all', 'pending', 'coming', 'not_coming', 'maybe'];
    const initialGroups =
      ruleGroups.length > 0
        ? ruleGroups
        : statusGroupKeys.includes(rowMode)
          ? [rowMode]
          : ['all'];
    const savedIds = Array.isArray((row as any)?.recipient_guest_ids)
      ? ((row as any).recipient_guest_ids as any[]).map((x) => String(x)).filter(Boolean)
      : [];
    // WhatsApp: manual only when explicitly saved as manual with a concrete list; otherwise groups.
    const waMode: 'groups' | 'manual' = rowMode === 'manual' && savedIds.length > 0 ? 'manual' : 'groups';
    setPickerSelectedIds(new Set(savedIds));
    setPickerSearch('');
    setPickerFilter('all');
    setFlowDraft({
      title: String(row.title ?? 'שלב'),
      recipientMode: isWa ? (waMode === 'manual' ? 'manual' : 'groups') : rowMode,
      recipientGroups: initialGroups,
      dependsOnSettingId: (row as any)?.depends_on_setting_id ? String((row as any).depends_on_setting_id) : null,
      whatsappTemplateId: (row as any)?.whatsapp_template_id ? String((row as any).whatsapp_template_id) : null,
      whatsappParams: ((row as any)?.whatsapp_params as WhatsAppStepParams) || {},
    });
    setEditorWizardStepIdx(0);
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditorType(null);
    setEditorKind('template');
    setMessageSelection({ start: 0, end: 0 });
    setFlowDraft(null);
    setDependsPickerOpen(false);
    setAddWizardOpen(false);
    setDateDialogOpen(false);
    setTimeDialogOpen(false);
    setRecipientsPreviewOpen(false);
    setRecipientsPreviewSearch('');
  };

  const getRecipientsPreviewData = useCallback(
    async (row: NotificationSettingRow) => {
      const nt = String(row.notification_type || '').trim();
      const ids = Array.isArray((row as any).recipient_guest_ids)
        ? ((row as any).recipient_guest_ids as any[]).map((x) => String(x))
        : [];

      const isFlow = nt.startsWith('flow_step:');
      const recipientMode = isFlow ? String((row as any)?.recipient_mode || 'manual') : null;
      const isAutoPending = nt === 'reminder_2' || (isFlow && recipientMode === 'pending');
      const isAutoAll = !isFlow && nt === 'reminder_1' && String((row as any)?.recipient_mode ?? '').trim() !== 'manual';

      if (isAutoAll && ids.length === 0) {
        return {
          title: 'מוזמנים (כל האורחים)',
          hint: 'הבחירה היא אוטומטית — ההודעה תישלח לכל האורחים באירוע.',
          rows: allGuests.map((g) => ({ id: String(g.id), name: String(g.name || ''), phone: g.phone, status: g.status })),
        };
      }

      if (isAutoPending && ids.length === 0) {
        const pending = allGuests.filter((g) => String(g.status || '').trim() === 'ממתין');
        return {
          title: 'מוזמנים (ממתינים)',
          hint: isFlow
            ? 'הבחירה היא דינאמית — תישלח אוטומטית לכל המוזמנים במצב ממתין.'
            : 'לא נבחרה רשימה — תישלח אוטומטית לכל הממתינים.',
          rows: pending.map((g) => ({ id: String(g.id), name: String(g.name || ''), phone: g.phone, status: g.status })),
        };
      }

      if (isFlow && recipientMode === 'prev_pending') {
        const dependsOn = String((row as any)?.depends_on_setting_id || '').trim();
        if (!dependsOn) {
          return { title: 'מוזמנים', hint: 'לא הוגדר שלב קודם.', rows: [] as any[] };
        }
        try {
          const { data: prevRun, error: runErr } = await supabase
            .from('scheduled_notification_sms_runs')
            .select('id, status, claimed_at')
            .eq('notification_setting_id', dependsOn)
            .order('claimed_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (runErr || !prevRun?.id) {
            return {
              title: 'מוזמנים (שלב קודם)',
              hint: 'אין עדיין שליחה קודמת שממנה ניתן לגזור רשימה.',
              rows: [] as any[],
            };
          }

          const { data: recRows, error: recErr } = await supabase
            .from('scheduled_notification_sms_run_recipients')
            .select('guest_id, status')
            .eq('run_id', String((prevRun as any).id))
            .eq('status', 'sent')
            .order('created_at', { ascending: true });
          if (recErr) throw recErr;
          const prevIds = ((recRows as any[]) || []).map((r) => String((r as any).guest_id)).filter(Boolean);
          const pendingIds = new Set(allGuests.filter((g) => String(g.status || '').trim() === 'ממתין').map((g) => String(g.id)));
          const idsToShow = prevIds.filter((id) => pendingIds.has(String(id)));
          const byId = new Map(allGuests.map((g) => [String(g.id), g]));
          const selected = idsToShow
            .map((id) => byId.get(String(id)))
            .filter(Boolean)
            .map((g: any) => ({ id: String(g.id), name: String(g.name || ''), phone: g.phone, status: g.status }));

          return {
            title: 'מוזמנים (ממתינים מהשלב הקודם)',
            hint: 'מחושב לפי שליחה אחרונה של השלב הקודם + סטטוס ממתין.',
            rows: selected,
          };
        } catch (e) {
          console.warn('Failed to compute prev_pending preview:', e);
          return { title: 'מוזמנים', hint: 'לא ניתן לחשב כרגע את הרשימה.', rows: [] as any[] };
        }
      }

      const byId = new Map(allGuests.map((g) => [String(g.id), g]));
      const selected = ids
        .map((id) => byId.get(String(id)))
        .filter(Boolean)
        .map((g: any) => ({ id: String(g.id), name: String(g.name || ''), phone: g.phone, status: g.status }));

      return { title: 'מוזמנים שנבחרו', hint: '', rows: selected };
    },
    [allGuests]
  );

  const openRecipientsPreview = useCallback(
    async (row: NotificationSettingRow) => {
      const data = await getRecipientsPreviewData(row);
      setRecipientsPreviewTitle(String((data as any).title || 'מוזמנים'));
      setRecipientsPreviewHint(String((data as any).hint || ''));
      setRecipientsPreviewRows(((data as any).rows as any[]) || []);
      setRecipientsPreviewSearch('');
      setRecipientsPreviewOpen(true);
    },
    [getRecipientsPreviewData]
  );

  const closeViewer = useCallback(() => {
    setViewerOpen(false);
    setViewerRow(null);
    setViewerRecipientsLoading(false);
    setViewerRecipientsTitle('מוזמנים');
    setViewerRecipientsRows([]);
    setViewerRecipientsHint('');
    setViewerRecipientsSearch('');
  }, []);

  const openViewer = useCallback(
    async (row: NotificationSettingRow) => {
      setViewerRow(row);
      setViewerOpen(true);
      setViewerRecipientsSearch('');
      setViewerRecipientsLoading(true);
      try {
        const data = await getRecipientsPreviewData(row);
        setViewerRecipientsTitle(String((data as any).title || 'מוזמנים'));
        setViewerRecipientsHint(String((data as any).hint || ''));
        setViewerRecipientsRows(((data as any).rows as any[]) || []);
      } finally {
        setViewerRecipientsLoading(false);
      }
    },
    [getRecipientsPreviewData]
  );

  const rowsByType = useMemo(() => {
    return new Map<string, NotificationSettingRow>(notificationSettings.map((r) => [String(r.notification_type), r]));
  }, [notificationSettings]);

  const displayRows = useMemo(() => {
    const order = ['reminder_1', 'reminder_2', 'whatsapp_event_day', 'after_1'];
    // Fully dynamic: only show the legacy preset cards that already exist in the DB
    // (so existing events keep working). New events start empty and are built via
    // dynamic steps ("הוסף כרטיסיה").
    return order
      .map((t) => rowsByType.get(t))
      .filter((r) => Boolean(r) && Boolean((r as any)?.id)) as NotificationSettingRow[];
  }, [rowsByType]);

  const flowStepsSorted = useMemo(() => {
    const list = Array.isArray(flowSteps) ? [...flowSteps] : [];
    list.sort((a, b) => {
      const oa = Number((a as any).sort_order ?? 0) || 0;
      const ob = Number((b as any).sort_order ?? 0) || 0;
      if (oa !== ob) return oa - ob;
      const da = a.notification_date ? new Date(String(a.notification_date)).getTime() : 0;
      const db = b.notification_date ? new Date(String(b.notification_date)).getTime() : 0;
      return da - db;
    });
    return list;
  }, [flowSteps]);

  // Combine built-in cards + flow steps into one ordered list.
  // Flow steps use `sort_order` as an insertion index (1-based) among ALL cards.
  const combinedCards = useMemo(() => {
    type CardItem = { kind: 'template' | 'flow'; row: NotificationSettingRow };

    const templates: CardItem[] = displayRows.map((r) => ({ kind: 'template', row: r }));
    const flows: CardItem[] = [...flowStepsSorted]
      .filter((s) => !Boolean((s as any)?.ui_hidden))
      .sort((a, b) => (Number((a as any).sort_order ?? 0) || 0) - (Number((b as any).sort_order ?? 0) || 0))
      .map((r) => ({ kind: 'flow', row: r }));

    const out: CardItem[] = [...templates];
    for (const f of flows) {
      const posRaw = Number((f.row as any)?.sort_order ?? 0) || 0;
      const idx = Math.max(0, Math.min(out.length, Math.floor(posRaw) - 1));
      out.splice(idx, 0, f);
    }
    return out;
  }, [displayRows, flowStepsSorted]);

  const timelineRows = useMemo(() => combinedCards.map((c) => c.row), [combinedCards]);
  const timelineUseScroll = timelineRows.length > 6;
  const adminHeaderMetaItems = useMemo(
    () =>
      showAdminChrome
        ? [subtitleFromEvent(event), formatHeDate((event as any)?.date), timelineRows.length ? `${timelineRows.length} הודעות` : '']
            .filter(Boolean)
            .map((item) => String(item))
        : [],
    [event, showAdminChrome, timelineRows.length]
  );

  const iconForType = (row: NotificationSettingRow) => {
    const t = row.notification_type;
    if (String(row.channel || 'SMS') === 'WHATSAPP') return 'logo-whatsapp';
    if (t.includes('reminder_1')) return 'megaphone-outline';
    if (t.includes('reminder_2')) return 'calendar-outline';
    if (t.includes('after')) return 'heart-outline';
    return 'mail-outline';
  };

  const getRowTone = (row: NotificationSettingRow, isFlow = false) => {
    const t = String(row.notification_type || '').trim();
    if (String(row.channel || 'SMS') === 'WHATSAPP') {
      return {
        accent: '#22C55E',
        soft: 'rgba(34,197,94,0.10)',
        border: 'rgba(34,197,94,0.18)',
        icon: 'rgba(34,197,94,0.14)',
      };
    }
    if (isFlow) {
      return {
        accent: '#8B5CF6',
        soft: 'rgba(139,92,246,0.10)',
        border: 'rgba(139,92,246,0.18)',
        icon: 'rgba(139,92,246,0.14)',
      };
    }
    if (t.includes('reminder_1')) {
      return {
        accent: '#2563EB',
        soft: 'rgba(37,99,235,0.10)',
        border: 'rgba(37,99,235,0.18)',
        icon: 'rgba(37,99,235,0.14)',
      };
    }
    if (t.includes('reminder_2')) {
      return {
        accent: '#4F46E5',
        soft: 'rgba(79,70,229,0.10)',
        border: 'rgba(79,70,229,0.18)',
        icon: 'rgba(79,70,229,0.14)',
      };
    }
    if (t.includes('after')) {
      return {
        accent: '#F59E0B',
        soft: 'rgba(245,158,11,0.12)',
        border: 'rgba(245,158,11,0.20)',
        icon: 'rgba(245,158,11,0.16)',
      };
    }
    return {
      accent: '#0F172A',
      soft: 'rgba(15,23,42,0.06)',
      border: 'rgba(15,23,42,0.10)',
      icon: 'rgba(15,23,42,0.08)',
    };
  };

  const toggleNotification = async (row: NotificationSettingRow) => {
    if (!canEdit) {
      showToast('לצפייה בלבד');
      return;
    }
    if (!event?.id) return;
    const nextEnabled = !row.enabled;
    const isFlow = String(row.notification_type || '').startsWith('flow_step:');

    if (isFlow) {
      setFlowSteps((prev) =>
        prev.map((r) => (r.notification_type === row.notification_type ? ({ ...(r as any), enabled: nextEnabled } as any) : r))
      );
    } else {
      setNotificationSettings((prev) =>
        prev.map((r) => (r.notification_type === row.notification_type ? { ...r, enabled: nextEnabled } : r))
      );
    }

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
      if (isFlow) {
        setFlowSteps((prev) =>
          prev.map((r) => (r.notification_type === row.notification_type ? ({ ...(r as any), enabled: row.enabled } as any) : r))
        );
      } else {
        setNotificationSettings((prev) =>
          prev.map((r) => (r.notification_type === row.notification_type ? { ...r, enabled: row.enabled } : r))
        );
      }
    }
  };

  const insertVariable = (token: string) => {
    if (!canEdit) return;
    if (!editDraft) return;
    const currentMessage = String(editDraft.message || '');
    const start = Math.min(Math.max(0, messageSelection.start), currentMessage.length);
    const end = Math.min(Math.max(start, messageSelection.end), currentMessage.length);
    const nextMessage = `${currentMessage.slice(0, start)}${token}${currentMessage.slice(end)}`.slice(0, MESSAGE_MAX_CHARS);
    const nextCaret = Math.min(start + token.length, nextMessage.length);
    const nextSelection = { start: nextCaret, end: nextCaret };

    setEditDraft((d) => (d ? { ...d, message: nextMessage } : d));
    setMessageSelection(nextSelection);
    focusMessageInput(nextSelection);
  };

  const openRecipientsPicker = (row: NotificationSettingRow) => {
    if (!canEdit) {
      showToast('לצפייה בלבד');
      return;
    }
    const nt = String(row.notification_type || '').trim();
    const isFlow = nt.startsWith('flow_step:');
    const recipientMode = isFlow ? String((row as any)?.recipient_mode || 'manual') : null;
    const shouldAutoPending = nt === 'reminder_2' || (isFlow && recipientMode === 'pending');
    if (isFlow && recipientMode !== 'manual') {
      showToast('בחירה ידנית זמינה רק במצב "בחירה ידנית"');
      return;
    }
    const ids = Array.isArray((row as any).recipient_guest_ids)
      ? ((row as any).recipient_guest_ids as any[]).map((x) => String(x))
      : [];
    setPickerTargetType(nt);
    setPickerSelectedIds(new Set(ids));
    setPickerSearch('');
    setPickerFilter(shouldAutoPending ? 'pending' : 'all');
    setPickerOpen(true);
  };

  const hideCard = async (row: NotificationSettingRow) => {
    if (!canEdit) {
      showToast('לצפייה בלבד');
      return;
    }
    if (!event?.id) return;
    const ok = typeof window !== 'undefined' ? window.confirm('למחוק את הכרטיסיה מהמסך? ניתן להחזיר רק דרך DB.') : true;
    if (!ok) return;
    const nt = String(row.notification_type || '').trim();
    if (!nt) return;

    try {
      if (row.id) {
        const { error } = await supabase
          .from('notification_settings')
          .update({ ui_hidden: true, enabled: false })
          .eq('id', row.id);
        if (error && isMissingColumn(error, 'ui_hidden')) throw error;
        if (error) throw error;
      } else {
        // create row just to persist ui_hidden
        const tpl = NOTIFICATION_TEMPLATES.find((t) => t.notification_type === nt);
        const payload: any = {
          event_id: event.id,
          notification_type: nt,
          title: getDisplayTitle(row),
          enabled: false,
          ui_hidden: true,
          message_content: String(row.message_content || '').trim() || tpl?.defaultMessage || getDefaultMessageContent(ownerTitle),
          days_from_wedding: typeof row.days_from_wedding === 'number' ? row.days_from_wedding : tpl?.days_from_wedding ?? 0,
          channel: (row.channel as any) || tpl?.channel || 'SMS',
        };
        const dt = computeNotificationDateTime((event as any)?.date, payload.days_from_wedding, '11:00');
        if (dt) payload.notification_date = dt.toISOString();
        let { error } = await supabase.from('notification_settings').insert(payload);
        if (error && isMissingColumn(error, 'ui_hidden')) throw error;
        if (error) throw error;
      }

      setNotificationSettings((prev) => prev.filter((r) => r.notification_type !== nt));
      if (selectedType === nt) {
        const fallback = (combinedCards.find((c) => c.row.notification_type !== nt)?.row?.notification_type as any) || 'reminder_1';
        setSelectedType(fallback);
      }
    } catch (e) {
      console.error('Failed to hide card:', e);
      alert('לא ניתן למחוק כרטיסיה (בדוק שהרצת את המיגרציה החדשה).');
    }
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
    if (!canEdit) {
      showToast('לצפייה בלבד');
      return;
    }
    if (!event?.id || !editorRow || !editDraft) return;
    if ((editDraft.message ?? '').length > MESSAGE_MAX_CHARS) {
      alert(`תוכן ההודעה מוגבל ל־${MESSAGE_MAX_CHARS} תווים. קיצר את ההודעה ושמור שוב.`);
      return;
    }
    setSaving(true);
    try {
      const isFlow = editorKind === 'flow' && String(editorRow.notification_type || '').startsWith('flow_step:');
      if (isFlow && !flowDraft) {
        alert('שגיאה: חסרים נתוני שלב');
        return;
      }

      const payload: any = {
        title: isFlow ? String(flowDraft?.title || 'שלב') : getDisplayTitle(editorRow),
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

      // Templates: reminder_1 defaults to "all guests" unless a manual list is provided.
      if (!isFlow && String(editorRow.notification_type || '').trim() === 'reminder_1') {
        // Catch-up schedule (queue after the first-message scheduled time has passed)
        payload.late_catchup_enabled = Boolean(catchupEnabled);
        const tt = normalizeTimeToDb(String(catchupTimeHm || '').trim());
        if (tt) payload.late_catchup_send_time = tt;
        payload.late_catchup_schedule_mode = catchupScheduleMode;
        if (catchupScheduleMode === 'dates') {
          payload.late_catchup_dates = Array.from(catchupDates).sort();
        } else {
          payload.late_catchup_weekdays = Array.from(catchupWeekdays).sort((a, b) => a - b);
        }

        // Only override recipients when explicitly provided by the caller.
        // (Avoid clobbering an existing manual list when saving other fields.)
        const hasRecipientsOverride = Boolean(opts && Object.prototype.hasOwnProperty.call(opts, 'recipientGuestIds'));
        if (hasRecipientsOverride) {
          const ids = Array.isArray(opts?.recipientGuestIds) ? opts?.recipientGuestIds || [] : [];
          if (ids.length > 0) {
            payload.recipient_mode = 'manual';
            payload.recipient_guest_ids = ids;
          } else {
            payload.recipient_mode = 'all';
            payload.recipient_guest_ids = [];
          }
        }
      }

      if (isFlow) {
        const flowChannel = String((editorRow as any)?.channel || 'SMS').toUpperCase();
        const isWa = flowChannel === 'WHATSAPP';

        if (isWa) {
          payload.depends_on_setting_id = null;
          payload.whatsapp_template_id = flowDraft?.whatsappTemplateId || null;
          payload.whatsapp_params = flowDraft?.whatsappParams || {};
          if (String(flowDraft?.recipientMode || '') === 'manual') {
            // WhatsApp steps: manual hand-picked recipients.
            payload.recipient_mode = 'manual';
            payload.recipient_rule = { mode: 'manual' };
            payload.recipient_guest_ids = Array.from(pickerSelectedIds);
          } else {
            // WhatsApp steps: multi-group audiences stored as recipient_mode='groups'.
            const groups = (flowDraft?.recipientGroups || []).filter(Boolean);
            payload.recipient_mode = 'groups';
            payload.recipient_rule = { mode: 'groups', groups };
            payload.recipient_guest_ids = [];
          }
        } else {
          const mode = String(flowDraft?.recipientMode || 'manual');
          payload.recipient_mode = mode;
          payload.depends_on_setting_id = flowDraft?.dependsOnSettingId ? String(flowDraft.dependsOnSettingId) : null;
          payload.recipient_rule =
            mode === 'prev_pending'
              ? { mode: 'prev_pending', dependsOn: payload.depends_on_setting_id }
              : { mode };
          if (mode !== 'manual') payload.recipient_guest_ids = [];
        }
      }

      if (editorRow.id) {
        const { error, payload: savedPayload } = await runWithMissingColumnRetries(payload, async (nextPayload) => {
          return await supabase.from('notification_settings').update(nextPayload).eq('id', editorRow.id!);
        });
        if (error) throw error;
        if (isFlow) {
          setFlowSteps((p) =>
            p.map((r) =>
              r.notification_type === editorRow.notification_type ? ({ ...(r as any), ...(savedPayload as any) } as any) : r
            )
          );
        } else {
          setNotificationSettings((p) => p.map((r) => (r.notification_type === editorRow.notification_type ? { ...r, ...savedPayload } : r)));
        }
        if (opts?.toastOnSuccess) showToast('השינויים נשמרו');
        if (opts?.closeOnSuccess) closeEditor();
        return;
      }

      if (isFlow) {
        alert('שגיאה: שלב חדש חייב להיווצר דרך "הוסף כרטיסיה"');
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
      if (Object.prototype.hasOwnProperty.call(payload, 'recipient_mode')) insertPayload.recipient_mode = payload.recipient_mode;
      if (Object.prototype.hasOwnProperty.call(payload, 'late_catchup_enabled')) insertPayload.late_catchup_enabled = payload.late_catchup_enabled;
      if (Object.prototype.hasOwnProperty.call(payload, 'late_catchup_send_time'))
        insertPayload.late_catchup_send_time = payload.late_catchup_send_time;
      if (Object.prototype.hasOwnProperty.call(payload, 'late_catchup_weekdays'))
        insertPayload.late_catchup_weekdays = payload.late_catchup_weekdays;
      if (Object.prototype.hasOwnProperty.call(payload, 'late_catchup_schedule_mode'))
        insertPayload.late_catchup_schedule_mode = payload.late_catchup_schedule_mode;
      if (Object.prototype.hasOwnProperty.call(payload, 'late_catchup_dates')) insertPayload.late_catchup_dates = payload.late_catchup_dates;

      const { data, error } = await runWithMissingColumnRetries(insertPayload, async (nextPayload) => {
        return await supabase.from('notification_settings').insert(nextPayload).select().single();
      });
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
    if (!canEdit) {
      showToast('לצפייה בלבד');
      return;
    }
    if (!event?.id) return;
    const nt = String(notificationType || '').trim();
    if (!nt) return;
    const ids = Array.isArray(guestIds) ? guestIds.map(String).map((s) => s.trim()).filter(Boolean) : [];

    const row =
      notificationSettings.find((r) => r.notification_type === nt) ||
      flowSteps.find((r) => r.notification_type === nt) ||
      null;
    if (!row) return;
    const isFlow = String(row.notification_type || '').startsWith('flow_step:');

    // Update local state immediately
    if (isFlow) {
      setFlowSteps((prev) =>
        prev.map((r) => (r.notification_type === nt ? ({ ...(r as any), recipient_guest_ids: ids } as any) : r))
      );
    } else {
      setNotificationSettings((prev) =>
        prev.map((r) =>
          r.notification_type === nt
            ? ({ ...(r as any), recipient_guest_ids: ids, ...(nt === 'reminder_1' ? { recipient_mode: 'manual' } : null) } as any)
            : r
        )
      );
    }

    // Persist to DB (upsert)
    try {
      if (row.id) {
        const updatePayload: any = { recipient_guest_ids: ids };
        if (!isFlow && nt === 'reminder_1') updatePayload.recipient_mode = 'manual';
        let { error } = await supabase.from('notification_settings').update(updatePayload).eq('id', row.id);
        if (error && isMissingColumn(error, 'recipient_guest_ids')) {
          // environment without migration
          throw error;
        }
        if (error && isMissingColumn(error, 'recipient_mode')) {
          delete updatePayload.recipient_mode;
          const retry = await supabase.from('notification_settings').update(updatePayload).eq('id', row.id);
          error = retry.error as any;
        }
        if (error) throw error;
        return;
      }

      if (isFlow) {
        alert('שגיאה: שלב חדש חייב להיווצר דרך "הוסף כרטיסיה"');
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
      if (!isFlow && nt === 'reminder_1') insertPayload.recipient_mode = 'manual';
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
      if (error && isMissingColumn(error, 'recipient_mode')) {
        delete insertPayload.recipient_mode;
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
    if (!canEdit) {
      showToast('לצפייה בלבד');
      return;
    }
    if (!event?.id || !editorRow || !editDraft) return;
    if (sendingNow) return;
    const sendChannel = String((editorRow as any)?.channel || 'SMS').toUpperCase();
    const sendIsWhatsapp = sendChannel === 'WHATSAPP';
    if (!sendIsWhatsapp) {
      if (!editDraft.message.trim()) {
        alert('יש למלא תוכן הודעה');
        return;
      }
      if (editDraft.message.length > MESSAGE_MAX_CHARS) {
        alert(`תוכן ההודעה מוגבל ל־${MESSAGE_MAX_CHARS} תווים. קיצר את ההודעה לפני שליחה.`);
        return;
      }
    }

    setSendingNow(true);
    try {
      const nt = String(editorRow.notification_type || '').trim();
      const channel = sendChannel;
      const isWhatsapp = sendIsWhatsapp;
      const isFlow = nt.startsWith('flow_step:');
      const flowMode = isFlow
        ? editorIsWhatsapp
          ? String(flowDraft?.recipientMode || '') === 'manual'
            ? 'manual'
            : 'groups'
          : String((editorRow as any)?.recipient_mode || flowDraft?.recipientMode || 'manual')
        : null;
      const shouldAutoPending = nt === 'reminder_2' || (isFlow && flowMode === 'pending');

      // Compute recipient ids for status-based audiences (flow steps).
      const statusIdsFor = (mode: string): string[] => {
        const byStatus = (set: string[]) =>
          allGuests.filter((g) => set.includes(String(g.status || '').trim())).map((g) => String(g.id));
        if (mode === 'all') return allGuests.map((g) => String(g.id));
        if (mode === 'pending') return byStatus(['ממתין']);
        if (mode === 'coming') return byStatus(['מגיע', 'אישר']);
        if (mode === 'not_coming') return byStatus(['לא מגיע', 'לא מגיעים']);
        if (mode === 'maybe') return byStatus(['אולי מגיע']);
        return [];
      };
      const rowIds = Array.isArray((editorRow as any).recipient_guest_ids)
        ? ((editorRow as any).recipient_guest_ids as any[]).map((x) => String(x))
        : [];
      let ids =
        (editorKind === 'template' && (nt === 'reminder_1' || nt === 'reminder_2') && !isFlow) ||
        (isFlow && editorIsWhatsapp && flowMode === 'manual')
          ? Array.from(pickerSelectedIds)
          : rowIds;
      const isAutoAll =
        !isFlow &&
        nt === 'reminder_1' &&
        String((editorRow as any)?.recipient_mode ?? '').trim() !== 'manual' &&
        !recipientsWizardManual &&
        ids.length === 0;
      const isRequiredList = (nt === 'reminder_1' && !isAutoAll) || (isFlow && flowMode === 'manual');

      if (isRequiredList && ids.length === 0) {
        alert(isFlow ? 'במצב "בחירה ידנית" צריך לבחור מוזמנים.' : 'להודעה הראשונה צריך לבחור מוזמנים (לחץ "הוסף מוזמנים")');
        return;
      }
      // Flow (WhatsApp): multi-group audience -> union of selected groups.
      if (isFlow && flowMode === 'groups') {
        ids = Array.from(waSelectedRecipientIds);
        if (ids.length === 0) {
          alert('בחר לפחות קבוצת נמענים אחת לשליחה.');
          return;
        }
      } else if (isFlow && flowMode && flowMode !== 'manual' && flowMode !== 'prev_pending') {
        // Flow: status-based audiences (all/pending/coming/not_coming/maybe) -> compute now.
        ids = statusIdsFor(flowMode);
        if (ids.length === 0) {
          alert('לא נמצאו מוזמנים מתאימים לסטטוס שנבחר.');
          return;
        }
      }
      // Flow: prev_pending -> compute recipients from previous step's last run + current pending status
      if (isFlow && flowMode === 'prev_pending') {
        const dependsOn = String((editorRow as any)?.depends_on_setting_id || flowDraft?.dependsOnSettingId || '').trim();
        if (!dependsOn) {
          alert('בחר שלב קודם כדי לחשב "ממתינים מהשלב הקודם".');
          return;
        }
        const { data: prevRun, error: runErr } = await supabase
          .from('scheduled_notification_sms_runs')
          .select('id, status, claimed_at')
          .eq('notification_setting_id', dependsOn)
          .order('claimed_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (runErr || !prevRun?.id) {
          alert('אין עדיין שליחה קודמת שממנה ניתן לגזור רשימה.');
          return;
        }
        const { data: recRows, error: recErr } = await supabase
          .from('scheduled_notification_sms_run_recipients')
          .select('guest_id, status')
          .eq('run_id', String((prevRun as any).id))
          .eq('status', 'sent')
          .order('created_at', { ascending: true });
        if (recErr) throw recErr;
        const prevIds = ((recRows as any[]) || []).map((r) => String((r as any).guest_id)).filter(Boolean);
        const pendingIds = new Set(allGuests.filter((g) => String(g.status || '').trim() === 'ממתין').map((g) => String(g.id)));
        ids = prevIds.filter((id) => pendingIds.has(String(id)));
        if (ids.length === 0) {
          alert('לא נמצאו ממתינים מהשלב הקודם לשליחה.');
          return;
        }
      }

      // Persist current editor draft before sending
      if (!isFlow && (nt === 'reminder_1' || nt === 'reminder_2')) {
        await saveDraft({ recipientGuestIds: ids });
      } else {
        if (ids.length > 0) await saveDraft({ recipientGuestIds: ids });
        else await saveDraft();
      }

      const sessionRes = await supabase.auth.getSession();
      const accessToken = sessionRes.data.session?.access_token;
      if (!accessToken) throw new Error('לא נמצא חיבור משתמש (נא להתחבר מחדש)');

      const origin = typeof window !== 'undefined' ? String(window.location.origin) : '';
      const configuredBaseUrl = normalizeBaseUrl(process.env.EXPO_PUBLIC_SITE_BASE_URL);
      const baseUrl =
        origin && !origin.includes('localhost') && !origin.includes('127.0.0.1') ? normalizeBaseUrl(origin) : configuredBaseUrl || undefined;

      // WhatsApp: send via approved template (Meta Cloud API).
      if (isWhatsapp) {
        const templateId = String(flowDraft?.whatsappTemplateId || (editorRow as any)?.whatsapp_template_id || '').trim();
        if (!templateId) {
          alert('בחר תבנית וואטסאפ לשלב הזה לפני שליחה.');
          return;
        }
        const whatsappParams = flowDraft?.whatsappParams || (editorRow as any)?.whatsapp_params || {};
        const { data, error } = await supabase.functions.invoke('send-whatsapp-template', {
          headers: { Authorization: `Bearer ${accessToken}` },
          body: {
            eventId: event.id,
            guestIds: ids.length > 0 ? ids : undefined,
            filterStatus: 'all',
            templateId,
            whatsappParams,
            baseUrl,
          },
        });
        if (error) throw error;
        const result = (data as any)?.result;
        const quotaNote = Number(result?.skippedQuota) > 0 ? ` · דולגו ${Number(result.skippedQuota)} (מכסה יומית)` : '';
        alert(`נשלחו ${Number(result?.sent) || 0} · נכשלו ${Number(result?.failed) || 0}${quotaNote}`);
        whatsappTemplateService.sentToday().then(setWaSentToday).catch(() => {});
        return;
      }

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

  const openTokenModal = useCallback(() => {
    setTokenInput('');
    setTokenModalOpen(true);
  }, []);

  const saveWaToken = useCallback(
    async (mode: 'save' | 'clear') => {
      if (tokenSaving) return;
      const value = mode === 'clear' ? '' : tokenInput.trim();
      if (mode === 'save' && !value) {
        showToast('הדבק טוקן תקין');
        return;
      }
      setTokenSaving(true);
      try {
        const res = await whatsappTemplateService.setToken(value);
        const status = await whatsappTemplateService.getTokenStatus().catch(() => ({ hasToken: !!value, hint: null, updatedAt: new Date() }));
        setWaTokenStatus(status);
        setTokenInput('');
        setTokenModalOpen(false);
        showToast(mode === 'clear' || (res as any)?.cleared ? 'הטוקן הוסר' : 'הטוקן נשמר בהצלחה');
      } catch (e: any) {
        let details = '';
        try {
          const ctx = e?.context;
          if (ctx && typeof ctx.text === 'function') details = await ctx.text();
        } catch {
          // ignore
        }
        alert(`לא ניתן לשמור טוקן.\n\n${String(e?.message || e?.name || 'שגיאה')}${details ? `\n\nפרטים:\n${details}` : ''}`);
      } finally {
        setTokenSaving(false);
      }
    },
    [tokenInput, tokenSaving, showToast]
  );

  const scheduledSendDateTime = useMemo(() => {
    if (!event) return null;
    const dt = computeNotificationDateTime((event as any)?.date, Number(editDraft?.days ?? 0) || 0, String(editDraft?.timeHm || '11:00'));
    return dt;
  }, [editDraft?.days, editDraft?.timeHm, event]);

  const openAddWizard = useCallback(() => {
    if (!canEdit) {
      showToast('לצפייה בלבד');
      return;
    }
    const nextInsertAt = (flowStepsSorted?.length || 0) + 1;
    setAddWizardChannel('SMS');
    setAddWizardInsertAt(nextInsertAt);
    setAddWizardStep(1);
    setAddWizardOpen(true);
  }, [canEdit, flowStepsSorted?.length, showToast]);

  const closeAddWizard = useCallback(() => {
    setAddWizardOpen(false);
    setAddWizardStep(1);
  }, []);

  const insertFlowStep = useCallback(async (args: { channel: 'SMS' | 'WHATSAPP'; insertAt: number }) => {
    if (!canEdit) {
      showToast('לצפייה בלבד');
      return;
    }
    if (!event?.id) return;
    const channel = args.channel;
    const existing = flowStepsSorted;
    const combinedLen = combinedCards.length;
    const insertAt = Math.max(1, Math.min(combinedLen + 1, Math.floor(Number(args.insertAt) || 1)));

    const stepTitleRe = /^שלב\s+(\d+)\s*$/;
    const patches: any[] = [];
    const updatedExisting: NotificationSettingRow[] = existing.map((s, idx) => {
      const posOld = Number((s as any).sort_order ?? (idx + 1)) || (idx + 1);
      const posNew = posOld >= insertAt ? posOld + 1 : posOld;
      let nextTitle = String(s.title ?? '');
      const m = stepTitleRe.exec(nextTitle.trim());
      if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n) && n >= insertAt) nextTitle = `שלב ${n + 1}`;
      }
      if (s.id) patches.push({ id: String(s.id), sort_order: posNew, title: nextTitle });
      return { ...(s as any), sort_order: posNew, title: nextTitle } as any;
    });

    // Persist shifting of existing steps (best-effort). If columns don't exist, user needs migration.
    try {
      if (patches.length > 0) {
        const { error: upErr } = await supabase.from('notification_settings').upsert(patches, { onConflict: 'id' });
        if (upErr && isMissingColumn(upErr, 'sort_order')) throw upErr;
      }
    } catch (e) {
      console.error('Failed to shift step order:', e);
      alert('לא ניתן להזיז שלבים (בדוק שהרצת את המיגרציה החדשה).');
      return;
    }

    const uuid = typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function' ? (crypto as any).randomUUID() : String(Date.now());
    const nt = `flow_step:${uuid}`;
    const defaultDays = -7;
    const dt = computeNotificationDateTime((event as any)?.date, defaultDays, '11:00');
    const insertPayload: any = {
      event_id: event.id,
      notification_type: nt,
      title: `שלב ${insertAt}`,
      enabled: false,
      message_content: normalizeTemplateToSingleBraces(defaultMessageByType({ notificationType: 'reminder_2', kind: detectEventKind(event as any) })),
      days_from_wedding: defaultDays,
      channel,
      recipient_guest_ids: [],
      flow_id: event.id,
      sort_order: insertAt,
      recipient_mode: 'manual',
      recipient_rule: { mode: 'manual' },
      depends_on_setting_id: null,
    };
    if (dt) insertPayload.notification_date = dt.toISOString();

    try {
      let { data, error } = await supabase.from('notification_settings').insert(insertPayload).select().single();
      if (error && isMissingColumn(error, 'flow_id')) {
        delete insertPayload.flow_id;
        delete insertPayload.sort_order;
        delete insertPayload.recipient_mode;
        delete insertPayload.recipient_rule;
        delete insertPayload.depends_on_setting_id;
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
      if (error && isMissingColumn(error, 'notification_date')) {
        delete insertPayload.notification_date;
        const retry = await supabase.from('notification_settings').insert(insertPayload).select().single();
        data = retry.data as any;
        error = retry.error as any;
      }
      if (error) throw error;

      const created: NotificationSettingRow = {
        id: data?.id ? String(data.id) : undefined,
        event_id: data?.event_id ? String(data.event_id) : undefined,
        notification_type: String(data?.notification_type || nt),
        title: String(data?.title ?? insertPayload.title),
        enabled: Boolean(data?.enabled),
        message_content: String(data?.message_content ?? insertPayload.message_content),
        days_from_wedding: typeof data?.days_from_wedding === 'number' ? Number(data.days_from_wedding) : defaultDays,
        channel: (data?.channel as any) || channel,
        notification_date: data?.notification_date ? String(data.notification_date) : insertPayload.notification_date ?? null,
        recipient_guest_ids: Array.isArray(data?.recipient_guest_ids) ? (data.recipient_guest_ids as any[]).map((x) => String(x)) : [],
        flow_id: data?.flow_id ? String(data.flow_id) : (insertPayload.flow_id ? String(insertPayload.flow_id) : null),
        sort_order: typeof data?.sort_order === 'number' ? Number(data.sort_order) : insertAt,
        recipient_mode:
          ((): NotificationSettingRow['recipient_mode'] => {
            const s = data?.recipient_mode == null ? null : String(data.recipient_mode).trim();
            if (s === 'manual' || s === 'all' || s === 'pending' || s === 'prev_pending') return s;
            return 'manual';
          })(),
        recipient_rule: data?.recipient_rule ?? insertPayload.recipient_rule ?? null,
        depends_on_setting_id: data?.depends_on_setting_id ? String(data.depends_on_setting_id) : null,
      };

      const merged = [...updatedExisting, created].sort((a, b) => (Number((a as any).sort_order ?? 0) || 0) - (Number((b as any).sort_order ?? 0) || 0));
      setFlowSteps(merged);
      openFlowEditor(created);
    } catch (e) {
      console.error('Failed to add flow step:', e);
      alert('לא ניתן להוסיף כרטיסיה (בדוק שהרצת את המיגרציה החדשה).');
    }
  }, [canEdit, event, flowStepsSorted, combinedCards.length, showToast]);

  const deleteFlowStep = useCallback(
    async (row: NotificationSettingRow) => {
      if (!canEdit) {
        showToast('לצפייה בלבד');
        return;
      }
      if (!row?.id) {
        setFlowSteps((p) => p.filter((s) => s.notification_type !== row.notification_type));
        return;
      }
      const ok = typeof window !== 'undefined' ? window.confirm('למחוק את הכרטיסיה?') : true;
      if (!ok) return;
      try {
        const { error } = await supabase.from('notification_settings').delete().eq('id', row.id);
        if (error) throw error;
        setFlowSteps((p) => p.filter((s) => s.id !== row.id));
        if (editorType === row.notification_type) closeEditor();
      } catch (e) {
        console.error('Failed to delete flow step:', e);
        alert('לא ניתן למחוק כרטיסיה.');
      }
    },
    [canEdit, editorType, showToast]
  );

  const moveFlowStep = useCallback(
    async (row: NotificationSettingRow, dir: -1 | 1) => {
      if (!canEdit) {
        showToast('לצפייה בלבד');
        return;
      }
      const list = flowStepsSorted;
      const idx = list.findIndex((s) => s.notification_type === row.notification_type);
      if (idx < 0) return;
      const j = idx + dir;
      if (j < 0 || j >= list.length) return;
      const a = list[idx];
      const b = list[j];
      const ao = Number((a as any).sort_order ?? 0) || 0;
      const bo = Number((b as any).sort_order ?? 0) || 0;
      // swap locally
      setFlowSteps((prev) =>
        prev.map((s) => {
          if (s.notification_type === a.notification_type) return { ...(s as any), sort_order: bo } as any;
          if (s.notification_type === b.notification_type) return { ...(s as any), sort_order: ao } as any;
          return s;
        })
      );
      // persist best-effort
      try {
        if (a.id) await supabase.from('notification_settings').update({ sort_order: bo }).eq('id', a.id);
        if (b.id) await supabase.from('notification_settings').update({ sort_order: ao }).eq('id', b.id);
      } catch (e) {
        console.warn('Failed to persist step order swap:', e);
      }
    },
    [canEdit, flowStepsSorted, showToast]
  );

  const calendarSelected = useMemo(() => {
    const d = scheduledSendDateTime;
    if (!d || !Number.isFinite(d.getTime())) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  }, [scheduledSendDateTime]);

  useEffect(() => {
    if (!editorOpen) return;
    if (editorKind !== 'template') return;
    if (editorWizardStepId !== 'schedule') return;
    const seed = calendarSelected ?? scheduledSendDateTime ?? new Date(String((event as any)?.date ?? ''));
    if (!seed || !Number.isFinite(seed.getTime())) return;
    setCalendarMonth(new Date(seed.getFullYear(), seed.getMonth(), 1));
  }, [calendarSelected, editorKind, editorOpen, editorWizardStepId, event, scheduledSendDateTime]);

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

  const catchupCalendarGrid = useMemo(() => {
    const base = catchupCalendarMonth instanceof Date ? catchupCalendarMonth : new Date();
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
  }, [catchupCalendarMonth]);

  const openDateDialog = useCallback(() => {
    if (!canEdit) {
      showToast('לצפייה בלבד');
      return;
    }
    const seed = calendarSelected ?? scheduledSendDateTime ?? new Date(String((event as any)?.date ?? ''));
    const base = Number.isFinite(seed.getTime()) ? seed : new Date();
    setCalendarMonth(new Date(base.getFullYear(), base.getMonth(), 1));
    setDateDialogOpen(true);
  }, [calendarSelected, canEdit, event, scheduledSendDateTime, showToast]);

  const openTimeDialog = useCallback(() => {
    if (!canEdit) {
      showToast('לצפייה בלבד');
      return;
    }
    const hm = parseTimeHm(String(editDraft?.timeHm ?? '11:00')) ?? { h: 11, m: 0 };
    setTimeDraft({ h: hm.h, m: hm.m });
    setTimeDialogOpen(true);
  }, [canEdit, editDraft?.timeHm, showToast]);



  if (loading) {
    return (
      <View style={styles.page}>
        <View style={[styles.bg, { backgroundColor: showAdminChrome ? (isAdminRouteContext ? '#E8F1FF' : 'transparent') : ui.bgLight }]} />
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
        <View style={[styles.bg, { backgroundColor: showAdminChrome ? (isAdminRouteContext ? '#E8F1FF' : 'transparent') : ui.bgLight }]} />
        <View style={styles.center}>
          <Text style={styles.centerText}>לא נמצא אירוע.</Text>
          <Pressable onPress={handleBackPress} style={styles.backInline}>
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
        <View style={[styles.bg, { backgroundColor: showAdminChrome ? (isAdminRouteContext ? '#E8F1FF' : 'transparent') : ui.bgLight }]} />
        <View style={styles.center}>
          <Text style={styles.centerText}>הגדרות הודעות לא זמינות (אין טבלה notification_settings).</Text>
          <Pressable onPress={handleBackPress} style={styles.backInline}>
            <Ionicons name="arrow-forward" size={18} color={ui.primary} />
            <Text style={[styles.backInlineText, { color: ui.primary }]}>חזרה</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const MainColumnComponent: any = useEmbeddedWebShell ? View : ScrollView;
  const mainColumnStyle = [styles.mainCol, showAdminChrome ? styles.mainColAdmin : null];
  const mainColumnContentStyle = [styles.mainColContent, showAdminChrome ? styles.mainColContentAdmin : null];
  const isViewerCompactLayout = viewportWidth < 1240;
  const isViewerDesktopReducedLayout = !isViewerCompactLayout && (viewportWidth < 1500 || viewportHeight < 1100);

  return (
    <View style={[styles.page, isAdminRouteContext ? styles.pageAdmin : null]}>
      <View style={[styles.bg, { backgroundColor: showAdminChrome ? (isAdminRouteContext ? '#E8F1FF' : 'transparent') : ui.bgLight }]} />

      <View style={[styles.body, showAdminChrome ? styles.bodyAdmin : null]}>
        {/* תוכן מרכזי */}
        <MainColumnComponent
          style={useEmbeddedWebShell ? [mainColumnStyle, mainColumnContentStyle] : mainColumnStyle}
          contentContainerStyle={!useEmbeddedWebShell ? mainColumnContentStyle : undefined}
          showsVerticalScrollIndicator={!useEmbeddedWebShell ? false : undefined}
        >
          {showAdminChrome ? (
            <View style={styles.heroShell}>
              <AdminWebPageHeader
                eyebrow="ניהול הודעות"
                title="עריכת הודעות"
                subtitleContent={
                  <View style={styles.headerSubtitleBar}>
                    <View style={styles.headerSubtitleMetaGroup}>
                      {adminHeaderMetaItems.map((item) => (
                        <View key={item} style={styles.headerSubtitleMetaChip}>
                          <Text style={styles.headerSubtitleMetaText}>{item}</Text>
                        </View>
                      ))}
                    </View>
                    <View style={styles.headerSubtitleActions}>
                      {userType === 'admin' ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="טוקן וואטסאפ"
                          onPress={openTokenModal}
                          style={({ hovered, pressed }: any) => [
                            styles.headerSubtitleSecondaryBtn,
                            Platform.OS === 'web' && hovered ? styles.headerSubtitleSecondaryBtnHover : null,
                            pressed ? { opacity: 0.92 } : null,
                          ]}
                        >
                          <Ionicons name={waTokenStatus.hasToken ? 'key' : 'key-outline'} size={16} color={waTokenStatus.hasToken ? '#0E7C46' : colors.primary} />
                          <Text style={styles.headerSubtitleSecondaryBtnText}>
                            {waTokenStatus.hasToken ? `טוקן וואטסאפ ${waTokenStatus.hint ?? ''}` : 'הוסף טוקן וואטסאפ'}
                          </Text>
                        </Pressable>
                      ) : null}
                      {userType === 'admin' ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="ניהול תבניות וואטסאפ ומכסה יומית"
                          onPress={() => router.push('/(admin)/whatsapp-templates' as any)}
                          style={({ hovered, pressed }: any) => [
                            styles.headerSubtitleSecondaryBtn,
                            Platform.OS === 'web' && hovered ? styles.headerSubtitleSecondaryBtnHover : null,
                            pressed ? { opacity: 0.92 } : null,
                          ]}
                        >
                          <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
                          <Text style={styles.headerSubtitleSecondaryBtnText}>
                            {`תבניות וואטסאפ${waDailyQuota > 0 ? ` · ${waSentToday}/${waDailyQuota} היום` : ''}`}
                          </Text>
                        </Pressable>
                      ) : null}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="ייצוא ממתינים לאקסל"
                        disabled={exportingPendingGuests}
                        onPress={handleExportPendingGuests}
                        style={({ hovered, pressed }: any) => [
                          styles.headerSubtitleSecondaryBtn,
                          Platform.OS === 'web' && hovered ? styles.headerSubtitleSecondaryBtnHover : null,
                          exportingPendingGuests ? styles.headerSubtitleSecondaryBtnDisabled : null,
                          pressed ? { opacity: 0.92 } : null,
                        ]}
                      >
                        {exportingPendingGuests ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <Ionicons name="download-outline" size={16} color={colors.primary} />
                        )}
                        <Text style={styles.headerSubtitleSecondaryBtnText}>ייצוא ממתינים לאקסל</Text>
                      </Pressable>
                      {canEdit ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="הוסף הודעה חדשה"
                          onPress={openAddWizard}
                          style={({ hovered, pressed }: any) => [
                            styles.headerSubtitleActionBtn,
                            Platform.OS === 'web' && hovered ? styles.headerSubtitleActionBtnHover : null,
                            pressed ? { opacity: 0.92 } : null,
                          ]}
                        >
                          <Ionicons name="add" size={16} color={colors.white} />
                          <Text style={styles.headerSubtitleActionBtnText}>הוסף הודעה חדשה</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                }
                showNav={false}
                useDefaultActions={false}
                leading={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="חזרה"
                    onPress={handleBackPress}
                    style={({ hovered, pressed }: any) => [
                      styles.backHeaderBtn,
                      Platform.OS === 'web' && hovered ? styles.backHeaderBtnHover : null,
                      pressed ? styles.backHeaderBtnPressed : null,
                    ]}
                  >
                    <Ionicons name="arrow-forward" size={16} color={colors.text} />
                    <Text style={styles.backHeaderBtnText}>חזרה</Text>
                  </Pressable>
                }
                actions={
                  ownerTitle ? (
                    <View style={styles.headerOwnerBadge}>
                      <Ionicons name="person-outline" size={15} color={colors.gray[600]} />
                      <Text style={styles.headerOwnerName} numberOfLines={1}>
                        {ownerTitle}
                      </Text>
                    </View>
                  ) : null
                }
              />
            </View>
          ) : null}

          {/* Timeline */}
          <View style={[styles.timelineCard, showAdminChrome ? styles.timelineCardAdmin : null]}>
            {showAdminChrome ? (
              <View style={styles.timelineSectionHeader}>
                <Text style={styles.timelineSectionTitle}>ציר הודעות</Text>
                <Text style={styles.timelineSectionSubtitle}>בחירה מהירה של כל הודעה לעריכה, תזמון ושליחה.</Text>
              </View>
            ) : (
              <View style={styles.timelineHeaderRow}>
                <View style={{ width: 180 }} />
                <View style={styles.timelineHeaderCenter}>
                  <Text style={styles.timelineHeaderTitle}>הודעות אוטומטיות</Text>
                  {isReadOnly ? <Text style={styles.timelineHeaderSubtitle}>תצוגת צפייה בלבד</Text> : null}
                </View>
                <View style={styles.timelineHeaderLeft}>
                  <Pressable onPress={handleBackPress} style={styles.backSmall} accessibilityRole="button" accessibilityLabel="חזרה">
                    <Ionicons name="arrow-forward" size={18} color="#4b5563" />
                  </Pressable>
                </View>
              </View>
            )}
            {timelineUseScroll ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.timelineScroller}
                contentContainerStyle={styles.timelineRowScroll}
              >
                {timelineRows.map((row, idx) => {
                  const active = row.notification_type === selectedType;
                  const abs = Math.abs(row.days_from_wedding);
                  const tone = getRowTone(row, String(row.notification_type || '').startsWith('flow_step:'));
                  const label =
                    row.days_from_wedding === 0
                      ? 'יום האירוע'
                      : row.days_from_wedding < 0
                        ? `לפני ${abs} יום`
                        : `אחרי ${abs} יום`;
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
                      <Pressable
                        onPress={() => setSelectedType(row.notification_type)}
                        style={[
                          styles.timelineItemScroll,
                          showAdminChrome ? styles.timelineItemAdmin : null,
                          showAdminChrome
                            ? {
                                borderColor: active ? tone.accent : tone.border,
                                backgroundColor: active ? tone.soft : '#FBFCFF',
                              }
                            : null,
                        ]}
                      >
                        {showAdminChrome ? (
                          <View style={styles.timelineStepBadge}>
                            <Text style={styles.timelineStepBadgeText}>{String(idx + 1).padStart(2, '0')}</Text>
                          </View>
                        ) : null}
                        <Text style={[styles.timelineLabel, active ? { color: tone.accent, fontWeight: '900' } : null]}>{label}</Text>
                        <View
                          style={[
                            styles.timelineDot,
                            showAdminChrome ? styles.timelineDotAdmin : null,
                            {
                              backgroundColor: active ? tone.accent : tone.icon,
                              borderColor: active ? tone.accent : tone.border,
                            },
                          ]}
                        >
                          {row.days_from_wedding === 0 ? (
                            <Ionicons name="calendar" size={showAdminChrome ? 16 : 20} color={active ? '#fff' : tone.accent} />
                          ) : (
                            <Text style={[styles.timelineDotNumber, { color: active ? '#fff' : tone.accent }]}>{idx + 1}</Text>
                          )}
                        </View>
                        {active ? <View style={[styles.timelineActiveLine, { backgroundColor: tone.accent }]} /> : null}
                        <Text style={[styles.timelineTitle, active ? { color: '#1f2937', fontWeight: '900' } : null]} numberOfLines={1}>
                          {getDisplayTitle(row)}
                        </Text>
                        <Text style={styles.timelineDate}>{dateLabel}</Text>
                        {timeLabel ? <Text style={styles.timelineTime}>{timeLabel}</Text> : null}
                      </Pressable>
                      {idx < timelineRows.length - 1 ? <View style={styles.timelineConnectorScroll} /> : null}
                    </React.Fragment>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={styles.timelineRow}>
                {timelineRows.map((row, idx) => {
                const active = row.notification_type === selectedType;
                const abs = Math.abs(row.days_from_wedding);
                const tone = getRowTone(row, String(row.notification_type || '').startsWith('flow_step:'));
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
                    <Pressable
                      onPress={() => setSelectedType(row.notification_type)}
                      style={[
                        styles.timelineItem,
                        showAdminChrome ? styles.timelineItemAdmin : null,
                        showAdminChrome
                          ? {
                              borderColor: active ? tone.accent : tone.border,
                              backgroundColor: active ? tone.soft : '#FBFCFF',
                            }
                          : null,
                      ]}
                    >
                      {showAdminChrome ? (
                        <View style={styles.timelineStepBadge}>
                          <Text style={styles.timelineStepBadgeText}>{String(idx + 1).padStart(2, '0')}</Text>
                        </View>
                      ) : null}
                      <Text style={[styles.timelineLabel, active ? { color: tone.accent, fontWeight: '900' } : null]}>{label}</Text>
                      <View
                        style={[
                          styles.timelineDot,
                          showAdminChrome ? styles.timelineDotAdmin : null,
                          {
                            backgroundColor: active ? tone.accent : tone.icon,
                            borderColor: active ? tone.accent : tone.border,
                          },
                        ]}
                      >
                        {row.days_from_wedding === 0 ? (
                          <Ionicons name="calendar" size={showAdminChrome ? 16 : 20} color={active ? '#fff' : tone.accent} />
                        ) : (
                          <Text style={[styles.timelineDotNumber, { color: active ? '#fff' : tone.accent }]}>{idx + 1}</Text>
                        )}
                      </View>
                      {active ? <View style={[styles.timelineActiveLine, { backgroundColor: tone.accent }]} /> : null}
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
            )}
          </View>

          {/* כרטיסי הודעות */}
          <View style={styles.cardsContainer}>
            <View style={styles.cardsRow}>
              {combinedCards.map((item, idx) => {
                const row = item.row;
                const selected = row.notification_type === selectedType;
                const number = String(idx + 1).padStart(2, '0');
                const tone = getRowTone(row, item.kind === 'flow');
                const lastRun =
                  row.id && (row.channel || 'SMS') === 'SMS' ? lastSmsRunBySettingId[String(row.id)] : undefined;
                const lastRunLabel = lastRun ? statusLabel(String(lastRun.status)) : null;
                const lastRunAt = lastRun?.claimed_at ? formatHeDateTimeShort(lastRun.claimed_at) : '';
                const catchup = row.id ? queuedCatchupBySettingId[String(row.id)] : undefined;
                const showCatchup =
                  String(row.notification_type || '').trim() === 'reminder_1' &&
                  (row.channel || 'SMS') === 'SMS' &&
                  (catchup?.count || 0) > 0;
                const catchupText = showCatchup
                  ? `אורחים חדשים בתור: ${catchup?.count || 0}${catchup?.nextDueAt ? ` · הבא: ${formatHeDateTimeShort(catchup.nextDueAt)}` : ''}`
                  : '';

                const isFlow = item.kind === 'flow';
                const mode = isFlow ? String((row as any)?.recipient_mode || 'manual') : null;
                const ids = Array.isArray((row as any).recipient_guest_ids) ? (row as any).recipient_guest_ids : [];
                const recipientsLabel = !isFlow
                  ? (() => {
                      const nt = String(row.notification_type || '').trim();
                      if (nt === 'reminder_1' && String((row as any)?.recipient_mode || '').trim() === 'all') return 'כל האורחים';
                      if (nt === 'reminder_2' && ids.length === 0) return 'כל הממתינים';
                      if (nt === 'reminder_1' || nt === 'reminder_2') return `${ids.length} מוזמנים${nt === 'reminder_1' ? '' : ' (אופציונלי)'}`;
                      return '';
                    })()
                  : mode === 'pending'
                    ? 'כל הממתינים'
                    : mode === 'prev_pending'
                      ? 'ממתינים מהשלב הקודם'
                      : `${ids.length} מוזמנים`;
                const isAutoAllRecipients =
                  !isFlow && String(row.notification_type || '').trim() === 'reminder_1' && String((row as any)?.recipient_mode || '').trim() === 'all';
                const autoAllCountText = isAutoAllRecipients ? `סה״כ אורחים: ${allGuests.length}` : '';
                const cardSendAt = (() => {
                  const raw = (row as any)?.notification_date;
                  const d = raw ? new Date(String(raw)) : null;
                  if (d && Number.isFinite(d.getTime())) return d;
                  return computeNotificationDateTime((event as any)?.date, row.days_from_wedding ?? 0, '11:00');
                })();
                const cardDateLabel = formatHeDate(cardSendAt) || '—';
                const cardTimeLabel = cardSendAt ? formatTime(cardSendAt) : '';
                const cardScheduleLabel = [cardDateLabel, cardTimeLabel].filter(Boolean).join(' · ');
                const cardChannelLabel = (row.channel || 'SMS') === 'WHATSAPP' ? 'WhatsApp' : 'SMS';
                const sendStatusTitle = lastRunLabel?.text || 'טרם נשלח';
                const sendStatusMeta = lastRunAt || 'לחץ לצפייה בפירוט';
                const catchupCountLabel = showCatchup ? `${catchup?.count || 0} אורחים בתור` : '';
                const catchupMeta = showCatchup
                  ? catchup?.nextDueAt
                    ? `הבא: ${formatHeDateTimeShort(catchup.nextDueAt)}`
                    : 'לחץ לצפייה בתור'
                  : '';

                return (
                  <Pressable
                    key={row.notification_type}
                    onPress={() => setSelectedType(row.notification_type)}
                    style={({ hovered }: any) => [
                      styles.messageCard,
                      showAdminChrome ? styles.messageCardAdmin : null,
                      selected ? styles.messageCardSelected : null,
                      showAdminChrome ? { borderColor: selected ? tone.accent : tone.border } : selected ? { borderColor: ui.primary } : null,
                      Platform.OS === 'web' && hovered && !selected ? styles.messageCardHover : null,
                    ]}
                  >
                    {showAdminChrome ? <View style={[styles.cardAccentBar, { backgroundColor: tone.accent }]} /> : null}
                    <View style={styles.cardTopRow}>
                      {showAdminChrome ? (
                        <View style={styles.cardTopMeta}>
                          <View style={[styles.cardStageBadge, { backgroundColor: tone.soft, borderColor: tone.border }]}>
                            <Text style={[styles.cardStageBadgeText, { color: tone.accent }]}>{`שלב ${number}`}</Text>
                          </View>
                          <View style={styles.cardChannelBadge}>
                            <Text style={styles.cardChannelBadgeText}>{cardChannelLabel}</Text>
                          </View>
                        </View>
                      ) : null}
                      <Text style={styles.cardNumber}>{number}</Text>
                      <View
                        style={[
                          styles.cardIconWrap,
                          showAdminChrome ? styles.cardIconWrapAdmin : null,
                          { backgroundColor: selected ? tone.accent : tone.icon },
                        ]}
                      >
                        <Ionicons
                          name={(isFlow ? 'layers-outline' : (iconForType(row) as any)) as any}
                          size={20}
                          color={selected ? '#fff' : tone.accent}
                        />
                      </View>
                    </View>

                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {isFlow ? String((row as any).title || `שלב ${idx + 1}`) : getDisplayTitle(row)}
                    </Text>

                    <View style={styles.cardMetaRow}>
                      <Ionicons name="time-outline" size={14} color={tone.accent} />
                      <Text style={styles.cardMetaText}>
                        {formatOffsetLabel(Number((row as any).days_from_wedding ?? 0) || 0)}
                      </Text>
                      {!isFlow ? (
                        <Ionicons
                          name="information-circle-outline"
                          size={14}
                          color="#d1d5db"
                          style={Platform.OS === 'web' ? ({ marginInlineStart: 'auto' } as any) : ({ marginRight: 'auto' } as any)}
                        />
                      ) : null}
                    </View>
                    {showAdminChrome ? (
                      <View style={styles.cardInsightsGrid}>
                        <View style={[styles.cardInsightCard, styles.cardInsightCardStatic, { backgroundColor: tone.soft, borderColor: tone.border }]}>
                          <View style={styles.cardInsightTopRow}>
                            <View style={[styles.cardInsightIconWrap, { backgroundColor: tone.icon }]}>
                              <Ionicons name="calendar-outline" size={15} color={tone.accent} />
                            </View>
                            <Text style={styles.cardInsightLabel}>מועד שליחה</Text>
                          </View>
                          <Text style={[styles.cardInsightValue, { color: tone.accent }]} numberOfLines={1}>
                            {cardScheduleLabel}
                          </Text>
                          <Text style={[styles.cardInsightMeta, { color: tone.accent }]}>התזמון שנקבע להודעה</Text>
                        </View>

                        {(row.channel || 'SMS') === 'SMS' ? (
                          <>
                            <Pressable
                              onPress={(e: any) => {
                                e?.stopPropagation?.();
                                e?.preventDefault?.();
                                void openSendStatus(row);
                              }}
                              style={({ pressed }: any) => [styles.cardInsightCard, styles.cardInsightCardInteractive, pressed ? { opacity: 0.92 } : null]}
                            >
                              <View style={styles.cardInsightTopRow}>
                                <View style={[styles.cardInsightIconWrap, { backgroundColor: 'rgba(15,23,42,0.05)' }]}>
                                  <Ionicons name="checkmark-done-outline" size={15} color={lastRunLabel?.color || 'rgba(100,116,139,1)'} />
                                </View>
                                <Text style={styles.cardInsightLabel}>סטטוס שליחה</Text>
                              </View>
                              <Text style={[styles.cardInsightValue, { color: lastRunLabel?.color || 'rgba(51,65,85,1)' }]} numberOfLines={1}>
                                {sendStatusTitle}
                              </Text>
                              <Text style={styles.cardInsightMeta} numberOfLines={1}>
                                {sendStatusMeta}
                              </Text>
                            </Pressable>

                            {showCatchup ? (
                              <Pressable
                                onPress={(e: any) => {
                                  e?.stopPropagation?.();
                                  e?.preventDefault?.();
                                  void openCatchupQueue(row);
                                }}
                                style={({ pressed }: any) => [styles.cardInsightCard, styles.cardInsightCardInteractive, pressed ? { opacity: 0.92 } : null]}
                              >
                                <View style={styles.cardInsightTopRow}>
                                  <View style={[styles.cardInsightIconWrap, { backgroundColor: 'rgba(59,130,246,0.10)' }]}>
                                    <Ionicons name="people-outline" size={15} color="rgba(37,99,235,1)" />
                                  </View>
                                  <Text style={styles.cardInsightLabel}>אורחים חדשים בתור</Text>
                                </View>
                                <Text style={[styles.cardInsightValue, { color: 'rgba(15,23,42,0.92)' }]} numberOfLines={1}>
                                  {catchupCountLabel}
                                </Text>
                                <Text style={styles.cardInsightMeta} numberOfLines={1}>
                                  {catchupMeta}
                                </Text>
                              </Pressable>
                            ) : null}
                          </>
                        ) : null}
                      </View>
                    ) : null}

                    {recipientsLabel ? (
                      <>
                        <View style={styles.cardInlineRow}>
                          <View style={styles.cardInlineMeta}>
                            <Ionicons name="people-outline" size={14} color="rgba(2,6,23,0.55)" />
                            <Text style={styles.cardInlineMetaText}>{recipientsLabel}</Text>
                          </View>

                          {isFlow ? (
                            <Pressable
                              onPress={(e: any) => {
                                e?.stopPropagation?.();
                                e?.preventDefault?.();
                                void toggleNotification(row);
                              }}
                              disabled={!canEdit}
                              accessibilityRole="switch"
                              accessibilityState={{ checked: !!row.enabled }}
                              style={({ pressed }: any) => [styles.toggleBtn, !canEdit ? { opacity: 0.55 } : null, pressed ? { opacity: 0.92 } : null]}
                            >
                              <View style={[styles.toggleTrack, row.enabled ? styles.toggleTrackOn : styles.toggleTrackOff]}>
                                <View style={[styles.toggleThumb, row.enabled ? styles.toggleThumbOn : styles.toggleThumbOff]} />
                              </View>
                              <Text style={[styles.toggleLabel, row.enabled ? styles.toggleLabelOn : styles.toggleLabelOff]}>
                                {row.enabled ? 'פעילה' : 'כבויה'}
                              </Text>
                            </Pressable>
                          ) : null}
                        </View>

                        {autoAllCountText ? <Text style={styles.cardInlineSubText}>{autoAllCountText}</Text> : null}
                      </>
                    ) : null}

                    <View style={styles.cardBottomRow}>
                      {isFlow ? (
                        canEdit ? (
                          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                            <Pressable
                              onPress={(e: any) => {
                                e?.stopPropagation?.();
                                e?.preventDefault?.();
                                void deleteFlowStep(row as any);
                              }}
                              style={({ pressed }: any) => [styles.builderIconBtnDanger, pressed ? { opacity: 0.9 } : null]}
                              accessibilityLabel="מחק"
                            >
                              <Ionicons name="trash-outline" size={18} color="#EF4444" />
                            </Pressable>
                          </View>
                        ) : null
                      ) : (
                        <Pressable
                          onPress={(e: any) => {
                            e?.stopPropagation?.();
                            e?.preventDefault?.();
                            void toggleNotification(row);
                          }}
                          disabled={!canEdit}
                          accessibilityRole="switch"
                          accessibilityState={{ checked: !!row.enabled }}
                          style={({ pressed }: any) => [styles.toggleBtn, !canEdit ? { opacity: 0.55 } : null, pressed ? { opacity: 0.92 } : null]}
                        >
                          <View style={[styles.toggleTrack, row.enabled ? styles.toggleTrackOn : styles.toggleTrackOff]}>
                            <View style={[styles.toggleThumb, row.enabled ? styles.toggleThumbOn : styles.toggleThumbOff]} />
                          </View>
                          <Text style={[styles.toggleLabel, row.enabled ? styles.toggleLabelOn : styles.toggleLabelOff]}>
                            {row.enabled ? 'פעילה' : 'כבויה'}
                          </Text>
                        </Pressable>
                      )}

                      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                        <Pressable
                          onPress={(e: any) => {
                            e?.stopPropagation?.();
                            e?.preventDefault?.();
                            if (!canEdit) {
                              void openViewer(row);
                              return;
                            }
                            if (isFlow) openFlowEditor(row);
                            else openEditor(row);
                          }}
                          style={({ pressed }: any) => [styles.editBtn, pressed ? { opacity: 0.9 } : null]}
                        >
                          <Ionicons name={canEdit ? 'create-outline' : 'eye-outline'} size={16} color={ui.primary} />
                          <Text style={[styles.editBtnText, { color: ui.primary }]}>{canEdit ? 'ערוך' : 'צפייה'}</Text>
                        </Pressable>

                        {!isFlow && canEdit ? (
                          <Pressable
                            onPress={(e: any) => {
                              e?.stopPropagation?.();
                              e?.preventDefault?.();
                              void hideCard(row);
                            }}
                            style={({ pressed }: any) => [styles.builderIconBtnDanger, pressed ? { opacity: 0.9 } : null]}
                            accessibilityLabel="מחק כרטיסיה"
                          >
                            <Ionicons name="trash-outline" size={18} color="#EF4444" />
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {false ? (
            <View style={styles.builderCard}>
            <View style={styles.builderHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.builderTitle}>Builder · הודעות מתוזמנות</Text>
                <Text style={styles.builderSub}>הוסף/מחק כרטיסיות, סדר לפי הצורך, ובחר נמענים לכל שלב.</Text>
              </View>
            </View>

            {flowStepsSorted.length === 0 ? (
              <Text style={styles.builderEmpty}>אין עדיין כרטיסיות. לחץ על כפתור ה־+ בתחתית המסך כדי להוסיף.</Text>
            ) : (
              <View style={styles.cardsContainer}>
                <View style={styles.cardsRow}>
                  {flowStepsSorted.map((step, idx) => {
                    const selected = step.notification_type === selectedType;
                    const number = String(displayRows.length + idx + 1).padStart(2, '0');
                    const lastRun =
                      step.id && (step.channel || 'SMS') === 'SMS' ? lastSmsRunBySettingId[String(step.id)] : undefined;
                    const lastRunLabel = lastRun ? statusLabel(String(lastRun.status)) : null;
                    const lastRunAt = lastRun?.claimed_at ? formatHeDateTimeShort(lastRun.claimed_at) : '';

                    const mode = String((step as any)?.recipient_mode || 'manual');
                    const ids = Array.isArray((step as any).recipient_guest_ids) ? (step as any).recipient_guest_ids : [];
                    const recipientsLabel =
                      mode === 'pending' ? 'כל הממתינים' : mode === 'prev_pending' ? 'ממתינים מהשלב הקודם' : `${ids.length} מוזמנים`;

                    return (
                      <Pressable
                        key={step.notification_type}
                        onPress={() => setSelectedType(step.notification_type)}
                        style={({ hovered }: any) => [
                          styles.messageCard,
                          selected ? styles.messageCardSelected : null,
                          Platform.OS === 'web' && hovered && !selected ? styles.messageCardHover : null,
                        ]}
                      >
                        <View style={styles.cardTopRow}>
                          <Text style={styles.cardNumber}>{number}</Text>
                          <View style={[styles.cardIconWrap, selected ? { backgroundColor: ui.primary } : null]}>
                            <Ionicons name="layers-outline" size={20} color={selected ? '#fff' : ui.primary} />
                          </View>
                        </View>

                        <Text style={styles.cardTitle} numberOfLines={1}>
                          {String(step.title || `שלב ${idx + 1}`)}
                        </Text>

                        <View style={styles.cardMetaRow}>
                          <Ionicons name="time-outline" size={14} color="#9ca3af" />
                          <Text style={styles.cardMetaText}>{formatOffsetLabel(Number(step.days_from_wedding ?? 0) || 0)}</Text>
                        </View>

                        <View style={styles.cardInlineRow}>
                          <View style={styles.cardInlineMeta}>
                            <Ionicons name="people-outline" size={14} color="rgba(2,6,23,0.55)" />
                            <Text style={styles.cardInlineMetaText}>{recipientsLabel}</Text>
                          </View>
                          <Pressable
                            onPress={(e: any) => {
                              e?.stopPropagation?.();
                              e?.preventDefault?.();
                              void openRecipientsPreview(step);
                            }}
                            style={({ pressed }: any) => [styles.cardInlineBtn, pressed ? { opacity: 0.9 } : null]}
                          >
                            <Ionicons name="eye-outline" size={16} color={ui.primary} />
                            <Text style={[styles.cardInlineBtnText, { color: ui.primary }]}>צפייה</Text>
                          </Pressable>
                        </View>

                        {(step.channel || 'SMS') === 'SMS' ? (
                          <Pressable
                            onPress={(e: any) => {
                              e?.stopPropagation?.();
                              e?.preventDefault?.();
                              void openSendStatus(step);
                            }}
                            style={({ pressed }: any) => [styles.sendStatusPill, pressed ? { opacity: 0.9 } : null]}
                          >
                            <Ionicons name="checkmark-done-outline" size={14} color={lastRunLabel?.color || 'rgba(100,116,139,1)'} />
                            <Text style={[styles.sendStatusText, { color: lastRunLabel?.color || 'rgba(100,116,139,1)' }]} numberOfLines={1}>
                              {lastRunLabel ? `${lastRunLabel.text}${lastRunAt ? ` · ${lastRunAt}` : ''}` : 'סטטוס: לא נשלח עדיין'}
                            </Text>
                          </Pressable>
                        ) : null}

                        <View style={styles.cardBottomRow}>
                          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                            <Pressable
                              onPress={(e: any) => {
                                e?.stopPropagation?.();
                                e?.preventDefault?.();
                                void deleteFlowStep(step);
                              }}
                              style={({ pressed }: any) => [styles.builderIconBtnDanger, pressed ? { opacity: 0.9 } : null]}
                              accessibilityLabel="מחק"
                            >
                              <Ionicons name="trash-outline" size={18} color="#EF4444" />
                            </Pressable>
                          </View>

                          <Pressable
                            onPress={(e: any) => {
                              e?.stopPropagation?.();
                              e?.preventDefault?.();
                              if (!canEdit) {
                                void openViewer(step);
                                return;
                              }
                              openFlowEditor(step);
                            }}
                            style={({ pressed }: any) => [styles.editBtn, pressed ? { opacity: 0.9 } : null]}
                          >
                            <Ionicons name={canEdit ? 'create-outline' : 'eye-outline'} size={16} color={ui.primary} />
                            <Text style={[styles.editBtnText, { color: ui.primary }]}>{canEdit ? 'ערוך' : 'צפייה'}</Text>
                          </Pressable>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
            </View>
          ) : null}
        </MainColumnComponent>
      </View>

      {/* Add Step Wizard (2-step form) */}
      {addWizardOpen ? (
        <View style={styles.dialogOverlay}>
          <Pressable style={styles.pickerBackdrop} onPress={closeAddWizard} />
          <View style={styles.dialogCard}>
            <View style={styles.dialogHeader}>
              <Text style={styles.dialogTitle}>{addWizardStep === 1 ? 'איזה הודעה תרצה לבחור?' : 'בחירת שלב'}</Text>
              <Pressable onPress={closeAddWizard} style={styles.dialogClose}>
                <Ionicons name="close" size={18} color="#111827" />
              </Pressable>
            </View>

            {addWizardStep === 1 ? (
              <View style={{ padding: 14, gap: 12 }}>
                <Text style={styles.recipientsPreviewHint}>בחר סוג הודעה. לאחר מכן תבחר לאיזה שלב להכניס את הכרטיסיה.</Text>
                <View style={styles.wizardChoiceRow}>
                  <Pressable
                    onPress={() => setAddWizardChannel('SMS')}
                    style={({ pressed }: any) => [
                      styles.wizardChoiceBtn,
                      addWizardChannel === 'SMS' ? styles.wizardChoiceBtnActive : null,
                      pressed ? { opacity: 0.92 } : null,
                    ]}
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={20} color={addWizardChannel === 'SMS' ? '#4F46E5' : '#111827'} />
                    <Text style={[styles.wizardChoiceTitle, addWizardChannel === 'SMS' ? styles.wizardChoiceTitleActive : null]}>SMS</Text>
                    <Text style={styles.wizardChoiceSub}>שליחה מתוזמנת בהתאם לרגע</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setAddWizardChannel('WHATSAPP')}
                    style={({ pressed }: any) => [
                      styles.wizardChoiceBtn,
                      addWizardChannel === 'WHATSAPP' ? styles.wizardChoiceBtnActive : null,
                      pressed ? { opacity: 0.92 } : null,
                    ]}
                  >
                    <Ionicons name="logo-whatsapp" size={20} color={addWizardChannel === 'WHATSAPP' ? '#25D366' : '#111827'} />
                    <Text style={[styles.wizardChoiceTitle, addWizardChannel === 'WHATSAPP' ? styles.wizardChoiceTitleActive : null]}>WhatsApp</Text>
                    <Text style={styles.wizardChoiceSub}>שליחה מתוזמנת עם תבנית וואטסאפ</Text>
                  </Pressable>
                </View>

                <View style={styles.dialogActions}>
                  <Pressable onPress={closeAddWizard} style={[styles.dialogBtn, styles.dialogBtnGhost]}>
                    <Text style={styles.dialogBtnGhostText}>ביטול</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setAddWizardInsertAt(flowStepsSorted.length + 1);
                      setAddWizardStep(2);
                    }}
                    style={[styles.dialogBtn, styles.dialogBtnPrimary]}
                  >
                    <Text style={styles.dialogBtnPrimaryText}>המשך</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={{ padding: 14, gap: 12 }}>
                <View style={styles.wizardChipRow}>
                  <View style={styles.wizardChip}>
                    <Ionicons name={addWizardChannel === 'WHATSAPP' ? 'logo-whatsapp' : 'chatbubble-ellipses-outline'} size={14} color="#4F46E5" />
                    <Text style={styles.wizardChipText}>{addWizardChannel === 'WHATSAPP' ? 'WhatsApp' : 'SMS'}</Text>
                  </View>
                  <Text style={styles.recipientsPreviewHint}>בחר לאיזה שלב להכניס. שלבים קיימים יזוזו אוטומטית קדימה.</Text>
                </View>

                <ScrollView style={{ maxHeight: 440 }} contentContainerStyle={{ gap: 8, paddingBottom: 6 }}>
                  {(() => {
                    const cards = combinedCards;
                    const options: Array<{ key: string; insertAt: number; title: string; sub: string }> = [];

                    if (cards.length === 0) {
                      options.push({
                        key: 'only',
                        insertAt: 1,
                        title: 'כרטיסיה ראשונה (שלב 1)',
                        sub: 'ייווצר שלב 1 חדש.',
                      });
                    } else {
                      options.push({
                        key: 'before-first',
                        insertAt: 1,
                        title: 'לפני שלב 1',
                        sub: `הכרטיסיה "${String(cards[0]?.row?.title || 'כרטיסיה')}" תזוז למיקום הבא`,
                      });
                    }

                    // Insert after each existing card i => insertAt i+2
                    for (let i = 0; i < cards.length; i++) {
                      const after = cards[i]?.row;
                      const next = cards[i + 1]?.row;
                      const insertAt = i + 2;
                      options.push({
                        key: `after-${String((after as any)?.id || (after as any)?.notification_type || i)}`,
                        insertAt,
                        title: `אחרי ${String((after as any)?.title || `כרטיסיה ${i + 1}`)}`,
                        sub: next
                          ? `הכרטיסיה הבאה "${String((next as any)?.title || `כרטיסיה ${i + 2}`)}" תזוז למיקום הבא`
                          : `יוסף בסוף הרשימה (מיקום ${insertAt})`,
                      });
                    }

                    return options.map((opt) => {
                      const selected = addWizardInsertAt === opt.insertAt;
                      return (
                        <Pressable
                          key={opt.key}
                          onPress={() => setAddWizardInsertAt(opt.insertAt)}
                          style={({ pressed }: any) => [
                            styles.wizardInsertCard,
                            selected ? styles.wizardInsertCardSelected : null,
                            pressed ? { opacity: 0.92 } : null,
                          ]}
                        >
                          <View style={styles.wizardInsertTopRow}>
                            <Text style={styles.wizardInsertTitle}>{opt.title}</Text>
                            {selected ? (
                              <View style={styles.wizardInsertBadge}>
                                <Ionicons name="checkmark" size={14} color="#16A34A" />
                                <Text style={styles.wizardInsertBadgeText}>נבחר</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={styles.wizardInsertSub}>{opt.sub}</Text>
                        </Pressable>
                      );
                    });
                  })()}
                </ScrollView>

                <View style={styles.dialogActions}>
                  <Pressable
                    onPress={() => setAddWizardStep(1)}
                    style={[styles.dialogBtn, styles.dialogBtnGhost]}
                  >
                    <Text style={styles.dialogBtnGhostText}>חזרה</Text>
                  </Pressable>
                  <Pressable
                    onPress={async () => {
                      await insertFlowStep({ channel: addWizardChannel, insertAt: addWizardInsertAt });
                      closeAddWizard();
                    }}
                    style={[styles.dialogBtn, styles.dialogBtnPrimary]}
                  >
                    <Text style={styles.dialogBtnPrimaryText}>הוסף כרטיסיה</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </View>
      ) : null}

      {editorOpen && editorRow ? (
        <View style={styles.editorOverlay}>
          <Pressable style={styles.pickerBackdrop} onPress={closeEditor} />
          <View style={styles.editorCard}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>
                {editorKind === 'flow' ? `עריכת ${String(flowDraft?.title || editorRow.title || 'שלב')}` : `עריכת ${getDisplayTitle(editorRow)}`}
              </Text>
              <Pressable onPress={closeEditor} style={({ pressed }: any) => [styles.pickerClose, pressed ? { opacity: 0.9 } : null]}>
                <Ionicons name="close" size={18} color="#111827" />
              </Pressable>
            </View>

            {editorIsWhatsapp ? (
              <View style={[styles.waQuotaBar, waOverQuota ? styles.waQuotaBarWarn : null]}>
                <Ionicons name="logo-whatsapp" size={16} color={waOverQuota ? '#B45309' : '#0E7C46'} />
                <Text style={styles.waQuotaBarText}>
                  {`מכסת וואטסאפ יומית: ${waSentToday}/${Number(waDailyQuota || 0)} נשלחו · נותרו ${waQuotaRemaining}`}
                </Text>
                {waOverQuota ? (
                  <View style={styles.waQuotaBadge}>
                    <Ionicons name="alert-circle" size={13} color="#B45309" />
                    <Text style={styles.waQuotaBadgeText}>חריגה ממכסה</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            <ScrollView style={styles.editorBody} contentContainerStyle={styles.editorBodyContent} showsVerticalScrollIndicator={false}>
              {eventDetailRows.length > 0 ? (
                <View style={styles.eventDetailsCard}>
                  <Pressable
                    onPress={() => setEventDetailsOpen((v) => !v)}
                    style={({ pressed }: any) => [styles.eventDetailsHeader, pressed ? { opacity: 0.92 } : null]}
                  >
                    <View style={styles.eventDetailsHeaderLeft}>
                      <Ionicons name={eventDetailsOpen ? 'chevron-up' : 'chevron-down'} size={16} color="#4F46E5" />
                    </View>
                    <View style={styles.eventDetailsHeaderRight}>
                      <Ionicons name="information-circle-outline" size={16} color="#4F46E5" />
                      <Text style={styles.eventDetailsTitle}>פרטי האירוע</Text>
                    </View>
                  </Pressable>
                  {eventDetailsOpen ? (
                    <>
                      <Text style={styles.eventDetailsHint}>לחץ על שורה כדי להעתיק, והדבק בשדות התוכן של ההודעה.</Text>
                      <View style={styles.eventDetailsGrid}>
                        {eventDetailRows.map((row) => (
                          <Pressable
                            key={row.key}
                            onPress={() => void copyEventDetail(row.value, row.label)}
                            style={({ pressed }: any) => [styles.eventDetailItem, pressed ? { opacity: 0.85 } : null]}
                          >
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={styles.eventDetailLabel} numberOfLines={1}>{row.label}</Text>
                              <Text style={styles.eventDetailValue} numberOfLines={2}>{row.value}</Text>
                            </View>
                            <Ionicons name="copy-outline" size={15} color="#4F46E5" />
                          </Pressable>
                        ))}
                      </View>
                    </>
                  ) : null}
                </View>
              ) : null}
              {editorKind === 'template' ? (
                <View style={styles.editorWizardTop}>
                  {(() => {
                    const stepId =
                      editorWizardSteps[Math.min(editorWizardStepIdx, Math.max(0, editorWizardSteps.length - 1))] ?? 'schedule';
                    const label =
                      stepId === 'schedule'
                        ? 'הגדרות'
                        : stepId === 'recipients'
                          ? 'נמענים'
                          : stepId === 'catchup'
                            ? 'תור אורחים חדשים'
                            : 'תוכן';
                    const sub =
                      stepId === 'recipients'
                        ? 'בחירת מוזמנים להודעה'
                        : stepId === 'schedule'
                          ? 'בחירת זמנים להודעה'
                          : stepId === 'catchup'
                            ? 'הגדרת הודעות לאורחים שנוספו לאחרונה למערכת'
                            : 'עריכת תוכן הודעה';
                    const pct = Math.max(
                      0,
                      Math.min(100, Math.round(((editorWizardStepIdx + 1) / Math.max(1, editorWizardSteps.length)) * 100))
                    );

                    return (
                      <>
                        <View style={styles.wizardTopTitlesRow}>
                          <View style={{ flex: 1 }} />
                          <View style={{ alignItems: 'flex-start', justifyContent: 'flex-start', minWidth: 0 }}>
                            <Text style={styles.wizardTopTitle} numberOfLines={1}>
                              {`שלב ${editorWizardStepIdx + 1} מתוך ${editorWizardSteps.length}: ${label}`}
                            </Text>
                            <Text style={styles.wizardTopSub} numberOfLines={1}>
                              {sub}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.wizardProgressMetaRow}>
                          <Text style={styles.wizardProgressPct}>{`${pct}%`}</Text>
                          <Text style={styles.wizardProgressLabel}>{label}</Text>
                        </View>
                        <View style={styles.wizardProgressTrack}>
                          <View style={[styles.wizardProgressFill, { width: `${pct}%` }]} />
                        </View>
                      </>
                    );
                  })()}
                </View>
              ) : null}
              {editorKind === 'flow' ? (
                <View style={[styles.editorSection, editorIsWhatsapp ? styles.waStepCard : null]}>
                  <View style={styles.editorSectionHeader}>
                    {editorIsWhatsapp ? (
                      <View style={styles.stepNumBadge}><Text style={styles.stepNumBadgeText}>1</Text></View>
                    ) : (
                      <Ionicons name="albums-outline" size={16} color="rgba(79,70,229,1)" />
                    )}
                    <Text style={styles.editorSectionTitle}>{editorIsWhatsapp ? 'בחירת נמענים' : 'כרטיסיה'}</Text>
                  </View>

                  {!editorIsWhatsapp ? (
                    <View style={styles.fieldRow}>
                      <Text style={styles.fieldLabel}>כותרת</Text>
                      <TextInput
                        value={flowDraft?.title ?? ''}
                        onChangeText={(t) => setFlowDraft((d) => (d ? { ...d, title: String(t || '') } : d))}
                        style={styles.fieldInput}
                        placeholder="כותרת לשלב"
                        placeholderTextColor="rgba(100,116,139,0.6)"
                      />
                    </View>
                  ) : null}

                  {editorIsWhatsapp ? (
                    <View style={styles.fieldRow}>
                      <Text style={styles.fieldLabel}>בחירת נמענים</Text>

                      <View style={styles.waModeToggleRow}>
                        <Pressable
                          onPress={() => setFlowDraft((d) => (d ? { ...d, recipientMode: 'groups' } : d))}
                          style={({ pressed }: any) => [
                            styles.waModeToggleBtn,
                            !waManualMode ? styles.waModeToggleBtnActive : null,
                            pressed ? { opacity: 0.92 } : null,
                          ]}
                        >
                          <Ionicons name="people-outline" size={15} color={!waManualMode ? '#4F46E5' : '#64748B'} />
                          <Text style={[styles.waModeToggleText, !waManualMode ? styles.waModeToggleTextActive : null]}>לפי קבוצות</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => setFlowDraft((d) => (d ? { ...d, recipientMode: 'manual' } : d))}
                          style={({ pressed }: any) => [
                            styles.waModeToggleBtn,
                            waManualMode ? styles.waModeToggleBtnActive : null,
                            pressed ? { opacity: 0.92 } : null,
                          ]}
                        >
                          <Ionicons name="hand-left-outline" size={15} color={waManualMode ? '#4F46E5' : '#64748B'} />
                          <Text style={[styles.waModeToggleText, waManualMode ? styles.waModeToggleTextActive : null]}>בחירה ידנית</Text>
                        </Pressable>
                      </View>

                      {waManualMode ? (
                        <View style={styles.waManualWrap}>
                          <Text style={styles.editorSectionHint}>בחר מוזמנים ספציפיים מהרשימה. אפשר לחפש ולסנן לפי סטטוס.</Text>
                          <View style={styles.waManualSearchRow}>
                            <Ionicons name="search" size={16} color="#94A3B8" />
                            <TextInput
                              value={pickerSearch}
                              onChangeText={setPickerSearch}
                              style={styles.waManualSearchInput}
                              placeholder="חיפוש לפי שם או טלפון"
                              placeholderTextColor="rgba(100,116,139,0.6)"
                            />
                          </View>
                          <View style={[styles.modeRow, { flexWrap: 'wrap' }]}>
                            {([
                              { key: 'all', label: 'הכל' },
                              { key: 'pending', label: 'ממתין' },
                              { key: 'confirmed', label: 'מגיע' },
                              { key: 'declined', label: 'לא מגיע' },
                            ] as Array<{ key: 'all' | 'pending' | 'confirmed' | 'declined'; label: string }>).map((opt) => {
                              const active = pickerFilter === opt.key;
                              return (
                                <Pressable
                                  key={opt.key}
                                  onPress={() => setPickerFilter(opt.key)}
                                  style={({ pressed }: any) => [styles.modePill, active ? styles.modePillActive : null, pressed ? { opacity: 0.92 } : null]}
                                >
                                  <Text style={[styles.modePillText, active ? styles.modePillTextActive : null]}>{opt.label}</Text>
                                </Pressable>
                              );
                            })}
                          </View>
                          <View style={styles.waManualActionsRow}>
                            <Pressable onPress={pickerSelectAllFiltered} style={({ pressed }: any) => [styles.waManualLinkBtn, pressed ? { opacity: 0.9 } : null]}>
                              <Ionicons name="checkmark-done-outline" size={14} color="#4F46E5" />
                              <Text style={styles.waManualLinkText}>בחר את כל המסוננים</Text>
                            </Pressable>
                            <Pressable onPress={pickerClear} style={({ pressed }: any) => [styles.waManualLinkBtn, pressed ? { opacity: 0.9 } : null]}>
                              <Ionicons name="close-outline" size={14} color="#4F46E5" />
                              <Text style={styles.waManualLinkText}>נקה בחירה</Text>
                            </Pressable>
                          </View>
                          <ScrollView style={styles.waManualList} nestedScrollEnabled contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
                            {pickerFilteredGuests.length === 0 ? (
                              <Text style={styles.editorSectionHint}>לא נמצאו מוזמנים תואמים.</Text>
                            ) : (
                              pickerFilteredGuests.map((g) => {
                                const id = String(g.id);
                                const checked = pickerSelectedIds.has(id);
                                return (
                                  <Pressable
                                    key={id}
                                    onPress={() => pickerToggleGuest(id)}
                                    style={({ pressed }: any) => [styles.waGuestRow, checked ? styles.waGuestRowChecked : null, pressed ? { opacity: 0.92 } : null]}
                                  >
                                    <View style={[styles.waCheckbox, checked ? styles.waCheckboxChecked : null]}>
                                      {checked ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
                                    </View>
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                      <Text style={styles.waGuestName} numberOfLines={1}>{String(g.name || 'ללא שם')}</Text>
                                      <Text style={styles.waGuestMeta} numberOfLines={1}>
                                        {`${String(g.phone || 'אין טלפון')}${g.status ? ` · ${String(g.status)}` : ''}`}
                                      </Text>
                                    </View>
                                  </Pressable>
                                );
                              })
                            )}
                          </ScrollView>
                        </View>
                      ) : (
                        <>
                          <Text style={styles.editorSectionHint}>ניתן לבחור כמה קבוצות יחד. ההודעה תישלח לאיחוד הקבוצות שנבחרו (ללא כפילויות).</Text>
                          <View style={[styles.modeRow, { flexWrap: 'wrap' }]}>
                            {([
                              { key: 'all', label: 'כל המוזמנים' },
                              { key: 'pending', label: 'ממתינים' },
                              { key: 'coming', label: 'מגיעים' },
                              { key: 'not_coming', label: 'לא מגיעים' },
                              { key: 'maybe', label: 'אולי מגיעים' },
                            ] as Array<{ key: string; label: string }>).map((opt) => {
                              const groups = flowDraft?.recipientGroups || [];
                              const active = groups.includes(opt.key);
                              const groupCount = guestIdsForGroup(opt.key).length;
                              return (
                                <Pressable
                                  key={opt.key}
                                  onPress={() =>
                                    setFlowDraft((d) => {
                                      if (!d) return d;
                                      const cur = d.recipientGroups || [];
                                      const next = cur.includes(opt.key) ? cur.filter((g) => g !== opt.key) : [...cur, opt.key];
                                      return { ...d, recipientGroups: next };
                                    })
                                  }
                                  style={({ pressed }: any) => [
                                    styles.modePill,
                                    active ? styles.modePillActive : null,
                                    pressed ? { opacity: 0.92 } : null,
                                  ]}
                                >
                                  {active ? <Ionicons name="checkmark-circle" size={14} color="#4F46E5" /> : null}
                                  <Text style={[styles.modePillText, active ? styles.modePillTextActive : null]}>
                                    {`${opt.label} (${groupCount})`}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </>
                      )}

                      <View style={[styles.waCountCard, waOverQuota ? styles.waCountCardWarn : null]}>
                        <Ionicons
                          name={waOverQuota ? 'alert-circle' : 'people'}
                          size={18}
                          color={waOverQuota ? '#B45309' : '#0E7C46'}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.waCountTitle}>
                            {`ההודעה תישלח ל־${waRecipientCount} מוזמנים`}
                          </Text>
                          {waOverQuota ? (
                            <Text style={styles.waCountWarnText}>
                              {`חריגה ממכסת הוואטסאפ היומית — נותרו ${waQuotaRemaining} הודעות בלבד. העודפים ידולגו.`}
                            </Text>
                          ) : Number(waDailyQuota || 0) > 0 ? (
                            <Text style={styles.waCountSubText}>
                              {`נותרו ${waQuotaRemaining} הודעות מתוך מכסה יומית של ${waDailyQuota}.`}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  ) : (
                  <View style={styles.fieldRow}>
                    <Text style={styles.fieldLabel}>נמענים</Text>
                    <View style={[styles.modeRow, { flexWrap: 'wrap' }]}>
                      {([
                        { key: 'manual', label: 'בחירה ידנית' },
                        { key: 'all', label: 'כל המוזמנים' },
                        { key: 'pending', label: 'ממתינים' },
                        { key: 'coming', label: 'מגיעים' },
                        { key: 'not_coming', label: 'לא מגיעים' },
                        { key: 'maybe', label: 'אולי מגיעים' },
                        { key: 'prev_pending', label: 'ממתינים מהשלב הקודם' },
                      ] as Array<{ key: WaRecipientMode; label: string }>).map((opt) => {
                        const active = (flowDraft?.recipientMode || 'manual') === opt.key;
                        return (
                          <Pressable
                            key={opt.key}
                            onPress={() => setFlowDraft((d) => (d ? { ...d, recipientMode: opt.key } : d))}
                            style={({ pressed }: any) => [
                              styles.modePill,
                              active ? styles.modePillActive : null,
                              pressed ? { opacity: 0.92 } : null,
                            ]}
                          >
                            <Text style={[styles.modePillText, active ? styles.modePillTextActive : null]}>{opt.label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                  )}

                  {!editorIsWhatsapp && flowDraft?.recipientMode === 'prev_pending' ? (
                    <View style={styles.fieldRow}>
                      <Text style={styles.fieldLabel}>שלב קודם</Text>
                      {(() => {
                        const candidates = [...displayRows, ...flowStepsSorted].filter(
                          (s) =>
                            String((s as any)?.id || '').trim() &&
                            String((s as any)?.id) !== String(editorRow.id || '') &&
                            String((s as any)?.channel || 'SMS') === 'SMS'
                        );
                        const selected = flowDraft?.dependsOnSettingId
                          ? candidates.find((s) => String((s as any).id) === String(flowDraft.dependsOnSettingId))
                          : null;
                        const selectedDt = selected?.notification_date ? new Date(String(selected.notification_date)) : null;
                        const selectedWhen = selectedDt && Number.isFinite(selectedDt.getTime()) ? formatHeDateTimeShort(selectedDt) : '';
                        const selectedRun = selected?.id ? lastSmsRunBySettingId[String(selected.id)] : undefined;
                        const selectedRunLabel = selectedRun ? statusLabel(String(selectedRun.status)) : null;

                        return (
                          <View style={{ gap: 10 }}>
                            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                              <Pressable
                                onPress={() => setDependsPickerOpen(true)}
                                style={({ pressed }: any) => [styles.dependsSelectBtn, pressed ? { opacity: 0.92 } : null]}
                              >
                                <Ionicons name="git-branch-outline" size={16} color="#4F46E5" />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                  <Text style={styles.dependsSelectTitle} numberOfLines={1}>
                                    {selected ? String(selected.title || 'שלב') : 'בחר שלב קודם…'}
                                  </Text>
                                  <Text style={styles.dependsSelectSub} numberOfLines={1}>
                                    {selected
                                      ? `${selectedWhen ? `${selectedWhen} · ` : ''}${selectedRunLabel ? `שליחה אחרונה: ${selectedRunLabel.text}` : 'אין שליחה קודמת'}`
                                      : 'נדרש כדי לחשב “ממתינים מהשלב הקודם”.'}
                                  </Text>
                                </View>
                                <Ionicons name="chevron-back" size={18} color="rgba(100,116,139,1)" />
                              </Pressable>

                              <Pressable
                                onPress={() => setFlowDraft((d) => (d ? { ...d, dependsOnSettingId: null } : d))}
                                style={({ pressed }: any) => [
                                  styles.dependsClearBtn,
                                  pressed ? { opacity: 0.92 } : null,
                                ]}
                                accessibilityLabel="נקה בחירה"
                              >
                                <Ionicons name="close" size={16} color="rgba(100,116,139,1)" />
                              </Pressable>
                            </View>

                            <Text style={styles.editorSectionHint}>
                              הרשימה מחושבת לפי השליחה האחרונה של השלב שתבחר + סטטוס <Text style={styles.recipientsHintEm}>ממתין</Text>.
                            </Text>
                          </View>
                        );
                      })()}
                    </View>
                  ) : null}
                </View>
              ) : null}

              {editorKind === 'flow' && editorIsWhatsapp ? (
                <View style={[styles.editorSection, styles.waStepCard]}>
                  <View style={styles.editorSectionHeader}>
                    <View style={styles.stepNumBadge}><Text style={styles.stepNumBadgeText}>2</Text></View>
                    <Text style={styles.editorSectionTitle}>תוכן ההודעה</Text>
                  </View>

                  {String((editorRow as any)?.channel || 'SMS').toUpperCase() === 'WHATSAPP' ? (
                    (() => {
                      const selectedTpl = waTemplates.find((t) => t.id === (flowDraft?.whatsappTemplateId || ''));
                      const params: WhatsAppStepParams = flowDraft?.whatsappParams || {};
                      const setParams = (patch: Partial<WhatsAppStepParams>) =>
                        setFlowDraft((d) => (d ? { ...d, whatsappParams: { ...(d.whatsappParams || {}), ...patch } } : d));
                      const setBodyAt = (i: number, value: string) => {
                        const body = Array.isArray(params.body) ? [...params.body] : [];
                        body[i] = value;
                        setParams({ body });
                      };
                      const setButtonSuffix = (index: number, suffix: string) => {
                        const buttons = Array.isArray(params.buttons) ? [...params.buttons] : [];
                        const at = buttons.findIndex((b) => Number(b.index) === Number(index));
                        if (at >= 0) buttons[at] = { ...buttons[at], suffix };
                        else buttons.push({ index, suffix });
                        setParams({ buttons });
                      };
                      const buttonSuffixOf = (index: number) =>
                        String((Array.isArray(params.buttons) ? params.buttons : []).find((b) => Number(b.index) === Number(index))?.suffix ?? '');

                      const pickHeaderImage = async () => {
                        if (!canEdit) {
                          showToast('לצפייה בלבד');
                          return;
                        }
                        if (!event?.id) {
                          alert('לא נמצא אירוע לשיוך התמונה.');
                          return;
                        }
                        try {
                          const result = await ImagePicker.launchImageLibraryAsync({
                            mediaTypes: ImagePicker.MediaTypeOptions.Images,
                            quality: 0.9,
                            base64: true,
                          });
                          if (result.canceled || !result.assets?.[0]) return;
                          const asset = result.assets[0] as any;
                          setWaImageUploading(true);
                          const url = await invitationAssetService.uploadInvitationImage(String(event.id), {
                            uri: asset.uri,
                            fileName: asset.fileName,
                            mimeType: asset.mimeType,
                            file: asset.file,
                            base64: asset.base64,
                          });
                          setParams({ header_image_url: url });
                        } catch (e) {
                          console.error('Failed to upload WhatsApp header image:', e);
                          alert('העלאת התמונה נכשלה. נסה שוב.');
                        } finally {
                          setWaImageUploading(false);
                        }
                      };

                      return (
                        <View style={styles.waBlock}>
                          <View style={styles.editorSectionHeader}>
                            <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
                            <Text style={styles.editorSectionTitle}>תבנית וואטסאפ</Text>
                          </View>

                          {waTemplates.length === 0 ? (
                            <View style={styles.waEmpty}>
                              <Text style={styles.editorSectionHint}>עדיין לא הוגדרו תבניות וואטסאפ.</Text>
                              {userType === 'admin' ? (
                                <Pressable
                                  onPress={() => router.push('/(admin)/whatsapp-templates' as any)}
                                  style={({ pressed }: any) => [styles.waManageBtn, pressed ? { opacity: 0.9 } : null]}
                                >
                                  <Ionicons name="add" size={16} color="#fff" />
                                  <Text style={styles.waManageBtnText}>הוסף תבניות</Text>
                                </Pressable>
                              ) : (
                                <Text style={styles.editorSectionHint}>פנה למנהל המערכת להוספת תבניות וואטסאפ.</Text>
                              )}
                            </View>
                          ) : (
                            <>
                              <View style={styles.fieldRow}>
                                <Text style={styles.fieldLabel}>בחר תבנית</Text>
                                <View style={[styles.modeRow, { flexWrap: 'wrap' }]}>
                                  {waTemplates.map((t) => {
                                    const active = (flowDraft?.whatsappTemplateId || '') === t.id;
                                    return (
                                      <Pressable
                                        key={t.id}
                                        onPress={() => setFlowDraft((d) => (d ? { ...d, whatsappTemplateId: t.id, whatsappParams: {} } : d))}
                                        style={({ pressed }: any) => [styles.modePill, active ? styles.modePillActive : null, pressed ? { opacity: 0.92 } : null]}
                                      >
                                        <Text style={[styles.modePillText, active ? styles.modePillTextActive : null]}>{t.label}</Text>
                                      </Pressable>
                                    );
                                  })}
                                </View>
                              </View>

                              {selectedTpl ? (
                                <View style={{ gap: 12 }}>
                                  {selectedTpl.bodyText ? (
                                    <View style={styles.waPreview}>
                                      <Text style={styles.waPreviewText}>{selectedTpl.bodyText}</Text>
                                    </View>
                                  ) : null}

                                  {selectedTpl.headerType === 'image' ? (
                                    <View style={styles.fieldRow}>
                                      <Text style={styles.fieldLabel}>תמונת כותרת</Text>
                                      <Text style={styles.editorSectionHint}>
                                        העלה תמונה שתופיע בראש הודעת הוואטסאפ. אם לא תעלה תמונה, תישלח תמונת ההזמנה של האירוע כברירת מחדל.
                                      </Text>

                                      {(() => {
                                        const eventInvImg = String((event as any)?.invitation_image_url ?? '').trim();
                                        const customImg = String(params.header_image_url ?? '').trim();
                                        const previewUri = customImg || eventInvImg;
                                        const isDefault = !customImg && !!eventInvImg;
                                        if (!previewUri) return null;
                                        return (
                                          <View style={styles.waImagePreviewWrap}>
                                            <Image source={{ uri: previewUri }} style={styles.waImagePreview} resizeMode="cover" />
                                            {isDefault ? (
                                              <View style={styles.waImageDefaultBadge}>
                                                <Ionicons name="image-outline" size={12} color="#fff" />
                                                <Text style={styles.waImageDefaultBadgeText}>תמונת ברירת מחדל (הזמנת האירוע)</Text>
                                              </View>
                                            ) : null}
                                          </View>
                                        );
                                      })()}

                                      <View style={styles.waImageActionsRow}>
                                        <Pressable
                                          onPress={pickHeaderImage}
                                          disabled={waImageUploading || !canEdit}
                                          style={({ pressed }: any) => [
                                            styles.waUploadBtn,
                                            (waImageUploading || !canEdit) ? { opacity: 0.6 } : null,
                                            pressed ? { opacity: 0.9 } : null,
                                          ]}
                                        >
                                          {waImageUploading ? (
                                            <ActivityIndicator size="small" color="#fff" />
                                          ) : (
                                            <Ionicons name={params.header_image_url ? 'sync-outline' : 'cloud-upload-outline'} size={16} color="#fff" />
                                          )}
                                          <Text style={styles.waUploadBtnText}>
                                            {waImageUploading ? 'מעלה...' : params.header_image_url ? 'החלף תמונה' : 'העלה תמונה'}
                                          </Text>
                                        </Pressable>

                                        {params.header_image_url ? (
                                          <Pressable
                                            onPress={() => setParams({ header_image_url: null })}
                                            disabled={waImageUploading}
                                            style={({ pressed }: any) => [styles.waImageRemoveBtn, pressed ? { opacity: 0.85 } : null]}
                                          >
                                            <Ionicons name="trash-outline" size={16} color="#DC2626" />
                                            <Text style={styles.waImageRemoveBtnText}>הסר</Text>
                                          </Pressable>
                                        ) : null}
                                      </View>
                                    </View>
                                  ) : null}

                                  {selectedTpl.headerType === 'text' ? (
                                    <View style={styles.fieldRow}>
                                      <Text style={styles.fieldLabel}>טקסט כותרת</Text>
                                      <TextInput
                                        value={String(params.header_text ?? '')}
                                        onChangeText={(t) => setParams({ header_text: t })}
                                        style={styles.fieldInput}
                                        placeholder="טקסט הכותרת"
                                        placeholderTextColor="rgba(100,116,139,0.6)"
                                      />
                                    </View>
                                  ) : null}

                                  {selectedTpl.variables.length > 0 ? (
                                    <View style={{ gap: 12 }}>
                                      {[...selectedTpl.variables]
                                        .sort((a, b) => Number(a.index) - Number(b.index))
                                        .map((v, i) => {
                                          const fieldTitle = String(v.label || '').trim() || `שדה ${i + 1}`;
                                          const fieldNumber = Number(v.index) || i + 1;
                                          return (
                                            <View key={i} style={styles.waVarField}>
                                              <View style={styles.waVarLabelRow}>
                                                <View style={styles.waVarNumBadge}>
                                                  <Text style={styles.waVarNumBadgeText}>{fieldNumber}</Text>
                                                </View>
                                                <Text style={styles.waVarFieldLabel}>{fieldTitle}</Text>
                                              </View>
                                              <TextInput
                                                value={String((Array.isArray(params.body) ? params.body : [])[i] ?? '')}
                                                onChangeText={(t) => setBodyAt(i, t)}
                                                style={styles.fieldInput}
                                                placeholder={v.sample ? `לדוגמה: ${v.sample}` : `הזן ${fieldTitle}`}
                                                placeholderTextColor="rgba(100,116,139,0.6)"
                                              />
                                            </View>
                                          );
                                        })}
                                    </View>
                                  ) : null}

                                  {selectedTpl.buttons.length > 0 ? (
                                    <View style={{ gap: 12 }}>
                                      <Text style={styles.fieldLabel}>כפתורים</Text>
                                      {selectedTpl.buttons.map((b, i) => (
                                        <View key={i} style={styles.waVarField}>
                                          <Text style={styles.waVarFieldLabel}>{b.label || `כפתור ${i + 1}`}</Text>
                                          {b.kind === 'invitation' ? (
                                            <Text style={styles.editorSectionHint}>
                                              מושלם אוטומטית עם הקישור האישי של כל אורח
                                            </Text>
                                          ) : (
                                            <TextInput
                                              value={buttonSuffixOf(b.index)}
                                              onChangeText={(t) => setButtonSuffix(b.index, t)}
                                              style={styles.fieldInput}
                                              placeholder="הזן את ערך הקישור"
                                              placeholderTextColor="rgba(100,116,139,0.6)"
                                              autoCapitalize="none"
                                            />
                                          )}
                                        </View>
                                      ))}
                                    </View>
                                  ) : null}
                                </View>
                              ) : (
                                <Text style={styles.editorSectionHint}>בחר תבנית כדי למלא את התוכן הדינמי שלה.</Text>
                              )}

                              {userType === 'admin' ? (
                                <Pressable
                                  onPress={() => router.push('/(admin)/whatsapp-templates' as any)}
                                  style={({ pressed }: any) => [styles.waManageLink, pressed ? { opacity: 0.85 } : null]}
                                >
                                  <Ionicons name="settings-outline" size={14} color="#1D4ED8" />
                                  <Text style={styles.waManageLinkText}>ניהול תבניות ומכסה יומית</Text>
                                </Pressable>
                              ) : null}
                            </>
                          )}
                        </View>
                      );
                    })()
                  ) : null}
                </View>
              ) : null}

              {editorKind === 'template' ? (
                editorWizardStepId === 'schedule' ? (
                  <View style={styles.scheduleStepWrap}>
                    <View style={styles.scheduleStepHeader}>
                      <Text style={styles.scheduleStepTitle}>{`עריכת הודעה - ${getDisplayTitle(editorRow)}`}</Text>
                      <Text style={styles.scheduleStepSubTitle}>{`שלב ${editorWizardStepIdx + 1} מתוך ${editorWizardSteps.length}: תזמון הודעה`}</Text>
                    </View>

                    <View style={styles.scheduleStepGrid}>
                      <View style={styles.scheduleLeftCol}>
                        <View style={styles.scheduleChoiceCard}>
                          <View style={styles.scheduleChoiceTopRow}>
                            <Text style={styles.scheduleChoiceTitle}>הבחירה שלך:</Text>
                            <Ionicons name="calendar-outline" size={18} color="#1D4ED8" />
                          </View>
                          <Text style={styles.scheduleChoiceValue}>{formatOffsetLabel(Number(editDraft?.days ?? 0) || 0)}</Text>
                        </View>

                        <View style={styles.scheduleFieldBlock}>
                          <Text style={styles.scheduleFieldLabel}>תאריך שליחה</Text>
                          <View style={styles.scheduleInputRow}>
                            <Ionicons name="calendar-outline" size={16} color="rgba(71,85,105,1)" />
                            <Text style={styles.scheduleInputText}>
                              {scheduledSendDateTime ? formatDmyFromYmd(toLocalYmd(scheduledSendDateTime) || '') : 'בחר תאריך'}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.scheduleFieldBlock}>
                          <Text style={styles.scheduleFieldLabel}>שעה</Text>
                          <Pressable
                            onPress={openTimeDialog}
                            disabled={!canEdit}
                            style={({ pressed }: any) => [
                              styles.scheduleInputRow,
                              !canEdit ? { opacity: 0.55 } : null,
                              pressed ? { opacity: 0.96 } : null,
                            ]}
                          >
                            <Ionicons name="time-outline" size={16} color="rgba(71,85,105,1)" />
                            <Text style={styles.scheduleInputText}>{String(editDraft?.timeHm || '11:00')}</Text>
                          </Pressable>
                        </View>

                        <Text style={styles.scheduleHintText}>
                          זמן השליחה הוא לפי שעון ישראל (GMT+3). הודעות ייכנסו לתור שליחה במועד שנבחר.
                        </Text>

                        <View style={styles.scheduleSummaryCard}>
                          <Text style={styles.scheduleSummaryLabel}>מועד שליחה סופי</Text>
                          <Text style={styles.scheduleSummaryValue}>
                            {scheduledSendDateTime ? `${String(editDraft?.timeHm || '')}, ${formatDmyFromYmd(toLocalYmd(scheduledSendDateTime) || '')}` : '—'}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.scheduleCalendarCard}>
                        <View style={styles.calendarHeaderRow}>
                          <Pressable
                            onPress={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                            disabled={!canEdit}
                            style={[styles.navBtn, !canEdit ? ({ opacity: 0.55 } as any) : null]}
                          >
                            <Ionicons name="chevron-forward" size={18} color="#111827" />
                          </Pressable>
                          <Text style={styles.calendarMonthText}>
                            {new Date(calendarGrid.y, calendarGrid.m, 1).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })}
                          </Text>
                          <Pressable
                            onPress={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                            disabled={!canEdit}
                            style={[styles.navBtn, !canEdit ? ({ opacity: 0.55 } as any) : null]}
                          >
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
                                disabled={!c.date || !canEdit}
                                onPress={() => {
                                  const ev = new Date(String((event as any)?.date ?? ''));
                                  if (!Number.isFinite(ev.getTime()) || !c.date) return;
                                  const days = diffDaysLocal(c.date, ev);
                                  setEditDraft((d) => (d ? { ...d, days } : d));
                                }}
                                style={({ pressed }: any) => [
                                  styles.dayCell,
                                  isSelected ? styles.dayCellSelected : null,
                                  !canEdit ? { opacity: 0.55 } : null,
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
                  </View>
                ) : null
              ) : (
                <View style={[styles.editorSection, editorIsWhatsapp ? styles.waStepCard : null]}>
                  <View style={styles.editorSectionHeader}>
                    {editorIsWhatsapp ? (
                      <View style={styles.stepNumBadge}><Text style={styles.stepNumBadgeText}>3</Text></View>
                    ) : (
                      <Ionicons name="time-outline" size={16} color="rgba(79,70,229,1)" />
                    )}
                    <Text style={styles.editorSectionTitle}>תזמון שליחה</Text>
                  </View>

                  <View style={styles.timingRow}>
                    <View style={styles.dateInlineCol}>
                      <Pressable
                        onPress={openDateDialog}
                        disabled={!canEdit}
                        style={({ pressed }: any) => [
                          styles.datePillInline,
                          !canEdit ? { opacity: 0.55 } : null,
                          pressed ? { opacity: 0.95 } : null,
                        ]}
                      >
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

                    <Pressable
                      onPress={openTimeDialog}
                      disabled={!canEdit}
                      style={({ pressed }: any) => [
                        styles.timePillInline,
                        !canEdit ? { opacity: 0.55 } : null,
                        pressed ? { opacity: 0.95 } : null,
                      ]}
                    >
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
              )}

              {editorKind === 'template' && editorWizardStepId === 'message' ? null : (editorKind !== 'template' && !editorIsWhatsapp) ? (
                <View style={styles.editorSection}>
                  <View style={styles.editorSectionHeader}>
                    <Ionicons name="pricetag-outline" size={16} color="rgba(79,70,229,1)" />
                    <Text style={styles.editorSectionTitle}>משתנים</Text>
                  </View>
                  <Text style={styles.editorSectionHint}>הוספת משתנים תחליף אותם אוטומטית בזמן שליחה ותכניס אותם בדיוק במקום הסמן.</Text>

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
                      <Pressable onPress={() => insertVariable('{פרטי הגעה}')} style={({ pressed }: any) => [styles.chip, pressed ? { opacity: 0.85 } : null]}>
                        <Text style={[styles.chipText, { color: ui.primary }]}>{'{פרטי הגעה}'}</Text>
                      </Pressable>
                      <Pressable onPress={() => insertVariable('{name}')} style={({ pressed }: any) => [styles.chip, pressed ? { opacity: 0.85 } : null]}>
                        <Text style={[styles.chipText, { color: ui.primary }]}>{'{name}'}</Text>
                      </Pressable>
                      <Pressable onPress={() => insertVariable('{link}')} style={({ pressed }: any) => [styles.chip, pressed ? { opacity: 0.85 } : null]}>
                        <Text style={[styles.chipText, { color: ui.primary }]}>{'{link}'}</Text>
                      </Pressable>
                  </View>
                </View>
              ) : null}

              {editorKind === 'template' && editorWizardStepId === 'message' ? (
                <View style={styles.step4TwoCol}>
                  <View style={[styles.step4PreviewCol, { backgroundColor: ui.surface, borderColor: ui.border }]}>
                    <Text style={[styles.step4PreviewTitle, { color: ui.text }]}>תצוגה מקדימה</Text>
                    <Text style={[styles.step4PreviewSubtitle, { color: ui.sub }]}>כך ההודעה תראה במכשיר הנייד</Text>
                    <View style={styles.step4PhoneMockupWrap}>
                      <IPhoneMockup
                        model="14-pro"
                        color="space-black"
                        fitWidth={300}
                        fitHeight={631}
                        screenBg="#f8fafc"
                        showHomeIndicator={true}
                      >
                        <View style={styles.step4PhoneScreenContent}>
                          <Text style={styles.step4PhoneTime}>היום 14:30</Text>
                          <View style={[styles.step4BubbleIn, { backgroundColor: 'rgba(226,232,240,1)' }]}>
                            <Text style={[styles.step4BubbleText, { color: ui.text }]}>
                              {renderPreviewText(editDraft?.message || getDefaultMessageContent(ownerTitle)).replace(/\n/g, '\n')}
                            </Text>
                            <Text style={styles.step4BubbleTime}>14:31</Text>
                          </View>
                          <View style={[styles.step4BubbleOut, { backgroundColor: 'rgba(59,130,246,1)' }]}>
                            <Text style={styles.step4BubbleTextOut}>תודה רבה! אגיע בזמן.</Text>
                            <Text style={styles.step4BubbleTimeOut}>14:35</Text>
                          </View>
                        </View>
                      </IPhoneMockup>
                    </View>
                  </View>
                  <View style={styles.step4ContentCol}>
                    <Text style={[styles.editorSectionTitle, { color: ui.text }]}>תוכן ותצוגה מקדימה</Text>
                    <Text style={[styles.step4Instruction, { color: ui.sub }]}>
                      הכנס את תוכן ההודעה שלך והשתמש במשתנים כדי להתאים אותה אישית.
                    </Text>
                    <Text style={[styles.step4VarsLabel, { color: ui.text }]}>משתנים זמינים</Text>
                    <Text style={[styles.step4VarsHint, { color: ui.sub }]}>לחיצה על משתנה תוסיף אותו בדיוק במקום שבו הסמן נמצא.</Text>
                    <View style={styles.step4VarsRow}>
                      {[
                        { label: 'שם_פרטי', token: '{שם_פרטי}' },
                        { label: 'שם_משפחה', token: '{name}' },
                        { label: 'כותרת_האירוע', token: '{שם_אירוע}' },
                        { label: 'תאריך_אירוע', token: '{תאריך}' },
                        { label: 'מיקום', token: '{מיקום}' },
                        { label: 'פרטי_הגעה', token: '{פרטי הגעה}' },
                      ].map((v) => (
                        <Pressable
                          key={v.token}
                          onPress={() => insertVariable(v.token)}
                          style={({ pressed }: any) => [styles.step4VarTag, { backgroundColor: ui.surfaceMuted, borderColor: ui.border }, pressed ? { opacity: 0.92 } : null]}
                        >
                          <Ionicons name="add" size={14} color={ui.primary} />
                          <Text style={[styles.step4VarTagText, { color: ui.text }]}>({v.label})</Text>
                        </Pressable>
                      ))}
                      {groomName ? (
                        <Pressable onPress={() => insertVariable('{שם_חתן}')} style={({ pressed }: any) => [styles.step4VarTag, { backgroundColor: ui.surfaceMuted, borderColor: ui.border }, pressed ? { opacity: 0.92 } : null]}>
                          <Ionicons name="add" size={14} color={ui.primary} />
                          <Text style={[styles.step4VarTagText, { color: ui.text }]}>(שם_חתן)</Text>
                        </Pressable>
                      ) : null}
                      {brideName ? (
                        <Pressable onPress={() => insertVariable('{שם_כלה}')} style={({ pressed }: any) => [styles.step4VarTag, { backgroundColor: ui.surfaceMuted, borderColor: ui.border }, pressed ? { opacity: 0.92 } : null]}>
                          <Ionicons name="add" size={14} color={ui.primary} />
                          <Text style={[styles.step4VarTagText, { color: ui.text }]}>(שם_כלה)</Text>
                        </Pressable>
                      ) : null}
                      <Pressable onPress={() => insertVariable('{link}')} style={({ pressed }: any) => [styles.step4VarTag, { backgroundColor: ui.surfaceMuted, borderColor: ui.border }, pressed ? { opacity: 0.92 } : null]}>
                        <Ionicons name="add" size={14} color={ui.primary} />
                        <Text style={[styles.step4VarTagText, { color: ui.text }]}>(link)</Text>
                      </Pressable>
                    </View>
                    <Text style={[styles.editorSectionTitle, { color: ui.text, marginTop: 16 }]}>תוכן ההודעה</Text>
                    <View style={styles.textareaWrap}>
                      <TextInput
                        ref={messageInputRef}
                        value={editDraft?.message ?? ''}
                        onChangeText={handleMessageChange}
                        onSelectionChange={handleMessageSelectionChange}
                        editable={canEdit}
                        multiline
                        selection={messageSelection}
                        textAlignVertical="top"
                        style={styles.textarea}
                        placeholder={'היי {שם_פרטי},\nתודה שנרשמת לאירוע שלנו ב-{תאריך_אירוע}.\nנשמח לראותך בשעה {שעה}.\nלפרטים נוספים השב להודעה זו.\nנתראה!'}
                        placeholderTextColor="rgba(100,116,139,0.6)"
                        maxLength={MESSAGE_MAX_CHARS}
                      />
                      <View style={styles.step4CharRow}>
                        <Text style={[styles.charCount, (editDraft?.message ?? '').length > MESSAGE_MAX_CHARS ? { color: ui.danger } : null]}>
                          {(editDraft?.message ?? '').length}/{MESSAGE_MAX_CHARS}
                        </Text>
                      </View>
                    </View>
                    <Pressable
                      onPress={() => void sendNow()}
                      disabled={sendingNow || !editDraft || !canEdit}
                      style={({ pressed }: any) => [
                        styles.sendNowBtnBelowContent,
                        sendingNow || !editDraft || !canEdit ? styles.sendNowBtnDisabled : null,
                        pressed ? { opacity: 0.92 } : null,
                      ]}
                    >
                      <Ionicons name="paper-plane-outline" size={16} color="#fff" />
                      <Text style={styles.sendNowBtnText}>{sendingNow ? 'שולח...' : 'שלח עכשיו'}</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (editorKind === 'template' || editorIsWhatsapp) ? null : (
                <View style={styles.editorSection}>
                  <View style={styles.editorSectionHeader}>
                    <Ionicons name="chatbox-ellipses-outline" size={16} color="rgba(79,70,229,1)" />
                    <Text style={styles.editorSectionTitle}>תוכן ההודעה</Text>
                  </View>
                  <View style={styles.textareaWrap}>
                    <TextInput
                      ref={messageInputRef}
                      value={editDraft?.message ?? ''}
                      onChangeText={handleMessageChange}
                      onSelectionChange={handleMessageSelectionChange}
                      multiline
                      selection={messageSelection}
                      textAlignVertical="top"
                      style={styles.textarea}
                      placeholder="כתוב הודעה..."
                      placeholderTextColor="rgba(100,116,139,0.6)"
                      maxLength={MESSAGE_MAX_CHARS}
                    />
                    <Text style={[styles.charCount, (editDraft?.message ?? '').length > MESSAGE_MAX_CHARS ? { color: ui.danger } : null]}>
                      {(editDraft?.message ?? '').length}/{MESSAGE_MAX_CHARS} תווים
                    </Text>
                  </View>
                </View>
              )}

              {(editorKind !== 'template' || editorWizardStepId === 'recipients') &&
              (editorRow.notification_type === 'reminder_1' || editorRow.notification_type === 'reminder_2') ? (
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
                    const isAutoAll = nt === 'reminder_1' && String((editorRow as any)?.recipient_mode ?? '').trim() !== 'manual';
                    const isRequired = nt === 'reminder_1' && !isAutoAll;
                    const emptyMeansAllPending = isAutoPending && ids.length === 0;
                    const countLabel = isAutoAll ? 'כל האורחים' : emptyMeansAllPending ? 'כל הממתינים' : `${ids.length} נבחרו`;

                    const isTemplateRecipientsStep = editorKind === 'template' && editorWizardStepId === 'recipients';

                    if (isTemplateRecipientsStep) {
                      const effectiveSelectedIds =
                        isAutoAll && !recipientsWizardManual ? new Set(allGuests.map((g) => String(g.id))) : pickerSelectedIds;
                      const selectedCount = effectiveSelectedIds.size;

                      const ensureManual = () => {
                        if (isAutoAll && !recipientsWizardManual) setRecipientsWizardManual(true);
                      };

                      const toggleGuest = (guestId: string) => {
                        const id = String(guestId || '').trim();
                        if (!id) return;
                        if (isAutoAll && !recipientsWizardManual) {
                          setRecipientsWizardManual(true);
                          const allIds = allGuests.map((g) => String(g.id)).filter(Boolean);
                          setPickerSelectedIds(new Set(allIds.filter((x) => x !== id)));
                          return;
                        }
                        pickerToggleGuest(id);
                      };

                      const selectAll = () => {
                        ensureManual();
                        pickerSelectAllFiltered();
                      };

                      const clearAll = () => {
                        ensureManual();
                        pickerClear();
                      };

                      const filterOptions = [
                        { key: 'all' as const, label: 'הכל', icon: 'checkmark-circle-outline' as const },
                        { key: 'pending' as const, label: 'ממתין', icon: 'time-outline' as const },
                        { key: 'confirmed' as const, label: 'מגיע', icon: 'checkmark-outline' as const },
                        { key: 'declined' as const, label: 'לא מגיע', icon: 'close-outline' as const },
                      ];

                      const allVisibleSelected =
                        pickerFilteredGuests.length > 0 && pickerFilteredGuests.every((g) => effectiveSelectedIds.has(String(g.id)));

                      return (
                        <View style={styles.recipientsStepWrap}>
                          <View style={styles.recipientsSummaryCard}>
                            <View style={styles.recipientsSummaryIcon}>
                              <Ionicons name="people-outline" size={18} color={ui.primary} />
                            </View>
                            <View style={{ flex: 1 }} />
                            <View style={{ justifyContent: 'flex-start', alignItems: 'flex-start' }}>
                              <Text style={styles.recipientsSummaryLabel}>מוזמנים נבחרו</Text>
                              <Text style={styles.recipientsSummaryValue}>{selectedCount}</Text>
                            </View>
                          </View>

                          <>
                            <View style={styles.recipientsChipsRow}>
                              {filterOptions.map((k) => {
                                const active = pickerFilter === k.key;
                                return (
                                  <Pressable
                                    key={k.key}
                                    onPress={() => setPickerFilter(k.key)}
                                    style={({ pressed }: any) => [
                                      styles.recipientsChip,
                                      active ? styles.recipientsChipActive : null,
                                      pressed ? { opacity: 0.92 } : null,
                                    ]}
                                  >
                                    <Ionicons name={k.icon as any} size={16} color={active ? '#fff' : '#111827'} />
                                    <Text style={[styles.recipientsChipText, active ? styles.recipientsChipTextActive : null]}>{k.label}</Text>
                                  </Pressable>
                                );
                              })}
                            </View>

                            {isAutoAll && !recipientsWizardManual ? (
                              <Text style={styles.recipientsHint}>
                                מצב <Text style={styles.recipientsHintEm}>כל האורחים</Text> — כדי להוציא מוזמנים מהרשימה, בטל סימון שורה בטבלה (המערכת תעבור לבחירה ידנית).
                              </Text>
                            ) : null}

                            <View style={styles.recipientsQuickActionsRow}>
                              <Pressable onPress={selectAll} style={({ pressed }: any) => [styles.recipientsLinkBtn, pressed ? { opacity: 0.92 } : null]}>
                                <Text style={styles.recipientsLinkText}>בחר הכל</Text>
                              </Pressable>
                              <Pressable onPress={clearAll} style={({ pressed }: any) => [styles.recipientsLinkBtn, pressed ? { opacity: 0.92 } : null]}>
                                <Text style={styles.recipientsLinkText}>נקה בחירה</Text>
                              </Pressable>
                            </View>

                            <View style={styles.recipientsTableWrap}>
                              <View style={styles.recipientsTableHeaderRow}>
                                <View style={[styles.recipientsTableCell, styles.recipientsCellStatus]}>
                                  <Text style={styles.recipientsTableHeaderText}>סטטוס</Text>
                                </View>
                                <View style={[styles.recipientsTableCell, styles.recipientsCellPhone]}>
                                  <Text style={styles.recipientsTableHeaderText}>טלפון</Text>
                                </View>
                                <View style={[styles.recipientsTableCell, styles.recipientsCellName]}>
                                  <Text style={styles.recipientsTableHeaderText}>שם מלא</Text>
                                </View>
                                <Pressable
                                  onPress={() => {
                                    if (allVisibleSelected) {
                                      ensureManual();
                                      setPickerSelectedIds((prev) => {
                                        const base =
                                          isAutoAll && !recipientsWizardManual
                                            ? new Set(allGuests.map((x) => String(x.id)).filter(Boolean))
                                            : new Set(prev);
                                        for (const g of pickerFilteredGuests) base.delete(String(g.id));
                                        return base;
                                      });
                                    } else {
                                      selectAll();
                                    }
                                  }}
                                  style={({ pressed }: any) => [styles.recipientsTableCheckboxHead, pressed ? { opacity: 0.92 } : null]}
                                >
                                  <Ionicons name={allVisibleSelected ? 'checkbox' : 'square-outline'} size={18} color={ui.primary} />
                                </Pressable>
                              </View>

                              {pickerFilteredGuests.map((g) => {
                                const checked = effectiveSelectedIds.has(String(g.id));
                                  const rawStatus = String((g as any).status || '').trim();
                                  const status =
                                    rawStatus === 'מגיע' || rawStatus === 'אישר'
                                      ? 'מגיע'
                                      : rawStatus === 'לא מגיע' || rawStatus === 'לא מגיעים'
                                        ? 'לא מגיע'
                                        : 'ממתין';
                                  const theme =
                                    status === 'מגיע'
                                      ? { bg: 'rgba(34,197,94,0.14)', text: 'rgba(22,163,74,1)', dot: 'rgba(34,197,94,1)' }
                                      : status === 'לא מגיע'
                                        ? { bg: 'rgba(239,68,68,0.12)', text: 'rgba(220,38,38,1)', dot: 'rgba(239,68,68,1)' }
                                        : { bg: 'rgba(234,179,8,0.18)', text: 'rgba(161,98,7,1)', dot: 'rgba(234,179,8,1)' };

                                  const name = String((g as any).name || '').trim() || '—';
                                  const initial = name && name !== '—' ? Array.from(name)[0] : '•';

                                  return (
                                    <Pressable
                                      key={String((g as any).id)}
                                      onPress={() => toggleGuest(String((g as any).id))}
                                      style={({ pressed }: any) => [
                                        styles.recipientsTableRow,
                                        checked ? styles.recipientsTableRowActive : null,
                                        pressed ? { opacity: 0.98 } : null,
                                      ]}
                                    >
                                      <View style={[styles.recipientsTableCell, styles.recipientsCellStatus]}>
                                        <View style={[styles.recipientsStatusPill, { backgroundColor: theme.bg }]}>
                                          <View style={[styles.recipientsStatusDot, { backgroundColor: theme.dot }]} />
                                          <Text style={[styles.recipientsStatusText, { color: theme.text }]}>{status}</Text>
                                        </View>
                                      </View>

                                      <View style={[styles.recipientsTableCell, styles.recipientsCellPhone]}>
                                        <Text style={styles.recipientsCellText} numberOfLines={1}>
                                          {(g as any).phone ? String((g as any).phone) : '—'}
                                        </Text>
                                      </View>

                                      <View style={[styles.recipientsTableCell, styles.recipientsCellName]}>
                                        <View style={styles.recipientsNameRow}>
                                          <View style={styles.recipientsAvatar}>
                                            <Text style={styles.recipientsAvatarText}>{initial}</Text>
                                          </View>
                                          <Text style={styles.recipientsNameText} numberOfLines={1}>
                                            {name}
                                          </Text>
                                        </View>
                                      </View>

                                      <View style={styles.recipientsTableCheckboxCell}>
                                        <Ionicons
                                          name={checked ? 'checkbox' : 'square-outline'}
                                          size={18}
                                          color={checked ? ui.primary : 'rgba(203,213,225,1)'}
                                        />
                                      </View>
                                    </Pressable>
                                  );
                                })}
                            </View>
                          </>

                          {isRequired && effectiveSelectedIds.size === 0 ? (
                            <Text style={styles.recipientsDangerText}>להודעה הראשונה חובה לבחור מוזמנים.</Text>
                          ) : null}
                        </View>
                      );
                    }

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
                            disabled={!canEdit}
                            style={({ pressed }: any) => [
                              styles.recipientsPrimaryBtn,
                              !canEdit ? { opacity: 0.55 } : null,
                              pressed ? { opacity: 0.92 } : null,
                            ]}
                          >
                            <Ionicons name="person-add-outline" size={16} color="#fff" />
                            <Text style={styles.recipientsPrimaryBtnText}>
                              {isAutoAll ? 'בחירה ידנית' : isRequired ? 'הוסף מוזמנים' : 'בחר מוזמנים'}
                            </Text>
                          </Pressable>
                        </View>

                        {isAutoAll ? (
                          <Text style={styles.recipientsHint}>
                            מצב <Text style={styles.recipientsHintEm}>כל האורחים</Text> — כל אורח שנוסף לאירוע נכלל אוטומטית בהודעה הראשונה.
                          </Text>
                        ) : null}

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

              {editorKind === 'template' && editorWizardStepId === 'catchup' && String(editorRow.notification_type || '').trim() === 'reminder_1' ? (
                <View style={styles.catchupStepWrap}>
                  <View style={styles.queueScheduleCard}>
                    {/* הפעלת תור אורחים חדשים — טוגל בצד אחד, אייקון+מלל בצד השני (אייקון לפני המלל) */}
                    <View style={styles.queueCatchupActivationRow}>
                      <Pressable
                        onPress={() => setCatchupEnabled((v) => !v)}
                        disabled={!canEdit}
                        style={({ pressed }: any) => [styles.toggleBtnCatchup, !canEdit ? { opacity: 0.55 } : null, pressed ? { opacity: 0.92 } : null]}
                        accessibilityRole="switch"
                        accessibilityState={{ checked: catchupEnabled }}
                        accessibilityLabel={catchupEnabled ? 'פעיל' : 'כבוי'}
                      >
                        <View style={[styles.toggleTrack, catchupEnabled ? styles.toggleTrackOnCatchup : styles.toggleTrackOff]}>
                          <View style={[styles.toggleThumb, catchupEnabled ? styles.toggleThumbOn : styles.toggleThumbOff]} />
                        </View>
                      </Pressable>
                      <View style={styles.queueCatchupActivationRightBlock}>
                        <Ionicons name="person-add-outline" size={24} color="rgba(79,70,229,1)" />
                        <View style={styles.queueCatchupActivationTextBlock}>
                          <Text style={styles.queueCatchupActivationTitleBlue}>הפעלת תור אורחים חדשים</Text>
                          <Text style={styles.queueCatchupActivationHint}>
                            שליחת הודעות אוטומטיות לאורחים שיצטרפו לאחר הקמפיין הראשוני
                          </Text>
                        </View>
                      </View>
                    </View>

                    {catchupEnabled ? (
                      <>
                        {/* תזמון שליחה יומי + ימי פעילות - שני בלוקים בשורה */}
                        <View style={styles.queueCatchupScheduleRow}>
                          {/* תזמון שליחה יומי (מימין) */}
                          <View style={styles.queueCatchupDailyBlock}>
                            <View style={styles.queueCatchupDaysLabelRow}>
                              <Ionicons name="time-outline" size={18} color="rgba(71,85,105,1)" />
                              <Text style={styles.queueCatchupDailyLabel}>תזמון שליחה יומי</Text>
                            </View>
                            <View style={styles.queueCatchupTimeInputWrap}>
                              <Ionicons name="time-outline" size={18} color="rgba(100,116,139,0.7)" />
                              <TextInput
                                value={catchupTimeHm}
                                onChangeText={setCatchupTimeHm}
                                placeholder="10:00"
                                placeholderTextColor="rgba(100,116,139,0.6)"
                                style={styles.queueCatchupTimeInput}
                              />
                            </View>
                          </View>

                          {/* ימי פעילות (משמאל) */}
                          <View style={styles.queueCatchupDaysBlock}>
                            <View style={styles.queueCatchupDaysLabelRow}>
                              <Ionicons name="calendar-outline" size={18} color="rgba(71,85,105,1)" />
                              <Text style={styles.queueCatchupDailyLabel}>ימי פעילות</Text>
                            </View>
                            <View style={styles.queueDaysRow}>
                              {[
                                { d: 0, t: 'א' },
                                { d: 1, t: 'ב' },
                                { d: 2, t: 'ג' },
                                { d: 3, t: 'ד' },
                                { d: 4, t: 'ה' },
                                { d: 5, t: 'ו' },
                                { d: 6, t: 'ש' },
                              ].map((x) => {
                                const on = catchupWeekdays.has(x.d);
                                return (
                                  <Pressable
                                    key={x.d}
                                    onPress={() =>
                                      setCatchupWeekdays((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(x.d)) next.delete(x.d);
                                        else next.add(x.d);
                                        return next;
                                      })
                                    }
                                    style={({ pressed }: any) => [
                                      styles.queueDayPill,
                                      on ? styles.queueDayPillOn : styles.queueDayPillOff,
                                      pressed ? { opacity: 0.92 } : null,
                                    ]}
                                  >
                                    <Text style={[styles.queueDayText, on ? styles.queueDayTextOn : styles.queueDayTextOff]}>{x.t}</Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          </View>
                        </View>

                        <View style={styles.queueModeRow}>
                          <Pressable
                            onPress={() => setCatchupScheduleMode('weekdays')}
                            style={({ pressed }: any) => [
                              styles.queueModePill,
                              catchupScheduleMode === 'weekdays' ? styles.queueModePillActive : null,
                              pressed ? { opacity: 0.92 } : null,
                            ]}
                          >
                            <Text style={[styles.queueModePillText, catchupScheduleMode === 'weekdays' ? styles.queueModePillTextActive : null]}>
                              ימים
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => setCatchupScheduleMode('dates')}
                            style={({ pressed }: any) => [
                              styles.queueModePill,
                              catchupScheduleMode === 'dates' ? styles.queueModePillActive : null,
                              pressed ? { opacity: 0.92 } : null,
                            ]}
                          >
                            <Text style={[styles.queueModePillText, catchupScheduleMode === 'dates' ? styles.queueModePillTextActive : null]}>
                              תאריכים
                            </Text>
                          </Pressable>
                        </View>

                        {catchupScheduleMode === 'dates' ? (
                          <View style={{ gap: 10 }}>
                            <View style={styles.queueDatesTopRow}>
                              <View style={styles.queueSchedulePill}>
                                <Text style={styles.queueSchedulePillText}>{`${catchupDates.size} תאריכים נבחרו`}</Text>
                              </View>
                              <Pressable
                                onPress={() => {
                                  const seed = scheduledSendDateTime ?? new Date(String((event as any)?.date ?? ''));
                                  const base = Number.isFinite(seed?.getTime?.() ? seed.getTime() : NaN) ? seed : new Date();
                                  setCatchupCalendarMonth(new Date(base.getFullYear(), base.getMonth(), 1));
                                  setCatchupDatesDialogOpen(true);
                                }}
                                style={({ pressed }: any) => [styles.queueToggleBtn, pressed ? { opacity: 0.92 } : null]}
                              >
                                <Text style={styles.queueToggleBtnText}>בחר תאריכים</Text>
                              </Pressable>
                              <Pressable
                                onPress={() => setCatchupDates(new Set())}
                                style={({ pressed }: any) => [styles.queueClearBtn, pressed ? { opacity: 0.92 } : null]}
                              >
                                <Text style={styles.queueClearBtnText}>נקה</Text>
                              </Pressable>
                            </View>
                            {catchupDates.size > 0 ? (
                              <View style={styles.queueDatesChips}>
                                {Array.from(catchupDates)
                                  .sort()
                                  .slice(0, 12)
                                  .map((d) => (
                                    <View key={d} style={styles.queueDateChip}>
                                      <Text style={styles.queueDateChipText}>{formatDmyFromYmd(d)}</Text>
                                      <Pressable
                                        onPress={() =>
                                          setCatchupDates((prev) => {
                                            const next = new Set(prev);
                                            next.delete(d);
                                            return next;
                                          })
                                        }
                                        style={({ pressed }: any) => [styles.queueChipX, pressed ? { opacity: 0.85 } : null]}
                                      >
                                        <Ionicons name="close" size={14} color="rgba(100,116,139,1)" />
                                      </Pressable>
                                    </View>
                                  ))}
                                {catchupDates.size > 12 ? <Text style={styles.editorSectionHint}>מוצגים 12 ראשונים…</Text> : null}
                              </View>
                            ) : null}
                          </View>
                        ) : null}
                      </>
                    ) : null}
                  </View>

                  {/* תור ממתינים */}
                  <View style={styles.queueCatchupTableSection}>
                    <View style={styles.queueCatchupTableTitleRow}>
                      <Text style={styles.queueCatchupTableTitle}>תור ממתינים</Text>
                      <View style={styles.queueCatchupActionsRow}>
                        <Pressable
                          onPress={() => void runCatchupBackfill()}
                          disabled={!canEdit}
                          style={({ pressed }: any) => [
                            styles.queueCatchupActionBtn,
                            !canEdit ? { opacity: 0.55 } : null,
                            pressed ? { opacity: 0.92 } : null,
                          ]}
                        >
                          <Ionicons name="add" size={16} color="#2563EB" />
                          <Text style={styles.queueCatchupActionBtnText}>הכנס לתור</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => void loadStepCatchupQueue()}
                          style={({ pressed }: any) => [styles.queueCatchupActionBtn, pressed ? { opacity: 0.92 } : null]}
                        >
                          <Ionicons name="refresh-outline" size={16} color="#2563EB" />
                          <Text style={styles.queueCatchupActionBtnText}>רענן</Text>
                        </Pressable>
                      </View>
                    </View>

                    <View style={styles.queueCatchupTableWrap}>
                      <View style={styles.queueCatchupTableHeader}>
                        <Text style={[styles.queueCatchupTableHeaderCell, styles.queueCatchupTableHeaderStatusCell]}>סטטוס</Text>
                        <Text style={styles.queueCatchupTableHeaderCell}>מועד מתוזמן</Text>
                        <Text style={styles.queueCatchupTableHeaderCell}>טלפון</Text>
                        <Text style={styles.queueCatchupTableHeaderCell}>שם</Text>
                      </View>
                      {stepCatchupLoading ? (
                        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                          <ActivityIndicator size="small" />
                        </View>
                      ) : stepCatchupRows.length === 0 ? (
                        <Text style={styles.queueCatchupTableEmpty}>אין אורחים בתור כרגע</Text>
                      ) : (
                        stepCatchupRows.map((r) => {
                          const statusLabel = r.status === 'sent' ? 'סיומה' : 'ממתין';
                          const theme =
                            r.status === 'sent'
                              ? { bg: 'rgba(241,245,249,1)', text: 'rgba(100,116,139,1)', dot: 'rgba(148,163,184,1)' }
                              : { bg: 'rgba(234,179,8,0.18)', text: 'rgba(161,98,7,1)', dot: 'rgba(234,179,8,1)' };
                          return (
                            <View key={r.guestId} style={styles.queueCatchupTableRow}>
                              <View style={[styles.queueCatchupTableStatusCell, styles.queueCatchupStatusPillTextOnly, { backgroundColor: theme.bg }]}>
                                <Text style={[styles.recipientsStatusText, { color: theme.text }]}>{statusLabel}</Text>
                              </View>
                              <Text style={styles.queueCatchupTableCell} numberOfLines={1}>
                                {formatDueAtQueue(r.dueAt)}
                              </Text>
                              <Text style={styles.queueCatchupTableCell} numberOfLines={1}>
                                {r.phone ? String(r.phone) : '—'}
                              </Text>
                              <Text style={styles.queueCatchupTableCell} numberOfLines={1}>
                                {r.name || '—'}
                              </Text>
                            </View>
                          );
                        })
                      )}
                    </View>
                    <Text style={styles.queueCatchupTableFooter}>
                      סה״כ {stepCatchupRows.length} אורחים בתור
                    </Text>
                  </View>
                </View>
              ) : null}

              {editorKind === 'flow' && !editorIsWhatsapp && String(editorRow.notification_type || '').startsWith('flow_step:') ? (
                <View style={styles.editorSection}>
                  <View style={styles.editorSectionHeader}>
                    <Ionicons name="people-outline" size={16} color="rgba(79,70,229,1)" />
                    <Text style={styles.editorSectionTitle}>מוזמנים</Text>
                  </View>

                  {(() => {
                    const mode = String(flowDraft?.recipientMode || (editorRow as any)?.recipient_mode || 'manual');
                    const ids = Array.isArray((editorRow as any).recipient_guest_ids)
                      ? ((editorRow as any).recipient_guest_ids as any[]).map((x) => String(x))
                      : [];

                    if (mode === 'pending') {
                      return (
                        <View style={styles.recipientsCard}>
                          <Text style={styles.recipientsHint}>
                            מצב <Text style={styles.recipientsHintEm}>כל הממתינים</Text> — הרשימה מחושבת אוטומטית בזמן שליחה.
                          </Text>
                          <Pressable
                            onPress={() => void openRecipientsPreview(editorRow)}
                            style={({ pressed }: any) => [styles.recipientsEyeBtn, pressed ? { opacity: 0.92 } : null]}
                          >
                            <Ionicons name="eye-outline" size={16} color={ui.primary} />
                            <Text style={styles.recipientsEyeText}>צפייה</Text>
                          </Pressable>
                        </View>
                      );
                    }

                    if (mode === 'prev_pending') {
                      return (
                        <View style={styles.recipientsCard}>
                          <Text style={styles.recipientsHint}>
                            מצב <Text style={styles.recipientsHintEm}>ממתינים מהשלב הקודם</Text> — מחושב לפי שליחה אחרונה של שלב קודם + סטטוס ממתין.
                          </Text>
                          <Pressable
                            onPress={() => void openRecipientsPreview(editorRow)}
                            style={({ pressed }: any) => [styles.recipientsEyeBtn, pressed ? { opacity: 0.92 } : null]}
                          >
                            <Ionicons name="eye-outline" size={16} color={ui.primary} />
                            <Text style={styles.recipientsEyeText}>צפייה</Text>
                          </Pressable>
                        </View>
                      );
                    }

                    return (
                      <View style={styles.recipientsCard}>
                        <View style={styles.recipientsTopRow}>
                          <View style={styles.recipientsMetaLeft}>
                            <View style={styles.recipientsCountPill}>
                              <Text style={styles.recipientsCountText}>{`${ids.length} נבחרו`}</Text>
                            </View>

                            <Pressable
                              onPress={() => void openRecipientsPreview(editorRow)}
                              style={({ pressed }: any) => [styles.recipientsEyeBtn, pressed ? { opacity: 0.92 } : null]}
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
                            <Text style={styles.recipientsPrimaryBtnText}>בחר מוזמנים</Text>
                          </Pressable>
                        </View>
                      </View>
                    );
                  })()}
                </View>
              ) : null}

              {editorKind !== 'template' ? (
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
              ) : null}
            </ScrollView>

            <View style={styles.editorFooter}>
              {editorKind === 'template' ? (
                <>
                  <Pressable
                    onPress={() => {
                      if (editorWizardStepIdx > 0) setEditorWizardStepIdx((i) => Math.max(0, i - 1));
                      else closeEditor();
                    }}
                    style={({ pressed }: any) => [
                      styles.dialogBtn,
                      styles.dialogBtnGhost,
                      pressed ? { opacity: 0.92 } : null,
                    ]}
                  >
                    <Text style={styles.dialogBtnGhostText}>{editorWizardStepIdx > 0 ? 'הקודם' : 'סגור'}</Text>
                  </Pressable>

                  {editorWizardIsLast ? (
                    <>
                      <Pressable
                        onPress={() =>
                          void saveDraft({
                            closeOnSuccess: true,
                            toastOnSuccess: true,
                            ...(String(editorRow?.notification_type || '').trim() === 'reminder_1' ||
                            String(editorRow?.notification_type || '').trim() === 'reminder_2'
                              ? { recipientGuestIds: Array.from(pickerSelectedIds) }
                              : null),
                          })
                        }
                        disabled={saving || !editDraft || !canEdit}
                        style={({ pressed }: any) => [
                          styles.saveBtn,
                          saving || !editDraft || !canEdit ? styles.saveBtnDisabled : null,
                          pressed ? { opacity: 0.92 } : null,
                        ]}
                      >
                        <Text style={styles.saveBtnText}>{!canEdit ? 'לצפייה בלבד' : saving ? 'שומר...' : 'שמור שינויים'}</Text>
                      </Pressable>
                      {editorWizardStepId !== 'message' ? (
                        <Pressable
                          onPress={() => void sendNow()}
                          disabled={sendingNow || !editDraft || !canEdit}
                          style={({ pressed }: any) => [
                            styles.sendNowBtn,
                            sendingNow || !editDraft || !canEdit ? styles.sendNowBtnDisabled : null,
                            pressed ? { opacity: 0.92 } : null,
                          ]}
                        >
                          <Ionicons name="paper-plane-outline" size={16} color="#fff" />
                          <Text style={styles.sendNowBtnText}>{sendingNow ? 'שולח...' : 'שלח עכשיו'}</Text>
                        </Pressable>
                      ) : null}
                    </>
                  ) : (
                    <Pressable
                      onPress={() => setEditorWizardStepIdx((i) => Math.min(editorWizardSteps.length - 1, i + 1))}
                      disabled={!editDraft || editorWizardSteps.length <= 1}
                      style={({ pressed }: any) => [
                        styles.dialogBtn,
                        styles.dialogBtnPrimary,
                        (!editDraft || editorWizardSteps.length <= 1) ? { opacity: 0.6 } : null,
                        pressed ? { opacity: 0.92 } : null,
                      ]}
                    >
                      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                        <Ionicons name="arrow-back" size={16} color="#fff" />
                        <Text style={styles.dialogBtnPrimaryText}>הבא</Text>
                      </View>
                    </Pressable>
                  )}
                </>
              ) : (
                <>
                  <Pressable
                    onPress={() => void saveDraft({ closeOnSuccess: true, toastOnSuccess: true })}
                    disabled={saving || !editDraft || !canEdit}
                    style={({ pressed }: any) => [
                      styles.saveBtn,
                      saving || !editDraft || !canEdit ? styles.saveBtnDisabled : null,
                      pressed ? { opacity: 0.92 } : null,
                    ]}
                  >
                    <Text style={styles.saveBtnText}>{!canEdit ? 'לצפייה בלבד' : saving ? 'שומר...' : 'שמור שינויים'}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void sendNow()}
                    disabled={sendingNow || !editDraft || !canEdit}
                    style={({ pressed }: any) => [
                      styles.sendNowBtn,
                      sendingNow || !editDraft || !canEdit ? styles.sendNowBtnDisabled : null,
                      pressed ? { opacity: 0.92 } : null,
                    ]}
                  >
                    <Ionicons name="paper-plane-outline" size={16} color="#fff" />
                    <Text style={styles.sendNowBtnText}>{sendingNow ? 'שולח...' : 'שלח עכשיו'}</Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>

          {dependsPickerOpen ? (
            <View style={styles.dialogOverlay}>
              <Pressable style={styles.pickerBackdrop} onPress={() => setDependsPickerOpen(false)} />
              <View style={styles.dialogCard}>
                <View style={styles.dialogHeader}>
                  <Text style={styles.dialogTitle}>בחירת שלב קודם</Text>
                  <Pressable onPress={() => setDependsPickerOpen(false)} style={styles.dialogClose}>
                    <Ionicons name="close" size={18} color="#111827" />
                  </Pressable>
                </View>

                <View style={{ padding: 14, gap: 10 }}>
                  <Text style={styles.recipientsPreviewHint}>
                    בחר מאיזו כרטיסיה לשאוב את המוזמנים שנשלחו אליהם בהצלחה, ואז יסוננו רק מי שעדיין במצב{' '}
                    <Text style={styles.recipientsHintEm}>ממתין</Text>.
                  </Text>

                  <ScrollView style={{ maxHeight: 440 }} contentContainerStyle={{ gap: 8, paddingBottom: 6 }}>
                    {(() => {
                      const candidates = [...displayRows, ...flowStepsSorted].filter(
                        (s) =>
                          String((s as any)?.id || '').trim() &&
                          String((s as any)?.id) !== String(editorRow.id || '') &&
                          String((s as any)?.channel || 'SMS') === 'SMS'
                      );

                      if (candidates.length === 0) {
                        return <Text style={styles.recipientsPreviewEmpty}>אין כרטיסיות זמינות לבחירה.</Text>;
                      }

                      return candidates.map((s) => {
                        const sid = String((s as any).id);
                        const isSelected = flowDraft?.dependsOnSettingId === sid;
                        const dt = (s as any)?.notification_date ? new Date(String((s as any).notification_date)) : null;
                        const when = dt && Number.isFinite(dt.getTime()) ? formatHeDateTimeShort(dt) : '—';
                        const run = lastSmsRunBySettingId[sid];
                        const runLabel = run ? statusLabel(String(run.status)) : null;

                        return (
                          <Pressable
                            key={sid}
                            onPress={() => {
                              setFlowDraft((d) => (d ? { ...d, dependsOnSettingId: sid } : d));
                              setDependsPickerOpen(false);
                            }}
                            style={({ pressed }: any) => [
                              styles.dependsOptionCard,
                              isSelected ? styles.dependsOptionCardSelected : null,
                              pressed ? { opacity: 0.92 } : null,
                            ]}
                          >
                            <View style={styles.dependsOptionTopRow}>
                              <Text style={styles.dependsOptionTitle} numberOfLines={1}>
                                {String((s as any)?.title || 'כרטיסיה')}
                              </Text>
                              {isSelected ? (
                                <View style={styles.dependsOptionBadge}>
                                  <Ionicons name="checkmark" size={14} color="#16A34A" />
                                  <Text style={styles.dependsOptionBadgeText}>נבחר</Text>
                                </View>
                              ) : null}
                            </View>
                            <View style={styles.dependsOptionMetaRow}>
                              <Ionicons name="time-outline" size={14} color="rgba(100,116,139,1)" />
                              <Text style={styles.dependsOptionMetaText}>{when}</Text>
                              <Ionicons name="checkmark-done-outline" size={14} color={runLabel?.color || 'rgba(100,116,139,1)'} />
                              <Text style={[styles.dependsOptionMetaText, { color: runLabel?.color || 'rgba(100,116,139,1)' }]}>
                                {runLabel ? runLabel.text : 'לא נשלח'}
                              </Text>
                            </View>
                          </Pressable>
                        );
                      });
                    })()}
                  </ScrollView>
                </View>
              </View>
            </View>
          ) : null}

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

          {catchupDatesDialogOpen ? (
            <View style={styles.dialogOverlay}>
              <Pressable style={styles.pickerBackdrop} onPress={() => setCatchupDatesDialogOpen(false)} />
              <View style={styles.dialogCard}>
                <View style={styles.dialogHeader}>
                  <Text style={styles.dialogTitle}>בחירת תאריכים לתור</Text>
                  <Pressable onPress={() => setCatchupDatesDialogOpen(false)} style={styles.dialogClose}>
                    <Ionicons name="close" size={18} color="#111827" />
                  </Pressable>
                </View>

                <View style={styles.calendarHeaderRow}>
                  <Pressable onPress={() => setCatchupCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))} style={styles.navBtn}>
                    <Ionicons name="chevron-forward" size={18} color="#111827" />
                  </Pressable>
                  <Text style={styles.calendarMonthText}>
                    {new Date(catchupCalendarGrid.y, catchupCalendarGrid.m, 1).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })}
                  </Text>
                  <Pressable onPress={() => setCatchupCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))} style={styles.navBtn}>
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
                  {catchupCalendarGrid.cells.map((c, idx) => {
                    const ymd = c.date ? toLocalYmd(c.date) : null;
                    const selected = ymd ? catchupDates.has(ymd) : false;
                    const ev = new Date(String((event as any)?.date ?? ''));
                    const evDate = Number.isFinite(ev.getTime()) ? new Date(ev.getFullYear(), ev.getMonth(), ev.getDate(), 0, 0, 0, 0) : null;
                    const disabled =
                      !c.date ||
                      (evDate ? c.date.getTime() > evDate.getTime() : false) ||
                      c.date.getTime() < new Date().getTime() - 3650 * 24 * 60 * 60 * 1000;

                    return (
                      <Pressable
                        key={idx}
                        disabled={disabled}
                        onPress={() => {
                          if (!ymd) return;
                          setCatchupDates((prev) => {
                            const next = new Set(prev);
                            if (next.has(ymd)) next.delete(ymd);
                            else next.add(ymd);
                            return next;
                          });
                        }}
                        style={({ pressed }: any) => [
                          styles.dayCell,
                          selected ? styles.dayCellSelected : null,
                          pressed && !disabled ? { opacity: 0.9 } : null,
                          disabled ? { opacity: 0.35 } : null,
                        ]}
                      >
                        <Text style={[styles.dayText, selected ? styles.dayTextSelected : null]}>{c.day ?? ''}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={{ padding: 14, paddingTop: 0, flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
                  <Pressable onPress={() => setCatchupDatesDialogOpen(false)} style={[styles.dialogBtn, styles.dialogBtnPrimary]}>
                    <Text style={styles.dialogBtnPrimaryText}>סיום</Text>
                  </Pressable>
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

      {viewerOpen && viewerRow ? (
        <View style={styles.dialogOverlay}>
          <Pressable style={styles.pickerBackdrop} onPress={closeViewer} />
          <View
            style={[
              styles.dialogCard,
              styles.viewerDialogCard,
              isViewerDesktopReducedLayout ? ({ height: 'auto', maxHeight: '82%' } as any) : null,
            ]}
          >
            <View style={styles.dialogHeader}>
              <Text style={styles.dialogTitle}>{`צפייה: ${getDisplayTitle(viewerRow)}`}</Text>
              <Pressable onPress={closeViewer} style={styles.dialogClose}>
                <Ionicons name="close" size={18} color="#111827" />
              </Pressable>
            </View>

            <View style={styles.viewerDialogBody}>
              <View style={styles.viewerHeroCard}>
                <View style={styles.viewerHeroTextBlock}>
                  <Text style={styles.viewerHeroTitle}>סקירת הודעה לפני שליחה</Text>
                  <Text style={styles.viewerHeroSubtitle}>תצוגה נוחה לדסקטופ עם תוכן ההודעה, מצב השליחה ורשימת הנמענים.</Text>
                </View>

                <View style={styles.viewerMetaRow}>
                  <View style={styles.viewerMetaPill}>
                    <Ionicons name={String((viewerRow as any)?.channel || 'SMS') === 'WHATSAPP' ? 'logo-whatsapp' : 'chatbox-outline'} size={14} color="#0F172A" />
                    <Text style={styles.viewerMetaText}>{String((viewerRow as any)?.channel || 'SMS')}</Text>
                  </View>
                  {viewerRow.notification_date ? (
                    <View style={styles.viewerMetaPill}>
                      <Ionicons name="time-outline" size={14} color="#0F172A" />
                      <Text style={styles.viewerMetaText}>{formatHeDateTimeShort((viewerRow as any).notification_date)}</Text>
                    </View>
                  ) : null}
                  <View style={[styles.viewerMetaPill, { backgroundColor: viewerRow.enabled ? 'rgba(34,197,94,0.12)' : 'rgba(100,116,139,0.10)' }]}>
                    <Ionicons name={viewerRow.enabled ? 'checkmark-circle-outline' : 'remove-circle-outline'} size={14} color={viewerRow.enabled ? '#16A34A' : '#64748B'} />
                    <Text style={[styles.viewerMetaText, { color: viewerRow.enabled ? '#166534' : '#64748B' }]}>{viewerRow.enabled ? 'פעילה' : 'כבויה'}</Text>
                  </View>
                </View>
              </View>

              <View style={[styles.viewerMainGrid, isViewerCompactLayout ? styles.viewerMainGridCompact : null]}>
                <View
                  style={[
                    styles.viewerPreviewPanel,
                    isViewerCompactLayout ? styles.viewerPreviewPanelCompact : null,
                    isViewerDesktopReducedLayout ? styles.viewerPreviewPanelLaptop : null,
                    { backgroundColor: ui.surface, borderColor: ui.border },
                  ]}
                >
                  <View style={styles.viewerPanelHeader}>
                    <View>
                      <Text style={[styles.step4PreviewTitle, { color: ui.text }]}>תצוגה מקדימה</Text>
                      <Text style={[styles.step4PreviewSubtitle, { color: ui.sub }]}>כך ההודעה תיראה אצל המוזמן במכשיר הנייד</Text>
                    </View>
                    <View style={styles.viewerPreviewBadge}>
                      <Ionicons name="phone-portrait-outline" size={14} color="#4F46E5" />
                      <Text style={styles.viewerPreviewBadgeText}>תצוגת נייד</Text>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.step4PhoneMockupWrap,
                      isViewerCompactLayout
                        ? styles.viewerPhoneMockupWrapCompact
                        : isViewerDesktopReducedLayout
                          ? styles.viewerPhoneMockupWrapLaptop
                          : styles.viewerPhoneMockupWrapDesktop,
                    ]}
                  >
                    <IPhoneMockup
                      model="14-pro"
                      color="space-black"
                      fitWidth={isViewerCompactLayout ? 260 : isViewerDesktopReducedLayout ? 240 : 270}
                      fitHeight={isViewerCompactLayout ? 547 : isViewerDesktopReducedLayout ? 505 : 568}
                      screenBg="#f8fafc"
                      showHomeIndicator={true}
                    >
                      <View style={styles.step4PhoneScreenContent}>
                        <Text style={styles.step4PhoneTime}>היום 14:30</Text>
                        <View style={[styles.step4BubbleIn, { backgroundColor: 'rgba(226,232,240,1)' }]}>
                          <Text style={[styles.step4BubbleText, { color: ui.text }]}>
                            {(() => {
                              const raw = normalizeTemplateToSingleBraces(String((viewerRow as any)?.message_content || '')).trim();
                              const txt = raw ? renderPreviewText(raw) : '';
                              return (txt || '—').replace(/\n/g, '\n');
                            })()}
                          </Text>
                          <Text style={styles.step4BubbleTime}>14:31</Text>
                        </View>
                        <View style={[styles.step4BubbleOut, { backgroundColor: 'rgba(59,130,246,1)' }]}>
                          <Text style={styles.step4BubbleTextOut}>תודה רבה! אגיע בזמן.</Text>
                          <Text style={styles.step4BubbleTimeOut}>14:35</Text>
                        </View>
                      </View>
                    </IPhoneMockup>
                  </View>
                </View>

                <View style={styles.viewerInfoColumn}>
                  <View style={[styles.viewerInfoCard, styles.viewerRecipientsCard]}>
                    <View style={styles.viewerPanelHeader}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.editorSectionTitle, { color: ui.text }]}>למי זה נשלח</Text>
                        {viewerRecipientsTitle ? <Text style={styles.recipientsPreviewHint}>{viewerRecipientsTitle}</Text> : null}
                        {viewerRecipientsHint ? <Text style={styles.recipientsPreviewHint}>{viewerRecipientsHint}</Text> : null}
                      </View>
                    </View>

                    <View style={styles.recipientsPreviewSearchRow}>
                      <Ionicons name="search-outline" size={16} color="#64748B" />
                      <TextInput
                        value={viewerRecipientsSearch}
                        onChangeText={setViewerRecipientsSearch}
                        placeholder="חיפוש לפי שם או טלפון..."
                        placeholderTextColor="rgba(100,116,139,0.6)"
                        style={styles.recipientsPreviewSearchInput}
                      />
                    </View>

                    {viewerRecipientsLoading ? (
                      <Text style={styles.recipientsPreviewEmpty}>טוען רשימת נמענים...</Text>
                    ) : viewerRecipientsRows.length === 0 ? (
                      <Text style={styles.recipientsPreviewEmpty}>לא נבחרו מוזמנים.</Text>
                    ) : (
                      <ScrollView style={styles.viewerRecipientsList} contentContainerStyle={styles.viewerRecipientsListContent}>
                        {viewerRecipientsRows
                          .filter((g) => {
                            const q = String(viewerRecipientsSearch || '').trim().toLowerCase();
                            if (!q) return true;
                            const name = String(g.name || '').toLowerCase();
                            const phone = String(g.phone || '').toLowerCase();
                            return name.includes(q) || phone.includes(q);
                          })
                          .map((g) => (
                            <View key={g.id} style={styles.recipientsPreviewRow}>
                              <Ionicons name="person-circle-outline" size={22} color="rgba(79,70,229,0.65)" />
                              <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={styles.recipientsPreviewName} numberOfLines={1}>
                                  {g.name || '—'}
                                </Text>
                                <Text style={styles.recipientsPreviewMeta} numberOfLines={1}>
                                  {(g.status ? `${g.status} · ` : '') + (g.phone ? g.phone : 'אין טלפון')}
                                </Text>
                              </View>
                            </View>
                          ))}
                      </ScrollView>
                    )}
                  </View>
                </View>
              </View>
            </View>
          </View>
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
                      <Ionicons name="person-circle-outline" size={22} color="rgba(79,70,229,0.65)" />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.recipientsPreviewName} numberOfLines={1}>
                          {g.name || '—'}
                        </Text>
                        <Text style={styles.recipientsPreviewMeta} numberOfLines={1}>
                          {(g.status ? `${g.status} · ` : '') + (g.phone ? g.phone : 'אין טלפון')}
                        </Text>
                      </View>
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

      {catchupOpen ? (
        <View style={styles.dialogOverlay}>
          <Pressable style={styles.pickerBackdrop} onPress={() => setCatchupOpen(false)} />
          <View style={styles.dialogCard}>
            <View style={styles.dialogHeader}>
              <Text style={styles.dialogTitle}>{catchupTitle}</Text>
              <Pressable onPress={() => setCatchupOpen(false)} style={styles.dialogClose}>
                <Ionicons name="close" size={18} color="#111827" />
              </Pressable>
            </View>

            <View style={{ padding: 14, gap: 10 }}>
              <View style={styles.recipientsPreviewSearchRow}>
                <Ionicons name="search-outline" size={16} color="#64748B" />
                <TextInput
                  value={catchupSearch}
                  onChangeText={setCatchupSearch}
                  placeholder="חיפוש לפי שם או טלפון..."
                  placeholderTextColor="rgba(100,116,139,0.6)"
                  style={styles.recipientsPreviewSearchInput}
                />
              </View>

              {catchupLoading ? (
                <View style={{ paddingVertical: 18, alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator />
                </View>
              ) : catchupRows.length === 0 ? (
                <Text style={styles.recipientsPreviewEmpty}>אין אורחים בתור כרגע.</Text>
              ) : (
                <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 8, paddingBottom: 6 }}>
                  {catchupRows
                    .filter((g) => {
                      const q = String(catchupSearch || '').trim().toLowerCase();
                      if (!q) return true;
                      const name = String(g.name || '').toLowerCase();
                      const phone = String(g.phone || '').toLowerCase();
                      return name.includes(q) || phone.includes(q);
                    })
                    .map((g) => (
                      <View key={g.guestId} style={styles.sendStatusRow}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.recipientsPreviewName} numberOfLines={1}>
                            {g.name || '—'}
                          </Text>
                          <Text style={styles.sendStatusMeta} numberOfLines={2}>
                            {(g.phone ? g.phone : 'אין טלפון') + (g.dueAt ? ` · מתוזמן ל־${formatHeDateTimeShort(g.dueAt)}` : '')}
                            {g.lastError ? ` · ${g.lastError}` : ''}
                          </Text>
                        </View>
                        <View style={styles.sendStatusBadge}>
                          <Text style={[styles.sendStatusBadgeText, { color: 'rgba(2,6,23,0.75)' }]}>בתור</Text>
                        </View>
                      </View>
                    ))}
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

      {tokenModalOpen ? (
        <View style={styles.tokenOverlay}>
          <Pressable style={styles.tokenBackdrop} onPress={() => (tokenSaving ? null : setTokenModalOpen(false))} />
          <View style={styles.tokenCard}>
            <View style={styles.tokenHeader}>
              <Text style={styles.tokenTitle}>טוקן וואטסאפ זמני</Text>
              <Pressable onPress={() => (tokenSaving ? null : setTokenModalOpen(false))} style={styles.tokenClose}>
                <Ionicons name="close" size={20} color="#0F172A" />
              </Pressable>
            </View>

            <Text style={styles.tokenHint}>
              עד לאישור העסק ב‑Meta אפשר להעלות כאן טוקן גישה זמני. הטוקן נשמר מוצפן (AES‑256) ולא נחשף ללקוח.
            </Text>

            <View style={styles.tokenStatusRow}>
              <Ionicons
                name={waTokenStatus.hasToken ? 'checkmark-circle' : 'alert-circle-outline'}
                size={16}
                color={waTokenStatus.hasToken ? '#0E7C46' : '#B45309'}
              />
              <Text style={styles.tokenStatusText}>
                {waTokenStatus.hasToken
                  ? `קיים טוקן פעיל ${waTokenStatus.hint ?? ''}${waTokenStatus.updatedAt ? ` · עודכן ${formatHeDateTimeShort(waTokenStatus.updatedAt)}` : ''}`
                  : 'אין כרגע טוקן שמור — תיעשה שימוש בטוקן ברירת המחדל של השרת (אם הוגדר).'}
              </Text>
            </View>

            <TextInput
              value={tokenInput}
              onChangeText={setTokenInput}
              style={styles.tokenInput}
              placeholder="הדבק כאן את הטוקן (EAAB...)"
              placeholderTextColor="rgba(100,116,139,0.7)"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              multiline
            />

            <View style={styles.tokenFooter}>
              {waTokenStatus.hasToken ? (
                <Pressable
                  onPress={() => void saveWaToken('clear')}
                  disabled={tokenSaving}
                  style={({ pressed }: any) => [styles.tokenClearBtn, tokenSaving ? { opacity: 0.6 } : null, pressed ? { opacity: 0.9 } : null]}
                >
                  <Text style={styles.tokenClearBtnText}>הסר טוקן</Text>
                </Pressable>
              ) : (
                <View style={{ flex: 1 }} />
              )}
              <Pressable
                onPress={() => void saveWaToken('save')}
                disabled={tokenSaving}
                style={({ pressed }: any) => [styles.tokenSaveBtn, tokenSaving ? { opacity: 0.6 } : null, pressed ? { opacity: 0.9 } : null]}
              >
                {tokenSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.tokenSaveBtnText}>שמור טוקן</Text>}
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
  return getEventDisplayTitle(title);
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
    backgroundColor: 'transparent',
  },
  pageAdmin: {
    backgroundColor: '#E8F1FF',
  },

  bg: {
    ...StyleSheet.absoluteFillObject,
  },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  centerText: { fontSize: 14, fontWeight: '900', color: 'rgba(100,116,139,1)', textAlign: 'center' },
  backInline: { marginTop: 12, flexDirection: 'row-reverse', gap: 8, alignItems: 'center', ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null) },
  backInlineText: { fontSize: 13, fontWeight: '900' },

  body: { flex: 1, minHeight: 0 },
  bodyAdmin: {
    width: '100%',
    alignSelf: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  heroShell: { gap: 18 },
  backHeaderBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#F8FAFD',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.08)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  backHeaderBtnHover: {
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 8px 18px rgba(11,28,65,0.06)' } as any) : null),
  },
  backHeaderBtnPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  backHeaderBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },
  headerSubtitleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  headerSubtitleMetaGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    flexWrap: 'nowrap',
    flex: 1,
  },
  headerSubtitleMetaChip: {
    minHeight: 32,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#F8FAFD',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 4px 12px rgba(11,28,65,0.04)',
        } as any)
      : null),
  },
  headerSubtitleMetaText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
  },
  headerSubtitleActionBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 38,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: 'rgba(25,93,230,0.18)',
    flexShrink: 0,
    ...(Platform.OS === 'web'
      ? ({
          cursor: 'pointer',
          boxShadow: '0 10px 22px rgba(25,93,230,0.18)',
        } as any)
      : null),
  },
  headerSubtitleActions: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
    flexWrap: 'wrap',
  },
  headerSubtitleSecondaryBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 38,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(25,93,230,0.22)',
    flexShrink: 0,
    ...(Platform.OS === 'web'
      ? ({
          cursor: 'pointer',
          boxShadow: '0 8px 18px rgba(15,23,42,0.06)',
        } as any)
      : null),
  },
  headerSubtitleSecondaryBtnHover: {
    backgroundColor: '#F8FAFF',
    borderColor: 'rgba(25,93,230,0.34)',
  },
  headerSubtitleSecondaryBtnDisabled: {
    opacity: 0.7,
    ...(Platform.OS === 'web' ? ({ cursor: 'not-allowed' } as any) : null),
  },
  headerSubtitleSecondaryBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'right',
  },
  headerSubtitleActionBtnHover: {
    backgroundColor: '#134FC5',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 12px 24px rgba(25,93,230,0.22)' } as any) : null),
  },
  headerSubtitleActionBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.white,
    textAlign: 'right',
  },
  headerOwnerBadge: {
    maxWidth: '100%',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F8FAFD',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
  },
  headerOwnerName: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },

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
  waStepCard: {
    padding: 14,
    borderRightWidth: 3,
    borderRightColor: '#4F46E5',
    backgroundColor: '#fff',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 6px 18px rgba(79,70,229,0.06)' } as any) : null),
  },
  stepNumBadge: {
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumBadgeText: { fontSize: 13, fontWeight: '900', color: '#fff' },
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
  datePillBlock: {
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

  chips: { flexDirection: 'row', flexWrap: 'nowrap', gap: 8 },
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
    height: 200,
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

  step4TwoCol: { flexDirection: 'row-reverse', width: '100%', gap: 24 },
  step4PreviewCol: { flex: 1, minWidth: 0, maxWidth: 460, minHeight: 700, borderRadius: 20, borderWidth: 0, padding: 18, gap: 12, alignItems: 'center', backgroundColor: '#f2f2f2' },
  step4PreviewTitle: { fontSize: 15, fontWeight: '900', textAlign: 'right', alignSelf: 'stretch' },
  step4PreviewSubtitle: { fontSize: 12, fontWeight: '700', textAlign: 'right', alignSelf: 'stretch', marginBottom: 8 },
  step4PhoneMockupWrap: { width: 300, height: 631, minHeight: 631, overflow: 'hidden' as const, alignSelf: 'center', flexShrink: 0 },
  step4PhoneMockup: { width: '100%', maxWidth: 340, borderRadius: 28, borderWidth: 10, borderColor: '#1f2937', backgroundColor: '#111827', padding: 12, alignItems: 'center' },
  step4PhoneScreenContent: { flex: 1, minHeight: 0, backgroundColor: '#f8fafc', padding: 16, gap: 12 },
  step4PhoneScreen: { width: '100%', minHeight: 380, backgroundColor: '#f8fafc', borderRadius: 18, padding: 16, gap: 12 },
  step4PhoneTime: { fontSize: 15, fontWeight: '800', color: 'rgba(71,85,105,1)', textAlign: 'center' },
  step4BubbleIn: { alignSelf: 'flex-start', maxWidth: '90%', padding: 14, borderRadius: 16, borderTopRightRadius: 4, gap: 4 },
  step4BubbleOut: { alignSelf: 'flex-end', maxWidth: '90%', padding: 14, borderRadius: 16, borderTopLeftRadius: 4, gap: 4 },
  step4BubbleText: { fontSize: 16, fontWeight: '700', textAlign: 'right', lineHeight: 24 },
  step4BubbleTextOut: { fontSize: 16, fontWeight: '700', color: '#fff', textAlign: 'right', lineHeight: 24 },
  step4BubbleTime: { fontSize: 12, fontWeight: '800', color: 'rgba(100,116,139,1)', textAlign: 'left' },
  step4BubbleTimeOut: { fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.85)', textAlign: 'left' },
  step4ContentCol: { flex: 1.2, minWidth: 0, gap: 10 },
  step4Instruction: { fontSize: 13, fontWeight: '700', textAlign: 'right', lineHeight: 20 },
  step4VarsLabel: { fontSize: 13, fontWeight: '900', textAlign: 'right' },
  step4VarsHint: { fontSize: 12, fontWeight: '700', textAlign: 'right', lineHeight: 18, marginTop: -2 },
  step4VarsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  step4VarTag: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  step4VarTagText: { fontSize: 12, fontWeight: '800', textAlign: 'right' },
  step4CharRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10 },
  step4CharPill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.86)', borderWidth: 1 },
  step4CharDot: { width: 8, height: 8, borderRadius: 4 },
  step4SmsHint: { fontSize: 12, fontWeight: '700', textAlign: 'right' },

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
  recipientsStepWrap: { width: '100%', gap: 14 },
  recipientsSummaryCard: {
    width: '100%',
    height: 86,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,1)',
    backgroundColor: '#fff',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 12,
  },
  recipientsSummaryIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(37,99,235,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipientsSummaryLabel: { fontSize: 12, fontWeight: '800', color: 'rgba(100,116,139,1)', textAlign: 'right' },
  recipientsSummaryValue: { marginTop: 2, fontSize: 26, fontWeight: '900', color: '#111827', textAlign: 'right', writingDirection: 'ltr' },

  recipientsAutoAllCard: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,1)',
    backgroundColor: 'rgba(248,250,252,1)',
    padding: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  recipientsAutoAllTitle: { fontSize: 13, fontWeight: '900', color: '#111827', textAlign: 'right' },
  recipientsAutoAllHint: { marginTop: 4, fontSize: 12, fontWeight: '700', color: 'rgba(100,116,139,1)', textAlign: 'right', lineHeight: 18 },
  recipientsManualBtn: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  recipientsManualBtnText: { fontSize: 12, fontWeight: '900', color: '#fff', textAlign: 'right' },

  recipientsChipsRow: { flexDirection: 'row', flexWrap: 'nowrap', gap: 10, alignItems: 'flex-start', justifyContent: 'flex-start' },
  recipientsChip: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,1)',
    backgroundColor: '#fff',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  recipientsChipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  recipientsChipText: { fontSize: 12, fontWeight: '900', color: '#111827', textAlign: 'right' },
  recipientsChipTextActive: { color: '#fff' },

  recipientsQuickActionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 14, flexWrap: 'wrap' },
  recipientsLinkBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null) },
  recipientsLinkText: { fontSize: 12, fontWeight: '900', color: '#2563EB', textAlign: 'right' },

  recipientsTableWrap: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,1)',
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  recipientsTableHeaderRow: {
    height: 44,
    backgroundColor: 'rgba(248,250,252,1)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(226,232,240,1)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  recipientsTableHeaderText: { fontSize: 12, fontWeight: '800', color: 'rgba(100,116,139,1)', textAlign: 'right' },
  recipientsTableCell: { paddingHorizontal: 10, justifyContent: 'center' },
  recipientsCellStatus: { width: 120, flexDirection: 'row' },
  recipientsCellPhone: { width: 170 },
  recipientsCellName: { flex: 1, minWidth: 0 },
  recipientsTableCheckboxHead: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null) },
  recipientsTableRow: {
    minHeight: 54,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(241,245,249,1)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  recipientsTableRowActive: { backgroundColor: 'rgba(37,99,235,0.05)' },
  recipientsTableCheckboxCell: { width: 38, height: 44, alignItems: 'center', justifyContent: 'center' },
  recipientsCellText: { fontSize: 13, fontWeight: '800', color: 'rgba(100,116,139,1)', textAlign: 'right' },
  recipientsNameRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, minWidth: 0 },
  recipientsAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(226,232,240,1)', alignItems: 'center', justifyContent: 'center' },
  recipientsAvatarText: { fontSize: 12, fontWeight: '900', color: '#111827', textAlign: 'center' },
  recipientsNameText: { fontSize: 13, fontWeight: '900', color: '#111827', textAlign: 'right' },
  recipientsStatusPill: { height: 22, paddingHorizontal: 10, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 8, flexWrap: 'nowrap' },
  recipientsStatusDot: { width: 6, height: 6, borderRadius: 3 },
  recipientsStatusText: { fontSize: 12, fontWeight: '900', textAlign: 'right' },

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
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
  },
  recipientsPreviewName: { fontSize: 13, fontWeight: '900', color: '#111827', textAlign: 'right' },
  recipientsPreviewMeta: { marginTop: 3, fontSize: 12, fontWeight: '800', color: '#64748B', textAlign: 'right' },

  viewerDialogCard: {
    maxWidth: 1120,
    height: '72%',
    borderRadius: 24,
  },
  viewerDialogBody: {
    flex: 1,
    minHeight: 0,
    padding: 18,
    gap: 14,
    backgroundColor: '#F8FAFC',
  },
  viewerHeroCard: {
    borderRadius: 20,
    padding: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(2,6,23,0.08)',
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
  },
  viewerHeroTextBlock: {
    flex: 1,
    minWidth: 240,
    gap: 6,
  },
  viewerHeroTitle: { fontSize: 20, fontWeight: '900', color: '#0F172A', textAlign: 'right' },
  viewerHeroSubtitle: { fontSize: 13, fontWeight: '700', color: '#64748B', textAlign: 'right', lineHeight: 20 },
  viewerMainGrid: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 18,
  },
  viewerMainGridCompact: {
    flexDirection: 'column',
  },
  viewerPanelHeader: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  viewerPreviewBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(79,70,229,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(79,70,229,0.14)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  viewerPreviewBadgeText: { fontSize: 12, fontWeight: '900', color: '#4338CA', textAlign: 'right' },
  viewerPreviewPanel: {
    width: '34%',
    minWidth: 310,
    maxWidth: 410,
    minHeight: 0,
    borderRadius: 22,
    borderWidth: 1,
    padding: 14,
    gap: 12,
    alignItems: 'center',
  },
  viewerPreviewPanelCompact: {
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
  },
  viewerPreviewPanelLaptop: {
    minWidth: 286,
    maxWidth: 360,
    paddingVertical: 12,
  },
  viewerPhoneMockupWrapDesktop: {
    width: 270,
    height: 568,
    minHeight: 568,
  },
  viewerPhoneMockupWrapLaptop: {
    width: 240,
    height: 505,
    minHeight: 505,
  },
  viewerPhoneMockupWrapCompact: {
    width: 260,
    height: 547,
    minHeight: 547,
  },
  viewerMetaRow: { width: '100%', flexDirection: 'row-reverse', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-start', gap: 8 },
  viewerMetaPill: {
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(2,6,23,0.06)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  viewerMetaText: { fontSize: 12, fontWeight: '900', color: '#0F172A', textAlign: 'right' },
  viewerTwoColCompact: {
    flexDirection: 'column',
    gap: 18,
  },
  viewerPreviewCol: {
    minWidth: 340,
    maxWidth: 520,
  },
  viewerPreviewColCompact: {
    width: '100%',
    maxWidth: '100%',
    minHeight: 0,
  },
  viewerInfoColumn: { flex: 1, minWidth: 320, minHeight: 0, gap: 16 },
  viewerInfoCard: {
    borderRadius: 20,
    padding: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(2,6,23,0.08)',
    gap: 12,
  },
  viewerRecipientsCard: {
    flex: 1,
    minHeight: 0,
    maxHeight: 460,
  },
  viewerSectionTitle: { marginTop: 2, fontSize: 13, fontWeight: '900', color: '#111827', textAlign: 'right' },
  viewerRecipientsList: {
    flex: 1,
    minHeight: 220,
    maxHeight: 320,
  },
  viewerRecipientsListContent: {
    gap: 8,
    paddingBottom: 6,
  },

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
  recipientsFiltersRow: { flexDirection: 'row', flexWrap: 'nowrap', gap: 8 },
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
  editorWizardTop: {
    paddingHorizontal: 2,
    paddingTop: 6,
    paddingBottom: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(79,70,229,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(79,70,229,0.10)',
  },
  wizardTopTitlesRow: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 6, flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 10 },
  wizardTopTitle: { fontSize: 16, fontWeight: '900', color: '#111827', textAlign: 'right' },
  wizardTopSub: { marginTop: 2, fontSize: 12, fontWeight: '700', color: 'rgba(100,116,139,1)', textAlign: 'right' },
  wizardProgressMetaRow: { paddingHorizontal: 10, paddingBottom: 8, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  wizardProgressPct: { fontSize: 12, fontWeight: '800', color: 'rgba(100,116,139,1)' },
  wizardProgressLabel: { fontSize: 12, fontWeight: '800', color: 'rgba(100,116,139,1)' },
  wizardProgressTrack: {
    marginHorizontal: 10,
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(148,163,184,0.25)',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  wizardProgressFill: { height: 6, borderRadius: 999, backgroundColor: '#2563EB' },
  editorStepperRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  editorStepperItem: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 6 },
  editorStepDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.18)',
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorStepDotDone: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  editorStepDotActive: { borderColor: '#4F46E5' },
  editorStepDotText: { fontSize: 12, fontWeight: '900', color: 'rgba(15,23,42,0.72)' },
  editorStepLabel: { fontSize: 11, fontWeight: '900', color: 'rgba(100,116,139,1)', textAlign: 'center' },
  editorStepLabelActive: { color: '#111827' },

  scheduleStepWrap: { padding: 14, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.96)', borderWidth: 1, borderColor: 'rgba(2,6,23,0.08)', gap: 14 },
  scheduleStepHeader: { width: '100%', gap: 4 },
  scheduleStepTitle: { fontSize: 18, fontWeight: '900', color: '#111827', textAlign: 'right' },
  scheduleStepSubTitle: { fontSize: 12, fontWeight: '800', color: 'rgba(100,116,139,1)', textAlign: 'right' },
  scheduleStepGrid: { width: '100%', flexDirection: 'row-reverse', alignItems: 'stretch', gap: 16, flexWrap: 'wrap' },
  scheduleLeftCol: { width: 320, maxWidth: '100%', gap: 12 },
  scheduleChoiceCard: { borderRadius: 10, padding: 12, backgroundColor: 'rgba(37,99,235,0.08)', borderWidth: 1, borderColor: 'rgba(37,99,235,0.22)' },
  scheduleChoiceTopRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' },
  scheduleChoiceTitle: { fontSize: 12, fontWeight: '900', color: 'rgba(30,64,175,1)', textAlign: 'right' },
  scheduleChoiceValue: { marginTop: 6, fontSize: 13, fontWeight: '900', color: '#111827', textAlign: 'right' },
  scheduleFieldBlock: { gap: 6 },
  scheduleFieldLabel: { fontSize: 12, fontWeight: '900', color: 'rgba(71,85,105,1)', textAlign: 'right' },
  scheduleInputRow: { height: 44, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(2,6,23,0.12)', backgroundColor: '#fff', paddingHorizontal: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 10, justifyContent: 'flex-end' },
  scheduleInputText: { fontSize: 14, fontWeight: '900', color: '#111827', textAlign: 'right', flex: 1, writingDirection: 'ltr' },
  scheduleHintText: { fontSize: 11, fontWeight: '800', color: 'rgba(100,116,139,1)', textAlign: 'right', lineHeight: 16 },
  scheduleSummaryCard: { marginTop: 6, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: 'rgba(148,163,184,0.30)', backgroundColor: 'rgba(248,250,252,1)', alignItems: 'center', justifyContent: 'flex-start', gap: 6 },
  scheduleSummaryLabel: { fontSize: 12, fontWeight: '900', color: 'rgba(15,23,42,0.72)', textAlign: 'right' },
  scheduleSummaryValue: { fontSize: 18, fontWeight: '900', color: '#111827', textAlign: 'right', writingDirection: 'ltr' },
  scheduleCalendarCard: { flex: 1, minWidth: 360, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(2,6,23,0.08)', backgroundColor: '#fff', paddingTop: 10, overflow: 'hidden' },
  editorFooter: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    flexDirection: 'row',
    flexWrap: 'wrap',
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

  eventDetailsCard: { gap: 10, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(79,70,229,0.18)', backgroundColor: 'rgba(79,70,229,0.04)' },
  eventDetailsHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  eventDetailsHeaderRight: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  eventDetailsHeaderLeft: { flexDirection: 'row-reverse', alignItems: 'center' },
  eventDetailsTitle: { fontSize: 15, fontWeight: '900', color: '#1E1B4B', textAlign: 'right' },
  eventDetailsHint: { fontSize: 12, fontWeight: '700', color: 'rgba(2,6,23,0.55)', textAlign: 'right' },
  eventDetailsGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  eventDetailItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    width: Platform.OS === 'web' ? ('calc(50% - 4px)' as any) : '100%',
    minWidth: 180,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(79,70,229,0.14)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  eventDetailLabel: { fontSize: 11, fontWeight: '800', color: 'rgba(2,6,23,0.5)', textAlign: 'right' },
  eventDetailValue: { fontSize: 13.5, fontWeight: '800', color: '#0F172A', textAlign: 'right' },

  tokenOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50 },
  tokenBackdrop: { ...StyleSheet.absoluteFillObject },
  tokenCard: { width: '100%', maxWidth: 520, backgroundColor: '#fff', borderRadius: 20, padding: 20, gap: 14, ...(Platform.OS === 'web' ? ({ boxShadow: '0 20px 60px rgba(2,6,23,0.35)' } as any) : null) },
  tokenHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  tokenTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A', textAlign: 'right' },
  tokenClose: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' },
  tokenHint: { fontSize: 12.5, fontWeight: '700', color: 'rgba(2,6,23,0.6)', textAlign: 'right', lineHeight: 18 },
  tokenStatusRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: '#F8FAFC', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  tokenStatusText: { flex: 1, fontSize: 12.5, fontWeight: '800', color: '#0F172A', textAlign: 'right' },
  tokenInput: { minHeight: 96, borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', paddingHorizontal: 14, paddingVertical: 12, fontSize: 13, fontWeight: '600', color: '#0F172A', textAlign: 'left', textAlignVertical: 'top' },
  tokenFooter: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  tokenSaveBtn: { flex: 1, height: 48, borderRadius: 12, backgroundColor: '#1D4ED8', alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null) },
  tokenSaveBtnText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  tokenClearBtn: { paddingHorizontal: 18, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.06)', ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null) },
  tokenClearBtnText: { color: '#EF4444', fontSize: 14, fontWeight: '900' },
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
  sendNowBtnBelowContent: {
    width: '100%',
    height: 44,
    marginTop: 14,
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
  mainColAdmin: { backgroundColor: 'transparent' },
  mainColContent: { padding: 24, paddingBottom: 40, gap: 20 },
  mainColContentAdmin: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 40, gap: 18 },

  timelineCard: {
    borderRadius: 12,
    backgroundColor: '#fff',
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 4px 16px rgba(0,0,0,0.04)' } as any) : null),
  },
  timelineCardAdmin: {
    borderRadius: 24,
    padding: 22,
    borderColor: 'rgba(6,23,62,0.06)',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 8px 24px rgba(11,28,65,0.04)' } as any) : null),
  },
  timelineSectionHeader: {
    gap: 4,
    marginBottom: 16,
  },
  timelineSectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  timelineSectionSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
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
  timelineItemAdmin: {
    minHeight: 168,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'flex-start',
    backgroundColor: '#FBFCFF',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 10px 24px rgba(11,28,65,0.04)' } as any) : null),
  },
  timelineScroller: { width: '100%' },
  timelineRowScroll: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 2,
    ...(Platform.OS === 'web' ? ({ direction: 'ltr' } as any) : null),
  },
  timelineItemScroll: {
    alignItems: 'center',
    gap: 8,
    width: 168,
    flexShrink: 0,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  timelineStepBadge: {
    minWidth: 42,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 6px 14px rgba(11,28,65,0.05)' } as any) : null),
  },
  timelineStepBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: 'rgba(100,116,139,1)',
    textAlign: 'center',
    writingDirection: 'ltr',
  },
  timelineLabel: { fontSize: 12, fontWeight: '800', color: '#9CA3AF', textAlign: 'center' },
  timelineDot: {
    width: 14,
    height: 14,
    borderRadius: 999,
    backgroundColor: '#D1D5DB',
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineDotAdmin: {
    width: 38,
    height: 38,
  },
  timelineDotNumber: {
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  timelineActiveLine: { width: 2, height: 26, marginVertical: 2 },
  timelineTitle: { fontSize: 13, fontWeight: '800', color: '#9CA3AF', textAlign: 'center' },
  timelineDate: { fontSize: 11, fontWeight: '900', color: '#111827', textAlign: 'center', marginTop: 2, writingDirection: 'ltr' },
  timelineTime: { fontSize: 12, fontWeight: '900', color: '#111827', textAlign: 'center', marginTop: 1, writingDirection: 'ltr' },
  timelineConnector: { width: 60, height: 1, backgroundColor: '#D9E2F2', alignSelf: 'center', marginBottom: 76 },
  timelineConnectorScroll: { width: 42, height: 1, backgroundColor: '#D9E2F2', alignSelf: 'center', marginTop: 48 },

  cardsContainer: { gap: 16 },
  cardsRow: {
    ...(Platform.OS === 'web'
      ? ({
          display: 'flex',
          // RTL is already applied at the page level (`direction: rtl`).
          // Using `row-reverse` here double-flips the order and places "01" on the left.
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 16,
          alignItems: 'stretch',
          overflowX: 'hidden',
          overflowY: 'visible',
        } as any)
      : ({
          flexDirection: 'row',
          alignItems: 'stretch',
          justifyContent: 'flex-start',
          gap: 16,
          flexWrap: 'wrap',
        } as any)),
  },

  builderCard: {
    marginTop: 18,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(2,6,23,0.08)',
  },
  builderHeaderRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  builderTitle: { fontSize: 14, fontWeight: '900', color: '#111827', textAlign: 'right' },
  builderSub: { marginTop: 2, fontSize: 12, fontWeight: '700', color: 'rgba(100,116,139,1)', textAlign: 'right' },
  builderEmpty: { marginTop: 12, fontSize: 12, fontWeight: '800', color: 'rgba(100,116,139,1)', textAlign: 'right' },
  builderStepCard: {
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(248,250,252,1)',
    borderWidth: 1,
    borderColor: 'rgba(2,6,23,0.06)',
  },
  builderStepTopRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  builderStepTitle: { fontSize: 13, fontWeight: '900', color: '#111827', textAlign: 'right' },
  builderStepMetaRow: { marginTop: 6, flexDirection: 'row-reverse', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  builderStepMetaText: { fontSize: 12, fontWeight: '800', color: 'rgba(100,116,139,1)', textAlign: 'right' },
  builderStepActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  builderIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(2,6,23,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  builderIconBtnDanger: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  builderStepBottomRow: { marginTop: 10, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  builderEditBtn: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(79,70,229,0.24)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  builderEditText: { fontSize: 12, fontWeight: '900', textAlign: 'right' },

  fieldRow: { marginTop: 10, gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '900', color: 'rgba(2,6,23,0.75)', textAlign: 'right' },
  fieldInput: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(2,6,23,0.10)',
    backgroundColor: '#fff',
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'right',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null),
  },
  modeRow: { flexDirection: 'row', flexWrap: 'nowrap', gap: 8 },
  modePill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(2,6,23,0.10)', backgroundColor: '#fff', ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null) },
  modePillActive: { backgroundColor: 'rgba(79,70,229,0.10)', borderColor: 'rgba(79,70,229,0.26)' },
  modePillText: { fontSize: 12, fontWeight: '900', color: 'rgba(2,6,23,0.70)', textAlign: 'right' },
  waModeToggleRow: { flexDirection: 'row-reverse', gap: 8, marginBottom: 4 },
  waModeToggleBtn: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(148,163,184,0.4)', backgroundColor: '#fff' },
  waModeToggleBtnActive: { borderColor: '#4F46E5', backgroundColor: 'rgba(79,70,229,0.08)' },
  waModeToggleText: { fontSize: 13, fontWeight: '800', color: '#64748B', textAlign: 'right' },
  waModeToggleTextActive: { color: '#4F46E5' },
  waManualWrap: { gap: 10 },
  waManualSearchRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 12, height: 42, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(148,163,184,0.4)', backgroundColor: '#fff' },
  waManualSearchInput: { flex: 1, fontSize: 14, color: '#0F172A', textAlign: 'right', height: '100%' },
  waManualActionsRow: { flexDirection: 'row-reverse', gap: 16 },
  waManualLinkBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  waManualLinkText: { fontSize: 13, fontWeight: '800', color: '#4F46E5', textAlign: 'right' },
  waManualList: { maxHeight: 280, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(148,163,184,0.3)', backgroundColor: 'rgba(248,250,252,0.6)', paddingHorizontal: 8 },
  waGuestRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: 'transparent', backgroundColor: '#fff' },
  waGuestRowChecked: { borderColor: 'rgba(79,70,229,0.4)', backgroundColor: 'rgba(79,70,229,0.06)' },
  waCheckbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: 'rgba(148,163,184,0.7)', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  waCheckboxChecked: { borderColor: '#4F46E5', backgroundColor: '#4F46E5' },
  waGuestName: { fontSize: 13, fontWeight: '800', color: '#0F172A', textAlign: 'right' },
  waGuestMeta: { fontSize: 11, fontWeight: '600', color: 'rgba(100,116,139,1)', textAlign: 'right', marginTop: 1 },
  waCountCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginTop: 4, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(14,124,70,0.25)', backgroundColor: 'rgba(37,211,102,0.08)' },
  waCountCardWarn: { borderColor: 'rgba(180,83,9,0.35)', backgroundColor: 'rgba(245,158,11,0.10)' },
  waCountTitle: { fontSize: 13, fontWeight: '900', color: '#0F172A', textAlign: 'right' },
  waCountSubText: { marginTop: 3, fontSize: 12, fontWeight: '700', color: 'rgba(71,85,105,1)', textAlign: 'right' },
  waCountWarnText: { marginTop: 3, fontSize: 12, fontWeight: '800', color: '#B45309', textAlign: 'right' },
  waQuotaBar: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(14,124,70,0.18)', backgroundColor: 'rgba(37,211,102,0.08)' },
  waQuotaBarWarn: { borderBottomColor: 'rgba(180,83,9,0.30)', backgroundColor: 'rgba(245,158,11,0.12)' },
  waQuotaBarText: { flex: 1, fontSize: 12.5, fontWeight: '900', color: '#0F172A', textAlign: 'right' },
  waQuotaBadge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(245,158,11,0.18)', borderWidth: 1, borderColor: 'rgba(180,83,9,0.30)' },
  waQuotaBadgeText: { fontSize: 11, fontWeight: '900', color: '#B45309' },
  modePillTextActive: { color: '#4F46E5' },

  waBlock: { gap: 12, marginTop: 6, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(37,211,102,0.25)', backgroundColor: 'rgba(37,211,102,0.05)' },
  waEmpty: { gap: 10, alignItems: 'flex-end' },
  waManageBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: '#25D366', paddingHorizontal: 14, height: 40, borderRadius: 10, justifyContent: 'center', ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null) },
  waManageBtnText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  waPreview: { padding: 12, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(2,6,23,0.08)' },
  waPreviewText: { fontSize: 13, fontWeight: '700', color: 'rgba(2,6,23,0.78)', textAlign: 'right', lineHeight: 19 },
  waVarRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  waBtnRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  waVarBadge: { paddingHorizontal: 8, height: 34, borderRadius: 8, backgroundColor: 'rgba(37,211,102,0.14)', alignItems: 'center', justifyContent: 'center' },
  waVarBadgeText: { fontSize: 12, fontWeight: '900', color: '#0E7C46' },
  waVarField: { gap: 6 },
  waVarLabelRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  waVarNumBadge: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 999, backgroundColor: 'rgba(37,211,102,0.16)', borderWidth: 1, borderColor: 'rgba(14,124,70,0.25)', alignItems: 'center', justifyContent: 'center' },
  waVarNumBadgeText: { fontSize: 12, fontWeight: '900', color: '#0E7C46' },
  waVarFieldLabel: { fontSize: 13, fontWeight: '900', color: '#0F172A', textAlign: 'right' },
  waImagePreviewWrap: { position: 'relative', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(2,6,23,0.10)', backgroundColor: '#fff', alignSelf: 'stretch' },
  waImagePreview: { width: '100%', height: 180, backgroundColor: 'rgba(2,6,23,0.04)' },
  waImageDefaultBadge: { position: 'absolute', top: 8, right: 8, flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(15,23,42,0.72)' },
  waImageDefaultBadgeText: { fontSize: 11, fontWeight: '800', color: '#fff', textAlign: 'right' },
  waImageActionsRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  waUploadBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: '#25D366', paddingHorizontal: 14, height: 40, borderRadius: 10, justifyContent: 'center', ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null) },
  waUploadBtnText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  waImageRemoveBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 40, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(220,38,38,0.30)', backgroundColor: 'rgba(220,38,38,0.06)', justifyContent: 'center', ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null) },
  waImageRemoveBtnText: { color: '#DC2626', fontSize: 13, fontWeight: '900' },
  waManageLink: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, alignSelf: 'flex-end', marginTop: 2, ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null) },
  waManageLinkText: { fontSize: 12, fontWeight: '900', color: '#1D4ED8' },
  dependsRow: { flexDirection: 'row', flexWrap: 'nowrap', gap: 8 },
  dependsPill: { maxWidth: 220, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(2,6,23,0.10)', backgroundColor: '#fff', ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null) },
  dependsPillActive: { backgroundColor: 'rgba(79,70,229,0.10)', borderColor: 'rgba(79,70,229,0.26)' },
  dependsText: { fontSize: 12, fontWeight: '900', color: 'rgba(2,6,23,0.70)', textAlign: 'right' },
  dependsTextActive: { color: '#4F46E5' },

  dependsSelectBtn: {
    height: 54,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(2,6,23,0.10)',
    backgroundColor: '#fff',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  dependsSelectTitle: { fontSize: 13, fontWeight: '900', color: '#111827', textAlign: 'right' },
  dependsSelectSub: { marginTop: 2, fontSize: 12, fontWeight: '800', color: 'rgba(100,116,139,1)', textAlign: 'right' },
  dependsClearBtn: {
    width: 44,
    height: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(2,6,23,0.08)',
    backgroundColor: 'rgba(2,6,23,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },

  dependsOptionCard: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(2,6,23,0.08)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  dependsOptionCardSelected: { borderColor: 'rgba(22,163,74,0.30)', backgroundColor: 'rgba(22,163,74,0.06)' },
  dependsOptionTopRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  dependsOptionTitle: { fontSize: 13, fontWeight: '900', color: '#111827', textAlign: 'right', flex: 1 },
  dependsOptionBadge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(22,163,74,0.10)', borderWidth: 1, borderColor: 'rgba(22,163,74,0.18)' },
  dependsOptionBadgeText: { fontSize: 12, fontWeight: '900', color: '#16A34A', textAlign: 'right' },
  dependsOptionMetaRow: { marginTop: 8, flexDirection: 'row-reverse', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  dependsOptionMetaText: { fontSize: 12, fontWeight: '800', color: 'rgba(100,116,139,1)', textAlign: 'right' },

  wizardChoiceRow: { flexDirection: 'row-reverse', gap: 12, flexWrap: 'wrap' },
  wizardChoiceBtn: {
    flex: 1,
    minWidth: 220,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: 'rgba(2,6,23,0.08)',
    gap: 6,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  wizardChoiceBtnActive: { borderColor: 'rgba(79,70,229,0.45)', backgroundColor: 'rgba(79,70,229,0.06)' },
  wizardChoiceTitle: { fontSize: 14, fontWeight: '900', color: '#111827', textAlign: 'right' },
  wizardChoiceTitleActive: { color: '#4F46E5' },
  wizardChoiceSub: { fontSize: 12, fontWeight: '800', color: 'rgba(100,116,139,1)', textAlign: 'right' },

  wizardChipRow: { gap: 8 },
  wizardChip: { alignSelf: 'flex-start', flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(79,70,229,0.10)', borderWidth: 1, borderColor: 'rgba(79,70,229,0.20)' },
  wizardChipText: { fontSize: 12, fontWeight: '900', color: '#4F46E5', textAlign: 'right' },

  wizardInsertCard: { padding: 12, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(2,6,23,0.08)', ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null) },
  wizardInsertCardSelected: { borderColor: 'rgba(22,163,74,0.30)', backgroundColor: 'rgba(22,163,74,0.06)' },
  wizardInsertTopRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  wizardInsertTitle: { fontSize: 13, fontWeight: '900', color: '#111827', textAlign: 'right' },
  wizardInsertSub: { marginTop: 6, fontSize: 12, fontWeight: '800', color: 'rgba(100,116,139,1)', textAlign: 'right' },
  wizardInsertBadge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(22,163,74,0.10)', borderWidth: 1, borderColor: 'rgba(22,163,74,0.18)' },
  wizardInsertBadgeText: { fontSize: 12, fontWeight: '900', color: '#16A34A', textAlign: 'right' },

  fabAddStep: {
    position: Platform.OS === 'web' ? ('fixed' as any) : 'absolute',
    left: 24,
    bottom: 24,
    width: 52,
    height: 52,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    shadowColor: '#4F46E5',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    zIndex: 60,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  fabAddStepHover: { opacity: 0.96 },

  messageCard: {
    ...(Platform.OS === 'web'
      ? ({
          flexGrow: 0,
          flexShrink: 0,
          flexBasis: 'calc(25% - 12px)',
          minWidth: 240,
          maxWidth: 'calc(25% - 12px)',
        } as any)
      : ({ flexGrow: 1, flexBasis: '32%', minWidth: 240 } as any)),
    borderRadius: 14,
    backgroundColor: '#fff',
    padding: 18,
    borderWidth: 2,
    borderColor: '#F3F4F6',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', boxShadow: '0 6px 20px rgba(0,0,0,0.05)' } as any) : null),
  },
  messageCardAdmin: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 22,
    padding: 20,
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 10px 28px rgba(11,28,65,0.05)' } as any) : null),
  },
  messageCardHover: {
    borderColor: '#D8E3F8',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 14px 30px rgba(11,28,65,0.08)' } as any) : null),
  },
  messageCardSelected: { borderColor: '#4F46E5', ...(Platform.OS === 'web' ? ({ boxShadow: '0 8px 28px rgba(79,70,229,0.12)' } as any) : null) },
  cardAccentBar: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    height: 4,
  },

  cardTopRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 },
  cardTopMeta: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, flexWrap: 'wrap', maxWidth: '70%' },
  cardStageBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  cardStageBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
  },
  cardChannelBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  cardChannelBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(71,85,105,1)',
    textAlign: 'center',
  },
  cardNumber: { fontSize: 36, fontWeight: '900', color: '#EEF2FF' },
  cardIconWrap: { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(79,70,229,0.08)', alignItems: 'center', justifyContent: 'center' },
  cardIconWrapAdmin: {
    width: 46,
    height: 46,
    borderRadius: 14,
  },

  cardTitle: { fontSize: 20, fontWeight: '900', color: '#111827', textAlign: 'right', marginBottom: 10, marginTop: 2 },

  cardMetaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 14 },
  cardMetaText: { fontSize: 13, fontWeight: '800', color: '#6B7280', textAlign: 'right', flexShrink: 1 },
  cardInsightsGrid: { marginTop: -2, marginBottom: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignSelf: 'stretch' },
  cardInsightCard: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 180,
    minWidth: 180,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 6,
  },
  cardInsightCardStatic: {},
  cardInsightCardInteractive: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: 'rgba(2,6,23,0.08)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  cardInsightTopRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardInsightIconWrap: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardInsightLabel: { fontSize: 11, fontWeight: '900', color: 'rgba(100,116,139,1)', textAlign: 'right', flexShrink: 1 },
  cardInsightValue: { fontSize: 14, fontWeight: '900', textAlign: 'right', flexShrink: 1 },
  cardInsightMeta: { fontSize: 11, fontWeight: '700', color: 'rgba(100,116,139,0.92)', textAlign: 'right', flexShrink: 1 },
  cardSchedulePill: {
    marginTop: -2,
    marginBottom: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardSchedulePillText: {
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'right',
    flexShrink: 1,
    writingDirection: 'ltr',
  },

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
  cardInlineSubText: { marginTop: -6, marginBottom: 12, fontSize: 12, fontWeight: '900', color: 'rgba(2,6,23,0.45)', textAlign: 'right' },

  catchupStepWrap: { width: '100%', flexDirection: 'column', gap: 16 },
  queueScheduleCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    borderRadius: 16,
    padding: 12,
    gap: 12,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 1px 3px rgba(15,23,42,0.06)' } as any) : null),
  },
  queueCatchupStatusPillTextOnly: { height: 22, paddingHorizontal: 10, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  queueScheduleTopRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  queueSchedulePill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(79,70,229,0.10)', borderWidth: 1, borderColor: 'rgba(79,70,229,0.18)' },
  queueSchedulePillText: { fontSize: 12, fontWeight: '900', color: 'rgba(79,70,229,1)' },
  queueToggleBtn: { height: 34, paddingHorizontal: 12, borderRadius: 12, backgroundColor: 'rgba(2,6,23,0.06)', borderWidth: 1, borderColor: 'rgba(2,6,23,0.10)', alignItems: 'center', justifyContent: 'center' },
  queueToggleBtnText: { fontSize: 12, fontWeight: '900', color: 'rgba(2,6,23,0.85)' },
  queueClearBtn: { height: 34, paddingHorizontal: 12, borderRadius: 12, backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.14)', alignItems: 'center', justifyContent: 'center' },
  queueClearBtnText: { fontSize: 12, fontWeight: '900', color: 'rgba(239,68,68,1)' },

  queueCatchupActivationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' },
  queueCatchupActivationRightBlock: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, justifyContent: 'flex-end' },
  queueCatchupActivationTextBlock: { flex: 1, minWidth: 0, justifyContent: 'flex-start', alignItems: 'flex-start', gap: 2 },
  queueCatchupActivationTitle: { fontSize: 15, fontWeight: '900', color: '#111827', textAlign: 'right' },
  queueCatchupActivationTitleBlue: { fontSize: 15, fontWeight: '900', color: 'rgba(79,70,229,1)', textAlign: 'right' },
  queueCatchupActivationHint: { fontSize: 12, fontWeight: '700', color: 'rgba(100,116,139,1)', textAlign: 'right', marginTop: 2 },
  toggleBtnCatchup: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', userSelect: 'none' } as any) : null),
  },
  toggleTrackOnCatchup: { backgroundColor: 'rgba(79,70,229,1)', borderColor: 'rgba(79,70,229,0.60)' },

  queueCatchupScheduleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' },
  queueCatchupDailyBlock: { gap: 8, minWidth: 0 },
  queueCatchupTimeInputWrap: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, height: 40, paddingLeft: 12, paddingRight: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(2,6,23,0.12)', backgroundColor: '#fff' },
  queueCatchupDailyRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  queueCatchupDailyLabel: { fontSize: 13, fontWeight: '800', color: 'rgba(71,85,105,1)', textAlign: 'right' },
  queueCatchupTimeInput: { flex: 1, minWidth: 56, height: 40, paddingVertical: 0, paddingHorizontal: 0, borderWidth: 0, backgroundColor: 'transparent', fontSize: 14, fontWeight: '800', color: '#111827', textAlign: 'right' },
  queueCatchupDaysBlock: { gap: 8, flex: 1, minWidth: 200 },
  queueCatchupDaysLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  queueCatchupTableSection: { marginTop: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(15,23,42,0.08)', borderRadius: 16, overflow: 'hidden' },
  queueCatchupTableTitleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(15,23,42,0.06)' },
  queueCatchupTableTitle: { fontSize: 15, fontWeight: '900', color: '#111827', textAlign: 'right' },
  queueCatchupActionsRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  queueCatchupActionBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  queueCatchupActionBtnText: { fontSize: 13, fontWeight: '800', color: '#2563EB', textAlign: 'right' },
  queueCatchupTableWrap: { minHeight: 80 },
  queueCatchupTableHeader: { flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: 'rgba(248,250,252,1)', borderBottomWidth: 1, borderBottomColor: 'rgba(15,23,42,0.06)' },
  queueCatchupTableHeaderCell: { fontSize: 12, fontWeight: '900', color: 'rgba(100,116,139,1)', textAlign: 'right', flex: 1, minWidth: 0 },
  queueCatchupTableHeaderStatusCell: { flex: 0, minWidth: 88, maxWidth: 100 },
  queueCatchupTableRow: { flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(15,23,42,0.05)' },
  queueCatchupTableStatusCell: { flex: 0, minWidth: 88, maxWidth: 100 },
  queueCatchupTableCell: { fontSize: 13, fontWeight: '800', color: '#111827', textAlign: 'right', flex: 1, minWidth: 0 },
  queueCatchupTableEmpty: { fontSize: 13, fontWeight: '800', color: 'rgba(100,116,139,0.8)', textAlign: 'center', paddingVertical: 24 },
  queueCatchupTableFooter: { fontSize: 12, fontWeight: '800', color: 'rgba(100,116,139,1)', textAlign: 'right', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: 'rgba(248,250,252,0.8)' },

  queueModeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, flexWrap: 'nowrap' },
  queueModePill: { height: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(2,6,23,0.10)', backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
  queueModePillActive: { backgroundColor: 'rgba(79,70,229,0.10)', borderColor: 'rgba(79,70,229,0.22)' },
  queueModePillText: { fontSize: 12, fontWeight: '900', color: 'rgba(2,6,23,0.72)' },
  queueModePillTextActive: { color: 'rgba(79,70,229,1)' },

  queueTimeWrap: { minWidth: 120, alignItems: 'flex-end', gap: 6 },
  queueTimeLabel: { fontSize: 11, fontWeight: '900', color: 'rgba(100,116,139,1)' },
  queueTimeInput: { height: 36, minWidth: 110, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(2,6,23,0.10)', backgroundColor: 'rgba(255,255,255,0.92)', fontSize: 12, fontWeight: '900', color: '#111827', textAlign: 'center' },

  queueDaysRow: { flexDirection: 'row', flexWrap: 'nowrap', gap: 8 },
  queueDayPill: { height: 36, minWidth: 36, paddingHorizontal: 8, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  queueDayPillOn: { backgroundColor: 'rgba(79,70,229,0.12)', borderColor: 'rgba(79,70,229,0.25)' },
  queueDayPillOff: { backgroundColor: 'rgba(255,255,255,0.92)', borderColor: 'rgba(2,6,23,0.12)' },
  queueDayText: { fontSize: 13, fontWeight: '900' },
  queueDayTextOn: { color: 'rgba(79,70,229,1)' },
  queueDayTextOff: { color: 'rgba(79,70,229,0.85)' },

  queueDatesTopRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  queueDatesChips: { flexDirection: 'row', flexWrap: 'nowrap', gap: 8 },
  queueDateChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(2,6,23,0.04)', borderWidth: 1, borderColor: 'rgba(2,6,23,0.08)' },
  queueDateChipText: { fontSize: 12, fontWeight: '900', color: 'rgba(2,6,23,0.80)' },
  queueChipX: { width: 22, height: 22, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.85)', borderWidth: 1, borderColor: 'rgba(2,6,23,0.08)' },
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
} as any) as any;

