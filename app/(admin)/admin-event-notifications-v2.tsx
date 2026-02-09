import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  I18nManager,
  Keyboard,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { eventService } from '@/lib/services/eventService';
import { Event } from '@/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
};

const NOTIFICATION_TEMPLATES: NotificationTemplate[] = [
  { notification_type: 'reminder_1', title: 'הודעה רגילה 1 (לפני האירוע)', days_from_wedding: -30, channel: 'SMS' },
  { notification_type: 'reminder_2', title: 'הודעה רגילה 2 (לפני האירוע)', days_from_wedding: -14, channel: 'SMS', defaultMessage: 'היי! האירוע בעוד שבועיים, מחכים לראות אתכם!' },
  { notification_type: 'reminder_3', title: 'הודעה רגילה 3 (לפני האירוע)', days_from_wedding: -7, channel: 'SMS', defaultMessage: 'תזכורת אחרונה: האירוע בעוד שבוע. נשמח לראותכם!' },
  { notification_type: 'whatsapp_event_day', title: 'וואטסאפ ביום האירוע', days_from_wedding: 0, channel: 'WHATSAPP', defaultMessage: 'היום האירוע! נתראה שם' },
  { notification_type: 'after_1', title: 'הודעה רגילה אחרי האירוע', days_from_wedding: 1, channel: 'SMS', defaultMessage: 'תודה שבאתם! היה לנו כיף גדול איתכם.' },
];

const isRTL = I18nManager.isRTL;

