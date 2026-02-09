import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  I18nManager,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { eventService } from '@/lib/services/eventService';
import { Event } from '@/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

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

export default function AdminEventNotificationsScreen() {
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

  const ui = useMemo(() => {
    // Stable: no BlurView and no transparency-heavy surfaces
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

    if (error) console.error('Error fetching notification settings (admin screen):', error);

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
            if (updateError) console.warn('Failed to auto-update legacy reminder_1 message (admin):', updateError);
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
        console.error('Load admin notifications failed:', e);
        setError('שגיאה בטעינת ההודעות');
      } finally {
        setLoading(false);
      }
    };
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // Refresh when coming back from the edit screen.
  useFocusEffect(
    React.useCallback(() => {
      if (!event || !eventId || typeof eventId !== 'string') return;
      void fetchSettings(event as any, ownerName);
    }, [event?.id, eventId, ownerName])
  );

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
      console.error('Error toggling notification (admin screen):', e);
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

  const openEdit = (r: NotificationSettingRow) => {
    if (!event?.id) return;
    router.push({
      pathname: '/(admin)/admin-event-notifications/edit',
      params: { eventId: String(event.id), type: r.notification_type },
    });
  };

  const regular = notificationSettings.filter((n) => (n.channel || 'SMS') !== 'WHATSAPP');
  const whatsapp = notificationSettings.filter((n) => (n.channel || 'SMS') === 'WHATSAPP');

  const CardRow = ({ row, variant }: { row: NotificationSettingRow; variant: 'regular' | 'whatsapp' }) => {
    const isSaving = Boolean(savingMap[row.notification_type]);
    const enabled = Boolean(row.enabled);
    const borderColor = variant === 'whatsapp' ? 'rgba(37, 211, 102, 0.25)' : ui.border;
    const chevronColor = variant === 'whatsapp' ? ui.whatsapp : ui.faint;
    const statusColor = enabled ? '#16A34A' : ui.faint;

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => openEdit(row)}
        style={[styles.cardRow, { backgroundColor: ui.card, borderColor }]}
        accessibilityRole="button"
        accessibilityLabel={`עריכת ${row.title}`}
      >
        {variant === 'whatsapp' ? <View style={[styles.whatsappAccent, { backgroundColor: ui.whatsapp }]} /> : null}

        <View style={styles.cardBody}>
          <Text style={[styles.cardTitle, { color: ui.text }]} numberOfLines={2}>
            {row.title}
          </Text>

          <View style={styles.metaRow}>
            {isSaving ? (
              <ActivityIndicator size="small" color={statusColor} />
            ) : (
              <Text style={[styles.metaStatus, { color: statusColor }]}>{enabled ? 'פעיל' : 'כבוי'}</Text>
            )}
            <Text style={[styles.metaBullet, { color: isDark ? 'rgba(255,255,255,0.22)' : '#D1D5DB' }]}>•</Text>
            <Text style={[styles.metaLabel, { color: ui.muted }]} numberOfLines={1}>
              {formatOffsetLabel(row.days_from_wedding)}
            </Text>
          </View>
        </View>

          <View style={styles.chevWrap}>
          <Ionicons name="chevron-back" size={20} color={chevronColor} />
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
      <View
        style={[
          styles.header,
          {
            paddingTop: Math.max(12, insets.top + 8),
            borderBottomColor: ui.divider,
            backgroundColor: ui.bg,
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.backBtn, styles.backBtnAbs, { borderColor: ui.border, backgroundColor: ui.card }]}
          onPress={() => router.back()}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel="חזרה"
        >
          <Ionicons name="chevron-back" size={22} color={ui.text} />
        </TouchableOpacity>

        <View style={styles.headerTitles}>
          <Text style={[styles.headerTitle, { color: ui.text }]}>הודעות אוטומטיות</Text>
          <Text style={[styles.headerSubtitle, { color: ui.muted }]} numberOfLines={1}>
            {`של ${getEventOwnerLabel(event, ownerName)}`}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.note, { backgroundColor: ui.card, borderColor: ui.border }]}>
          <Ionicons name="information-circle-outline" size={18} color={ui.primary} />
          <Text style={[styles.noteText, { color: ui.muted }]}>נציין כי לפעמים תהיה חריגה של יום/יומיים בביצוע השיחות</Text>
        </View>

        <View style={styles.sectionTitleRow}>
          <View style={[styles.sectionIconCircle, styles.sectionIconCircleBlue]}>
            <Ionicons name="mail-outline" size={18} color={ui.primary} />
          </View>
          <Text style={[styles.sectionTitle, { color: ui.text }]}>הודעות רגילות</Text>
        </View>
        <View style={styles.stack}>
          {regular.map((r) => (
            <CardRow key={r.notification_type} row={r} variant="regular" />
          ))}
        </View>

        <View style={[styles.sectionTitleRow, { marginTop: 28 }]}>
          <View style={[styles.sectionIconCircle, styles.sectionIconCircleGreen]}>
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={ui.whatsapp} />
          </View>
          <Text style={[styles.sectionTitle, { color: ui.text }]}>הודעות וואטסאפ</Text>
        </View>
        <View style={styles.stack}>
          {whatsapp.map((r) => (
            <CardRow key={r.notification_type} row={r} variant="whatsapp" />
          ))}
        </View>

        <View style={{ height: 140 }} />
      </ScrollView>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    position: 'relative',
    paddingHorizontal: 24,
    paddingBottom: 14,
    alignItems: 'center',
    justifyContent: 'center',
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
  backBtnAbs: {
    position: 'absolute',
    left: 24,
    top: 0,
    zIndex: 10,
  },

  content: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 120,
    maxWidth: 560,
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
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 1,
  },
  noteText: { flex: 1, fontSize: 12, fontWeight: '800', textAlign: 'right', lineHeight: 18 },

  sectionTitleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    paddingHorizontal: 8,
    marginBottom: 14,
  },
  sectionIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  sectionIconCircleBlue: {
    backgroundColor: 'rgba(59, 130, 246, 0.10)',
    borderColor: 'rgba(59, 130, 246, 0.18)',
  },
  sectionIconCircleGreen: {
    backgroundColor: 'rgba(37, 211, 102, 0.10)',
    borderColor: 'rgba(37, 211, 102, 0.18)',
  },
  sectionTitle: { fontSize: 18, fontWeight: '900', textAlign: 'right' },

  stack: { gap: 14 },
  cardRow: {
    position: 'relative',
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 18,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
    overflow: 'hidden',
  },
  whatsappAccent: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 4,
    height: '100%',
  },
  cardBody: { flex: 1, alignItems: 'flex-end' },
  cardTitle: { fontSize: 17, fontWeight: '900', textAlign: 'right' },
  metaRow: {
    marginTop: 10,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    alignSelf: 'stretch',
  },
  metaLabel: { fontSize: 13, fontWeight: '700', textAlign: 'right' },
  metaStatus: { fontSize: 13, fontWeight: '900', textAlign: 'right' },
  metaBullet: { marginHorizontal: 10, fontSize: 14, fontWeight: '900' },
  chevWrap: { width: 28, alignItems: 'center', justifyContent: 'center' },

  // Modal styles removed: editing now opens a dedicated screen.
});

