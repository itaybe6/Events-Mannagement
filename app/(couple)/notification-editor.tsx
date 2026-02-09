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
import { useUserStore } from '@/store/userStore';
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

export default function NotificationEditorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setTabBarVisible } = useLayoutStore();
  const { userData } = useUserStore();

  const { notificationType } = useLocalSearchParams<{ notificationType?: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [eventDate, setEventDate] = useState<Date | null>(null);
  const [row, setRow] = useState<NotificationSettingRow | null>(null);

  const [timingMode, setTimingMode] = useState<'before' | 'after'>('before');
  const [editedAbsDays, setEditedAbsDays] = useState('0');
  const [editedMessage, setEditedMessage] = useState('');

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
      faint: 'rgba(107,114,128,0.85)',
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
      if (!userData?.event_id) {
        setLoading(false);
        Alert.alert('שגיאה', 'לא נמצא אירוע למשתמש');
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
          .eq('id', userData.event_id)
          .single();
        if (eventError) throw eventError;
        const d = new Date((eventData as any)?.date);
        setEventDate(d);

        const { data: existing, error: rowError } = await supabase
          .from('notification_settings')
          .select('*')
          .eq('event_id', userData.event_id)
          .eq('notification_type', notificationType)
          .maybeSingle();
        if (rowError) {
          console.warn('Failed to load notification setting (editor):', rowError);
        }

        const tpl = DEFAULT_TEMPLATES.find(t => t.notification_type === notificationType);
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
        setRow({
          id: (base as any).id,
          event_id: userData.event_id,
          notification_type: base.notification_type,
          title: String((base as any).title ?? tpl?.title ?? ''),
          enabled: Boolean((base as any).enabled),
          message_content: String((base as any).message_content ?? ''),
          days_from_wedding: days,
          channel: ((base as any).channel as any) || (tpl?.channel as any) || 'SMS',
        });

        setTimingMode(days < 0 ? 'before' : 'after');
        setEditedAbsDays(String(Math.abs(days)));
        setEditedMessage(String((base as any).message_content ?? ''));
      } catch (e) {
        console.error('Editor load error:', e);
        Alert.alert('שגיאה', 'לא ניתן לטעון את ההודעה');
        router.back();
      } finally {
        setLoading(false);
      }
    };

    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userData?.event_id, notificationType]);

  const computedDateText = useMemo(() => {
    if (!eventDate) return '';
    const abs = Number.parseInt((editedAbsDays || '').trim(), 10);
    const signed =
      Number.isFinite(abs) ? (abs === 0 ? 0 : timingMode === 'before' ? -Math.abs(abs) : Math.abs(abs)) : 0;
    return formatDate(computeSendDate(eventDate, signed));
  }, [eventDate, editedAbsDays, timingMode]);

  const maxChars = 160;
  const charsCount = editedMessage.length;
  const isOverLimit = charsCount > maxChars;

  const onChangeDays = (txt: string) => {
    // Keep digits only (abs days).
    const cleaned = String(txt || '').replace(/[^\d]/g, '');
    setEditedAbsDays(cleaned);
  };

  const save = async () => {
    if (!userData?.event_id || !row) return;
    if (saving) return;
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
    const signed =
      Number.isFinite(abs) ? (abs === 0 ? 0 : timingMode === 'before' ? -Math.abs(abs) : Math.abs(abs)) : NaN;
    const daysToSave = Number.isFinite(signed) ? signed : (row.days_from_wedding ?? 0);

    setSaving(true);
    try {
      if (row.id) {
        const updatePayload: any = { message_content: msg, days_from_wedding: daysToSave, channel: row.channel };
        let { error } = await supabase.from('notification_settings').update(updatePayload).eq('id', row.id);
        if (error && isMissingColumn(error, 'channel')) {
          delete updatePayload.channel;
          const retry = await supabase.from('notification_settings').update(updatePayload).eq('id', row.id);
          error = retry.error as any;
        }
        if (error) throw error;
      } else {
        const insertPayload: any = {
          event_id: userData.event_id,
          notification_type: row.notification_type,
          title: row.title,
          enabled: Boolean(row.enabled),
          message_content: msg,
          days_from_wedding: daysToSave,
          channel: row.channel || 'SMS',
        };
        let { data, error } = await supabase.from('notification_settings').insert(insertPayload).select().single();
        if (error && isMissingColumn(error, 'channel')) {
          delete insertPayload.channel;
          const retry = await supabase.from('notification_settings').insert(insertPayload).select().single();
          data = retry.data as any;
          error = retry.error as any;
        }
        if (error) throw error;
        setRow(prev => (prev ? { ...prev, ...(data as any) } : prev));
      }

      router.back();
    } catch (e) {
      console.error('Editor save error:', e);
      Alert.alert('שגיאה', 'לא ניתן לשמור שינויים');
    } finally {
      setSaving(false);
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
            backgroundColor: ui.surface,
            borderBottomColor: ui.border,
          },
        ]}
      >
        <BlurView intensity={22} tint="light" style={StyleSheet.absoluteFillObject} />

        <View style={styles.header}>
          <TouchableOpacity
            style={[styles.headerBtn, { backgroundColor: ui.surfaceMuted }]}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="חזרה"
            activeOpacity={0.9}
          >
            <Ionicons name="chevron-forward" size={22} color={ui.text} />
          </TouchableOpacity>

          <View style={styles.headerTitles}>
            <Text style={[styles.headerTitle, { color: ui.text }]} numberOfLines={1}>
              עריכת הודעה
            </Text>

            <View style={[styles.headerSubtitlePill, { backgroundColor: ui.surfaceMuted, borderColor: ui.border }]}>
              <Text style={[styles.headerSubtitle, { color: ui.sub }]} numberOfLines={1} ellipsizeMode="tail">
                {row?.title ?? ''}
              </Text>
            </View>
          </View>

          <View style={{ width: 44 }} />
        </View>
      </View>

      {Platform.OS === 'ios' ? (
        <View style={styles.flex}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <View style={styles.flex}>
              <ScrollView
                style={styles.flex}
                contentContainerStyle={[styles.content, { paddingBottom: 18 }]}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                automaticallyAdjustKeyboardInsets
                showsVerticalScrollIndicator={false}
              >
              {/* Scheduling */}
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: ui.text }]}>תזמון ההודעה</Text>

                <View style={[styles.segmentWrap, { backgroundColor: ui.surfaceMuted }]}>
                  <Pressable
                    onPress={() => setTimingMode('after')}
                    style={[styles.segmentBtn, timingMode === 'after' ? styles.segmentBtnActive : null]}
                    accessibilityRole="button"
                    accessibilityLabel="אחרי האירוע"
                  >
                    <Text style={[styles.segmentText, { color: timingMode === 'after' ? ui.primary : ui.sub }]}>
                      אחרי האירוע
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setTimingMode('before')}
                    style={[styles.segmentBtn, timingMode === 'before' ? styles.segmentBtnActive : null]}
                    accessibilityRole="button"
                    accessibilityLabel="לפני האירוע"
                  >
                    <Text style={[styles.segmentText, { color: timingMode === 'before' ? ui.primary : ui.sub }]}>
                      לפני האירוע
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.cardsRow}>
                  <View
                    style={[
                      styles.computedCard,
                      { backgroundColor: ui.softBlue, borderColor: 'rgba(59,130,246,0.18)' },
                    ]}
                  >
                    <Text style={[styles.computedLabel, { color: 'rgba(59,130,246,0.85)' }]}>תאריך מחושב</Text>
                    <Text style={[styles.computedValue, { color: ui.primary }]}>{computedDateText}</Text>
                  </View>

                  <View style={[styles.daysCard, { backgroundColor: ui.surface, borderColor: ui.border }]}>
                    <View style={styles.daysCardTop}>
                      <Text style={[styles.daysMeta, { color: ui.sub }]}>ימים</Text>
                      <Ionicons name="calendar-outline" size={18} color={ui.iconMuted} />
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

              {/* Message */}
              <View style={styles.section}>
                <View style={styles.messageHeaderRow}>
                  <Text style={[styles.sectionTitle, { color: ui.text }]}>תוכן ההודעה</Text>

                  <View style={styles.messageTools}>
                    <TouchableOpacity
                      style={[styles.toolBtn, { backgroundColor: ui.surfaceMuted, borderColor: 'rgba(17,24,39,0.06)' }]}
                      activeOpacity={0.92}
                      onPress={() => setEditedMessage(prev => `${prev}${prev ? ' ' : ''}{{event_date}}`)}
                      accessibilityRole="button"
                      accessibilityLabel="הוסף תאריך"
                    >
                      <Ionicons name="calendar-outline" size={18} color={ui.sub} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.toolBtn, { backgroundColor: ui.surfaceMuted, borderColor: 'rgba(17,24,39,0.06)' }]}
                      activeOpacity={0.92}
                      onPress={() => setEditedMessage(prev => `${prev}${prev ? ' ' : ''}{{name}}`)}
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
            </ScrollView>

            </View>
          </TouchableWithoutFeedback>
        </View>
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior="height" keyboardVerticalOffset={0}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <View style={styles.flex}>
              <ScrollView
                style={styles.flex}
                contentContainerStyle={[styles.content, { paddingBottom: 18 }]}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                showsVerticalScrollIndicator={false}
              >
                {/* Scheduling */}
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: ui.text }]}>תזמון ההודעה</Text>

                  <View style={[styles.segmentWrap, { backgroundColor: ui.surfaceMuted }]}>
                    <Pressable
                      onPress={() => setTimingMode('after')}
                      style={[styles.segmentBtn, timingMode === 'after' ? styles.segmentBtnActive : null]}
                      accessibilityRole="button"
                      accessibilityLabel="אחרי האירוע"
                    >
                      <Text style={[styles.segmentText, { color: timingMode === 'after' ? ui.primary : ui.sub }]}>
                        אחרי האירוע
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setTimingMode('before')}
                      style={[styles.segmentBtn, timingMode === 'before' ? styles.segmentBtnActive : null]}
                      accessibilityRole="button"
                      accessibilityLabel="לפני האירוע"
                    >
                      <Text style={[styles.segmentText, { color: timingMode === 'before' ? ui.primary : ui.sub }]}>
                        לפני האירוע
                      </Text>
                    </Pressable>
                  </View>

                  <View style={styles.cardsRow}>
                    <View
                      style={[
                        styles.computedCard,
                        { backgroundColor: ui.softBlue, borderColor: 'rgba(59,130,246,0.18)' },
                      ]}
                    >
                      <Text style={[styles.computedLabel, { color: 'rgba(59,130,246,0.85)' }]}>תאריך מחושב</Text>
                      <Text style={[styles.computedValue, { color: ui.primary }]}>{computedDateText}</Text>
                    </View>

                    <View style={[styles.daysCard, { backgroundColor: ui.surface, borderColor: ui.border }]}>
                      <View style={styles.daysCardTop}>
                        <Text style={[styles.daysMeta, { color: ui.sub }]}>ימים</Text>
                        <Ionicons name="calendar-outline" size={18} color={ui.iconMuted} />
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

                {/* Message */}
                <View style={styles.section}>
                  <View style={styles.messageHeaderRow}>
                    <Text style={[styles.sectionTitle, { color: ui.text }]}>תוכן ההודעה</Text>

                    <View style={styles.messageTools}>
                      <TouchableOpacity
                        style={[
                          styles.toolBtn,
                          { backgroundColor: ui.surfaceMuted, borderColor: 'rgba(17,24,39,0.06)' },
                        ]}
                        activeOpacity={0.92}
                        onPress={() => setEditedMessage(prev => `${prev}${prev ? ' ' : ''}{{event_date}}`)}
                        accessibilityRole="button"
                        accessibilityLabel="הוסף תאריך"
                      >
                        <Ionicons name="calendar-outline" size={18} color={ui.sub} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.toolBtn,
                          { backgroundColor: ui.surfaceMuted, borderColor: 'rgba(17,24,39,0.06)' },
                        ]}
                        activeOpacity={0.92}
                        onPress={() => setEditedMessage(prev => `${prev}${prev ? ' ' : ''}{{name}}`)}
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
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      )}

      {/* Bottom actions (part of the page, NOT floating) */}
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
              style={[
                styles.bottomBtnSecondary,
                { borderColor: ui.border, backgroundColor: 'rgba(255,255,255,0.92)' },
              ]}
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
  header: {
    paddingHorizontal: 18,
    paddingBottom: 16,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitles: { flex: 1, alignItems: 'center', gap: 6 },
  headerTitle: { fontSize: 18, fontWeight: '900', textAlign: 'center' },
  headerSubtitlePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: '92%',
  },
  headerSubtitle: { fontSize: 12, fontWeight: '800', textAlign: 'center' },

  content: {
    paddingHorizontal: 16,
    paddingTop: 18,
    gap: 18,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },

  section: {
    paddingHorizontal: 2,
    gap: 12,
  },
  sectionTitle: { fontSize: 13, fontWeight: '900', textAlign: 'right', paddingHorizontal: 2 },

  segmentWrap: {
    flexDirection: 'row-reverse',
    padding: 4,
    borderRadius: 16,
  },
  segmentBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
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
  computedCard: {
    flex: 1,
    height: 76,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  computedLabel: { fontSize: 11, fontWeight: '800' },
  computedValue: {
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'ltr',
    ...(Platform.OS === 'ios' ? { fontVariant: ['tabular-nums'] as any } : null),
  },
  daysCard: {
    flex: 1,
    height: 76,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 1,
    justifyContent: 'space-between',
  },
  daysCardTop: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  daysMeta: { fontSize: 11, fontWeight: '800' },
  daysValue: { fontSize: 22, fontWeight: '900', paddingVertical: 0, paddingHorizontal: 0 },

  messageHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  messageTools: { flexDirection: 'row-reverse', gap: 8 },
  toolBtn: {
    width: 36,
    height: 36,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textareaWrap: { position: 'relative' },
  textarea: {
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 16,
    fontWeight: '700',
    minHeight: 280,
    lineHeight: 24,
    writingDirection: 'rtl',
    borderWidth: 1,
  },
  charCountPill: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderWidth: 1,
  },
  charCountText: { fontSize: 12, fontWeight: '800' },

  helperText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
    opacity: 0.75,
    paddingHorizontal: 2,
    lineHeight: 18,
  },

  bottomBar: {
    position: 'relative',
    borderTopWidth: 1,
  },
  bottomBarInner: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  bottomButtonsRow: {
    flexDirection: 'row-reverse',
    gap: 12,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  bottomBtnSecondary: {
    flex: 1,
    height: 58,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  bottomBtnSecondaryText: { fontSize: 16, fontWeight: '900' },
  bottomBtnPrimary: {
    flex: 2,
    height: 58,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row-reverse',
    gap: 10,
    shadowColor: '#1d4ed8',
    shadowOpacity: 0.20,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  bottomBtnPrimaryText: { fontSize: 16, fontWeight: '900', color: '#fff' },
});

