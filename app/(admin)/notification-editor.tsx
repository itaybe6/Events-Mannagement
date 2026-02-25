import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';

import { supabase } from '@/lib/supabase';
import { useLayoutStore } from '@/store/layoutStore';

type NotificationSettingRow = {
  id?: string;
  event_id?: string;
  notification_type: string;
  title: string;
  enabled?: boolean;
  message_content?: string;
  days_from_wedding?: number;
  channel?: 'SMS' | 'WHATSAPP';
  recipient_guest_ids?: string[] | null;
};

const DEFAULT_TEMPLATES: Array<Omit<NotificationSettingRow, 'id' | 'event_id'>> = [
  { notification_type: 'reminder_1', title: 'הודעה רגילה 1 (לפני האירוע)', days_from_wedding: -30, channel: 'SMS', enabled: false, message_content: '' },
  { notification_type: 'reminder_2', title: 'הודעה רגילה 2 (לפני האירוע)', days_from_wedding: -14, channel: 'SMS', enabled: false, message_content: 'היי! האירוע בעוד שבועיים, מחכים לראות אתכם!' },
  { notification_type: 'reminder_3', title: 'הודעה רגילה 3 (לפני האירוע)', days_from_wedding: -7, channel: 'SMS', enabled: false, message_content: 'תזכורת אחרונה: האירוע בעוד שבוע. נשמח לראותכם!' },
  { notification_type: 'whatsapp_event_day', title: 'וואטסאפ ביום האירוע', days_from_wedding: 0, channel: 'WHATSAPP', enabled: false, message_content: 'היום האירוע! נתראה שם' },
  { notification_type: 'after_1', title: 'הודעה רגילה אחרי האירוע', days_from_wedding: 1, channel: 'SMS', enabled: false, message_content: 'תודה שבאתם! היה לנו כיף גדול איתכם.' },
];

