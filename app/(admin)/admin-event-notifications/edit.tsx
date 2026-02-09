import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  I18nManager,
  Keyboard,
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
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { eventService } from '@/lib/services/eventService';
import { Event } from '@/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLayoutStore } from '@/store/layoutStore';

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
};

const NOTIFICATION_TEMPLATES: NotificationTemplate[] = [
  { notification_type: 'reminder_1', title: 'הודעה רגילה 1 (לפני האירוע)', days_from_wedding: -30, channel: 'SMS' },
  { notification_type: 'reminder_2', title: 'הודעה רגילה 2 (לפני האירוע)', days_from_wedding: -14, channel: 'SMS', defaultMessage: 'היי! האירוע בעוד שבועיים, מחכים לראות אתכם!' },
  { notification_type: 'reminder_3', title: 'הודעה רגילה 3 (לפני האירוע)', days_from_wedding: -7, channel: 'SMS', defaultMessage: 'תזכורת אחרונה: האירוע בעוד שבוע. נשמח לראותכם!' },
  { notification_type: 'whatsapp_event_day', title: 'וואטסאפ ביום האירוע', days_from_wedding: 0, channel: 'WHATSAPP', defaultMessage: 'היום האירוע! נתראה שם' },
  { notification_type: 'after_1', title: 'הודעה רגילה אחרי האירוע', days_from_wedding: 1, channel: 'SMS', defaultMessage: 'תודה שבאתם! היה לנו כיף גדול איתכם.' },
];

const isRTL = I18nManager.isRTL;