export default function AdminEventNotificationsScreenV2() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const isDark = false;

  const [event, setEvent] = useState<Event | null>(null);
  const [ownerName, setOwnerName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});

  const [notificationSettings, setNotificationSettings] = useState<NotificationSettingRow[]>([]);

  const [editVisible, setEditVisible] = useState(false);
  const [editing, setEditing] = useState<NotificationSettingRow | null>(null);
  const [editedMessage, setEditedMessage] = useState('');
  const [editedDateText, setEditedDateText] = useState(''); // absolute number string
  const [timingMode, setTimingMode] = useState<'before' | 'after'>('before');

  const ui = useMemo(() => {
    // keep light mode stable
    return isDark
      ? {
          bg: '#0B1220',
          card: '#111B2E',
          text: '#F8FAFC',
          muted: '#94A3B8',
          faint: '#CBD5E1',
          border: 'rgba(255,255,255,0.10)',
          divider: 'rgba(255,255,255,0.08)',
          primary: '#3b82f6',
          whatsapp: '#22c55e',
        }
      : {
          bg: '#F9FAFB',
          card: '#FFFFFF',
          text: '#0f172a',
          muted: '#64748b',
          faint: '#94a3b8',
          border: '#E2E8F0',
          divider: '#E2E8F0',
          primary: '#067ff9',
          whatsapp: '#16a34a',
        };
  }, [isDark]);

  const getDefaultMessageContent = (name?: string) => {
    const displayName = name && name.trim().length > 0 ? name.trim() : 'בעל/ת האירוע';
    return `הנכם מוזמנים לאירוע של ${displayName}\nפרטי האירוע ואישור הגעתכם בקישור\nנשמח לראותכם בין אורחינו.`;
  };

  const isWeddingEvent = (eventData: Event | null) => {
    const title = String((eventData as any)?.title ?? '').trim();
    return title === 'חתונה' || title.includes('חתונה');
  };

  const getWeddingNamesLabel = (eventData: Event | null) => {
    const groom = String((eventData as any)?.groomName ?? '').trim();
    const bride = String((eventData as any)?.brideName ?? '').trim();
    const groomLabel = groom || 'שם חתן לא הוזן';
    const brideLabel = bride || 'שם כלה לא הוזן';
    return `${groomLabel} ו${brideLabel}`;
  };

  const getEventOwnerLabel = (eventData: Event | null, owner?: string) => {
    if (isWeddingEvent(eventData)) return getWeddingNamesLabel(eventData);
    const raw = (owner || '').trim();
    return raw || 'בעל/ת האירוע';
  };

  const shouldReplaceLegacyFirstReminder = (msg: string) => {
    const t = String(msg || '').trim();
    if (!t) return true;
    return t.includes('רצינו להזכיר') || t.includes('האירוע הקרוב שלנו') || t.includes('הנכם מוזמנים') || t.includes('מוזמנים לאירוע');
  };

  const getDefaultFirstReminderMessage = (eventData: Event | null, owner?: string) => {
    const title = String((eventData as any)?.title ?? '').toLowerCase();
    const ownerN = (owner || '').trim() || 'בעל/ת האירוע';
    const groom = String((eventData as any)?.groomName ?? '').trim();
    const bride = String((eventData as any)?.brideName ?? '').trim();

    const kind: 'wedding' | 'brit' | 'barMitzvah' | 'batMitzvah' | 'henna' | 'event' =
      isWeddingEvent(eventData) || title.includes('wedding')
        ? 'wedding'
        : title.includes('ברית') || title.includes('בריתה') || title.includes('baby')
          ? 'brit'
          : title.includes('בר מצו') || title.includes('בר-מצו') || title.includes('bar mitz')
            ? 'barMitzvah'
            : title.includes('בת מצו') || title.includes('בת-מצו') || title.includes('bat mitz')
              ? 'batMitzvah'
              : title.includes('חינה')
                ? 'henna'
                : 'event';

    const weddingLabel = groom && bride ? `לחתונה של ${groom} ול${bride}` : `לחתונה של ${ownerN}`;

    const label =
      kind === 'wedding'
        ? weddingLabel
        : kind === 'brit'
          ? `לברית של ${ownerN}`
          : kind === 'barMitzvah'
            ? `לבר מצווה של ${ownerN}`
            : kind === 'batMitzvah'
              ? `לבת מצווה של ${ownerN}`
              : kind === 'henna'
                ? `לחינה של ${ownerN}`
                : `לאירוע של ${ownerN}`;

    const dateText = (eventData as any)?.date ? new Date((eventData as any).date).toLocaleDateString('he-IL') : '';
    const explicitLink = String((eventData as any)?.rsvpLink ?? (eventData as any)?.rsvp_link ?? '').trim();
    const base = 'https://i.e2grsvp.com/e/';
    const link = explicitLink || `${base}${String((eventData as any)?.id ?? '').trim()}`;

    return `שלום, הוזמנתם ${label} בתאריך ${dateText}.\nלפרטים ואישור הגעה היכנסו לקישור הבא:\n${link}`;
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

  const formatOffsetLabel = (days: number) => {
    if (days === 0) return 'ביום האירוע';
    const abs = Math.abs(days);
    return days < 0 ? `${abs} ימים לפני האירוע` : `${abs} ימים אחרי האירוע`;
  };

  const isMissingColumn = (err: any, column: string) =>
    String(err?.code) === '42703' && String(err?.message || '').toLowerCase().includes(column.toLowerCase());

  const getDraftSignedDays = () => {
    const absText = (editedDateText || '').trim();
    const abs = Number.parseInt(absText, 10);
    if (!Number.isFinite(abs)) return 0;
    if (abs === 0) return 0;
    return timingMode === 'before' ? -Math.abs(abs) : Math.abs(abs);
  };

  const loadOwnerName = async (eventData: Event) => {
    if (!eventData?.user_id) return '';
    const { data, error } = await supabase.from('users').select('name').eq('id', (eventData as any).user_id).single();
    if (error) return '';
    return String((data as any)?.name || '');
  };

  const fetchSettings = async (eventData: Event, owner?: string) => {
    const { data: rows, error } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('event_id', eventData.id)
      .order('days_from_wedding', { ascending: true });

    if (error) {
      console.error('Error fetching notification settings (admin screen v2):', error);
    }

    const existingMap = new Map<string, any>(((rows as any[]) || []).map((r) => [r.notification_type, r]));
    const legacyFixes: Array<{ id: string; message_content: string }> = [];

    const merged: NotificationSettingRow[] = NOTIFICATION_TEMPLATES.map((tpl) => {
      const existing = existingMap.get(tpl.notification_type);
      if (existing) {
        const existingMsg = String(existing.message_content ?? '');
        if (tpl.notification_type === 'reminder_1' && existing.id && shouldReplaceLegacyFirstReminder(existingMsg)) {
          const nextMsg = getDefaultFirstReminderMessage(eventData as any, owner);
          legacyFixes.push({ id: existing.id, message_content: nextMsg });
          return {
            id: existing.id,
            event_id: existing.event_id,
            notification_type: existing.notification_type,
            title: existing.title ?? tpl.title,
            enabled: Boolean(existing.enabled),
            message_content: nextMsg,
            days_from_wedding: typeof existing.days_from_wedding === 'number' ? existing.days_from_wedding : tpl.days_from_wedding,
            channel: (existing.channel as any) || tpl.channel,
          };
        }
        return {
          id: existing.id,
          event_id: existing.event_id,
          notification_type: existing.notification_type,
          title: existing.title ?? tpl.title,
          enabled: Boolean(existing.enabled),
          message_content: existingMsg,
          days_from_wedding: typeof existing.days_from_wedding === 'number' ? existing.days_from_wedding : tpl.days_from_wedding,
          channel: (existing.channel as any) || tpl.channel,
        };
      }

      const defaultMessage =
        tpl.notification_type === 'reminder_1'
          ? getDefaultFirstReminderMessage(eventData, owner)
          : (tpl.defaultMessage ?? getDefaultMessageContent(owner));

      return {
        notification_type: tpl.notification_type,
        title: tpl.title,
        enabled: false,
        message_content: defaultMessage,
        days_from_wedding: tpl.days_from_wedding,
        channel: tpl.channel,
      };
    });

    setNotificationSettings(merged);

    if (legacyFixes.length) {
      legacyFixes.forEach((fix) => {
        supabase
          .from('notification_settings')
          .update({ message_content: fix.message_content })
          .eq('id', fix.id)
          .then(({ error: updateError }) => {
            if (updateError) console.warn('Failed to auto-update legacy reminder_1 message (admin v2):', updateError);
          });
      });
    }
  };

  useEffect(() => {
    const load = async () => {
      if (!eventId || typeof eventId !== 'string') {
        router.back();
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const eventData = await eventService.getEvent(eventId);
        if (!eventData) {
          setEvent(null);
          setOwnerName('');
          setNotificationSettings([]);
          setError('האירוע לא נמצא');
          return;
        }
        setEvent(eventData);
        const name = await loadOwnerName(eventData as any);
        setOwnerName(name);
        if ((eventData as any)?.id) {
          await fetchSettings(eventData as any, name);
        }
      } catch (e) {
        console.error('Load admin notifications v2 failed:', e);
        setError('שגיאה בטעינת ההודעות');
      } finally {
        setLoading(false);
      }
    };
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const toggleNotification = async (row: NotificationSettingRow, nextEnabled?: boolean) => {
    if (!event?.id) return;
    if (savingMap[row.notification_type]) return;

    const desiredEnabled = typeof nextEnabled === 'boolean' ? nextEnabled : !row.enabled;
    const previousEnabled = row.enabled;

    setSavingMap((prev) => ({ ...prev, [row.notification_type]: true }));
    setNotificationSettings((prev) =>
      prev.map((r) => (r.notification_type === row.notification_type ? { ...r, enabled: desiredEnabled } : r))
    );

    try {
      if (row.id) {
        const { error } = await supabase.from('notification_settings').update({ enabled: desiredEnabled }).eq('id', row.id);
        if (error) throw error;
        return;
      }

      const tpl = NOTIFICATION_TEMPLATES.find((t) => t.notification_type === row.notification_type);
      const payload: any = {
        event_id: event.id,
        notification_type: row.notification_type,
        title: row.title,
        enabled: desiredEnabled,
        message_content: row.message_content || getDefaultMessageContent(getEventOwnerLabel(event, ownerName)),
        days_from_wedding: typeof row.days_from_wedding === 'number' ? row.days_from_wedding : (tpl?.days_from_wedding ?? 0),
        channel: (row.channel as any) || tpl?.channel || 'SMS',
      };

      let { data, error } = await supabase.from('notification_settings').insert(payload).select().single();
      if (error && isMissingColumn(error, 'channel')) {
        delete payload.channel;
        const retry = await supabase.from('notification_settings').insert(payload).select().single();
        data = retry.data as any;
        error = retry.error as any;
      }
      if (error) throw error;
      setNotificationSettings((prev) =>
        prev.map((r) => (r.notification_type === row.notification_type ? { ...(r as any), ...(data as any) } : r))
      );
    } catch (e) {
      console.error('Error toggling notification (admin screen v2):', e);
      const msg = String((e as any)?.message || '');
      const isRls = String((e as any)?.code || '') === '42501' || msg.toLowerCase().includes('row-level security');
      Alert.alert('שגיאה', isRls ? 'אין הרשאה לעדכן הודעות (RLS). צריך להוסיף Policy בסופאבייס.' : 'לא ניתן לעדכן את ההודעה');

      setNotificationSettings((prev) =>
        prev.map((r) => (r.notification_type === row.notification_type ? { ...r, enabled: previousEnabled } : r))
      );
    } finally {
      setSavingMap((prev) => ({ ...prev, [row.notification_type]: false }));
    }
  };

  const openEdit = (row: NotificationSettingRow) => {
    const rawDays = typeof row.days_from_wedding === 'number' ? row.days_from_wedding : 0;
    const mode: 'before' | 'after' = rawDays < 0 ? 'before' : 'after';
    setEditing(row);
    setEditedMessage(row.message_content || '');
    setTimingMode(rawDays === 0 ? 'before' : mode);
    setEditedDateText(String(Math.abs(rawDays)));
    setEditVisible(true);
  };

  const editingRowFromStore = useMemo(() => {
    if (!editing) return null;
    return notificationSettings.find((r) => r.notification_type === editing.notification_type) ?? editing;
  }, [notificationSettings, editing]);

  useEffect(() => {
    if (!editVisible || !editing) return;
    const latest = notificationSettings.find((r) => r.notification_type === editing.notification_type);
    if (!latest) return;
    setEditing((prev) => {
      if (!prev || prev.notification_type !== latest.notification_type) return prev;
      if (prev.id === latest.id && prev.enabled === latest.enabled && prev.channel === latest.channel && prev.event_id === latest.event_id) {
        return prev;
      }
      return {
        ...prev,
        id: latest.id ?? prev.id,
        event_id: latest.event_id ?? prev.event_id,
        enabled: Boolean(latest.enabled),
        channel: latest.channel ?? prev.channel,
      };
    });
  }, [editVisible, editing?.notification_type, notificationSettings]);

  const saveEdit = async () => {
    if (!event?.id || !editing) return;
    const msg = (editedMessage || '').trim();
    if (!msg) return;

    const absText = (editedDateText || '').trim();
    const abs = Number.parseInt(absText, 10);
    const signed =
      Number.isFinite(abs) ? (abs === 0 ? 0 : timingMode === 'before' ? -Math.abs(abs) : Math.abs(abs)) : NaN;
    const daysToSave = Number.isFinite(signed) ? signed : editing.days_from_wedding;

    try {
      if (editing.id) {
        const updatePayload: any = { message_content: msg, days_from_wedding: daysToSave, channel: editing.channel };
        let { error } = await supabase.from('notification_settings').update(updatePayload).eq('id', editing.id);
        if (error && isMissingColumn(error, 'channel')) {
          delete updatePayload.channel;
          const retry = await supabase.from('notification_settings').update(updatePayload).eq('id', editing.id);
          error = retry.error as any;
        }
        if (error) throw error;
        setNotificationSettings((prev) =>
          prev.map((r) => (r.notification_type === editing.notification_type ? { ...r, message_content: msg, days_from_wedding: daysToSave } : r))
        );
      } else {
        const insertPayload: any = {
          event_id: event.id,
          notification_type: editing.notification_type,
          title: editing.title,
          enabled: editing.enabled ?? false,
          message_content: msg,
          days_from_wedding: daysToSave,
          channel:
            editing.channel ||
            (NOTIFICATION_TEMPLATES.find((t) => t.notification_type === editing.notification_type)?.channel ?? 'SMS'),
        };
        let { data, error } = await supabase.from('notification_settings').insert(insertPayload).select().single();
        if (error && isMissingColumn(error, 'channel')) {
          delete insertPayload.channel;
          const retry = await supabase.from('notification_settings').insert(insertPayload).select().single();
          data = retry.data as any;
          error = retry.error as any;
        }
        if (error) throw error;
        setNotificationSettings((prev) =>
          prev.map((r) => (r.notification_type === editing.notification_type ? { ...(r as any), ...(data as any) } : r))
        );
      }
      setEditVisible(false);
    } catch (e) {
      console.error('Error saving notification edit (admin screen v2):', e);
      const emsg = String((e as any)?.message || '');
      const isRls = String((e as any)?.code || '') === '42501' || emsg.toLowerCase().includes('row-level security');
      Alert.alert('שגיאה', isRls ? 'אין הרשאה לשמור שינוי (RLS). צריך להוסיף Policy בסופאבייס.' : 'לא ניתן לשמור את השינוי');
    }
  };

  const regular = notificationSettings.filter((n) => (n.channel || 'SMS') !== 'WHATSAPP');
  const whatsapp = notificationSettings.filter((n) => (n.channel || 'SMS') === 'WHATSAPP');

  const CardRow = ({ row, variant }: { row: NotificationSettingRow; variant: 'regular' | 'whatsapp' }) => {
    const isSaving = Boolean(savingMap[row.notification_type]);
    const enabled = Boolean(row.enabled);
    const computedSendDate =
      event?.date && typeof row.days_from_wedding === 'number' ? formatDate(computeSendDate((event as any).date, row.days_from_wedding)) : '';

    const accent = variant === 'whatsapp' ? ui.whatsapp : ui.primary;
    const borderColor = variant === 'whatsapp' ? 'rgba(22,163,74,0.25)' : ui.border;

    return (
      <TouchableOpacity
        activeOpacity={0.92}
        onPress={() => openEdit(row)}
        style={[styles.cardRow, { backgroundColor: ui.card, borderColor }]}
        accessibilityRole="button"
        accessibilityLabel={`עריכת ${row.title}`}
      >
        <View style={[styles.accentBar, { backgroundColor: accent }]} />

        <View style={styles.cardBody}>
          <Text style={[styles.cardTitle, { color: ui.text }]} numberOfLines={2}>
            {row.title}
          </Text>

          <View style={styles.metaRow}>
            <View style={styles.metaLeft}>
              <Text style={[styles.metaLabel, { color: ui.muted }]} numberOfLines={1}>
                {formatOffsetLabel(row.days_from_wedding)}
              </Text>
              {computedSendDate ? (
                <Text style={[styles.metaLabel, { color: ui.muted }]} numberOfLines={1}>
                  {computedSendDate}
                </Text>
              ) : null}
            </View>

            <View style={styles.metaRight}>
              {isSaving ? (
                <ActivityIndicator size="small" color={enabled ? ui.whatsapp : ui.faint} />
              ) : (
                <Text style={[styles.metaStatus, { color: enabled ? ui.whatsapp : ui.faint }]}>{enabled ? 'פעיל' : 'כבוי'}</Text>
              )}
              <Switch
                value={enabled}
                onValueChange={(v) => toggleNotification(row, v)}
                disabled={isSaving}
                trackColor={{ false: 'rgba(148,163,184,0.35)', true: 'rgba(6,127,249,0.35)' }}
                thumbColor={enabled ? ui.primary : '#f1f5f9'}
              />
            </View>
          </View>
        </View>

        <View style={styles.chevWrap}>
          <Ionicons name="chevron-back" size={20} color={ui.faint} />
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: ui.bg }]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={ui.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: ui.bg }]}>
        <View style={[styles.center, { paddingHorizontal: 18 }]}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: ui.text, textAlign: 'center' }}>{error}</Text>
          <TouchableOpacity style={[styles.backBtn, { marginTop: 16 }]} onPress={() => router.back()} activeOpacity={0.9}>
            <Ionicons name="chevron-forward" size={22} color={ui.text} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: ui.bg }]}>
        <View style={[styles.center, { paddingHorizontal: 18 }]}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: ui.text, textAlign: 'center' }}>האירוע לא נמצא</Text>
          <TouchableOpacity style={[styles.backBtn, { marginTop: 16 }]} onPress={() => router.back()} activeOpacity={0.9}>
            <Ionicons name="chevron-forward" size={22} color={ui.text} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: ui.bg }]}>
      <View style={[styles.header, { paddingTop: Math.max(12, insets.top + 8), borderBottomColor: ui.divider, backgroundColor: ui.card }]}>
        <TouchableOpacity
          style={[styles.backBtn, { borderColor: ui.border, backgroundColor: ui.bg }]}
          onPress={() => router.back()}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel="חזרה"
        >
          <Ionicons name="chevron-forward" size={22} color={ui.text} />
        </TouchableOpacity>

        <View style={styles.headerTitles}>
          <Text style={[styles.headerTitle, { color: ui.text }]}>הודעות אוטומטיות</Text>
          <Text style={[styles.headerSubtitle, { color: ui.muted }]} numberOfLines={1}>
            {`של ${getEventOwnerLabel(event, ownerName)}`}
          </Text>
        </View>

        <View style={{ width: 40, height: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.note, { backgroundColor: ui.card, borderColor: ui.border }]}>
          <Ionicons name="information-circle-outline" size={18} color={ui.primary} />
          <Text style={[styles.noteText, { color: ui.muted }]}>נציין כי לפעמים תהיה חריגה של יום/יומיים בביצוע השיחות</Text>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: ui.text }]}>הודעות רגילות</Text>
          <View style={[styles.sectionPill, { backgroundColor: 'rgba(6,127,249,0.10)', borderColor: 'rgba(6,127,249,0.20)' }]}>
            <Text style={[styles.sectionPillText, { color: ui.primary }]}>SMS</Text>
          </View>
        </View>
        <View style={styles.stack}>
          {regular.map((r) => (
            <CardRow key={r.notification_type} row={r} variant="regular" />
          ))}
        </View>

        <View style={[styles.sectionHeader, { marginTop: 18 }]}>
          <Text style={[styles.sectionTitle, { color: ui.text }]}>הודעות וואטסאפ</Text>
          <View style={[styles.sectionPill, { backgroundColor: 'rgba(22,163,74,0.10)', borderColor: 'rgba(22,163,74,0.20)' }]}>
            <Text style={[styles.sectionPillText, { color: ui.whatsapp }]}>WhatsApp</Text>
          </View>
        </View>
        <View style={styles.stack}>
          {whatsapp.map((r) => (
            <CardRow key={r.notification_type} row={r} variant="whatsapp" />
          ))}
        </View>

        <View style={{ height: 28 }} />
      </ScrollView>

      <Modal animationType="fade" transparent visible={editVisible} onRequestClose={() => setEditVisible(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setEditVisible(false)} />

          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <View style={styles.modalCenter}>
              <View style={[styles.modalCard, { backgroundColor: ui.card, borderColor: ui.border }]}>
                <View style={styles.modalHeader}>
                  <TouchableOpacity
                    style={[styles.iconBtn, { backgroundColor: ui.bg, borderColor: ui.border }]}
                    onPress={() => setEditVisible(false)}
                    activeOpacity={0.9}
                    accessibilityRole="button"
                    accessibilityLabel="סגירה"
                  >
                    <Ionicons name="close" size={18} color={ui.muted} />
                  </TouchableOpacity>

                  <View style={styles.modalHeaderTitles}>
                    <Text style={[styles.modalTitle, { color: ui.text }]}>עריכת הודעה</Text>
                    <Text style={[styles.modalSubtitle, { color: ui.muted }]} numberOfLines={2}>
                      {editing?.title ?? ''}
                    </Text>
                  </View>

                  <View style={{ width: 40, height: 40 }} />
                </View>

                <View style={[styles.divider, { backgroundColor: ui.divider }]} />

                <View style={styles.modalBody}>
                  {editingRowFromStore ? (
                    <View style={styles.rowBetween}>
                      <Text style={[styles.label, { color: ui.text }]}>סטטוס הודעה</Text>
                      <View style={styles.rowInline}>
                        <Text style={[styles.value, { color: editingRowFromStore.enabled ? ui.whatsapp : ui.muted }]}>
                          {editingRowFromStore.enabled ? 'פעיל' : 'כבוי'}
                        </Text>
                        <Switch
                          value={Boolean(editingRowFromStore.enabled)}
                          onValueChange={(v) => toggleNotification(editingRowFromStore, v)}
                          disabled={Boolean(savingMap[editingRowFromStore.notification_type])}
                          trackColor={{ false: 'rgba(148,163,184,0.35)', true: 'rgba(6,127,249,0.35)' }}
                          thumbColor={editingRowFromStore.enabled ? ui.primary : '#f1f5f9'}
                        />
                      </View>
                    </View>
                  ) : null}

                  <View style={styles.block}>
                    <Text style={[styles.label, { color: ui.text }]}>תיזמון ההודעה</Text>
                    <View style={[styles.segment, { backgroundColor: ui.bg, borderColor: ui.border }]}>
                      <TouchableOpacity
                        style={[styles.segmentBtn, timingMode === 'before' && styles.segmentBtnActive]}
                        onPress={() => setTimingMode('before')}
                        activeOpacity={0.9}
                      >
                        <Text style={[styles.segmentText, { color: timingMode === 'before' ? ui.primary : ui.muted }]}>לפני האירוע</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.segmentBtn, timingMode === 'after' && styles.segmentBtnActive]}
                        onPress={() => setTimingMode('after')}
                        activeOpacity={0.9}
                      >
                        <Text style={[styles.segmentText, { color: timingMode === 'after' ? ui.primary : ui.muted }]}>אחרי האירוע</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.rowBetween}>
                      <Text style={[styles.value, { color: ui.muted }]}>ימים</Text>
                      <TextInput
                        value={editedDateText}
                        onChangeText={setEditedDateText}
                        placeholder="0"
                        placeholderTextColor={ui.faint}
                        style={[styles.numberInput, { borderColor: ui.border, color: ui.text }]}
                        keyboardType="numeric"
                        textAlign="center"
                      />
                      <Text style={[styles.value, { color: ui.muted }]}>תאריך מחושב:</Text>
                      <Text style={[styles.value, { color: ui.text, fontWeight: '900' }]}>
                        {event?.date ? formatDate(computeSendDate((event as any).date, getDraftSignedDays() as any)) : ''}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.block}>
                    <Text style={[styles.label, { color: ui.text }]}>תוכן ההודעה</Text>
                    {isWeddingEvent(event) ? (
                      <Text style={[styles.hint, { color: ui.muted }]}>{`חתן/כלה: ${getWeddingNamesLabel(event)}`}</Text>
                    ) : null}
                    <TextInput
                      value={editedMessage}
                      onChangeText={setEditedMessage}
                      placeholder="הקלד את הודעתך כאן..."
                      placeholderTextColor={ui.faint}
                      style={[styles.textarea, { backgroundColor: ui.bg, borderColor: ui.border, color: ui.text }]}
                      multiline
                      textAlign="right"
                      textAlignVertical="top"
                      writingDirection="rtl"
                    />
                    <Text style={[styles.charCount, { color: ui.muted }]}>{`${editedMessage.length}/160 תווים`}</Text>
                  </View>
                </View>

                <View style={[styles.modalFooter, { borderTopColor: ui.divider }]}>
                  <TouchableOpacity
                    style={[styles.btnSecondary, { backgroundColor: ui.bg, borderColor: ui.border }]}
                    onPress={() => setEditVisible(false)}
                    activeOpacity={0.9}
                  >
                    <Text style={[styles.btnSecondaryText, { color: ui.text }]}>ביטול</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btnPrimary, { backgroundColor: ui.primary }]}
                    onPress={saveEdit}
                    activeOpacity={0.92}
                  >
                    <Ionicons name="save-outline" size={16} color="#fff" />
                    <Text style={styles.btnPrimaryText}>שמור שינויים</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    paddingHorizontal: 18,
    paddingBottom: 12,
    flexDirection: isRTL ? 'row' : 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
  },
  headerTitles: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '900', textAlign: 'center' },
  headerSubtitle: { marginTop: 2, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  content: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 30,
    maxWidth: 520,
    alignSelf: 'center',
    width: '100%',
  },

  note: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  noteText: { flex: 1, fontSize: 12, fontWeight: '800', textAlign: 'right', lineHeight: 18 },

  sectionHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: '900', textAlign: 'right' },
  sectionPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  sectionPillText: { fontSize: 12, fontWeight: '900', textAlign: 'right' },

  stack: { gap: 12 },
  cardRow: {
    position: 'relative',
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  accentBar: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 999,
  },
  cardBody: { flex: 1, alignItems: 'flex-end' },
  cardTitle: { fontSize: 15, fontWeight: '900', textAlign: 'right' },
  metaRow: {
    marginTop: 10,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
  },
  metaLeft: { flex: 1, alignItems: 'flex-end', gap: 2 },
  metaRight: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  metaLabel: { fontSize: 12, fontWeight: '800', textAlign: 'right' },
  metaStatus: { fontSize: 12, fontWeight: '900', textAlign: 'right', minWidth: 36 },
  chevWrap: { width: 28, alignItems: 'center', justifyContent: 'center' },

  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  modalCenter: {
    width: '100%',
    maxWidth: 540,
  },
  modalCard: {
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
  },
  modalHeader: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalHeaderTitles: { flex: 1, alignItems: 'center' },
  modalTitle: { fontSize: 16, fontWeight: '900', textAlign: 'center' },
  modalSubtitle: { marginTop: 4, fontSize: 12, fontWeight: '800', textAlign: 'center' },

  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  divider: { height: 1 },
  modalBody: { padding: 14, gap: 14 },

  rowBetween: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },
  rowInline: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },

  block: { gap: 10 },
  label: { fontSize: 13, fontWeight: '900', textAlign: 'right' },
  value: { fontSize: 12, fontWeight: '800', textAlign: 'right' },
  hint: { fontSize: 12, fontWeight: '800', textAlign: 'right' },

  segment: {
    flexDirection: 'row-reverse',
    borderWidth: 1,
    borderRadius: 14,
    padding: 4,
    gap: 6,
  },
  segmentBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.10)',
  },
  segmentText: { fontSize: 12, fontWeight: '900', textAlign: 'center' },

  numberInput: {
    width: 70,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 16,
    fontWeight: '900',
    backgroundColor: '#FFFFFF',
  },

  textarea: {
    minHeight: 140,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  charCount: { fontSize: 11, fontWeight: '800', textAlign: 'left' },

  modalFooter: {
    padding: 12,
    borderTopWidth: 1,
    flexDirection: 'row-reverse',
    gap: 10,
  },
  btnSecondary: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnSecondaryText: { fontSize: 14, fontWeight: '900' },
  btnPrimary: {
    flex: 2,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row-reverse',
    gap: 8,
  },
  btnPrimaryText: { fontSize: 14, fontWeight: '900', color: '#fff' },
});

