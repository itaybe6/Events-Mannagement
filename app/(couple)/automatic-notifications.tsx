import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { eventService } from '@/lib/services/eventService';
import { useUserStore } from '@/store/userStore';
import { useEventSelectionStore } from '@/store/eventSelectionStore';
import { Event } from '@/types';

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
  { notification_type: 'reminder_1', title: 'הודעה רגילה 1 (לפני האירוע)', days_from_wedding: -30, channel: 'SMS', defaultMessage: 'שלום! רצינו להזכיר לכם על האירוע הקרוב שלנו.' },
  { notification_type: 'reminder_2', title: 'הודעה רגילה 2 (לפני האירוע)', days_from_wedding: -14, channel: 'SMS', defaultMessage: 'היי! האירוע בעוד שבועיים, מחכים לראות אתכם!' },
  { notification_type: 'reminder_3', title: 'הודעה רגילה 3 (לפני האירוע)', days_from_wedding: -7, channel: 'SMS', defaultMessage: 'תזכורת אחרונה: האירוע בעוד שבוע. נשמח לראותכם!' },
  { notification_type: 'whatsapp_event_day', title: 'וואטסאפ ביום האירוע', days_from_wedding: 0, channel: 'WHATSAPP', defaultMessage: 'היום האירוע! נתראה שם' },
  { notification_type: 'after_1', title: 'הודעה רגילה אחרי האירוע', days_from_wedding: 1, channel: 'SMS', defaultMessage: 'תודה שבאתם! היה לנו כיף גדול איתכם.' },
];