export default function AdminEventNotificationEditScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { eventId, type } = useLocalSearchParams();
  const isDark = false;
  const setTabBarVisible = useLayoutStore((s) => s.setTabBarVisible);

  useFocusEffect(
    useCallback(() => {
      // This screen uses a fixed footer; hide the admin tab bar to avoid overlap.
      setTabBarVisible(false);
      return () => setTabBarVisible(true);
    }, [setTabBarVisible])
  );

  const [event, setEvent] = useState<Event | null>(null);
  const [ownerName, setOwnerName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toggleSaving, setToggleSaving] = useState(false);

  const [row, setRow] = useState<NotificationSettingRow | null>(null);
  const [editedMessage, setEditedMessage] = useState('');
  const [editedDateText, setEditedDateText] = useState('');
  const [timingMode, setTimingMode] = useState<'before' | 'after'>('before');

  const ui = useMemo(() => {
    return isDark
      ? {
          bg: '#111827',
          card: '#1F2937',
          itemBg: '#374151',
          text: '#F9FAFB',
          muted: '#9CA3AF',
          faint: 'rgba(249,250,251,0.55)',
          border: 'rgba(255,255,255,0.12)',
          divider: 'rgba(255,255,255,0.10)',
          primary: '#3b82f6',
          whatsapp: '#25D366',
        }
      : {
          bg: '#F9FAFB',
          card: '#FFFFFF',
          itemBg: '#F3F4F6',
          text: '#111827',
          muted: '#6B7280',
          faint: '#9CA3AF',
          border: '#E5E7EB',
          divider: '#E5E7EB',
          primary: '#3b82f6',
          whatsapp: '#25D366',
        };
  }, [isDark]);

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

  const getDefaultMessageContent = (name?: string) => {
    const displayName = name && name.trim().length > 0 ? name.trim() : 'בעל/ת האירוע';
    return `הנכם מוזמנים לאירוע של ${displayName}\nפרטי האירוע ואישור הגעתכם בקישור\nנשמח לראותכם בין אורחינו.`;
  };

  const shouldReplaceLegacyFirstReminder = (msg: string) => {
    const t = String(msg || '').trim();
    if (!t) return true;
    return (
      t.includes('רצינו להזכיר') ||
      t.includes('האירוע הקרוב שלנו') ||
      t.includes('הנכם מוזמנים') ||
      t.includes('מוזמנים לאירוע')
    );
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

  const computeSendDate = (eventDateISO: string, days_from_wedding: number) => {
    const base = new Date(eventDateISO);
    const d = new Date(base);
    d.setDate(d.getDate() + days_from_wedding);
    return d;
  };

  const formatDate = (d: Date) => {
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
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

  const fetchRow = async (eventData: Event, owner: string, notificationType: string) => {
    const tpl = NOTIFICATION_TEMPLATES.find((t) => t.notification_type === notificationType);
    if (!tpl) throw new Error('סוג הודעה לא מוכר');

    const { data, error } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('event_id', eventData.id)
      .eq('notification_type', notificationType)
      .maybeSingle();

    if (error) {
      console.error('Fetch notification setting failed:', error);
    }

    if (data) {
      const existingMsg = String((data as any).message_content ?? '');
      const fixedMsg =
        notificationType === 'reminder_1' && shouldReplaceLegacyFirstReminder(existingMsg)
          ? getDefaultFirstReminderMessage(eventData, owner)
          : existingMsg;

      const next: NotificationSettingRow = {
        id: (data as any).id,
        event_id: (data as any).event_id,
        notification_type: (data as any).notification_type,
        title: String((data as any).title ?? tpl.title),
        enabled: Boolean((data as any).enabled),
        message_content: fixedMsg,
        days_from_wedding:
          typeof (data as any).days_from_wedding === 'number' ? (data as any).days_from_wedding : tpl.days_from_wedding,
        channel: ((data as any).channel as any) || tpl.channel,
      };

      setRow(next);
      setEditedMessage(next.message_content || '');
      const rawDays = typeof next.days_from_wedding === 'number' ? next.days_from_wedding : 0;
      setTimingMode(rawDays === 0 ? 'before' : rawDays < 0 ? 'before' : 'after');
      setEditedDateText(String(Math.abs(rawDays)));
      return;
    }

    const defaultMessage =
      notificationType === 'reminder_1'
        ? getDefaultFirstReminderMessage(eventData, owner)
        : (tpl.defaultMessage ?? getDefaultMessageContent(owner));

    const next: NotificationSettingRow = {
      notification_type: tpl.notification_type,
      title: tpl.title,
      enabled: false,
      message_content: defaultMessage,
      days_from_wedding: tpl.days_from_wedding,
      channel: tpl.channel,
    };

    setRow(next);
    setEditedMessage(next.message_content || '');
    const rawDays = typeof next.days_from_wedding === 'number' ? next.days_from_wedding : 0;
    setTimingMode(rawDays === 0 ? 'before' : rawDays < 0 ? 'before' : 'after');
    setEditedDateText(String(Math.abs(rawDays)));
  };

  useEffect(() => {
    const load = async () => {
      if (!eventId || typeof eventId !== 'string' || !type || typeof type !== 'string') {
        router.back();
        return;
      }

      setLoading(true);
      try {
        const eventData = await eventService.getEvent(eventId);
        if (!eventData) {
          Alert.alert('שגיאה', 'האירוע לא נמצא');
          router.back();
          return;
        }
        setEvent(eventData);
        const owner = await loadOwnerName(eventData as any);
        setOwnerName(owner);
        await fetchRow(eventData as any, owner, type);
      } catch (e) {
        console.error('Notification edit load error:', e);
        Alert.alert('שגיאה', 'לא ניתן לטעון את ההודעה');
        router.back();
      } finally {
        setLoading(false);
      }
    };

    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, type]);

  const persistEnabled = async (nextEnabled: boolean) => {
    if (!event?.id || !row) return;
    if (toggleSaving) return;

    const previous = row.enabled;
    setToggleSaving(true);
    setRow((prev) => (prev ? { ...prev, enabled: nextEnabled } : prev));

    try {
      if (row.id) {
        const { error } = await supabase.from('notification_settings').update({ enabled: nextEnabled }).eq('id', row.id);
        if (error) throw error;
        return;
      }

      const tpl = NOTIFICATION_TEMPLATES.find((t) => t.notification_type === row.notification_type);
      const draftMessage = (editedMessage || '').trim() || row.message_content;
      const draftDays =
        (() => {
          const absText = (editedDateText || '').trim();
          const abs = Number.parseInt(absText, 10);
          if (!Number.isFinite(abs)) return row.days_from_wedding;
          if (abs === 0) return 0;
          return timingMode === 'before' ? -Math.abs(abs) : Math.abs(abs);
        })() ?? row.days_from_wedding;
      const payload: any = {
        event_id: event.id,
        notification_type: row.notification_type,
        title: row.title,
        enabled: nextEnabled,
        message_content: draftMessage || getDefaultMessageContent(getEventOwnerLabel(event, ownerName)),
        days_from_wedding: typeof draftDays === 'number' ? draftDays : (tpl?.days_from_wedding ?? 0),
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

      setRow((prev) => (prev ? { ...(prev as any), ...(data as any) } : prev));
    } catch (e) {
      console.error('persistEnabled failed:', e);
      const msg = String((e as any)?.message || '');
      const isRls = String((e as any)?.code || '') === '42501' || msg.toLowerCase().includes('row-level security');
      Alert.alert('שגיאה', isRls ? 'אין הרשאה לעדכן הודעות (RLS).' : 'לא ניתן לעדכן סטטוס');
      setRow((prev) => (prev ? { ...prev, enabled: previous } : prev));
    } finally {
      setToggleSaving(false);
    }
  };

  const save = async () => {
    if (!event?.id || !row) return;
    const msg = (editedMessage || '').trim();
    if (!msg) {
      Alert.alert('שגיאה', 'יש להזין תוכן הודעה');
      return;
    }

    const absText = (editedDateText || '').trim();
    const abs = Number.parseInt(absText, 10);
    const signed =
      Number.isFinite(abs) ? (abs === 0 ? 0 : timingMode === 'before' ? -Math.abs(abs) : Math.abs(abs)) : NaN;
    const daysToSave = Number.isFinite(signed) ? signed : row.days_from_wedding;

    setSaving(true);
    try {
      if (row.id) {
        const updatePayload: any = {
          message_content: msg,
          days_from_wedding: daysToSave,
          channel: row.channel,
        };
        let { error } = await supabase.from('notification_settings').update(updatePayload).eq('id', row.id);
        if (error && isMissingColumn(error, 'channel')) {
          delete updatePayload.channel;
          const retry = await supabase.from('notification_settings').update(updatePayload).eq('id', row.id);
          error = retry.error as any;
        }
        if (error) throw error;

        setRow((prev) => (prev ? { ...prev, message_content: msg, days_from_wedding: daysToSave } : prev));
      } else {
        const tpl = NOTIFICATION_TEMPLATES.find((t) => t.notification_type === row.notification_type);
        const insertPayload: any = {
          event_id: event.id,
          notification_type: row.notification_type,
          title: row.title,
          enabled: row.enabled ?? false,
          message_content: msg,
          days_from_wedding: daysToSave,
          channel: row.channel || tpl?.channel || 'SMS',
        };
        let { data, error } = await supabase.from('notification_settings').insert(insertPayload).select().single();
        if (error && isMissingColumn(error, 'channel')) {
          delete insertPayload.channel;
          const retry = await supabase.from('notification_settings').insert(insertPayload).select().single();
          data = retry.data as any;
          error = retry.error as any;
        }
        if (error) throw error;
        setRow((prev) => (prev ? { ...(prev as any), ...(data as any) } : prev));
      }

      router.back();
    } catch (e) {
      console.error('Save notification edit failed:', e);
      const msg2 = String((e as any)?.message || '');
      const isRls = String((e as any)?.code || '') === '42501' || msg2.toLowerCase().includes('row-level security');
      Alert.alert('שגיאה', isRls ? 'אין הרשאה לשמור שינוי (RLS).' : 'לא ניתן לשמור את השינוי');
    } finally {
      setSaving(false);
    }
  };

  const variant: 'whatsapp' | 'regular' = row?.channel === 'WHATSAPP' ? 'whatsapp' : 'regular';
  const iconBg = variant === 'whatsapp' ? 'rgba(37, 211, 102, 0.12)' : 'rgba(59, 130, 246, 0.12)';
  const iconBorder = variant === 'whatsapp' ? 'rgba(37, 211, 102, 0.18)' : 'rgba(59, 130, 246, 0.18)';
  const iconColor = variant === 'whatsapp' ? ui.whatsapp : ui.primary;

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: ui.bg }]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={ui.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!row || !event) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: ui.bg }]}>
        <View style={[styles.center, { paddingHorizontal: 18 }]}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: ui.text, textAlign: 'center' }}>לא ניתן לטעון הודעה</Text>
          <TouchableOpacity style={[styles.backBtn, { marginTop: 16, backgroundColor: ui.card, borderColor: ui.border }]} onPress={() => router.back()} activeOpacity={0.9}>
            <Ionicons name="chevron-forward" size={22} color={ui.text} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const draftSignedDays = getDraftSignedDays();
  const computedDate = event?.date ? formatDate(computeSendDate((event as any).date, draftSignedDays as any)) : '';

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <SafeAreaView style={[styles.safe, { backgroundColor: ui.bg }]}>
        <View style={[styles.header, { paddingTop: Math.max(12, insets.top + 8), borderBottomColor: ui.divider }]}>
          <TouchableOpacity
            style={[styles.backBtn, { backgroundColor: ui.card, borderColor: ui.border }]}
            onPress={() => router.back()}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="חזרה"
          >
            <Ionicons name="chevron-forward" size={22} color={ui.text} />
          </TouchableOpacity>

          <View style={styles.headerTitles}>
            <Text style={[styles.headerTitle, { color: ui.text }]} numberOfLines={1}>
              עריכת הודעה
            </Text>
            <Text style={[styles.headerSubtitle, { color: ui.muted }]} numberOfLines={1}>
              {`של ${getEventOwnerLabel(event, ownerName)}`}
            </Text>
          </View>

          <View style={{ width: 40, height: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={[styles.heroCard, { backgroundColor: ui.card, borderColor: ui.border }]}>
            <View style={[styles.heroIconCircle, { backgroundColor: iconBg, borderColor: iconBorder }]}>
              <Ionicons
                name={variant === 'whatsapp' ? 'chatbubble-ellipses-outline' : 'mail-outline'}
                size={18}
                color={iconColor}
              />
            </View>
            <View style={styles.heroTextWrap}>
              <Text style={[styles.heroTitle, { color: ui.text }]}>{row.title}</Text>
              <Text style={[styles.heroMeta, { color: ui.muted }]}>{formatOffsetLabel(draftSignedDays)}</Text>
            </View>
          </View>

          <View style={[styles.blockCard, { backgroundColor: ui.card, borderColor: ui.border }]}>
            <View style={styles.rowBetween}>
              <Text style={[styles.label, { color: ui.text }]}>סטטוס הודעה</Text>
              <View style={styles.rowInline}>
                <Text style={[styles.value, { color: row.enabled ? '#16A34A' : ui.muted }]}>{row.enabled ? 'פעיל' : 'כבוי'}</Text>
                <Switch
                  value={Boolean(row.enabled)}
                  onValueChange={(v) => persistEnabled(v)}
                  disabled={toggleSaving}
                  trackColor={{ false: 'rgba(148,163,184,0.35)', true: 'rgba(59,130,246,0.35)' }}
                  thumbColor={row.enabled ? ui.primary : '#f1f5f9'}
                />
              </View>
            </View>
          </View>

          <View style={[styles.blockCard, { backgroundColor: ui.card, borderColor: ui.border }]}>
            <Text style={[styles.label, { color: ui.text }]}>תיזמון ההודעה</Text>

            <View style={[styles.segment, { backgroundColor: ui.itemBg, borderColor: ui.border }]}>
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

            <View style={[styles.daysRow, { borderColor: ui.border, backgroundColor: ui.itemBg }]}>
              <Text style={[styles.daysLabel, { color: ui.muted }]}>ימים</Text>
              <TextInput
                value={editedDateText}
                onChangeText={setEditedDateText}
                placeholder="0"
                placeholderTextColor={ui.faint}
                style={[styles.daysInput, { color: ui.text }]}
                keyboardType="numeric"
                textAlign="center"
              />
              <View style={styles.computedWrap}>
                <Text style={[styles.computedLabel, { color: ui.muted }]}>תאריך מחושב</Text>
                <Text style={[styles.computedValue, { color: ui.text }]}>{computedDate}</Text>
              </View>
            </View>
          </View>

          <View style={[styles.blockCard, { backgroundColor: ui.card, borderColor: ui.border }]}>
            <View style={styles.rowBetween}>
              <Text style={[styles.label, { color: ui.text }]}>תוכן ההודעה</Text>
              <Text style={[styles.counter, { color: ui.muted }]}>{`${editedMessage.length}/160`}</Text>
            </View>

            {isWeddingEvent(event) ? (
              <Text style={[styles.hint, { color: ui.muted }]}>{`חתן/כלה: ${getWeddingNamesLabel(event)}`}</Text>
            ) : null}

            <TextInput
              value={editedMessage}
              onChangeText={setEditedMessage}
              placeholder="הקלד את הודעתך כאן..."
              placeholderTextColor={ui.faint}
              style={[
                styles.textarea,
                { backgroundColor: ui.itemBg, borderColor: ui.border, color: ui.text },
                { writingDirection: 'rtl' },
              ]}
              multiline
              textAlign="right"
              textAlignVertical="top"
            />
          </View>

          <View style={{ height: 20 }} />
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(14, insets.bottom), borderTopColor: ui.divider, backgroundColor: ui.bg }]}>
          <TouchableOpacity
            style={[styles.footerSecondary, { backgroundColor: ui.card, borderColor: ui.border }]}
            onPress={() => router.back()}
            activeOpacity={0.9}
            disabled={saving}
          >
            <Text style={[styles.footerSecondaryText, { color: ui.text }]}>ביטול</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.footerPrimary, { backgroundColor: ui.primary }, saving && { opacity: 0.85 }]}
            onPress={save}
            activeOpacity={0.92}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Ionicons name="save-outline" size={16} color="#fff" />}
            <Text style={styles.footerPrimaryText}>{saving ? 'שומר...' : 'שמור שינויים'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    paddingHorizontal: 24,
    paddingBottom: 14,
    flexDirection: isRTL ? 'row' : 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
  },
  headerTitles: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '900', textAlign: 'center' },
  headerSubtitle: { marginTop: 2, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },

  content: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 120,
    maxWidth: 680,
    alignSelf: 'center',
    width: '100%',
    gap: 16,
  },

  heroCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  heroIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroTextWrap: { flex: 1, alignItems: 'flex-end' },
  heroTitle: { fontSize: 18, fontWeight: '900', textAlign: 'right' },
  heroMeta: { marginTop: 4, fontSize: 13, fontWeight: '700', textAlign: 'right' },

  blockCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  rowBetween: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  rowInline: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  label: { fontSize: 13, fontWeight: '900', textAlign: 'right' },
  value: { fontSize: 13, fontWeight: '900', textAlign: 'right' },
  hint: { marginTop: 8, fontSize: 12, fontWeight: '800', textAlign: 'right' },
  counter: { fontSize: 12, fontWeight: '900' },

  segment: {
    flexDirection: 'row-reverse',
    borderWidth: 1,
    borderRadius: 14,
    padding: 4,
    gap: 6,
    marginTop: 12,
  },
  segmentBtn: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.10)',
  },
  segmentText: { fontSize: 13, fontWeight: '900', textAlign: 'center' },

  daysRow: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  daysLabel: { fontSize: 12, fontWeight: '900' },
  daysInput: {
    width: 72,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.10)',
    fontSize: 16,
    fontWeight: '900',
  },
  computedWrap: { flex: 1, alignItems: 'flex-end' },
  computedLabel: { fontSize: 11, fontWeight: '900', textAlign: 'right' },
  computedValue: { marginTop: 4, fontSize: 13, fontWeight: '900', textAlign: 'right' },

  textarea: {
    marginTop: 12,
    minHeight: 220,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 22,
  },

  footer: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    flexDirection: 'row-reverse',
    gap: 10,
  },
  footerSecondary: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerSecondaryText: { fontSize: 14, fontWeight: '900' },
  footerPrimary: {
    flex: 2,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row-reverse',
    gap: 8,
  },
  footerPrimaryText: { fontSize: 14, fontWeight: '900', color: '#fff' },
});

