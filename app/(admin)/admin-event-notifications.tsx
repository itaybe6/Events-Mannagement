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
import { BlurView } from 'expo-blur';
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
  // 3 regular (SMS) before the event
  { notification_type: 'reminder_1', title: 'הודעה רגילה 1 (לפני האירוע)', days_from_wedding: -30, channel: 'SMS' },
  { notification_type: 'reminder_2', title: 'הודעה רגילה 2 (לפני האירוע)', days_from_wedding: -14, channel: 'SMS', defaultMessage: 'היי! האירוע בעוד שבועיים, מחכים לראות אתכם!' },
  { notification_type: 'reminder_3', title: 'הודעה רגילה 3 (לפני האירוע)', days_from_wedding: -7, channel: 'SMS', defaultMessage: 'תזכורת אחרונה: האירוע בעוד שבוע. נשמח לראותכם!' },
  // 1 WhatsApp on the event day
  { notification_type: 'whatsapp_event_day', title: 'וואטסאפ ביום האירוע', days_from_wedding: 0, channel: 'WHATSAPP', defaultMessage: 'היום האירוע! נתראה שם' },
  // 1 regular (SMS) after the event
  { notification_type: 'after_1', title: 'הודעה רגילה אחרי האירוע', days_from_wedding: 1, channel: 'SMS', defaultMessage: 'תודה שבאתם! היה לנו כיף גדול איתכם.' },
];

