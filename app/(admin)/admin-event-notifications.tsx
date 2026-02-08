import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
  { notification_type: 'reminder_1', title: 'הודעה רגילה 1 (לפני האירוע)', days_from_wedding: -30, channel: 'SMS', defaultMessage: 'שלום! רצינו להזכיר לכם על האירוע הקרוב שלנו.' },
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
  const [editedDateText, setEditedDateText] = useState(''); // YYYY-MM-DD

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
    const { data, error } = await supabase
      .from('users')
      .select('name')
      .eq('id', (eventData as any).user_id)
      .single();
    if (error) return '';
    return String((data as any)?.name || '');
  };

  const fetchSettings = async (event_id: string, eventDateISO: string, owner?: string) => {
    const { data: rows, error } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('event_id', event_id)
      .order('days_from_wedding', { ascending: true });

    if (error) {
      console.error('Error fetching notification settings (admin screen):', error);
    }

    const existingMap = new Map<string, any>(((rows as any[]) || []).map(r => [r.notification_type, r]));

    const merged: NotificationSettingRow[] = NOTIFICATION_TEMPLATES.map(tpl => {
      const existing = existingMap.get(tpl.notification_type);
      if (existing) {
        return {
          id: existing.id,
          event_id: existing.event_id,
          notification_type: existing.notification_type,
          title: existing.title ?? tpl.title,
          enabled: Boolean(existing.enabled),
          message_content: String(existing.message_content ?? ''),
          days_from_wedding:
            typeof existing.days_from_wedding === 'number'
              ? existing.days_from_wedding
              : tpl.days_from_wedding,
          channel: (existing.channel as any) || tpl.channel,
        };
      }

      const defaultMessage =
        tpl.defaultMessage ?? getDefaultMessageContent(owner);

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
        if ((eventData as any)?.id && (eventData as any)?.date) {
          await fetchSettings((eventData as any).id, (eventData as any).date, name);
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
        message_content: row.message_content || getDefaultMessageContent(ownerName),
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
    setEditing(row);
    setEditedMessage(row.message_content || '');
    setEditedDateText(String(row.days_from_wedding ?? 0));
    setEditVisible(true);
  };

  const saveEdit = async () => {
    if (!event?.id || !editing) return;
    const msg = (editedMessage || '').trim();
    if (!msg) return;

    const daysText = (editedDateText || '').trim();
    const nextDays = Number.parseInt(daysText, 10);
    const daysToSave = Number.isFinite(nextDays) ? nextDays : editing.days_from_wedding;

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
    const metaText = event?.date
      ? `${formatOffsetLabel(row.days_from_wedding)} · ${formatDate(
          computeSendDate((event as any).date, row.days_from_wedding)
        )}`
      : formatOffsetLabel(row.days_from_wedding);

    const pillBg = enabled ? 'rgba(34,197,94,0.12)' : 'rgba(17,24,39,0.06)';
    const pillBorder = enabled ? 'rgba(34,197,94,0.18)' : 'rgba(17,24,39,0.10)';
    const pillText = enabled ? '#15803D' : 'rgba(17,24,39,0.55)';
    const dotColor = enabled ? '#22C55E' : 'rgba(17,24,39,0.35)';

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

        <View style={styles.cardChevron}>
          <Ionicons name="chevron-back" size={18} color={'rgba(17,24,39,0.35)'} />
        </View>

        <View style={styles.cardContent}>
          <View style={styles.cardTitleLine}>
            <Text style={[styles.cardTitle, { color: ui.text }]} numberOfLines={2}>
              {row.title}
            </Text>

            <TouchableOpacity
              onPress={(e) => {
                stop(e);
                toggleNotification(row);
              }}
              onPressIn={stop}
              activeOpacity={0.9}
              disabled={isSaving}
              style={[styles.statusPill, { backgroundColor: pillBg, borderColor: pillBorder, opacity: isSaving ? 0.75 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={enabled ? 'כיבוי הודעה' : 'הפעלת הודעה'}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color={enabled ? '#16A34A' : 'rgba(17,24,39,0.45)'} />
              ) : (
                <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
              )}
              <Text style={[styles.statusText, { color: pillText }]}>{enabled ? 'פעיל' : 'כבוי'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.cardMetaLine}>
            <View style={styles.cardMetaItem}>
              <Text style={[styles.cardMetaText, { color: ui.muted }]}>{formatOffsetLabel(row.days_from_wedding)}</Text>
              <Ionicons name="calendar-outline" size={14} color={'rgba(17,24,39,0.35)'} style={{ marginLeft: 6 }} />
            </View>

            <View style={styles.cardMetaDivider} />

            <Text style={[styles.cardMetaDate, { color: 'rgba(17,24,39,0.70)' }]}>{event?.date ? formatDate(computeSendDate((event as any).date, row.days_from_wedding)) : ''}</Text>
          </View>
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
              {`של ${ownerName || 'בעל/ת האירוע'}`}
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
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => {
                Keyboard.dismiss();
                setEditVisible(false);
              }}
            >
              <Ionicons name="close" size={18} color={'rgba(13,17,28,0.75)'} />
            </TouchableOpacity>

            <Text style={styles.modalTitle}>עריכת הודעה</Text>
            <Text style={styles.modalSubtitle}>{editing?.title ?? ''}</Text>

            <View style={styles.field}>
              <Text style={styles.label}>ימים מהאירוע (מינוס = לפני)</Text>
              <TextInput
                value={editedDateText}
                onChangeText={setEditedDateText}
                placeholder="-14"
                placeholderTextColor={'rgba(17,24,39,0.35)'}
                style={styles.input}
                keyboardType="numeric"
                autoCapitalize="none"
                autoCorrect={false}
                textAlign="left"
              />
              {event?.date ? (
                <Text style={styles.hintText}>
                  {`תאריך מחושב: ${formatDate(computeSendDate((event as any).date, Number.parseInt(editedDateText || '0', 10) || 0))}`}
                </Text>
              ) : null}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>תוכן ההודעה</Text>
              <TextInput
                value={editedMessage}
                onChangeText={setEditedMessage}
                placeholder="כתוב כאן את תוכן ההודעה..."
                placeholderTextColor={'rgba(17,24,39,0.35)'}
                style={styles.textarea}
                multiline
                textAlign="right"
                textAlignVertical="top"
                writingDirection="rtl"
              />
            </View>

            <View style={styles.buttons}>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => setEditVisible(false)} activeOpacity={0.9}>
                <Text style={styles.btnSecondaryText}>ביטול</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnPrimary} onPress={saveEdit} activeOpacity={0.9}>
                <Text style={styles.btnPrimaryText}>שמור</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
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
  cardChevron: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: 'rgba(17,24,39,0.04)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  cardContent: { flex: 1, alignItems: 'flex-end' },
  cardTitleLine: {
    width: '100%',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: '900', textAlign: 'right' },

  statusPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 72,
    justifyContent: 'center',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 99,
  },
  statusText: { fontSize: 11, fontWeight: '900' },

  cardMetaLine: {
    marginTop: 8,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    justifyContent: 'flex-end',
  },
  cardMetaItem: { flexDirection: 'row', alignItems: 'center' },
  cardMetaText: { fontSize: 12, fontWeight: '700' },
  cardMetaDivider: { width: 1, height: 14, backgroundColor: 'rgba(17,24,39,0.15)' },
  cardMetaDate: { fontSize: 12, fontWeight: '800' },

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
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.98)',
    padding: 18,
    borderWidth: 1,
    shadowColor: colors.black,
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  modalClose: {
    position: 'absolute',
    left: 12,
    top: 12,
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: 'rgba(17,24,39,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#0d111c', textAlign: 'center' },
  modalSubtitle: { marginTop: 6, fontSize: 14, fontWeight: '700', color: 'rgba(13,17,28,0.55)', textAlign: 'center' },
  field: { marginTop: 14 },
  label: { fontSize: 13, fontWeight: '800', color: 'rgba(13,17,28,0.65)', textAlign: 'right', marginBottom: 8 },
  hintText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(13,17,28,0.55)',
    textAlign: 'right',
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.12)',
    backgroundColor: 'rgba(17,24,39,0.03)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '700',
    color: '#0d111c',
  },
  textarea: {
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.12)',
    backgroundColor: 'rgba(17,24,39,0.03)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '700',
    color: '#0d111c',
    minHeight: 110,
  },
  buttons: { marginTop: 16, flexDirection: 'row-reverse', gap: 10 },
  btnPrimary: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(15,69,230,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0f45e6',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  btnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  btnSecondary: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(17,24,39,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.08)',
  },
  btnSecondaryText: { color: 'rgba(13,17,28,0.85)', fontSize: 15, fontWeight: '900' },
});

