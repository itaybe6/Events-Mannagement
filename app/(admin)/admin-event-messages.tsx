import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';

type NotificationTemplate = {
  notification_type: string;
  title: string;
  days_from_wedding: number; // negative = before, 0 = day, positive = after
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
  {
    notification_type: 'reminder_1',
    title: 'הודעה רגילה 1 (לפני האירוע)',
    days_from_wedding: -30,
    channel: 'SMS',
    defaultMessage: 'שלום! רצינו להזכיר לכם על האירוע הקרוב שלנו.',
  },
  {
    notification_type: 'reminder_2',
    title: 'הודעה רגילה 2 (לפני האירוע)',
    days_from_wedding: -14,
    channel: 'SMS',
    defaultMessage: 'היי! האירוע בעוד שבועיים, מחכים לראות אתכם!',
  },
  {
    notification_type: 'reminder_3',
    title: 'הודעה רגילה 3 (לפני האירוע)',
    days_from_wedding: -7,
    channel: 'SMS',
    defaultMessage: 'תזכורת אחרונה: האירוע בעוד שבוע. נשמח לראותכם!',
  },
  {
    notification_type: 'whatsapp_event_day',
    title: 'וואטסאפ ביום האירוע',
    days_from_wedding: 0,
    channel: 'WHATSAPP',
    defaultMessage: 'היום האירוע! נתראה שם',
  },
  {
    notification_type: 'after_1',
    title: 'הודעה רגילה אחרי האירוע',
    days_from_wedding: 1,
    channel: 'SMS',
    defaultMessage: 'תודה שבאתם! היה לנו כיף גדול איתכם.',
  },
];

const isMissingColumn = (err: any, column: string) =>
  String(err?.code) === '42703' && String(err?.message || '').toLowerCase().includes(column.toLowerCase());

function formatOffsetLabel(days: number) {
  if (days === 0) return 'ביום האירוע';
  const abs = Math.abs(days);
  return days < 0 ? `${abs} ימים לפני האירוע` : `${abs} ימים אחרי האירוע`;
}