export default function AdminEventNotificationsScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams();
  const insets = useSafeAreaInsets();

  const [event, setEvent] = useState<Event | null>(null);
  const [ownerName, setOwnerName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});

  const [notificationSettings, setNotificationSettings] = useState<NotificationSettingRow[]>([]);

  const [editVisible, setEditVisible] = useState(false);
  const [editing, setEditing] = useState<NotificationSettingRow | null>(null);
  const [editedMessage, setEditedMessage] = useState('');
  // Absolute days value. Direction is controlled by `timingMode`.
  const [editedDateText, setEditedDateText] = useState(''); // e.g. "30"
  const [timingMode, setTimingMode] = useState<'before' | 'after'>('before');

  const ui = useMemo(
    () => ({
      bg: '#F9FAFB',
      card: '#FFFFFF',
      text: '#111827',
      muted: '#6B7280',
      primary: '#3b82f6',
      whatsapp: '#25D366',
      border: 'rgba(17,24,39,0.08)',
      divider: 'rgba(17,24,39,0.06)',
      headerFill: 'rgba(249,250,251,0.92)',
    }),
    []
  );

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
    // Replace only known/legacy defaults so we don't overwrite user-custom content.
    return (
      t.includes('רצינו להזכיר') ||
      t.includes('האירוע הקרוב שלנו') ||
      t.includes('הנכם מוזמנים') ||
      t.includes('מוזמנים לאירוע')
    );
  };

  const getDefaultFirstReminderMessage = (eventData: Event | null, owner?: string) => {
    const title = String((eventData as any)?.title ?? '').toLowerCase();
    const ownerName = (owner || '').trim() || 'בעל/ת האירוע';
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

    const weddingLabel = groom && bride ? `לחתונה של ${groom} ול${bride}` : `לחתונה של ${ownerName}`;

    const label =
      kind === 'wedding'
        ? weddingLabel
        : kind === 'brit'
          ? `לברית של ${ownerName}`
          : kind === 'barMitzvah'
            ? `לבר מצווה של ${ownerName}`
            : kind === 'batMitzvah'
              ? `לבת מצווה של ${ownerName}`
              : kind === 'henna'
                ? `לחינה של ${ownerName}`
                : `לאירוע של ${ownerName}`;

    const dateText = (eventData as any)?.date ? new Date((eventData as any).date).toLocaleDateString('he-IL') : '';

    // RSVP link: pull from events.rsvp_link when available.
    const explicitLink = String((eventData as any)?.rsvpLink ?? (eventData as any)?.rsvp_link ?? '').trim();
    const base = 'https://i.e2grsvp.com/e/';
    const link = explicitLink || `${base}${String((eventData as any)?.id ?? '').trim()}`;

    // Match screenshot structure (link in its own line).
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
    const { data, error } = await supabase
      .from('users')
      .select('name')
      .eq('id', (eventData as any).user_id)
      .single();
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
      console.error('Error fetching notification settings (admin screen):', error);
    }

    const existingMap = new Map<string, any>(((rows as any[]) || []).map(r => [r.notification_type, r]));
    const legacyFixes: Array<{ id: string; message_content: string }> = [];

    const merged: NotificationSettingRow[] = NOTIFICATION_TEMPLATES.map(tpl => {
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
            days_from_wedding:
              typeof existing.days_from_wedding === 'number'
                ? existing.days_from_wedding
                : tpl.days_from_wedding,
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
          days_from_wedding:
            typeof existing.days_from_wedding === 'number'
              ? existing.days_from_wedding
              : tpl.days_from_wedding,
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

    // Best-effort: persist the fixed default for legacy reminder_1 rows.
    if (legacyFixes.length) {
      legacyFixes.forEach((fix) => {
        supabase
          .from('notification_settings')
          .update({ message_content: fix.message_content })
          .eq('id', fix.id)
          .then(({ error: updateError }) => {
            if (updateError) {
              console.warn('Failed to auto-update legacy reminder_1 message (admin):', updateError);
            }
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
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const toggleNotification = async (row: NotificationSettingRow) => {
    if (!event?.id) return;
    if (savingMap[row.notification_type]) return;

    const nextEnabled = !row.enabled;
    const previousEnabled = row.enabled;

    // Optimistic UI: update immediately, then persist in background.
    setSavingMap(prev => ({ ...prev, [row.notification_type]: true }));
    setNotificationSettings(prev =>
      prev.map(r => (r.notification_type === row.notification_type ? { ...r, enabled: nextEnabled } : r))
    );

    try {
      if (row.id) {
        const { error } = await supabase.from('notification_settings').update({ enabled: nextEnabled }).eq('id', row.id);
        if (error) throw error;
        return;
      }

      const tpl = NOTIFICATION_TEMPLATES.find(t => t.notification_type === row.notification_type);
      const payload: any = {
        event_id: event.id,
        notification_type: row.notification_type,
        title: row.title,
        enabled: nextEnabled,
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
      setNotificationSettings(prev => prev.map(r => (r.notification_type === row.notification_type ? { ...(r as any), ...(data as any) } : r)));
    } catch (e) {
      console.error('Error toggling notification (admin screen):', e);
      const msg = String((e as any)?.message || '');
      const isRls = String((e as any)?.code || '') === '42501' || msg.toLowerCase().includes('row-level security');
      Alert.alert('שגיאה', isRls ? 'אין הרשאה לעדכן הודעות (RLS). צריך להוסיף Policy בסופאבייס.' : 'לא ניתן לעדכן את ההודעה');

      // Revert optimistic UI on failure.
      setNotificationSettings(prev =>
        prev.map(r => (r.notification_type === row.notification_type ? { ...r, enabled: previousEnabled } : r))
      );
    } finally {
      setSavingMap(prev => ({ ...prev, [row.notification_type]: false }));
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
    return (
      notificationSettings.find(r => r.notification_type === editing.notification_type) ?? editing
    );
  }, [notificationSettings, editing]);

  // Keep `editing` meta (id/enabled/channel) in sync with store updates,
  // without overriding the draft fields (message + days) the user is editing.
  useEffect(() => {
    if (!editVisible || !editing) return;
    const latest = notificationSettings.find(r => r.notification_type === editing.notification_type);
    if (!latest) return;
    setEditing(prev => {
      if (!prev || prev.notification_type !== latest.notification_type) return prev;
      if (
        prev.id === latest.id &&
        prev.enabled === latest.enabled &&
        prev.channel === latest.channel &&
        prev.event_id === latest.event_id
      ) {
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
        setNotificationSettings(prev =>
          prev.map(r =>
            r.notification_type === editing.notification_type
              ? { ...r, message_content: msg, days_from_wedding: daysToSave }
              : r
          )
        );
      } else {
        const insertPayload: any = {
          event_id: event.id,
          notification_type: editing.notification_type,
          title: editing.title,
          enabled: editing.enabled ?? false,
          message_content: msg,
          days_from_wedding: daysToSave,
          channel: editing.channel || (NOTIFICATION_TEMPLATES.find(t => t.notification_type === editing.notification_type)?.channel ?? 'SMS'),
        };
        let { data, error } = await supabase.from('notification_settings').insert(insertPayload).select().single();
        if (error && isMissingColumn(error, 'channel')) {
          delete insertPayload.channel;
          const retry = await supabase.from('notification_settings').insert(insertPayload).select().single();
          data = retry.data as any;
          error = retry.error as any;
        }
        if (error) throw error;
        setNotificationSettings(prev => prev.map(r => (r.notification_type === editing.notification_type ? { ...(r as any), ...(data as any) } : r)));
      }
      setEditVisible(false);
    } catch (e) {
      console.error('Error saving notification edit (admin screen):', e);
      const msg = String((e as any)?.message || '');
      const isRls = String((e as any)?.code || '') === '42501' || msg.toLowerCase().includes('row-level security');
      Alert.alert('שגיאה', isRls ? 'אין הרשאה לשמור שינוי (RLS). צריך להוסיף Policy בסופאבייס.' : 'לא ניתן לשמור את השינוי');
    }
  };

  const regular = notificationSettings.filter(n => (n.channel || 'SMS') !== 'WHATSAPP');
  const whatsapp = notificationSettings.filter(n => (n.channel || 'SMS') === 'WHATSAPP');

  const stop = (e: any) => e?.stopPropagation?.();

  const renderCardRow = (row: NotificationSettingRow, variant: 'regular' | 'whatsapp') => {
    const isSaving = Boolean(savingMap[row.notification_type]);
    const enabled = Boolean(row.enabled);

    const statusColor = enabled ? '#16A34A' : 'rgba(17,24,39,0.40)';

    return (
      <TouchableOpacity
        key={row.notification_type}
        style={[
          styles.cardRow,
          { backgroundColor: ui.card, borderColor: ui.border },
          variant === 'whatsapp' ? styles.cardRowWhatsapp : null,
        ]}
        activeOpacity={0.92}
        onPress={() => openEdit(row)}
        accessibilityRole="button"
        accessibilityLabel={`עריכת ${row.title}`}
      >
        {variant === 'whatsapp' ? <View style={[styles.whatsappAccent, { backgroundColor: ui.whatsapp }]} /> : null}

        <View style={styles.cardMain}>
          <Text style={[styles.cardTitle, { color: ui.text }]} numberOfLines={2}>
            {row.title}
          </Text>

          <View style={styles.cardMetaRow}>
            <TouchableOpacity
              onPress={(e) => {
                stop(e);
                toggleNotification(row);
              }}
              onPressIn={stop}
              activeOpacity={0.9}
              disabled={isSaving}
              style={styles.metaStatusBtn}
              accessibilityRole="button"
              accessibilityLabel={enabled ? 'כיבוי הודעה' : 'הפעלת הודעה'}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color={statusColor} />
              ) : (
                <Text style={[styles.metaStatusText, { color: statusColor }]}>{enabled ? 'פעיל' : 'כבוי'}</Text>
              )}
            </TouchableOpacity>
            <Text style={styles.metaBullet}>•</Text>
            <Text style={[styles.metaOffsetText, { color: ui.muted }]} numberOfLines={1}>
              {formatOffsetLabel(row.days_from_wedding)}
            </Text>
          </View>
        </View>

        <View style={styles.cardChevronRight}>
          <Ionicons name="chevron-back" size={20} color={'rgba(17,24,39,0.35)'} />
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
          <TouchableOpacity
            style={[styles.backBtn, { marginTop: 16 }]}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="חזרה"
          >
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
          <TouchableOpacity
            style={[styles.backBtn, { marginTop: 16 }]}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="חזרה"
          >
            <Ionicons name="chevron-forward" size={22} color={ui.text} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: ui.bg }]}>
      <View style={[styles.headerWrap, { paddingTop: Math.max(10, insets.top + 8) }]}>
        <BlurView intensity={24} tint="light" style={[styles.headerBlur, { backgroundColor: ui.headerFill }]} />
        <View style={[styles.header, { borderBottomColor: 'rgba(17,24,39,0.06)' }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.85}>
            <Ionicons name="chevron-forward" size={22} color={ui.text} />
          </TouchableOpacity>
          <View style={styles.headerTitles}>
            <Text style={[styles.headerTitle, { color: ui.text }]}>הודעות אוטומטיות</Text>
            <Text style={[styles.headerSubtitle, { color: 'rgba(17,24,39,0.55)' }]} numberOfLines={1}>
              {`של ${getEventOwnerLabel(event, ownerName)}`}
            </Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Regular */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: ui.text }]}>הודעות רגילות</Text>
          <View style={[styles.sectionIconCircle, { backgroundColor: 'rgba(59,130,246,0.10)', borderColor: 'rgba(59,130,246,0.18)' }]}>
            <Ionicons name="mail-outline" size={16} color={ui.primary} />
          </View>
        </View>
        <View style={styles.cardsStack}>
          {regular.map(r => renderCardRow(r, 'regular'))}
        </View>

        {/* WhatsApp */}
        <View style={[styles.sectionHeader, { marginTop: 18 }]}>
          <Text style={[styles.sectionTitle, { color: ui.text }]}>הודעות וואטסאפ</Text>
          <View style={[styles.sectionIconCircle, { backgroundColor: 'rgba(37,211,102,0.10)', borderColor: 'rgba(37,211,102,0.18)' }]}>
            <Ionicons name="chatbubble-ellipses-outline" size={16} color={ui.whatsapp} />
          </View>
        </View>
        <View style={styles.cardsStack}>
          {whatsapp.map(r => renderCardRow(r, 'whatsapp'))}
        </View>
      </ScrollView>

      <Modal animationType="fade" transparent visible={editVisible} onRequestClose={() => setEditVisible(false)}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <View style={styles.modalOverlayTouchable} />
          </TouchableWithoutFeedback>

          <View style={[styles.modalCard, { borderColor: ui.border }]}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => {
                  Keyboard.dismiss();
                  setEditVisible(false);
                }}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="סגירה"
              >
                <Ionicons name="close" size={18} color={'rgba(17,24,39,0.60)'} />
              </TouchableOpacity>

              <View style={styles.modalHeaderTitles}>
                <Text style={styles.modalTitle}>עריכת הודעה</Text>
                <Text style={styles.modalSubtitle} numberOfLines={2}>
                  {editing?.title ?? ''}
                </Text>
              </View>
              <View style={{ width: 40 }} />
            </View>

            <View style={styles.modalDivider} />

            {/* Body */}
            <View style={styles.modalBody}>
              {/* Enabled toggle */}
              {editingRowFromStore ? (
                <View style={styles.statusRow}>
                  <Text style={styles.blockLabel}>סטטוס הודעה</Text>
                  <View style={styles.statusToggleWrap}>
                    <Text
                      style={[
                        styles.statusToggleLabel,
                        { color: editingRowFromStore.enabled ? '#16A34A' : 'rgba(17,24,39,0.55)' },
                      ]}
                    >
                      {editingRowFromStore.enabled ? 'פעיל' : 'כבוי'}
                    </Text>

                    <TouchableOpacity
                      style={[
                        styles.switchTrack,
                        editingRowFromStore.enabled ? styles.switchTrackOn : styles.switchTrackOff,
                        savingMap[editingRowFromStore.notification_type] ? { opacity: 0.75 } : null,
                      ]}
                      activeOpacity={0.9}
                      disabled={Boolean(savingMap[editingRowFromStore.notification_type])}
                      onPress={() => toggleNotification(editingRowFromStore)}
                      accessibilityRole="switch"
                      accessibilityState={{
                        checked: Boolean(editingRowFromStore.enabled),
                        disabled: Boolean(savingMap[editingRowFromStore.notification_type]),
                      }}
                      accessibilityLabel="הפעלת/כיבוי הודעה"
                    >
                      <View
                        style={[
                          styles.switchThumb,
                          savingMap[editingRowFromStore.notification_type]
                            ? styles.switchThumbLoading
                            : I18nManager.isRTL
                              ? (editingRowFromStore.enabled ? styles.switchThumbRtlOn : styles.switchThumbRtlOff)
                              : (editingRowFromStore.enabled ? styles.switchThumbLtrOn : styles.switchThumbLtrOff),
                        ]}
                      >
                        {savingMap[editingRowFromStore.notification_type] ? (
                          <ActivityIndicator size="small" color={'rgba(17,24,39,0.55)'} />
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              {/* Timing */}
              <View style={styles.block}>
                <Text style={styles.blockLabel}>תיזמון ההודעה</Text>
                <View style={styles.segmentWrap}>
                  <TouchableOpacity
                    style={[styles.segmentBtn, timingMode === 'before' ? styles.segmentBtnActive : null]}
                    onPress={() => setTimingMode('before')}
                    activeOpacity={0.9}
                    accessibilityRole="button"
                    accessibilityLabel="לפני האירוע"
                  >
                    <Text style={[styles.segmentText, timingMode === 'before' ? styles.segmentTextActive : null]}>
                      לפני האירוע
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.segmentBtn, timingMode === 'after' ? styles.segmentBtnActive : null]}
                    onPress={() => setTimingMode('after')}
                    activeOpacity={0.9}
                    accessibilityRole="button"
                    accessibilityLabel="אחרי האירוע"
                  >
                    <Text style={[styles.segmentText, timingMode === 'after' ? styles.segmentTextActive : null]}>
                      אחרי האירוע
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.daysRow}>
                  <View style={styles.daysInputWrap}>
                    <Ionicons name="calendar-outline" size={18} color={'rgba(17,24,39,0.45)'} style={styles.daysIcon} />
                    <TextInput
                      value={editedDateText}
                      onChangeText={setEditedDateText}
                      placeholder="0"
                      placeholderTextColor={'rgba(17,24,39,0.35)'}
                      style={styles.daysInput}
                      keyboardType="numeric"
                      autoCapitalize="none"
                      autoCorrect={false}
                      textAlign="center"
                    />
                    <Text style={styles.daysSuffix}>ימים</Text>
                  </View>

                  <View style={styles.computedPill}>
                    <Text style={styles.computedLabel}>תאריך מחושב</Text>
                    <Text style={styles.computedValue}>
                      {event?.date
                        ? formatDate(computeSendDate((event as any).date, getDraftSignedDays() as any))
                        : ''}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.bodyDivider} />

              {/* Message */}
              <View style={styles.block}>
                <View style={styles.messageHeaderRow}>
                  <View style={styles.messageTools}>
                    <TouchableOpacity
                      style={styles.toolBtn}
                      activeOpacity={0.9}
                      onPress={() => setEditedMessage(prev => `${prev}${prev ? ' ' : ''}{{name}}`)}
                      accessibilityRole="button"
                      accessibilityLabel="הוסף שם"
                    >
                      <Ionicons name="person-add-outline" size={16} color={'rgba(17,24,39,0.55)'} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.toolBtn}
                      activeOpacity={0.9}
                      onPress={() => setEditedMessage(prev => `${prev}${prev ? ' ' : ''}{{groom_name}}`)}
                      accessibilityRole="button"
                      accessibilityLabel="הוסף שם חתן"
                    >
                      <Ionicons name="man-outline" size={16} color={'rgba(17,24,39,0.55)'} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.toolBtn}
                      activeOpacity={0.9}
                      onPress={() => setEditedMessage(prev => `${prev}${prev ? ' ' : ''}{{bride_name}}`)}
                      accessibilityRole="button"
                      accessibilityLabel="הוסף שם כלה"
                    >
                      <Ionicons name="woman-outline" size={16} color={'rgba(17,24,39,0.55)'} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.toolBtn}
                      activeOpacity={0.9}
                      onPress={() => setEditedMessage(prev => `${prev}${prev ? ' ' : ''}{{event_date}}`)}
                      accessibilityRole="button"
                      accessibilityLabel="הוסף תאריך"
                    >
                      <Ionicons name="calendar-outline" size={16} color={'rgba(17,24,39,0.55)'} />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.blockLabel}>תוכן ההודעה</Text>
                </View>

                {isWeddingEvent(event) ? (
                  <Text style={{ marginTop: -2, fontSize: 12, fontWeight: '800', color: 'rgba(17,24,39,0.55)', textAlign: 'right' }}>
                    {`חתן/כלה: ${getWeddingNamesLabel(event)}`}
                  </Text>
                ) : null}

                <View style={styles.textareaWrap}>
                  <TextInput
                    value={editedMessage}
                    onChangeText={setEditedMessage}
                    placeholder="הקלד את הודעתך כאן..."
                    placeholderTextColor={'rgba(17,24,39,0.35)'}
                    style={styles.textarea}
                    multiline
                    textAlign="right"
                    textAlignVertical="top"
                    writingDirection="rtl"
                  />
                  <View style={styles.charCountPill}>
                    <Text style={styles.charCountText}>{`${editedMessage.length}/160 תווים`}</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Footer */}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.footerBtnSecondary}
                onPress={() => setEditVisible(false)}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityLabel="ביטול"
              >
                <Text style={styles.footerBtnSecondaryText}>ביטול</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.footerBtnPrimary}
                onPress={saveEdit}
                activeOpacity={0.92}
                accessibilityRole="button"
                accessibilityLabel="שמור שינויים"
              >
                <Ionicons name="save-outline" size={16} color="#fff" />
                <Text style={styles.footerBtnPrimaryText}>שמור שינויים</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  headerWrap: {
    position: 'relative',
    zIndex: 5,
  },
  headerBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  header: {
    paddingHorizontal: 18,
    paddingBottom: 12,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.90)',
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitles: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '900', textAlign: 'center' },
  headerSubtitle: { marginTop: 4, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  headerSpacer: { width: 40, height: 40 },

  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 140,
    gap: 8,
    maxWidth: 520,
    alignSelf: 'center',
    width: '100%',
  },

  sectionHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    paddingHorizontal: 4,
    marginTop: 10,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 18, fontWeight: '900', textAlign: 'right' },
  sectionIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  cardsStack: { gap: 12 },

  cardRow: {
    position: 'relative',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 18,
    paddingHorizontal: 18,
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  cardRowWhatsapp: {
    borderColor: 'rgba(37,211,102,0.18)',
  },
  whatsappAccent: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 4,
    height: '100%',
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
  },
  cardMain: { flex: 1, alignItems: 'flex-end' },
  cardTitle: { fontSize: 18, fontWeight: '900', textAlign: 'right' },
  cardMetaRow: {
    marginTop: 8,
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  metaStatusBtn: { paddingVertical: 2 },
  metaStatusText: { fontSize: 14, fontWeight: '900' },
  metaBullet: { marginHorizontal: 10, color: 'rgba(17,24,39,0.22)', fontSize: 14, fontWeight: '900' },
  metaOffsetText: { fontSize: 14, fontWeight: '700' },
  cardChevronRight: {
    paddingRight: 4,
    paddingLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  modalOverlayTouchable: { ...StyleSheet.absoluteFillObject },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.98)',
    padding: 0,
    borderWidth: 1,
    shadowColor: colors.black,
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
    overflow: 'hidden',
  },
  modalHeader: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  modalCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: 'rgba(17,24,39,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalHeaderTitles: { flex: 1, alignItems: 'center', paddingHorizontal: 10 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#111827', textAlign: 'center' },
  modalSubtitle: { marginTop: 6, fontSize: 14, fontWeight: '700', color: 'rgba(17,24,39,0.55)', textAlign: 'center' },
  modalDivider: { height: 1, backgroundColor: 'rgba(17,24,39,0.08)', marginHorizontal: 18 },
  modalBody: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 18, gap: 16 },
  block: { gap: 10 },
  blockLabel: { fontSize: 13, fontWeight: '900', color: '#111827', textAlign: 'right' },

  statusRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusToggleWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  statusToggleLabel: { fontSize: 13, fontWeight: '900' },

  switchTrack: {
    width: 54,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    position: 'relative',
  },
  switchTrackOn: {
    backgroundColor: 'rgba(59,130,246,0.95)',
    borderColor: 'rgba(59,130,246,0.55)',
  },
  switchTrackOff: {
    backgroundColor: 'rgba(17,24,39,0.12)',
    borderColor: 'rgba(17,24,39,0.14)',
  },
  switchThumb: {
    position: 'absolute',
    top: 2,
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    shadowColor: colors.black,
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  switchThumbLoading: {
    left: 13,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  // Thumb positioning (use left to be consistent on web)
  switchThumbLtrOff: { left: 2 },
  switchThumbLtrOn: { left: 24 },
  switchThumbRtlOff: { left: 24 },
  switchThumbRtlOn: { left: 2 },

  segmentWrap: {
    flexDirection: 'row-reverse',
    gap: 8,
    padding: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(17,24,39,0.04)',
  },
  segmentBtn: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  segmentText: { fontSize: 13, fontWeight: '800', color: 'rgba(17,24,39,0.55)' },
  segmentTextActive: { color: '#1d4ed8' },

  daysRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  daysInputWrap: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.10)',
    justifyContent: 'center',
  },
  daysIcon: { position: 'absolute', right: 12 },
  daysSuffix: { position: 'absolute', left: 12, fontSize: 12, fontWeight: '700', color: 'rgba(17,24,39,0.55)' },
  daysInput: {
    paddingHorizontal: 40,
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
    height: 52,
  },
  computedPill: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(29,78,216,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(29,78,216,0.14)',
    alignItems: 'flex-end',
    minWidth: 128,
  },
  computedLabel: { fontSize: 11, fontWeight: '800', color: 'rgba(29,78,216,0.75)' },
  computedValue: { marginTop: 4, fontSize: 13, fontWeight: '900', color: 'rgba(29,78,216,0.95)' },

  bodyDivider: { height: 1, backgroundColor: 'rgba(17,24,39,0.08)' },

  messageHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  messageTools: { flexDirection: 'row-reverse', gap: 8 },
  toolBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(17,24,39,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textareaWrap: { position: 'relative' },
  textarea: {
    borderWidth: 0,
    backgroundColor: 'rgba(17,24,39,0.04)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    minHeight: 140,
    lineHeight: 20,
  },
  charCountPill: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.08)',
  },
  charCountText: { fontSize: 11, fontWeight: '800', color: 'rgba(17,24,39,0.55)' },

  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(17,24,39,0.08)',
    flexDirection: 'row-reverse',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.98)',
  },
  footerBtnSecondary: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(17,24,39,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerBtnSecondaryText: { fontSize: 15, fontWeight: '900', color: '#111827' },
  footerBtnPrimary: {
    flex: 2,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#1d4ed8',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row-reverse',
    gap: 8,
    shadowColor: '#1d4ed8',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  footerBtnPrimaryText: { fontSize: 15, fontWeight: '900', color: '#fff' },
});