function formatDate(d: Date) {
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function computeSendDate(eventDate: Date, daysOffset: number) {
  const d = new Date(eventDate);
  d.setDate(d.getDate() + daysOffset);
  return d;
}

const isMissingColumn = (err: any, column: string) =>
  String(err?.code) === '42703' && String(err?.message || '').toLowerCase().includes(column.toLowerCase());

export default function AdminNotificationEditorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setTabBarVisible } = useLayoutStore();
  const { notificationType, eventId } = useLocalSearchParams<{ notificationType?: string; eventId?: string }>();

  const resolvedEventId = useMemo(() => String(eventId || '').trim() || null, [eventId]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [eventDate, setEventDate] = useState<Date | null>(null);
  const [row, setRow] = useState<NotificationSettingRow | null>(null);

  const [timingMode, setTimingMode] = useState<'before' | 'after'>('before');
  const [editedAbsDays, setEditedAbsDays] = useState('0');
  const [editedMessage, setEditedMessage] = useState('');

  const [guestFilter, setGuestFilter] = useState<'all' | 'מגיע' | 'ממתין' | 'לא מגיע'>(
    notificationType === 'reminder_2' || notificationType === 'reminder_3' ? 'ממתין' : 'all'
  );
  const [allGuests, setAllGuests] = useState<
    Array<{ id: string; name: string; phone?: string; status: 'מגיע' | 'לא מגיע' | 'ממתין' }>
  >([]);
  const [selectedGuestIds, setSelectedGuestIds] = useState<Set<string>>(() => new Set());
  const [sendingNow, setSendingNow] = useState(false);
  const [importingPrev, setImportingPrev] = useState(false);

  const previousNotificationType = useMemo(() => {
    const nt = String(notificationType || '').trim();
    if (nt === 'reminder_2') return 'reminder_1';
    if (nt === 'reminder_3') return 'reminder_2';
    return null;
  }, [notificationType]);

  const ui = useMemo(() => {
    return {
      primary: '#1d4ed8',
      primaryHover: '#1e40af',
      bg: '#F2F4F7',
      surface: '#FFFFFF',
      surfaceMuted: '#F3F4F6',
      softBlue: '#EFF6FF',
      text: '#111827',
      sub: '#6B7280',
      border: '#E5E7EB',
      iconMuted: '#9CA3AF',
      danger: '#EF4444',
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      // Full screen editor: hide tab bar while focused.
      setTabBarVisible(false);
      return () => setTabBarVisible(true);
    }, [setTabBarVisible])
  );

  useEffect(() => {
    const load = async () => {
      if (!resolvedEventId) {
        setLoading(false);
        Alert.alert('שגיאה', 'חסר eventId');
        router.back();
        return;
      }
      if (!notificationType) {
        setLoading(false);
        router.back();
        return;
      }

      setLoading(true);
      try {
        const { data: eventData, error: eventError } = await supabase
          .from('events')
          .select('id, date')
          .eq('id', resolvedEventId)
          .single();
        if (eventError) throw eventError;
        const d = new Date((eventData as any)?.date);
        setEventDate(d);

        const { data: guestRows, error: guestError } = await supabase
          .from('guests')
          .select('id, name, phone, status')
          .eq('event_id', resolvedEventId)
          .order('name', { ascending: true });
        if (guestError) {
          console.warn('Failed to load guests (admin editor):', guestError);
          setAllGuests([]);
        } else {
          setAllGuests(
            ((guestRows as any[]) || []).map((g) => ({
              id: String(g.id),
              name: String(g.name ?? ''),
              phone: g.phone ? String(g.phone) : undefined,
              status: (g.status as any) || 'ממתין',
            }))
          );
        }

        const { data: existing, error: rowError } = await supabase
          .from('notification_settings')
          .select('*')
          .eq('event_id', resolvedEventId)
          .eq('notification_type', notificationType)
          .maybeSingle();
        if (rowError) console.warn('Failed to load notification setting (admin editor):', rowError);

        const tpl = DEFAULT_TEMPLATES.find((t) => t.notification_type === notificationType);
        const base: NotificationSettingRow =
          (existing as any) ??
          (tpl
            ? ({
                ...tpl,
                notification_type: tpl.notification_type,
              } as any)
            : ({
                notification_type: notificationType,
                title: 'עריכת הודעה',
                enabled: false,
                message_content: '',
                days_from_wedding: 0,
                channel: 'SMS',
              } as NotificationSettingRow));

        const days = typeof base.days_from_wedding === 'number' ? base.days_from_wedding : 0;
        const recipientIds = Array.isArray((base as any).recipient_guest_ids)
          ? ((base as any).recipient_guest_ids as any[]).map((x) => String(x))
          : [];
        setRow({
          id: (base as any).id,
          event_id: resolvedEventId,
          notification_type: base.notification_type,
          title: String((base as any).title ?? tpl?.title ?? ''),
          enabled: Boolean((base as any).enabled),
          message_content: String((base as any).message_content ?? ''),
          days_from_wedding: days,
          channel: ((base as any).channel as any) || (tpl?.channel as any) || 'SMS',
          recipient_guest_ids: recipientIds,
        });
        setSelectedGuestIds(new Set(recipientIds));

        setTimingMode(days < 0 ? 'before' : 'after');
        setEditedAbsDays(String(Math.abs(days)));
        setEditedMessage(String((base as any).message_content ?? ''));
      } catch (e) {
        console.error('Admin editor load error:', e);
        Alert.alert('שגיאה', 'לא ניתן לטעון את ההודעה');
        router.back();
      } finally {
        setLoading(false);
      }
    };

    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedEventId, notificationType]);

  const computedDateText = useMemo(() => {
    if (!eventDate) return '';
    const abs = Number.parseInt((editedAbsDays || '').trim(), 10);
    const signed = Number.isFinite(abs) ? (abs === 0 ? 0 : timingMode === 'before' ? -Math.abs(abs) : Math.abs(abs)) : 0;
    return formatDate(computeSendDate(eventDate, signed));
  }, [eventDate, editedAbsDays, timingMode]);

  const maxChars = 160;
  const charsCount = editedMessage.length;
  const isOverLimit = charsCount > maxChars;

  const onChangeDays = (txt: string) => {
    const cleaned = String(txt || '').replace(/[^\d]/g, '');
    setEditedAbsDays(cleaned);
  };

  const save = async (opts?: { recipientGuestIds?: string[]; navigateBack?: boolean }) => {
    if (!resolvedEventId || !row) return;
    if (saving) return;
    const navigateBack = opts?.navigateBack !== false;
    const msg = (editedMessage || '').trim();
    if (!msg) {
      Alert.alert('שגיאה', 'יש להזין תוכן הודעה');
      return;
    }
    if (msg.length > maxChars) {
      Alert.alert('שגיאה', `תוכן ההודעה ארוך מדי (${msg.length}/${maxChars})`);
      return;
    }

    const abs = Number.parseInt((editedAbsDays || '').trim(), 10);
    const signed = Number.isFinite(abs) ? (abs === 0 ? 0 : timingMode === 'before' ? -Math.abs(abs) : Math.abs(abs)) : NaN;
    const daysToSave = Number.isFinite(signed) ? signed : row.days_from_wedding ?? 0;

    setSaving(true);
    try {
      if (row.id) {
        const updatePayload: any = { message_content: msg, days_from_wedding: daysToSave, channel: row.channel };
        if (opts?.recipientGuestIds) updatePayload.recipient_guest_ids = opts.recipientGuestIds;
        let { error } = await supabase.from('notification_settings').update(updatePayload).eq('id', row.id);
        if (error && isMissingColumn(error, 'channel')) {
          delete updatePayload.channel;
          const retry = await supabase.from('notification_settings').update(updatePayload).eq('id', row.id);
          error = retry.error as any;
        }
        if (error && isMissingColumn(error, 'recipient_guest_ids')) {
          delete updatePayload.recipient_guest_ids;
          const retry2 = await supabase.from('notification_settings').update(updatePayload).eq('id', row.id);
          error = retry2.error as any;
        }
        if (error) throw error;
      } else {
        const insertPayload: any = {
          event_id: resolvedEventId,
          notification_type: row.notification_type,
          title: row.title,
          enabled: Boolean(row.enabled),
          message_content: msg,
          days_from_wedding: daysToSave,
          channel: row.channel || 'SMS',
        };
        if (opts?.recipientGuestIds) insertPayload.recipient_guest_ids = opts.recipientGuestIds;
        let { data, error } = await supabase.from('notification_settings').insert(insertPayload).select().single();
        if (error && isMissingColumn(error, 'channel')) {
          delete insertPayload.channel;
          const retry = await supabase.from('notification_settings').insert(insertPayload).select().single();
          data = retry.data as any;
          error = retry.error as any;
        }
        if (error && isMissingColumn(error, 'recipient_guest_ids')) {
          delete insertPayload.recipient_guest_ids;
          const retry2 = await supabase.from('notification_settings').insert(insertPayload).select().single();
          data = retry2.data as any;
          error = retry2.error as any;
        }
        if (error) throw error;
        setRow((prev) => (prev ? { ...prev, ...(data as any) } : prev));
      }

      if (navigateBack) router.back();
    } catch (e) {
      console.error('Admin editor save error:', e);
      Alert.alert('שגיאה', 'לא ניתן לשמור שינויים');
    } finally {
      setSaving(false);
    }
  };

  const filteredGuests = useMemo(() => {
    const all = Array.isArray(allGuests) ? allGuests : [];
    if (guestFilter === 'all') return all;
    return all.filter((g) => g.status === guestFilter);
  }, [allGuests, guestFilter]);

  const selectedCount = selectedGuestIds.size;
  const selectedPendingCount = useMemo(() => {
    const byId = new Map(allGuests.map((g) => [String(g.id), g.status]));
    let n = 0;
    for (const id of selectedGuestIds) if (byId.get(String(id)) === 'ממתין') n += 1;
    return n;
  }, [allGuests, selectedGuestIds]);

  const toggleGuest = (guestId: string) => {
    const id = String(guestId || '').trim();
    if (!id) return;
    setSelectedGuestIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedGuestIds((prev) => {
      const next = new Set(prev);
      for (const g of filteredGuests) next.add(String(g.id));
      return next;
    });
  };

  const clearSelection = () => setSelectedGuestIds(new Set());

  const keepOnlyPendingFromSelection = () => {
    const byId = new Map(allGuests.map((g) => [String(g.id), g.status]));
    setSelectedGuestIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) if (byId.get(String(id)) === 'ממתין') next.add(String(id));
      return next;
    });
  };

  const importFromPrevious = async () => {
    if (!resolvedEventId) return;
    if (!previousNotificationType) return;
    if (importingPrev) return;
    setImportingPrev(true);
    try {
      const { data, error } = await supabase
        .from('notification_settings')
        .select('recipient_guest_ids')
        .eq('event_id', resolvedEventId)
        .eq('notification_type', previousNotificationType)
        .maybeSingle();
      if (error) throw error;
      const prevIds = Array.isArray((data as any)?.recipient_guest_ids)
        ? ((data as any).recipient_guest_ids as any[]).map((x) => String(x))
        : [];
      if (prevIds.length === 0) {
        Alert.alert('אין רשימה קודמת', 'לא נמצאה רשימת מוזמנים שמורה להודעה הקודמת.');
        return;
      }
      const byId = new Map(allGuests.map((g) => [String(g.id), g.status]));
      const pendingOnly = prevIds.filter((id) => byId.get(String(id)) === 'ממתין');
      setSelectedGuestIds(new Set(pendingOnly));
      setGuestFilter('ממתין');
      Alert.alert('נטען', `נטענו ${pendingOnly.length} ממתינים מההודעה הקודמת`);
    } catch (e: any) {
      const message = e?.message ? String(e.message) : 'שגיאה לא ידועה';
      Alert.alert('שגיאה', `לא ניתן לטעון רשימה קודמת.\n\n${message}`);
    } finally {
      setImportingPrev(false);
    }
  };

  const sendNow = async () => {
    if (!resolvedEventId || !row) return;
    if (sendingNow) return;
    const msg = (editedMessage || '').trim();
    if (!msg) {
      Alert.alert('שגיאה', 'יש להזין תוכן הודעה');
      return;
    }
    const ids = Array.from(selectedGuestIds);
    if (ids.length === 0) {
      Alert.alert('בחר מוזמנים', 'בחר לפחות מוזמן אחד לשליחה.');
      return;
    }

    setSendingNow(true);
    try {
      await save({ recipientGuestIds: ids, navigateBack: false });

      const sessionRes = await supabase.auth.getSession();
      const accessToken = sessionRes.data.session?.access_token;
      if (!accessToken) throw new Error('לא נמצא חיבור משתמש (נא להתחבר מחדש)');

      const origin =
        Platform.OS === 'web' && typeof window !== 'undefined' ? String(window.location.origin) : '';
      const baseUrl = origin && !origin.includes('localhost') && !origin.includes('127.0.0.1') ? origin : undefined;

      const { data, error } = await supabase.functions.invoke('send-invitation-sms', {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: {
          eventId: resolvedEventId,
          guestIds: ids,
          messageTemplate: msg,
          baseUrl,
        },
      });
      if (error) throw error;
      const result = (data as any)?.result;
      Alert.alert('נשלח', `נשלחו ${Number(result?.sent) || 0} · נכשלו ${Number(result?.failed) || 0}`);
    } catch (e: any) {
      const message = e?.message ? String(e.message) : 'שגיאה לא ידועה';
      Alert.alert('שגיאה', `לא ניתן לשלוח.\n\n${message}`);
    } finally {
      setSendingNow(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.page, { backgroundColor: ui.bg }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={ui.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const bottomSafe = Math.max(14, insets.bottom + 14);

  return (
    <SafeAreaView style={[styles.page, { backgroundColor: ui.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View
        style={[
          styles.headerWrap,
          {
            paddingTop: Math.max(12, insets.top + 10),
            // @ts-expect-error - RN web style support
            backgroundImage:
              Platform.OS === 'web'
                ? 'linear-gradient(135deg, rgba(29,78,216,0.12), rgba(255,255,255,0.65), rgba(16,185,129,0.08))'
                : undefined,
            backgroundColor: Platform.OS === 'web' ? undefined : 'rgba(29,78,216,0.10)',
            borderBottomColor: 'rgba(229,231,235,0.95)',
          },
        ]}
      >
        {Platform.OS === 'web' ? null : <BlurView intensity={22} tint="light" style={StyleSheet.absoluteFillObject} />}

        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }: any) => [
              styles.headerBtn,
              styles.backBtnAbs,
              { backgroundColor: 'rgba(255,255,255,0.78)', borderColor: 'rgba(17,24,39,0.10)' },
              pressed ? { opacity: 0.92 } : null,
            ]}
          >
            <Ionicons name="chevron-back" size={20} color={ui.text} />
          </Pressable>

          <View style={styles.headerTitles}>
            <Text style={[styles.headerTitle, { color: ui.text }]}>עריכת הודעה</Text>
            <View
              style={[
                styles.headerSubtitlePill,
                { backgroundColor: 'rgba(255,255,255,0.75)', borderColor: 'rgba(17,24,39,0.10)' },
              ]}
            >
              <Text style={[styles.headerSubtitle, { color: ui.sub }]} numberOfLines={1}>
                {row?.title || 'הודעה'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.flex}>
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: ui.text }]}>מתי לשלוח</Text>
                <View style={[styles.segmentWrap, { backgroundColor: ui.softBlue, borderColor: 'rgba(29,78,216,0.14)' }]}>
                  <Pressable
                    onPress={() => setTimingMode('before')}
                    style={[styles.segmentBtn, timingMode === 'before' ? styles.segmentBtnActive : null]}
                    accessibilityRole="button"
                    accessibilityLabel="לפני האירוע"
                  >
                    <Text style={[styles.segmentText, { color: timingMode === 'before' ? ui.primary : ui.sub }]}>לפני</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setTimingMode('after')}
                    style={[styles.segmentBtn, timingMode === 'after' ? styles.segmentBtnActive : null]}
                    accessibilityRole="button"
                    accessibilityLabel="אחרי האירוע"
                  >
                    <Text style={[styles.segmentText, { color: timingMode === 'after' ? ui.primary : ui.sub }]}>אחרי</Text>
                  </Pressable>
                </View>

                <View style={styles.cardsRow}>
                  <View style={[styles.computedCard, { backgroundColor: ui.surface, borderColor: ui.border }]}>
                    <Text style={[styles.computedLabel, { color: ui.sub }]}>תאריך מחושב</Text>
                    <Text style={[styles.computedValue, { color: ui.text }]}>{computedDateText || '—'}</Text>
                  </View>
                  <View style={[styles.daysCard, { backgroundColor: ui.surface, borderColor: ui.border }]}>
                    <View style={styles.daysCardTop}>
                      <Text style={[styles.daysMeta, { color: ui.sub }]}>ימים</Text>
                      <Ionicons name="time-outline" size={18} color={ui.sub} />
                    </View>
                    <TextInput
                      value={editedAbsDays}
                      onChangeText={onChangeDays}
                      placeholder="0"
                      placeholderTextColor={ui.iconMuted}
                      style={[styles.daysValue, { color: ui.text }]}
                      keyboardType="numeric"
                      inputMode="numeric"
                      textAlign="center"
                      maxLength={4}
                    />
                  </View>
                </View>
              </View>

              <View style={styles.section}>
                <View style={styles.messageHeaderRow}>
                  <Text style={[styles.sectionTitle, { color: ui.text }]}>תוכן ההודעה</Text>
                  <View style={styles.messageTools}>
                    <TouchableOpacity
                      style={[styles.toolBtn, { backgroundColor: ui.surfaceMuted, borderColor: 'rgba(17,24,39,0.06)' }]}
                      activeOpacity={0.92}
                      onPress={() => setEditedMessage((prev) => `${prev}${prev ? ' ' : ''}{{event_date}}`)}
                      accessibilityRole="button"
                      accessibilityLabel="הוסף תאריך"
                    >
                      <Ionicons name="calendar-outline" size={18} color={ui.sub} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.toolBtn, { backgroundColor: ui.surfaceMuted, borderColor: 'rgba(17,24,39,0.06)' }]}
                      activeOpacity={0.92}
                      onPress={() => setEditedMessage((prev) => `${prev}${prev ? ' ' : ''}{{name}}`)}
                      accessibilityRole="button"
                      accessibilityLabel="הוסף שם"
                    >
                      <Ionicons name="person-add-outline" size={18} color={ui.sub} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.textareaWrap}>
                  <TextInput
                    value={editedMessage}
                    onChangeText={setEditedMessage}
                    placeholder="הקלד את ההודעה כאן..."
                    placeholderTextColor={ui.iconMuted}
                    style={[
                      styles.textarea,
                      {
                        color: ui.text,
                        backgroundColor: ui.surfaceMuted,
                        borderColor: isOverLimit ? ui.danger : 'rgba(17,24,39,0.10)',
                      },
                    ]}
                    multiline
                    textAlign="right"
                    textAlignVertical="top"
                    maxLength={5000}
                  />
                  <View style={[styles.charCountPill, { borderColor: 'rgba(17,24,39,0.08)' }]}>
                    <Text style={[styles.charCountText, { color: isOverLimit ? ui.danger : ui.sub }]}>
                      {`${charsCount}/${maxChars} תווים`}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.helperText, { color: ui.sub }]}>
                  * שימוש במשתנים דינמיים עשוי לשנות את אורך ההודעה הסופי.
                </Text>
              </View>

              {row?.channel === 'SMS' ? (
                <View style={styles.section}>
                  <View style={styles.recipientsHeaderRow}>
                    <Text style={[styles.sectionTitle, { color: ui.text }]}>בחירת מוזמנים ושליחה</Text>
                    <View style={styles.recipientsBadge}>
                      <Text style={styles.recipientsBadgeText}>{selectedCount}</Text>
                      <Text style={styles.recipientsBadgeText}>נבחרו</Text>
                    </View>
                  </View>

                  <Text style={[styles.helperText, { color: ui.sub }]}>
                    משתנים שימושיים: <Text style={styles.mono}>{'{{name}}'}</Text> · <Text style={styles.mono}>{'{{link}}'}</Text> ·{' '}
                    <Text style={styles.mono}>{'{{event_date}}'}</Text>
                  </Text>

                  <View style={styles.filtersRow}>
                    {(['all', 'ממתין', 'מגיע', 'לא מגיע'] as const).map((k) => (
                      <Pressable
                        key={k}
                        onPress={() => setGuestFilter(k)}
                        style={({ pressed }) => [
                          styles.filterPill,
                          guestFilter === k ? styles.filterPillActive : null,
                          pressed ? { opacity: 0.92 } : null,
                        ]}
                      >
                        <Text style={[styles.filterText, guestFilter === k ? styles.filterTextActive : null]}>
                          {k === 'all' ? 'הכל' : k}
                        </Text>
                      </Pressable>
                    ))}
                    <View style={{ flex: 1 }} />
                    <Pressable onPress={selectAllFiltered} style={({ pressed }) => [styles.smallBtn, pressed ? { opacity: 0.92 } : null]}>
                      <Ionicons name="checkbox-outline" size={16} color={ui.primary} />
                      <Text style={[styles.smallBtnText, { color: ui.primary }]}>בחר הכל</Text>
                    </Pressable>
                    <Pressable onPress={clearSelection} style={({ pressed }) => [styles.smallBtn, pressed ? { opacity: 0.92 } : null]}>
                      <Ionicons name="close-circle-outline" size={16} color={ui.primary} />
                      <Text style={[styles.smallBtnText, { color: ui.primary }]}>נקה</Text>
                    </Pressable>
                  </View>

                  <View style={styles.recipientsActionsRow}>
                    {previousNotificationType ? (
                      <Pressable
                        onPress={() => void importFromPrevious()}
                        disabled={importingPrev}
                        style={({ pressed }) => [
                          styles.keepPendingBtn,
                          pressed ? { opacity: 0.92 } : null,
                          importingPrev ? { opacity: 0.6 } : null,
                        ]}
                      >
                        {importingPrev ? (
                          <ActivityIndicator />
                        ) : (
                          <Ionicons name="download-outline" size={16} color={ui.text} />
                        )}
                        <Text style={[styles.keepPendingText, { color: ui.text }]}>ייבא מהודעה קודמת (ממתינים)</Text>
                      </Pressable>
                    ) : null}
                    <Pressable onPress={keepOnlyPendingFromSelection} style={({ pressed }) => [styles.keepPendingBtn, pressed ? { opacity: 0.92 } : null]}>
                      <Ionicons name="time-outline" size={16} color={ui.text} />
                      <Text style={[styles.keepPendingText, { color: ui.text }]}>השאר רק ממתינים ({selectedPendingCount})</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => void sendNow()}
                      disabled={sendingNow || selectedCount === 0}
                      style={({ pressed }) => [
                        styles.sendNowBtn,
                        { backgroundColor: ui.primary },
                        pressed ? { opacity: 0.92 } : null,
                        sendingNow || selectedCount === 0 ? { opacity: 0.6 } : null,
                      ]}
                    >
                      {sendingNow ? <ActivityIndicator color="#fff" /> : <Ionicons name="paper-plane-outline" size={18} color="#fff" />}
                      <Text style={styles.sendNowText}>{sendingNow ? 'שולח...' : 'שלח עכשיו'}</Text>
                    </Pressable>
                  </View>

                  <View style={{ gap: 10 }}>
                    {filteredGuests.map((g) => {
                      const checked = selectedGuestIds.has(String(g.id));
                      return (
                        <Pressable
                          key={g.id}
                          onPress={() => toggleGuest(g.id)}
                          style={({ pressed }) => [
                            styles.recipientRow,
                            { borderColor: checked ? 'rgba(29,78,216,0.25)' : 'rgba(17,24,39,0.08)' },
                            { backgroundColor: checked ? 'rgba(29,78,216,0.06)' : 'rgba(255,255,255,0.92)' },
                            pressed ? { opacity: 0.96 } : null,
                          ]}
                        >
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={[styles.recipientName, { color: ui.text }]} numberOfLines={1}>
                              {g.name}
                            </Text>
                            <Text style={[styles.recipientMeta, { color: ui.sub }]} numberOfLines={1}>
                              {g.status}
                              {g.phone ? ` · ${g.phone}` : ' · אין טלפון'}
                            </Text>
                          </View>
                          <Ionicons name={checked ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={checked ? ui.primary : ui.iconMuted} />
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      <View
        style={[
          styles.bottomBar,
          {
            paddingBottom: bottomSafe,
            borderTopColor: 'rgba(229,231,235,0.85)',
            backgroundColor: 'rgba(255,255,255,0.88)',
          },
        ]}
      >
        <BlurView intensity={24} tint="light" style={StyleSheet.absoluteFillObject} />
        <View style={[styles.bottomBarInner, { paddingBottom: bottomSafe }]}>
          <View style={styles.bottomButtonsRow}>
            <TouchableOpacity
              style={[styles.bottomBtnSecondary, { borderColor: ui.border, backgroundColor: 'rgba(255,255,255,0.92)' }]}
              onPress={() => router.back()}
              activeOpacity={0.92}
            >
              <Text style={[styles.bottomBtnSecondaryText, { color: ui.text }]}>ביטול</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.bottomBtnPrimary, { backgroundColor: saving ? ui.primaryHover : ui.primary }]}
              onPress={save}
              activeOpacity={0.92}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="save-outline" size={18} color="#fff" />
                  <Text style={styles.bottomBtnPrimaryText}>שמור שינויים</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  headerWrap: {
    position: 'relative',
    zIndex: 5,
    borderBottomWidth: 1,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  header: { paddingHorizontal: 18, paddingBottom: 16, alignItems: 'center', justifyContent: 'center' },
  headerBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  backBtnAbs: { position: 'absolute', left: 18, top: 0, zIndex: 10 },
  headerTitles: { flex: 1, alignItems: 'center', gap: 6 },
  headerTitle: { fontSize: 18, fontWeight: '900', textAlign: 'center' },
  headerSubtitlePill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, maxWidth: '92%' },
  headerSubtitle: { fontSize: 12, fontWeight: '800', textAlign: 'center' },

  content: { paddingHorizontal: 16, paddingTop: 18, gap: 18, maxWidth: 720, width: '100%', alignSelf: 'center' },

  section: { paddingHorizontal: 2, gap: 12 },
  sectionTitle: { fontSize: 13, fontWeight: '900', textAlign: 'right', paddingHorizontal: 2 },

  segmentWrap: { flexDirection: 'row-reverse', padding: 4, borderRadius: 16, borderWidth: 1 },
  segmentBtn: { flex: 1, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  segmentBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  segmentText: { fontSize: 13, fontWeight: '800' },

  cardsRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  computedCard: { flex: 1, height: 76, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  computedLabel: { fontSize: 11, fontWeight: '800' },
  computedValue: { fontSize: 18, fontWeight: '900', textAlign: 'center', writingDirection: 'ltr' },
  daysCard: { flex: 1, height: 76, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, justifyContent: 'space-between' },
  daysCardTop: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  daysMeta: { fontSize: 11, fontWeight: '800' },
  daysValue: { fontSize: 22, fontWeight: '900', paddingVertical: 0, paddingHorizontal: 0 },

  messageHeaderRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  messageTools: { flexDirection: 'row-reverse', gap: 8 },
  toolBtn: { width: 36, height: 36, borderRadius: 14, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  textareaWrap: { position: 'relative' },
  textarea: { borderRadius: 20, paddingHorizontal: 18, paddingVertical: 16, fontSize: 16, fontWeight: '700', minHeight: 280, lineHeight: 24, writingDirection: 'rtl', borderWidth: 1 },
  charCountPill: { position: 'absolute', left: 12, bottom: 12, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.86)', borderWidth: 1 },
  charCountText: { fontSize: 12, fontWeight: '800' },
  helperText: { fontSize: 12, fontWeight: '600', textAlign: 'right', opacity: 0.75, paddingHorizontal: 2, lineHeight: 18 },

  mono: { fontWeight: '900' },
  recipientsHeaderRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  recipientsBadge: { flexDirection: 'row-reverse', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(17,24,39,0.04)' },
  recipientsBadgeText: { fontSize: 12, fontWeight: '900', color: 'rgba(17,24,39,0.72)', textAlign: 'right' },

  filtersRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  filterPill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.92)', borderWidth: 1, borderColor: 'rgba(17,24,39,0.10)' },
  filterPillActive: { backgroundColor: 'rgba(29,78,216,0.10)', borderColor: 'rgba(29,78,216,0.22)' },
  filterText: { fontSize: 12, fontWeight: '900', color: 'rgba(17,24,39,0.72)', textAlign: 'right' },
  filterTextActive: { color: 'rgba(29,78,216,1)' },

  smallBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.92)', borderWidth: 1, borderColor: 'rgba(29,78,216,0.18)' },
  smallBtnText: { fontSize: 12, fontWeight: '900', textAlign: 'right' },

  recipientsActionsRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  keepPendingBtn: { flex: 1, minWidth: 180, height: 44, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(17,24,39,0.10)', backgroundColor: 'rgba(17,24,39,0.04)', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
  keepPendingText: { fontSize: 12, fontWeight: '900', textAlign: 'right' },
  sendNowBtn: { height: 44, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8 },
  sendNowText: { fontSize: 12, fontWeight: '900', color: '#fff', textAlign: 'right' },

  recipientRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 16, borderWidth: 1 },
  recipientName: { fontSize: 13, fontWeight: '900', textAlign: 'right' },
  recipientMeta: { marginTop: 3, fontSize: 12, fontWeight: '700', textAlign: 'right' },

  bottomBar: { position: 'relative', borderTopWidth: 1 },
  bottomBarInner: { paddingHorizontal: 16, paddingTop: 12 },
  bottomButtonsRow: { flexDirection: 'row-reverse', gap: 12, maxWidth: 720, width: '100%', alignSelf: 'center' },
  bottomBtnSecondary: { flex: 1, height: 58, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  bottomBtnSecondaryText: { fontSize: 16, fontWeight: '900' },
  bottomBtnPrimary: { flex: 2, height: 58, borderRadius: 16, justifyContent: 'center', alignItems: 'center', flexDirection: 'row-reverse', gap: 10 },
  bottomBtnPrimaryText: { fontSize: 16, fontWeight: '900', color: '#fff' },
});

