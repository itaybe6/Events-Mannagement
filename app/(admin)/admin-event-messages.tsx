import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import { colors } from '@/constants/colors';

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

export default function AdminEventMessagesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ eventId?: string | string[] }>();
  const eventId = useMemo(
    () => (typeof params.eventId === 'string' ? params.eventId : Array.isArray(params.eventId) ? params.eventId[0] : ''),
    [params.eventId]
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
    const channel = (row.channel || (variant === 'whatsapp' ? 'WHATSAPP' : 'SMS')) as 'SMS' | 'WHATSAPP';
    const isWhatsapp = channel === 'WHATSAPP';
    const accent = isWhatsapp ? 'rgba(37,211,102,0.95)' : 'rgba(59,130,246,0.95)';
    const border = isWhatsapp ? 'rgba(37,211,102,0.18)' : 'rgba(59,130,246,0.18)';

    const days = typeof row.days_from_wedding === 'number' ? row.days_from_wedding : 0;
    const whenLabel =
      days === 0 ? 'ביום האירוע' : days > 0 ? `${days}+ ימים אחרי האירוע` : `${Math.abs(days)} ימים לפני האירוע`;

    const statusLabel = row.enabled ? 'פעיל' : 'כבוי';

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
                <Text style={[styles.statusText, { color: row.enabled ? accent : colors.gray[400] }]}>{statusLabel}</Text>
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

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.gray[50] }]}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : !eventId ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: colors.gray[600] }]}>חסר eventId</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: 28 + Math.max(90, insets.bottom + 90) }]}
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
                  {eventTitle ? `של ${eventTitle}` : eventId ? `של ${eventId}` : 'ניהול הודעות SMS ווואטסאפ'}
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
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 13, fontWeight: '800' },

  notifHeader: {
    flexDirection: 'row-reverse',
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
    marginBottom: 20,
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
  notifHeaderText: { flex: 1, alignItems: 'flex-end' },
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

  scroll: { flex: 1, backgroundColor: colors.gray[50] },
  content: { paddingTop: 20 },

  notificationsSection: { marginHorizontal: 20, marginBottom: 32 },
  section: { marginBottom: 28 },
  sectionHeader: {
    flexDirection: 'row-reverse',
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
    flexDirection: 'row-reverse',
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
  cardMain: { flex: 1, alignItems: 'flex-end' },
  cardTitle: { fontSize: 18, fontWeight: '800', textAlign: 'right' },
  cardMetaRow: {
    marginTop: 8,
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  statusBtn: { paddingVertical: 2 },
  statusText: { fontSize: 14, fontWeight: '800' },
  metaBullet: { marginHorizontal: 10, fontSize: 14, fontWeight: '800' },
  metaText: { fontSize: 14, fontWeight: '700' },
  cardChevron: { paddingRight: 4, paddingLeft: 8, justifyContent: 'center', alignItems: 'center' },
});