export default function AdminEventMessagesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ eventId?: string | string[] }>();
  const eventId = useMemo(
    () => (typeof params.eventId === 'string' ? params.eventId : Array.isArray(params.eventId) ? params.eventId[0] : ''),
    [params.eventId]
  );

  const ui = useMemo(
    () => ({
      primary: '#3b82f6',
      whatsapp: '#25D366',
      bg: '#F9FAFB',
      card: '#FFFFFF',
      text: '#111827',
      sub: '#6B7280',
    }),
    []
  );

  const [loading, setLoading] = useState(true);
  const [eventTitle, setEventTitle] = useState<string>('');
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettingRow[]>([]);

  const fetchSettings = async (evtId: string) => {
    const { data: rows, error } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('event_id', evtId)
      .order('days_from_wedding', { ascending: true });

    if (error) {
      console.error('Error fetching notification settings (admin screen):', error);
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

      return {
        notification_type: tpl.notification_type,
        title: tpl.title,
        enabled: false,
        message_content: tpl.defaultMessage ?? '',
        days_from_wedding: tpl.days_from_wedding,
        channel: tpl.channel,
      };
    });

    setNotificationSettings(merged);
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!eventId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const { data, error } = await supabase.from('events').select('id, title').eq('id', eventId).maybeSingle();
        if (error) throw error;
        if (!cancelled) {
          setEventTitle(String((data as any)?.title || '').trim());
        }
        await fetchSettings(eventId);
      } catch (e) {
        console.warn('Failed to load admin automatic notifications:', e);
        if (!cancelled) {
          setEventTitle('');
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
  }, [eventId]);

  const toggleNotification = async (row: NotificationSettingRow) => {
    if (!eventId) return;
    const nextEnabled = !row.enabled;

    // optimistic UI
    setNotificationSettings((prev) =>
      prev.map((r) => (r.notification_type === row.notification_type ? { ...r, enabled: nextEnabled } : r))
    );

    try {
      if (row.id) {
        const { error } = await supabase.from('notification_settings').update({ enabled: nextEnabled }).eq('id', row.id);
        if (error) throw error;
        return;
      }

      const tpl = NOTIFICATION_TEMPLATES.find((t) => t.notification_type === row.notification_type);
      const payload: any = {
        event_id: eventId,
        notification_type: row.notification_type,
        title: row.title,
        enabled: nextEnabled,
        message_content: row.message_content || tpl?.defaultMessage || '',
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

      setNotificationSettings((prev) =>
        prev.map((r) => (r.notification_type === row.notification_type ? { ...(r as any), ...(data as any) } : r))
      );
    } catch (e) {
      console.error('Error toggling notification (admin screen):', e);
      // rollback
      setNotificationSettings((prev) =>
        prev.map((r) => (r.notification_type === row.notification_type ? { ...r, enabled: row.enabled } : r))
      );
    }
  };

  const openEdit = (row: NotificationSettingRow) => {
    if (!eventId) return;
    router.push({
      pathname: '/(admin)/notification-editor',
      params: { eventId, notificationType: row.notification_type },
    } as any);
  };

  const regular = useMemo(() => notificationSettings.filter((r) => (r.channel || 'SMS') !== 'WHATSAPP'), [notificationSettings]);
  const whatsapp = useMemo(() => notificationSettings.filter((r) => (r.channel || 'SMS') === 'WHATSAPP'), [notificationSettings]);

  const renderCardRow = (row: NotificationSettingRow, variant: 'regular' | 'whatsapp') => {
    const statusLabel = row.enabled ? 'פעיל' : 'כבוי';
    const statusColor = row.enabled ? '#16a34a' : '#9ca3af';
    const meta = formatOffsetLabel(row.days_from_wedding);

    const borderColor = variant === 'whatsapp' ? 'rgba(220,252,231,1)' : 'rgba(243,244,246,1)';

    return (
      <Pressable
        key={row.notification_type}
        onPress={() => openEdit(row)}
        style={({ pressed }: any) => [
          styles.itemCard,
          { backgroundColor: ui.card, borderColor },
          pressed ? { transform: [{ scale: 0.99 }], opacity: 0.98 } : null,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`עריכת ${row.title}`}
      >
        {variant === 'whatsapp' ? <View style={[styles.whatsappAccent, { backgroundColor: ui.whatsapp }]} /> : null}

        <View style={styles.itemMain}>
          <Text style={[styles.itemTitle, { color: ui.text }]} numberOfLines={1}>
            {row.title}
          </Text>

          <View style={styles.itemMetaRow}>
            <Pressable
              onPress={(e: any) => {
                e?.stopPropagation?.();
                e?.preventDefault?.();
                void toggleNotification(row);
              }}
              accessibilityRole="button"
              accessibilityLabel={row.enabled ? 'כיבוי הודעה' : 'הפעלת הודעה'}
              style={styles.statusBtn}
            >
              <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
            </Pressable>
            <Text style={[styles.metaDot, { color: '#d1d5db' }]}>•</Text>
            <Text style={[styles.metaText, { color: ui.sub }]} numberOfLines={1}>
              {meta}
            </Text>
          </View>
        </View>

        <View style={styles.chevronWrap}>
          <Ionicons name="chevron-back" size={18} color={variant === 'whatsapp' ? ui.whatsapp : '#9ca3af'} />
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: ui.bg }]}>
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
        <BlurView intensity={22} tint="light" style={StyleSheet.absoluteFillObject} />

        <View style={styles.headerTitles}>
          <Text style={[styles.headerTitle, { color: '#111827' }]}>הודעות אוטומטיות</Text>
          <Text style={[styles.headerSubtitle, { color: ui.sub }]} numberOfLines={1}>
            {eventTitle ? `של ${eventTitle}` : eventId ? `של ${eventId}` : ''}
          </Text>
        </View>

        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={ui.primary} />
        </View>
      ) : !eventId ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: ui.sub }]}>חסר eventId</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: 28 + Math.max(90, insets.bottom + 90) }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconWrap, { backgroundColor: 'rgba(59,130,246,0.08)' }]}>
                <Ionicons name="mail-outline" size={18} color={ui.primary} />
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
                <Ionicons name="chatbubble-ellipses-outline" size={18} color={ui.whatsapp} />
              </View>
              <Text style={[styles.sectionTitle, { color: '#1f2937' }]}>הודעות וואטסאפ</Text>
            </View>
            <View style={styles.itemsStack}>{whatsapp.map((r) => renderCardRow(r, 'whatsapp'))}</View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 13, fontWeight: '800' },

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
          position: 'sticky',
          top: 0,
          backdropFilter: 'blur(14px)',
        } as any)
      : null),
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

