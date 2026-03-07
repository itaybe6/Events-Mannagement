import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import DateTimePickerModal from 'react-native-modal-datetime-picker';

import { supabase } from '@/lib/supabase';
import { useLayoutStore } from '@/store/layoutStore';
import { ROW_DIR } from '@/lib/rtl';
import { I18nManager } from 'react-native';

type NotificationSettingRow = {
  id?: string;
  event_id?: string;
  notification_type: string;
  title: string;
  enabled?: boolean;
  message_content?: string;
  days_from_wedding?: number;
  channel?: 'SMS' | 'WHATSAPP';
  // Stored in DB as TIMESTAMPTZ (ISO string on the client).
  notification_date?: string | null;
  recipient_guest_ids?: string[] | null;
};

const DEFAULT_TEMPLATES: Array<Omit<NotificationSettingRow, 'id' | 'event_id'>> = [
  { notification_type: 'reminder_1', title: 'הודעה רגילה 1 (לפני האירוע)', days_from_wedding: -30, channel: 'SMS', enabled: false, message_content: '' },
  // Default: 14 days after message #1 (-30 + 14 = -16), can be edited manually.
  { notification_type: 'reminder_2', title: 'הודעה שנייה (לממתינים)', days_from_wedding: -16, channel: 'SMS', enabled: false, message_content: 'תזכורת: אם עדיין לא אישרתם הגעה נשמח לאישור.' },
  { notification_type: 'whatsapp_event_day', title: 'וואטסאפ ביום האירוע', days_from_wedding: 0, channel: 'WHATSAPP', enabled: false, message_content: 'היום האירוע! נתראה שם' },
  { notification_type: 'after_1', title: 'הודעה רגילה אחרי האירוע', days_from_wedding: 1, channel: 'SMS', enabled: false, message_content: 'תודה שבאתם! היה לנו כיף גדול איתכם.' },
];