export default function AutomaticNotificationsScreen() {
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

  const ui = useMemo(() => {
    // Light-only palette (always white UI)
    const primary = '#3b82f6';
    const whatsapp = '#25D366';
    const bg = '#F9FAFB';
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

  const formatOffsetLabel = (days: number) => {
    if (days === 0) return 'ביום האירוע';
    const abs = Math.abs(days);
    return days < 0 ? `${abs} ימים לפני האירוע` : `${abs} ימים אחרי האירוע`;
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

  const fetchSettings = async (event_id: string, eventDateISO: string, owner?: string) => {
    const { data: rows, error } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('event_id', event_id)
      .order('days_from_wedding', { ascending: true });

    if (error) {
      console.error('Error fetching notification settings (couple screen):', error);
    }

    const existingMap = new Map<string, any>(((rows as any[]) || []).map((r) => [r.notification_type, r]));

    const merged: NotificationSettingRow[] = NOTIFICATION_TEMPLATES.map((tpl) => {
      const existing = existingMap.get(tpl.notification_type);
      if (existing) {
        return {
          id: existing.id,
          event_id: existing.event_id,
          notification_type: existing.notification_type,
          title: existing.title ?? tpl.title,
          enabled: Boolean(existing.enabled),
          message_content: String(existing.message_content ?? ''),
          days_from_wedding: typeof existing.days_from_wedding === 'number' ? existing.days_from_wedding : tpl.days_from_wedding,
          channel: (existing.channel as any) || tpl.channel,
        };
      }

      const defaultMessage = tpl.defaultMessage ?? getDefaultMessageContent(owner);
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
          await fetchSettings((eventData as any).id, (eventData as any).date, title);
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
        const { error } = await supabase.from('notification_settings').update({ enabled: nextEnabled }).eq('id', row.id);
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

      let { data, error } = await supabase.from('notification_settings').insert(payload).select().single();
      if (error && isMissingColumn(error, 'channel')) {
        delete payload.channel;
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

  const openEdit = (row: NotificationSettingRow) => {
    if (!resolvedEventId) return;
    router.push({
      pathname: '/(couple)/notification-editor',
      params: { eventId: resolvedEventId, notificationType: row.notification_type },
    } as any);
  };

  const regular = useMemo(() => notificationSettings.filter((r) => (r.channel || 'SMS') !== 'WHATSAPP'), [notificationSettings]);
  const whatsapp = useMemo(() => notificationSettings.filter((r) => (r.channel || 'SMS') === 'WHATSAPP'), [notificationSettings]);

  const renderCardRow = (row: NotificationSettingRow, variant: 'regular' | 'whatsapp') => {
    const statusLabel = row.enabled ? 'פעיל' : 'כבוי';
    const statusColor = row.enabled ? '#16a34a' : '#9ca3af';
    const meta = event?.date
      ? `${formatOffsetLabel(row.days_from_wedding)}`
      : formatOffsetLabel(row.days_from_wedding);

    const borderColor =
      variant === 'whatsapp'
        ? 'rgba(220,252,231,1)'
        : 'rgba(243,244,246,1)';

    return (
      <TouchableOpacity
        key={row.notification_type}
        activeOpacity={0.92}
        onPress={() => openEdit(row)}
        style={[
          styles.itemCard,
          {
            backgroundColor: ui.card,
            borderColor,
          },
        ]}
      >
        {variant === 'whatsapp' ? <View style={[styles.whatsappAccent, { backgroundColor: ui.whatsapp }]} /> : null}

        <View style={styles.itemMain}>
          <Text style={[styles.itemTitle, { color: ui.text }]} numberOfLines={1}>
            {row.title}
          </Text>

          <View style={styles.itemMetaRow}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => toggleNotification(row)}
              style={styles.statusBtn}
              accessibilityRole="button"
              accessibilityLabel={row.enabled ? 'כיבוי הודעה' : 'הפעלת הודעה'}
            >
              <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
            </TouchableOpacity>
            <Text style={[styles.metaDot, { color: '#d1d5db' }]}>•</Text>
            <Text style={[styles.metaText, { color: ui.sub }]} numberOfLines={1}>
              {meta}
            </Text>
          </View>
        </View>

        <View style={styles.chevronWrap}>
          <Ionicons
            name="chevron-back"
            size={18}
            color={variant === 'whatsapp' ? ui.whatsapp : '#9ca3af'}
          />
        </View>
      </TouchableOpacity>
    );
  };

  if (loading || !event) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: ui.bg }]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={ui.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: ui.bg }]}>
      {/* Sticky header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: Math.max(12, insets.top + 12),
            backgroundColor: 'rgba(249,250,251,0.95)',
            borderBottomColor: 'rgba(243,244,246,1)',
          },
        ]}
      >
        {/* Native blur (web uses backdropFilter below) */}
        <BlurView intensity={22} tint="light" style={StyleSheet.absoluteFillObject} />

        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.92}
          style={[
            styles.backBtn,
            {
              backgroundColor: '#FFFFFF',
              borderColor: 'rgba(243,244,246,1)',
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="חזרה"
        >
          <Ionicons name="chevron-forward" size={20} color={'#4b5563'} />
        </TouchableOpacity>

        <View style={styles.headerTitles}>
          <Text style={[styles.headerTitle, { color: '#111827' }]}>הודעות אוטומטיות</Text>
          <Text style={[styles.headerSubtitle, { color: ui.sub }]} numberOfLines={1}>
            {`של ${ownerTitle || 'בעל/ת האירוע'}`}
          </Text>
        </View>

        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: 28 + Math.max(90, insets.bottom + 90) }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Regular */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View
              style={[
                styles.sectionIconWrap,
                { backgroundColor: 'rgba(59,130,246,0.08)' },
              ]}
            >
              <Ionicons name="mail-outline" size={18} color={ui.primary} />
            </View>
            <Text style={[styles.sectionTitle, { color: '#1f2937' }]}>הודעות רגילות</Text>
          </View>

          <View style={styles.itemsStack}>
            {regular.map((r) => renderCardRow(r, 'regular'))}
          </View>
        </View>

        {/* WhatsApp */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View
              style={[
                styles.sectionIconWrap,
                {
                  backgroundColor: 'rgba(34,197,94,0.10)',
                  borderColor: 'rgba(220,252,231,1)',
                  borderWidth: 1,
                },
              ]}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={ui.whatsapp} />
            </View>
            <Text style={[styles.sectionTitle, { color: '#1f2937' }]}>הודעות וואטסאפ</Text>
          </View>

          <View style={styles.itemsStack}>
            {whatsapp.map((r) => renderCardRow(r, 'whatsapp'))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    position: 'relative',
    zIndex: 20,
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...(typeof document !== 'undefined'
      ? ({
          // @ts-expect-error web-only
          position: 'sticky',
          // @ts-expect-error web-only
          top: 0,
          // @ts-expect-error web-only
          backdropFilter: 'blur(14px)',
        } as any)
      : null),
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  headerTitles: { flex: 1, alignItems: 'center', paddingHorizontal: 12 },
  headerTitle: { fontSize: 18, fontWeight: '900', textAlign: 'center' },
  headerSubtitle: { marginTop: 3, fontSize: 12, fontWeight: '700', textAlign: 'center' },

  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 16,
    paddingTop: 18,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    gap: 22,
  },

  section: {},
  sectionHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'flex-start', gap: 10, paddingHorizontal: 6, marginBottom: 12 },
  sectionIconWrap: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 18, fontWeight: '900', textAlign: 'right' },
  itemsStack: { gap: 14 },

  itemCard: {
    position: 'relative',
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderWidth: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
    overflow: 'hidden',
  },
  whatsappAccent: { position: 'absolute', top: 0, right: 0, height: '100%', width: 4 },
  itemMain: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
  itemTitle: { fontSize: 18, fontWeight: '900', textAlign: 'right', marginBottom: 8, writingDirection: 'rtl' },
  itemMetaRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'flex-start' },
  statusBtn: { paddingVertical: 2 },
  statusText: { fontSize: 14, fontWeight: '900', textAlign: 'right' },
  metaDot: { marginHorizontal: 10, fontSize: 14, fontWeight: '900' },
  metaText: { fontSize: 14, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  chevronWrap: { paddingRight: 8, paddingLeft: 4, alignItems: 'center', justifyContent: 'center' },
});