function formatDate(d: Date) {
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDmySlashes(d: Date) {
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function computeSendDate(eventDate: Date, daysOffset: number) {
  const d = new Date(eventDate);
  d.setDate(d.getDate() + daysOffset);
  return d;
}

function formatTime(d: Date) {
  if (Number.isNaN(d.getTime())) return '';
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

function formatOffsetLabel(days: number) {
  if (!Number.isFinite(days)) return '—';
  if (days === 0) return 'ביום האירוע';
  const abs = Math.abs(days);
  return days < 0 ? `${abs} ימים לפני האירוע` : `${abs} ימים אחרי האירוע`;
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

  const [editedSendDateYmd, setEditedSendDateYmd] = useState<string>('');
  const [editedTimeHm, setEditedTimeHm] = useState('11:00');
  const [editedMessage, setEditedMessage] = useState('');
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const dateInputRef = useRef<any>(null);
  const timeInputRef = useRef<any>(null);

  const webNativeOverlayInputStyle = useMemo(
    () =>
      Platform.OS === 'web'
        ? ({
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'block',
            opacity: 0.001,
            cursor: 'pointer',
            zIndex: 10,
          } as any)
        : null,
    []
  );

  const [guestFilter, setGuestFilter] = useState<'all' | 'מגיע' | 'ממתין' | 'לא מגיע'>(
    notificationType === 'reminder_2' ? 'ממתין' : 'all'
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
          notification_date: (base as any).notification_date ? String((base as any).notification_date) : null,
          recipient_guest_ids: recipientIds,
        });
        setSelectedGuestIds(new Set(recipientIds));

        {
          const existingDtRaw = (base as any)?.notification_date;
          const existingDt = existingDtRaw ? new Date(String(existingDtRaw)) : null;
          const hasRealTime =
            existingDt && Number.isFinite(existingDt.getTime()) && (existingDt.getHours() !== 0 || existingDt.getMinutes() !== 0);
          setEditedTimeHm(hasRealTime && existingDt ? formatTime(existingDt) : '11:00');
          if (existingDt && Number.isFinite(existingDt.getTime())) {
            setEditedSendDateYmd(
              `${existingDt.getFullYear()}-${String(existingDt.getMonth() + 1).padStart(2, '0')}-${String(existingDt.getDate()).padStart(2, '0')}`
            );
          } else if (d && Number.isFinite(d.getTime())) {
            const fallback = computeSendDate(d, days);
            setEditedSendDateYmd(
              `${fallback.getFullYear()}-${String(fallback.getMonth() + 1).padStart(2, '0')}-${String(fallback.getDate()).padStart(2, '0')}`
            );
          } else {
            setEditedSendDateYmd('');
          }
        }
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

  const computedSendAt = useMemo(() => {
    if (!eventDate) return null;
    const ymd = parseYmd(editedSendDateYmd);
    const hm = parseTimeHm(editedTimeHm);
    if (!ymd || !hm) return null;
    return new Date(ymd.y, ymd.m - 1, ymd.d, hm.h, hm.m, 0, 0);
  }, [editedSendDateYmd, editedTimeHm, eventDate]);

  const offsetDays = useMemo(() => {
    if (!eventDate || !computedSendAt) return null;
    return diffDaysLocal(computedSendAt, eventDate);
  }, [computedSendAt, eventDate]);

  const maxChars = 160;
  const charsCount = editedMessage.length;
  const isOverLimit = charsCount > maxChars;

  const onChangeTimeHm = (txt: string) => setEditedTimeHm(String(txt || ''));

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

    if (!eventDate) return;
    if (!computedSendAt || offsetDays === null) {
      Alert.alert('שגיאה', 'בחר תאריך ושעה תקינים לשליחה');
      return;
    }
    const daysToSave = offsetDays;

    setSaving(true);
    try {
      if (row.id) {
        const updatePayload: any = { message_content: msg, days_from_wedding: daysToSave, channel: row.channel, enabled: true };
        updatePayload.notification_date = computedSendAt.toISOString();
        if (opts?.recipientGuestIds) updatePayload.recipient_guest_ids = opts.recipientGuestIds;
        let { error } = await supabase.from('notification_settings').update(updatePayload).eq('id', row.id);
        if (error && isMissingColumn(error, 'channel')) {
          delete updatePayload.channel;
          const retry = await supabase.from('notification_settings').update(updatePayload).eq('id', row.id);
          error = retry.error as any;
        }
        if (error && isMissingColumn(error, 'notification_date')) {
          delete updatePayload.notification_date;
          const retry2 = await supabase.from('notification_settings').update(updatePayload).eq('id', row.id);
          error = retry2.error as any;
        }
        if (error && isMissingColumn(error, 'recipient_guest_ids')) {
          delete updatePayload.recipient_guest_ids;
          const retry3 = await supabase.from('notification_settings').update(updatePayload).eq('id', row.id);
          error = retry3.error as any;
        }
        if (error) throw error;
      } else {
        const insertPayload: any = {
          event_id: resolvedEventId,
          notification_type: row.notification_type,
          title: row.title,
          enabled: true,
          message_content: msg,
          days_from_wedding: daysToSave,
          channel: row.channel || 'SMS',
        };
        insertPayload.notification_date = computedSendAt.toISOString();
        if (opts?.recipientGuestIds) insertPayload.recipient_guest_ids = opts.recipientGuestIds;
        let { data, error } = await supabase.from('notification_settings').insert(insertPayload).select().single();
        if (error && isMissingColumn(error, 'channel')) {
          delete insertPayload.channel;
          const retry = await supabase.from('notification_settings').insert(insertPayload).select().single();
          data = retry.data as any;
          error = retry.error as any;
        }
        if (error && isMissingColumn(error, 'notification_date')) {
          delete insertPayload.notification_date;
          const retry2 = await supabase.from('notification_settings').insert(insertPayload).select().single();
          data = retry2.data as any;
          error = retry2.error as any;
        }
        if (error && isMissingColumn(error, 'recipient_guest_ids')) {
          delete insertPayload.recipient_guest_ids;
          const retry3 = await supabase.from('notification_settings').insert(insertPayload).select().single();
          data = retry3.data as any;
          error = retry3.error as any;
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
    const nt = String(notificationType || '').trim();
    const isAutoPending = nt === 'reminder_2';
    const ids = Array.from(selectedGuestIds);
    if (ids.length === 0 && !isAutoPending) {
      Alert.alert('בחר מוזמנים', 'בחר לפחות מוזמן אחד לשליחה.');
      return;
    }

    setSendingNow(true);
    try {
      // Persist current selection (empty list is meaningful for reminder_2: "all pending").
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
          guestIds: ids.length > 0 ? ids : undefined,
          filterStatus: isAutoPending ? 'pending' : 'all',
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
              I18nManager.isRTL ? { left: undefined, right: 18 } : { right: undefined, left: 18 },
              { backgroundColor: 'rgba(255,255,255,0.78)', borderColor: 'rgba(17,24,39,0.10)' },
              pressed ? { opacity: 0.92 } : null,
            ]}
          >
            <Ionicons name={I18nManager.isRTL ? 'chevron-forward' : 'chevron-back'} size={20} color={ui.text} />
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

                <View style={styles.scheduleRow}>
                  <View style={styles.dateCol}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        if (Platform.OS !== 'web') {
                          setDatePickerOpen(true);
                          return;
                        }
                        const el = dateInputRef.current;
                        el?.showPicker?.();
                        el?.click?.();
                        el?.focus?.();
                      }}
                      style={({ pressed }) => [
                        styles.scheduleCard,
                        { backgroundColor: ui.surface, borderColor: ui.border },
                        pressed && Platform.OS !== 'web' ? { opacity: 0.92 } : null,
                      ]}
                    >
                      <View style={styles.scheduleCardTop}>
                        <Text style={[styles.daysMeta, { color: ui.sub }]}>תאריך לשליחה</Text>
                        <Ionicons name="calendar-outline" size={18} color={ui.sub} />
                      </View>

                      {Platform.OS === 'web' ? (
                        <>
                          {/* @ts-expect-error web-only element */}
                          <input
                            ref={dateInputRef}
                            value={editedSendDateYmd || ''}
                            onChange={(e: any) => setEditedSendDateYmd(String(e?.target?.value || ''))}
                            type="date"
                            style={webNativeOverlayInputStyle}
                          />
                          <Text style={[styles.scheduleValueText, { color: ui.text }]}>
                            {editedSendDateYmd ? formatDmyFromYmd(editedSendDateYmd) : 'בחר תאריך'}
                          </Text>
                        </>
                      ) : (
                        <Text style={[styles.scheduleValueText, { color: ui.text }]}>
                          {computedSendAt ? formatDmySlashes(computedSendAt) : editedSendDateYmd ? formatDmyFromYmd(editedSendDateYmd) : 'בחר תאריך'}
                        </Text>
                      )}
                    </Pressable>

                    <Text style={[styles.offsetBelow, { color: ui.sub }]} numberOfLines={1}>
                      {offsetDays === null ? '—' : formatOffsetLabel(offsetDays)}
                    </Text>
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      if (Platform.OS !== 'web') {
                        setTimePickerOpen(true);
                        return;
                      }
                      const el = timeInputRef.current;
                      el?.showPicker?.();
                      el?.click?.();
                      el?.focus?.();
                    }}
                    style={({ pressed }) => [
                      styles.scheduleCardSmall,
                      { backgroundColor: ui.surface, borderColor: ui.border },
                      pressed && Platform.OS !== 'web' ? { opacity: 0.92 } : null,
                    ]}
                  >
                    <View style={styles.scheduleCardTop}>
                      <Text style={[styles.daysMeta, { color: ui.sub }]}>שעה</Text>
                      <Ionicons name="alarm-outline" size={18} color={ui.sub} />
                    </View>

                    {Platform.OS === 'web' ? (
                      <>
                        {/* @ts-expect-error web-only element */}
                        <input
                          ref={timeInputRef}
                          value={editedTimeHm || ''}
                          onChange={(e: any) => onChangeTimeHm(String(e?.target?.value || ''))}
                          type="time"
                          step={60}
                          style={webNativeOverlayInputStyle}
                        />
                        <Text style={[styles.scheduleValueText, { color: ui.text }]}>{editedTimeHm || 'בחר שעה'}</Text>
                      </>
                    ) : (
                      <Text style={[styles.scheduleValueText, { color: ui.text }]}>{editedTimeHm || 'בחר שעה'}</Text>
                    )}
                  </Pressable>
                </View>
              </View>

              <View style={styles.section}>
                <View style={styles.messageHeaderRow}>
                  <Text style={[styles.sectionTitle, { color: ui.text }]}>תוכן ההודעה</Text>
                  <View style={styles.messageTools}>
                    <TouchableOpacity
                      style={[styles.toolBtn, { backgroundColor: ui.surfaceMuted, borderColor: 'rgba(17,24,39,0.06)' }]}
                      activeOpacity={0.92}
                      onPress={() => setEditedMessage((prev) => `${prev}${prev ? ' ' : ''}{event_date}`)}
                      accessibilityRole="button"
                      accessibilityLabel="הוסף תאריך"
                    >
                      <Ionicons name="calendar-outline" size={18} color={ui.sub} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.toolBtn, { backgroundColor: ui.surfaceMuted, borderColor: 'rgba(17,24,39,0.06)' }]}
                      activeOpacity={0.92}
                      onPress={() => setEditedMessage((prev) => `${prev}${prev ? ' ' : ''}{name}`)}
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
                    משתנים שימושיים: <Text style={styles.mono}>{'{name}'}</Text> · <Text style={styles.mono}>{'{link}'}</Text> ·{' '}
                    <Text style={styles.mono}>{'{event_date}'}</Text>
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

      {Platform.OS === 'web' ? null : (
        <>
          <DateTimePickerModal
            isVisible={datePickerOpen}
            mode="date"
            date={computedSendAt ?? eventDate ?? new Date()}
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onConfirm={(d) => {
              setDatePickerOpen(false);
              const y = d.getFullYear();
              const m = String(d.getMonth() + 1).padStart(2, '0');
              const day = String(d.getDate()).padStart(2, '0');
              setEditedSendDateYmd(`${y}-${m}-${day}`);
            }}
            onCancel={() => setDatePickerOpen(false)}
          />

          <DateTimePickerModal
            isVisible={timePickerOpen}
            mode="time"
            date={computedSendAt ?? eventDate ?? new Date()}
            display={Platform.OS === 'ios' ? 'spinner' : 'spinner'}
            onConfirm={(d) => {
              setTimePickerOpen(false);
              setEditedTimeHm(formatTime(d));
            }}
            onCancel={() => setTimePickerOpen(false)}
          />
        </>
      )}

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
              onPress={() => void save({ recipientGuestIds: Array.from(selectedGuestIds) })}
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

  scheduleRow: { flexDirection: ROW_DIR, alignItems: 'stretch', gap: 12 },
  dateCol: { flex: 2, gap: 8 },
  scheduleCard: { position: 'relative', flex: 2, minHeight: 92, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, gap: 6 },
  scheduleCardSmall: { position: 'relative', flex: 1, minHeight: 92, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, gap: 6 },
  scheduleCardTop: { flexDirection: ROW_DIR, alignItems: 'center', justifyContent: 'space-between' },
  scheduleValueText: { fontSize: 18, fontWeight: '900', textAlign: 'right', writingDirection: 'ltr' },
  scheduleSubText: { fontSize: 12, fontWeight: '800', textAlign: 'right', opacity: 0.85 },
  offsetBelow: { fontSize: 12, fontWeight: '800', textAlign: 'right', opacity: 0.85 },
  scheduleValueInput: {
    fontSize: 16,
    fontWeight: '900',
    paddingVertical: 0,
    paddingHorizontal: 0,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null),
  },

  segmentWrap: { flexDirection: ROW_DIR, padding: 4, borderRadius: 16, borderWidth: 1 },
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

  cardsRow: { flexDirection: ROW_DIR, alignItems: 'center', gap: 12 },
  computedCard: { flex: 1, height: 76, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  computedLabel: { fontSize: 11, fontWeight: '800' },
  computedValue: { fontSize: 18, fontWeight: '900', textAlign: 'center', writingDirection: 'ltr' },
  sideCardsCol: { flex: 1, gap: 12 },
  daysCard: { flex: 1, height: 76, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, justifyContent: 'space-between' },
  timeCard: { flex: 1, height: 76, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, justifyContent: 'space-between' },
  daysCardTop: { flexDirection: ROW_DIR, alignItems: 'center', justifyContent: 'space-between' },
  daysMeta: { fontSize: 11, fontWeight: '800' },
  daysValue: { fontSize: 22, fontWeight: '900', paddingVertical: 0, paddingHorizontal: 0 },

  messageHeaderRow: { flexDirection: ROW_DIR, alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  messageTools: { flexDirection: ROW_DIR, gap: 8, flexWrap: 'wrap' },
  toolBtn: { width: 36, height: 36, borderRadius: 14, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  textareaWrap: { position: 'relative' },
  textarea: { borderRadius: 20, paddingHorizontal: 18, paddingVertical: 16, fontSize: 16, fontWeight: '700', minHeight: 280, lineHeight: 24, writingDirection: 'rtl', borderWidth: 1 },
  charCountPill: { position: 'absolute', left: 12, bottom: 12, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.86)', borderWidth: 1 },
  charCountText: { fontSize: 12, fontWeight: '800' },
  helperText: { fontSize: 12, fontWeight: '600', textAlign: 'right', opacity: 0.75, paddingHorizontal: 2, lineHeight: 18 },

  mono: { fontWeight: '900' },
  recipientsHeaderRow: { flexDirection: ROW_DIR, alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  recipientsBadge: { flexDirection: ROW_DIR, gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(17,24,39,0.04)' },
  recipientsBadgeText: { fontSize: 12, fontWeight: '900', color: 'rgba(17,24,39,0.72)', textAlign: 'right' },

  filtersRow: { flexDirection: ROW_DIR, flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  filterPill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.92)', borderWidth: 1, borderColor: 'rgba(17,24,39,0.10)' },
  filterPillActive: { backgroundColor: 'rgba(29,78,216,0.10)', borderColor: 'rgba(29,78,216,0.22)' },
  filterText: { fontSize: 12, fontWeight: '900', color: 'rgba(17,24,39,0.72)', textAlign: 'right' },
  filterTextActive: { color: 'rgba(29,78,216,1)' },

  smallBtn: { flexDirection: ROW_DIR, alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.92)', borderWidth: 1, borderColor: 'rgba(29,78,216,0.18)' },
  smallBtnText: { fontSize: 12, fontWeight: '900', textAlign: 'right' },

  recipientsActionsRow: { flexDirection: ROW_DIR, alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  keepPendingBtn: { flex: 1, minWidth: 180, height: 44, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(17,24,39,0.10)', backgroundColor: 'rgba(17,24,39,0.04)', flexDirection: ROW_DIR, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
  keepPendingText: { fontSize: 12, fontWeight: '900', textAlign: 'right' },
  sendNowBtn: { height: 44, borderRadius: 14, paddingHorizontal: 14, flexDirection: ROW_DIR, alignItems: 'center', justifyContent: 'center', gap: 8 },
  sendNowText: { fontSize: 12, fontWeight: '900', color: '#fff', textAlign: 'right' },

  recipientRow: { flexDirection: ROW_DIR, alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 16, borderWidth: 1 },
  recipientName: { fontSize: 13, fontWeight: '900', textAlign: 'right' },
  recipientMeta: { marginTop: 3, fontSize: 12, fontWeight: '700', textAlign: 'right' },

  bottomBar: { position: 'relative', borderTopWidth: 1 },
  bottomBarInner: { paddingHorizontal: 16, paddingTop: 12 },
  bottomButtonsRow: { flexDirection: ROW_DIR, gap: 12, maxWidth: 720, width: '100%', alignSelf: 'center' },
  bottomBtnSecondary: { flex: 1, height: 58, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  bottomBtnSecondaryText: { fontSize: 16, fontWeight: '900' },
  bottomBtnPrimary: { flex: 2, height: 58, borderRadius: 16, justifyContent: 'center', alignItems: 'center', flexDirection: ROW_DIR, gap: 10 },
  bottomBtnPrimaryText: { fontSize: 16, fontWeight: '900', color: '#fff' },
});

