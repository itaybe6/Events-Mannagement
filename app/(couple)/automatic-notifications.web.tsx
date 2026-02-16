import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { supabase } from '@/lib/supabase';
import { eventService } from '@/lib/services/eventService';
import { useUserStore } from '@/store/userStore';
import { useEventSelectionStore } from '@/store/eventSelectionStore';
import { Event } from '@/types';

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

const normalizeMessage = (s: string) => String(s || '').replace(/\r\n/g, '\n').trim();

const NOTIFICATION_TEMPLATES: NotificationTemplate[] = [
  {
    notification_type: 'reminder_1',
    title: 'הודעה ראשונה',
    days_from_wedding: -30,
    channel: 'SMS',
    defaultMessage:
      'אורחים יקרים,\n' +
      'בתאריך {{תאריך}} תיערך החתונה של {{שמות_חתן_כלה}} ב{{מיקום}}.\n' +
      'למתנה באשראי: [הדביקו כאן קישור]\n' +
      'להנחיות הגעה: [הדביקו כאן קישור]\n' +
      'נשמח לראותכם :)',
  },
  { notification_type: 'reminder_2', title: 'הודעה שנייה', days_from_wedding: -14, channel: 'SMS', defaultMessage: 'היי! האירוע בעוד שבועיים, מחכים לראות אתכם!' },
  { notification_type: 'reminder_3', title: 'הודעה שלישית', days_from_wedding: -7, channel: 'SMS', defaultMessage: 'תזכורת אחרונה: האירוע בעוד שבוע. נשמח לראותכם!' },
  { notification_type: 'whatsapp_event_day', title: 'וואטסאפ ביום האירוע', days_from_wedding: 0, channel: 'WHATSAPP', defaultMessage: 'היום האירוע! נתראה שם' },
  { notification_type: 'after_1', title: 'הודעה רגילה אחרי האירוע', days_from_wedding: 1, channel: 'SMS', defaultMessage: 'תודה שבאתם! היה לנו כיף גדול איתכם.' },
];

const LEGACY_DEFAULT_MESSAGES: Record<string, Set<string>> = {
  reminder_1: new Set([normalizeMessage('שלום! רצינו להזכיר לכם על האירוע הקרוב שלנו.')]),
};

const TITLE_OVERRIDES: Record<string, string> = {
  reminder_1: 'הודעה ראשונה',
  reminder_2: 'הודעה שנייה',
  reminder_3: 'הודעה שלישית',
};

function getDisplayTitle(row: Pick<NotificationSettingRow, 'notification_type' | 'title'>) {
  return TITLE_OVERRIDES[row.notification_type] ?? row.title;
}

function formatOffsetLabel(days: number) {
  if (days === 0) return 'ביום האירוע';
  const abs = Math.abs(days);
  return days < 0 ? `${abs} ימים לפני האירוע` : `${abs} ימים אחרי האירוע`;
}

function formatHeDate(value: unknown) {
  const d = value instanceof Date ? value : new Date(String(value ?? ''));
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const isMissingColumn = (err: any, column: string) =>
  String(err?.code) === '42703' && String(err?.message || '').toLowerCase().includes(column.toLowerCase());

export default function AutomaticNotificationsWebScreen() {
  const router = useRouter();
  const { width: viewportWidth } = useWindowDimensions();
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

  const ui = useMemo(
    () => ({
      primary: '#4F46E5',
      whatsapp: '#25D366',
      bgLight: '#F9FAFB',
      card: '#FFFFFF',
      text: '#111827',
      sub: '#6B7280',
    }),
    []
  );

  const [event, setEvent] = useState<Event | null>(null);
  const [ownerTitle, setOwnerTitle] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [settingsSupported, setSettingsSupported] = useState(true);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettingRow[]>([]);
  const [selectedType, setSelectedType] = useState<string>('reminder_2');
  const [editDraft, setEditDraft] = useState<{ message: string; days: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const sidebarWidth = useMemo(() => {
    // Slightly wider editor on desktop, but keep reasonable bounds.
    // Examples:
    // - 1200px viewport -> 420px
    // - 900px viewport  -> ~350px
    // - small viewports -> 320px
    const desired = Math.round(viewportWidth * 0.35);
    return Math.min(440, Math.max(320, desired));
  }, [viewportWidth]);

  const groomName = useMemo(
    () => String((event as any)?.groomName ?? (event as any)?.groom_name ?? '').trim(),
    [event]
  );
  const brideName = useMemo(
    () => String((event as any)?.brideName ?? (event as any)?.bride_name ?? '').trim(),
    [event]
  );
  const coupleNames = useMemo(() => {
    if (groomName && brideName) return `${groomName} ו${brideName}`;
    return groomName || brideName || '';
  }, [brideName, groomName]);

  const previewVars = useMemo(() => {
    const eventTitle = subtitleFromEvent(event);
    const eventDateText = formatHeDate((event as any)?.date) || '—';
    const loc = String((event as any)?.location ?? '').trim();
    const city = String((event as any)?.city ?? '').trim();
    const eventLocationText = [loc, city].filter(Boolean).join(', ') || '—';

    const vars: Record<string, string> = {
      // שם האורח הוא דוגמה בלבד (אין לנו אורח ספציפי בתצוגה הזאת)
      '{{שם_פרטי}}': 'אורח/ת',
      '{{שם_אירוע}}': eventTitle,
      '{{תאריך}}': eventDateText,
      '{{מיקום}}': eventLocationText,
    };
    if (groomName) vars['{{שם_חתן}}'] = groomName;
    if (brideName) vars['{{שם_כלה}}'] = brideName;
    if (coupleNames) vars['{{שמות_חתן_כלה}}'] = coupleNames;
    return vars;
  }, [brideName, coupleNames, event, groomName]);

  const renderPreviewText = (raw: string) => {
    let out = raw;
    for (const [token, value] of Object.entries(previewVars)) {
      out = out.split(token).join(value);
    }
    return out;
  };

  const getDefaultMessageContent = (name?: string) => {
    const displayName = name && name.trim().length > 0 ? name.trim() : 'בעל/ת האירוע';
    return `הנכם מוזמנים לאירוע של ${displayName}\nפרטי האירוע ואישור הגעתכם בקישור\nנשמח לראותכם בין אורחינו.`;
  };

  const loadOwnerTitle = async (eventData: Event) => {
    const groom = String((eventData as any)?.groomName ?? (eventData as any)?.groom_name ?? '').trim();
    const bride = String((eventData as any)?.brideName ?? (eventData as any)?.bride_name ?? '').trim();
    if (groom && bride) return `${groom} ו${bride}`;
    return String(userData?.name || '').trim();
  };

  const fetchSettings = async (evtId: string, defaultOwner?: string) => {
    const { data: rows, error } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('event_id', evtId)
      .order('days_from_wedding', { ascending: true });

    if (error) {
      const msg = String((error as any)?.message || '').toLowerCase();
      const code = String((error as any)?.code || '');
      if (msg.includes('does not exist') || code === '42P01') {
        setSettingsSupported(false);
        setNotificationSettings([]);
        return;
      }
      console.error('Error fetching notification settings (couple web):', error);
    }

    setSettingsSupported(true);
    const existingMap = new Map<string, any>(((rows as any[]) || []).map((r) => [r.notification_type, r]));

    const merged: NotificationSettingRow[] = NOTIFICATION_TEMPLATES.map((tpl) => {
      const existing = existingMap.get(tpl.notification_type);
      if (existing) {
        const existingMsg = normalizeMessage(String(existing.message_content ?? ''));
        const shouldUpgradeMessage =
          tpl.notification_type in LEGACY_DEFAULT_MESSAGES
            ? existingMsg.length === 0 || LEGACY_DEFAULT_MESSAGES[tpl.notification_type]?.has(existingMsg)
            : existingMsg.length === 0;

        return {
          id: existing.id,
          event_id: existing.event_id,
          notification_type: existing.notification_type,
          title: TITLE_OVERRIDES[tpl.notification_type] ?? existing.title ?? tpl.title,
          enabled: Boolean(existing.enabled),
          message_content: shouldUpgradeMessage ? String(tpl.defaultMessage ?? getDefaultMessageContent(defaultOwner)) : String(existing.message_content ?? ''),
          days_from_wedding: typeof existing.days_from_wedding === 'number' ? existing.days_from_wedding : tpl.days_from_wedding,
          channel: (existing.channel as any) || tpl.channel,
        };
      }

      return {
        notification_type: tpl.notification_type,
        title: TITLE_OVERRIDES[tpl.notification_type] ?? tpl.title,
        enabled: false,
        message_content: tpl.defaultMessage ?? getDefaultMessageContent(defaultOwner),
        days_from_wedding: tpl.days_from_wedding,
        channel: tpl.channel,
      };
    });

    setNotificationSettings(merged);
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!resolvedEventId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const eventData = await eventService.getEvent(resolvedEventId);
        if (cancelled) return;
        setEvent(eventData);
        const title = await loadOwnerTitle(eventData as any);
        if (cancelled) return;
        setOwnerTitle(title);
        await fetchSettings((eventData as any).id, title);
      } catch (e) {
        console.warn('Failed to load couple web automatic notifications:', e);
        if (!cancelled) {
          setEvent(null);
          setOwnerTitle('');
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedEventId]);

  const selectedRow = useMemo(
    () => notificationSettings.find((r) => r.notification_type === selectedType) || null,
    [notificationSettings, selectedType]
  );

  useEffect(() => {
    if (!selectedRow) return;
    setEditDraft({ message: String(selectedRow.message_content || ''), days: Number(selectedRow.days_from_wedding || 0) });
  }, [selectedRow?.notification_type]);

  const allRowsSorted = useMemo(() => {
    const rows = [...notificationSettings];
    rows.sort((a, b) => (a.days_from_wedding ?? 0) - (b.days_from_wedding ?? 0));
    return rows;
  }, [notificationSettings]);

  const regular = useMemo(() => notificationSettings.filter((r) => (r.channel || 'SMS') !== 'WHATSAPP'), [notificationSettings]);
  const whatsapp = useMemo(() => notificationSettings.filter((r) => (r.channel || 'SMS') === 'WHATSAPP'), [notificationSettings]);

  const iconForType = (row: NotificationSettingRow) => {
    const t = row.notification_type;
    if (String(row.channel || 'SMS') === 'WHATSAPP') return 'logo-whatsapp';
    if (t.includes('reminder_1')) return 'megaphone-outline';
    if (t.includes('reminder_2')) return 'calendar-outline';
    if (t.includes('reminder_3')) return 'navigate-outline';
    if (t.includes('after')) return 'heart-outline';
    return 'mail-outline';
  };

  const toggleNotification = async (row: NotificationSettingRow) => {
    if (!event?.id) return;
    const nextEnabled = !row.enabled;

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
        event_id: event.id,
        notification_type: row.notification_type,
        title: getDisplayTitle(row),
        enabled: nextEnabled,
        message_content: row.message_content || tpl?.defaultMessage || getDefaultMessageContent(ownerTitle),
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
      console.error('Error toggling notification (couple web):', e);
      setNotificationSettings((prev) =>
        prev.map((r) => (r.notification_type === row.notification_type ? { ...r, enabled: row.enabled } : r))
      );
    }
  };

  const insertVariable = (token: string) => {
    if (!editDraft) return;
    setEditDraft((d) => (d ? { ...d, message: `${d.message}${d.message ? ' ' : ''}${token}` } : d));
  };

  const saveDraft = async () => {
    if (!event?.id || !selectedRow || !editDraft) return;
    setSaving(true);
    try {
      const payload: any = {
        title: getDisplayTitle(selectedRow),
        message_content: editDraft.message,
        days_from_wedding: editDraft.days,
      };

      if (selectedRow.id) {
        const { error } = await supabase.from('notification_settings').update(payload).eq('id', selectedRow.id);
        if (error) throw error;
        setNotificationSettings((p) =>
          p.map((r) => (r.notification_type === selectedRow.notification_type ? { ...r, ...payload } : r))
        );
        return;
      }

      const tpl = NOTIFICATION_TEMPLATES.find((t) => t.notification_type === selectedRow.notification_type);
      const insertPayload: any = {
        event_id: event.id,
        notification_type: selectedRow.notification_type,
        title: getDisplayTitle(selectedRow),
        enabled: selectedRow.enabled ?? false,
        message_content: editDraft.message || tpl?.defaultMessage || getDefaultMessageContent(ownerTitle),
        days_from_wedding: editDraft.days,
        channel: (selectedRow.channel as any) || tpl?.channel || 'SMS',
      };

      let { data, error } = await supabase.from('notification_settings').insert(insertPayload).select().single();
      if (error && isMissingColumn(error, 'channel')) {
        delete insertPayload.channel;
        const retry = await supabase.from('notification_settings').insert(insertPayload).select().single();
        data = retry.data as any;
        error = retry.error as any;
      }
      if (error) throw error;
      setNotificationSettings((p) =>
        p.map((r) => (r.notification_type === selectedRow.notification_type ? { ...(r as any), ...(data as any) } : r))
      );
    } catch (e) {
      console.error('Error saving notification draft (couple web):', e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.page}>
        <View style={[styles.bg, { backgroundColor: ui.bgLight }]} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={ui.primary} />
          <Text style={styles.centerText}>טוען...</Text>
        </View>
      </View>
    );
  }

  if (!resolvedEventId || !event) {
    return (
      <View style={styles.page}>
        <View style={[styles.bg, { backgroundColor: ui.bgLight }]} />
        <View style={styles.center}>
          <Text style={styles.centerText}>לא נמצא אירוע.</Text>
          <Pressable onPress={() => router.back()} style={styles.backInline}>
            <Ionicons name="arrow-forward" size={18} color={ui.primary} />
            <Text style={[styles.backInlineText, { color: ui.primary }]}>חזרה</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!settingsSupported) {
    return (
      <View style={styles.page}>
        <View style={[styles.bg, { backgroundColor: ui.bgLight }]} />
        <View style={styles.center}>
          <Text style={styles.centerText}>הגדרות הודעות לא זמינות (אין טבלה notification_settings).</Text>
          <Pressable onPress={() => router.back()} style={styles.backInline}>
            <Ionicons name="arrow-forward" size={18} color={ui.primary} />
            <Text style={[styles.backInlineText, { color: ui.primary }]}>חזרה</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <View style={[styles.bg, { backgroundColor: ui.bgLight }]} />

      <View style={styles.body}>
        {/* Sidebar שמאלי */}
        <View style={[styles.sidebar, { width: sidebarWidth }]}>
          <View style={styles.sidebarHeader}>
            <View style={styles.sidebarHeaderRow}>
              <Text style={styles.sidebarTitle}>עריכת הודעה</Text>
              <Text style={styles.sidebarId} numberOfLines={1}>
                {selectedRow?.id ? `${selectedRow.id.slice(0, 8)}` : '48201'}
              </Text>
            </View>
            <Text style={styles.sidebarSubtitle} numberOfLines={2}>
              ערוך את התוכן של "{selectedRow ? getDisplayTitle(selectedRow) : 'בחר הודעה'}"
            </Text>
          </View>

          <ScrollView style={styles.sidebarBody} contentContainerStyle={styles.sidebarBodyContent} showsVerticalScrollIndicator={false}>
            <View style={styles.formBlock}>
              <Text style={styles.label}>זמן שליחה</Text>
              <View style={styles.timeRow}>
                <Pressable
                  onPress={() => {
                    if (!editDraft) return;
                    const next = editDraft.days <= 0 ? Math.abs(editDraft.days || 1) : -Math.abs(editDraft.days || 1);
                    setEditDraft({ ...editDraft, days: next });
                  }}
                  style={({ hovered, pressed }: any) => [
                    styles.selectLike,
                    Platform.OS === 'web' && hovered ? styles.selectLikeHover : null,
                    pressed ? { opacity: 0.9 } : null,
                  ]}
                >
                  <Text style={styles.selectLikeText}>{editDraft && editDraft.days < 0 ? 'לפני' : 'אחרי'}</Text>
                  <Ionicons name="chevron-down" size={14} color="rgba(100,116,139,1)" />
                </Pressable>

                <View style={styles.timeRight}>
                  <TextInput
                    value={String(editDraft?.days ? Math.abs(editDraft.days) : 0)}
                    onChangeText={(txt) => {
                      if (!editDraft) return;
                      const n = Number(String(txt).replace(/[^\d]/g, '')) || 0;
                      const sign = editDraft.days < 0 ? -1 : 1;
                      setEditDraft({ ...editDraft, days: n * sign });
                    }}
                    keyboardType="numeric"
                    style={styles.numberInput}
                  />
                  <View style={[styles.selectLike, styles.selectLikeDisabled]}>
                    <Text style={[styles.selectLikeText, styles.selectLikeTextDisabled]}>ימים</Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.formBlock}>
              <Text style={styles.label}>משתנים זמינים</Text>
              <View style={styles.chips}>
                <Pressable onPress={() => insertVariable('{{שם_פרטי}}')} style={({ pressed }: any) => [styles.chip, pressed ? { opacity: 0.85 } : null]}>
                  <Text style={[styles.chipText, { color: ui.primary }]}>{'{{שם_פרטי}}'}</Text>
                </Pressable>
                <Pressable onPress={() => insertVariable('{{שם_אירוע}}')} style={({ pressed }: any) => [styles.chip, pressed ? { opacity: 0.85 } : null]}>
                  <Text style={[styles.chipText, { color: ui.primary }]}>{'{{שם_אירוע}}'}</Text>
                </Pressable>
                {groomName ? (
                  <Pressable onPress={() => insertVariable('{{שם_חתן}}')} style={({ pressed }: any) => [styles.chip, pressed ? { opacity: 0.85 } : null]}>
                    <Text style={[styles.chipText, { color: ui.primary }]}>{'{{שם_חתן}}'}</Text>
                  </Pressable>
                ) : null}
                {brideName ? (
                  <Pressable onPress={() => insertVariable('{{שם_כלה}}')} style={({ pressed }: any) => [styles.chip, pressed ? { opacity: 0.85 } : null]}>
                    <Text style={[styles.chipText, { color: ui.primary }]}>{'{{שם_כלה}}'}</Text>
                  </Pressable>
                ) : null}
                {coupleNames ? (
                  <Pressable onPress={() => insertVariable('{{שמות_חתן_כלה}}')} style={({ pressed }: any) => [styles.chip, pressed ? { opacity: 0.85 } : null]}>
                    <Text style={[styles.chipText, { color: ui.primary }]}>{'{{שמות_חתן_כלה}}'}</Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={() => insertVariable('{{תאריך}}')} style={({ pressed }: any) => [styles.chip, pressed ? { opacity: 0.85 } : null]}>
                  <Text style={[styles.chipText, { color: ui.primary }]}>{'{{תאריך}}'}</Text>
                </Pressable>
                <Pressable onPress={() => insertVariable('{{מיקום}}')} style={({ pressed }: any) => [styles.chip, pressed ? { opacity: 0.85 } : null]}>
                  <Text style={[styles.chipText, { color: ui.primary }]}>{'{{מיקום}}'}</Text>
                </Pressable>
                <View style={[styles.chip, styles.chipAdd]}>
                  <Text style={styles.chipAddText}>+ משתנה</Text>
                </View>
              </View>
            </View>

            <View style={styles.formBlock}>
              <Text style={styles.label}>תוכן ההודעה</Text>
              <View style={styles.textareaWrap}>
                <TextInput
                  value={editDraft?.message ?? ''}
                  onChangeText={(t) => setEditDraft((d) => (d ? { ...d, message: t } : d))}
                  multiline
                  textAlignVertical="top"
                  style={styles.textarea}
                  placeholder="כתוב הודעה..."
                  placeholderTextColor="rgba(100,116,139,0.6)"
                />
                <Text style={styles.charCount}>{(editDraft?.message ?? '').length}/160 תווים</Text>
              </View>
            </View>

            <View style={styles.previewBlock}>
              <Text style={styles.labelCenter}>תצוגה מקדימה בנייד</Text>
              <View style={styles.phoneFrame}>
                <View style={styles.phoneNotch} />
                <View style={styles.phoneScreen}>
                  <Text style={styles.phoneTime}>09:41</Text>
                  <View style={styles.phoneStatusLeft}>
                    <View style={styles.phoneStatusDot} />
                    <View style={styles.phoneStatusDot} />
                  </View>
                  <View style={styles.phoneHeader}>
                    <View style={styles.phoneAvatar} />
                    <Text style={styles.phoneHeaderTitle} numberOfLines={1}>
                      {ownerTitle || 'ברית'}
                    </Text>
                  </View>
                  <View style={styles.bubble}>
                    <Text style={styles.bubbleText}>
                      {renderPreviewText(editDraft?.message || getDefaultMessageContent(ownerTitle)).replace(/\n/g, '\n')}
                    </Text>
                    <Text style={styles.bubbleTime}>09:42 PM</Text>
                  </View>
                  <View style={styles.datePill}>
                    <Text style={styles.datePillText}>היום</Text>
                  </View>
                </View>
              </View>
            </View>
          </ScrollView>

          <View style={styles.sidebarFooter}>
            <Pressable
              onPress={() => void saveDraft()}
              disabled={saving || !selectedRow || !editDraft}
              style={({ hovered, pressed }: any) => [
                styles.saveBtn,
                saving || !selectedRow || !editDraft ? styles.saveBtnDisabled : null,
                Platform.OS === 'web' && hovered && !(saving || !selectedRow || !editDraft) ? styles.saveBtnHover : null,
                pressed ? { transform: [{ translateY: -1 }], opacity: 0.98 } : null,
              ]}
            >
              <Text style={styles.saveBtnText}>{saving ? 'שומר...' : 'שמור שינויים'}</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                if (!selectedRow) return;
                setEditDraft({ message: String(selectedRow.message_content || ''), days: Number(selectedRow.days_from_wedding || 0) });
              }}
              style={({ hovered, pressed }: any) => [
                styles.cancelBtn,
                Platform.OS === 'web' && hovered ? styles.cancelBtnHover : null,
                pressed ? { opacity: 0.9 } : null,
              ]}
            >
              <Text style={styles.cancelBtnText}>ביטול</Text>
            </Pressable>
          </View>
        </View>

        {/* תוכן מרכזי */}
        <ScrollView style={styles.mainCol} contentContainerStyle={styles.mainColContent} showsVerticalScrollIndicator={false}>
          {/* Timeline */}
          <View style={styles.timelineCard}>
            <View style={styles.timelineHeaderRow}>
              <View style={styles.timelineHeaderRight}>
                <Pressable onPress={() => router.back()} style={styles.backSmall} accessibilityRole="button" accessibilityLabel="חזרה">
                  <Ionicons name="arrow-forward" size={18} color="#4b5563" />
                </Pressable>
                <View style={styles.timelineHeaderDivider} />
                <Text style={styles.timelineHeaderCrumb}>הגדרות הודעות</Text>
              </View>
              <View style={styles.timelineHeaderCenter}>
                <Text style={styles.timelineHeaderTitle}>הודעות אוטומטיות</Text>
                <Text style={styles.timelineHeaderSubtitle} numberOfLines={1}>
                  {ownerTitle ? `של ${ownerTitle}` : 'של בעל/ת האירוע'}
                </Text>
              </View>
              <View style={{ width: 180 }} />
            </View>

            <Text style={styles.timelineSubtitle}>ניהול האירוע של "{ownerTitle || subtitleFromEvent(event)}"</Text>
            <View style={styles.timelineRow}>
              {allRowsSorted.slice(0, 3).map((row, idx) => {
                const active = row.notification_type === selectedType;
                const abs = Math.abs(row.days_from_wedding);
                const label = row.days_from_wedding === 0 ? 'יום האירוע' : `לפני ${abs} יום`;

                return (
                  <React.Fragment key={row.notification_type}>
                    <Pressable onPress={() => setSelectedType(row.notification_type)} style={styles.timelineItem}>
                      <Text style={[styles.timelineLabel, active ? { color: ui.primary, fontWeight: '900' } : null]}>{label}</Text>
                      <View style={[styles.timelineDot, active ? { backgroundColor: ui.primary } : null]}>
                        {row.days_from_wedding === 0 ? <Ionicons name="calendar" size={20} color="#fff" /> : null}
                      </View>
                      {active ? <View style={[styles.timelineActiveLine, { backgroundColor: ui.primary }]} /> : null}
                      <Text style={[styles.timelineTitle, active ? { color: '#1f2937', fontWeight: '900' } : null]} numberOfLines={1}>
                        {getDisplayTitle(row)}
                      </Text>
                      <Text style={styles.timelineDate}>15.10.2024</Text>
                    </Pressable>
                    {idx < 2 ? <View style={styles.timelineConnector} /> : null}
                  </React.Fragment>
                );
              })}
            </View>
          </View>

          {/* כרטיסי הודעות */}
          <View style={styles.cardsContainer}>
            <View style={styles.cardsRow}>
              {allRowsSorted.slice(0, 3).map((row, idx) => {
                const selected = row.notification_type === selectedType;
                const number = String(idx + 1).padStart(2, '0');

                return (
                  <Pressable
                    key={row.notification_type}
                    onPress={() => setSelectedType(row.notification_type)}
                    style={({ hovered }: any) => [
                      styles.messageCard,
                      selected ? styles.messageCardSelected : null,
                      Platform.OS === 'web' && hovered && !selected ? styles.messageCardHover : null,
                    ]}
                  >
                    <View style={styles.cardTopRow}>
                      <Text style={styles.cardNumber}>{number}</Text>
                      <View style={[styles.cardIconWrap, selected ? { backgroundColor: ui.primary } : null]}>
                        <Ionicons name={iconForType(row) as any} size={20} color={selected ? '#fff' : ui.primary} />
                      </View>
                    </View>

                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {getDisplayTitle(row)}
                    </Text>

                    <View style={styles.cardMetaRow}>
                      <Ionicons name="time-outline" size={14} color="#9ca3af" />
                      <Text style={styles.cardMetaText}>{formatOffsetLabel(row.days_from_wedding)}</Text>
                      <Ionicons
                        name="information-circle-outline"
                        size={14}
                        color="#d1d5db"
                        style={Platform.OS === 'web' ? ({ marginInlineStart: 'auto' } as any) : ({ marginRight: 'auto' } as any)}
                      />
                    </View>

                    <View style={styles.cardBottomRow}>
                      <Pressable
                        onPress={(e: any) => {
                          e?.stopPropagation?.();
                          e?.preventDefault?.();
                          void toggleNotification(row);
                        }}
                        style={styles.statusBadge}
                      >
                        <Text style={[styles.statusText, row.enabled ? styles.statusSuccessText : styles.statusOffText]}>
                          {row.enabled ? 'פעילה' : 'כבויה'}
                        </Text>
                      </Pressable>

                      {selected ? (
                        <View style={styles.editBtn}>
                          <Text style={[styles.editBtnText, { color: ui.primary }]}>ערוך</Text>
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {/* כרטיס WhatsApp */}
            {whatsapp.length > 0 ? (
              <View style={styles.whatsappRow}>
                <View style={styles.whatsappCard}>
                  <View style={styles.whatsappHeader}>
                    <View style={styles.whatsappIconWrap}>
                      <Ionicons name="logo-whatsapp" size={24} color="#fff" />
                    </View>
                    <View style={styles.premiumBadge}>
                      <Text style={styles.premiumText}>PREMIUM</Text>
                    </View>
                  </View>

                  <Text style={styles.whatsappTitle}>תזכורת WhatsApp</Text>
                  <Text style={styles.whatsappDesc}>
                    שליחת הודעת WhatsApp אישית 4 שעות לפני האירוע עם קישור לכניסה מהירה.
                  </Text>

                  <View style={styles.whatsappButtons}>
                    <Pressable style={styles.whatsappBtnPrimary}>
                      <Text style={styles.whatsappBtnPrimaryText}>תצוגה מקדימה</Text>
                    </Pressable>
                    <Pressable style={styles.whatsappBtnSecondary}>
                      <Text style={styles.whatsappBtnSecondaryText}>שליחה בדיקה</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

function subtitleFromEvent(event: Event | null) {
  if (!event) return 'האירוע שלך';
  const title = String((event as any)?.title || '').trim();
  return title || 'האירוע שלך';
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
    backgroundColor: 'transparent',
  },

  bg: {
    ...StyleSheet.absoluteFillObject,
  },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  centerText: { fontSize: 14, fontWeight: '900', color: 'rgba(100,116,139,1)', textAlign: 'center' },
  backInline: { marginTop: 12, flexDirection: 'row-reverse', gap: 8, alignItems: 'center', ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null) },
  backInlineText: { fontSize: 13, fontWeight: '900' },

  body: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'row-reverse',
    gap: 0,
  },

  // Sidebar (שמאלי)
  sidebar: {
    backgroundColor: '#fff',
    borderLeftWidth: 1,
    borderLeftColor: '#E5E7EB',
    ...(Platform.OS === 'web' ? ({ boxShadow: '4px 0 12px rgba(0,0,0,0.04)' } as any) : null),
  },
  sidebarHeader: { padding: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  sidebarHeaderRow: { flexDirection: 'row-reverse', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 },
  sidebarTitle: { fontSize: 20, fontWeight: '900', color: '#111827' },
  sidebarId: { fontSize: 11, fontWeight: '800', color: '#9CA3AF' },
  sidebarSubtitle: { fontSize: 14, fontWeight: '800', color: '#6B7280', textAlign: 'right' },
  sidebarBody: { flex: 1, minHeight: 0 },
  sidebarBodyContent: { padding: 14, paddingBottom: 14, gap: 14 },

  formBlock: { gap: 8 },
  label: { fontSize: 12, fontWeight: '900', color: '#374151', textAlign: 'right', textTransform: 'uppercase', letterSpacing: 0.5 },
  labelCenter: { fontSize: 12, fontWeight: '900', color: '#374151', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5 },

  timeRow: { flexDirection: 'row-reverse', gap: 8, alignItems: 'center' },
  timeRight: { flex: 1, minWidth: 0, flexDirection: 'row-reverse', gap: 8 },
  selectLike: {
    height: 40,
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minWidth: 100,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  selectLikeHover: { backgroundColor: '#F3F4F6' },
  selectLikeText: { fontSize: 14, fontWeight: '800', color: '#111827' },
  selectLikeDisabled: { opacity: 1, ...(Platform.OS === 'web' ? ({ cursor: 'default' } as any) : null) },
  selectLikeTextDisabled: { color: '#6B7280' },

  numberInput: {
    width: 72,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    textAlign: 'center',
    fontWeight: '900',
    fontSize: 16,
    color: '#111827',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null),
  },

  chips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: 'rgba(79,70,229,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(79,70,229,0.15)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  chipText: { fontSize: 12, fontWeight: '800' },
  chipAdd: { backgroundColor: 'rgba(147,51,234,0.08)', borderColor: 'rgba(147,51,234,0.15)' },
  chipAddText: { fontSize: 12, fontWeight: '800', color: '#9333EA' },

  textareaWrap: { position: 'relative' },
  textarea: {
    height: 160,
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 22,
    textAlign: 'right',
    writingDirection: 'rtl',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null),
  },
  charCount: { position: 'absolute', left: 12, bottom: 10, fontSize: 12, fontWeight: '800', color: '#9CA3AF' },

  previewBlock: { marginTop: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6', gap: 10 },
  phoneFrame: {
    alignSelf: 'center',
    width: 260,
    height: 350,
    borderRadius: 28,
    backgroundColor: '#1E293B',
    borderWidth: 4,
    borderColor: '#334155',
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 16px 36px rgba(0,0,0,0.2)' } as any) : null),
  },
  phoneNotch: { position: 'absolute', top: 0, left: '50%', transform: [{ translateX: -54 }], width: 108, height: 18, backgroundColor: '#334155', borderBottomLeftRadius: 12, borderBottomRightRadius: 12, zIndex: 5 },
  phoneScreen: { flex: 1, paddingTop: 26, paddingBottom: 10, paddingHorizontal: 12, backgroundColor: '#E5DDD5' },
  phoneTime: { position: 'absolute', top: 6, right: 12, fontSize: 10, fontWeight: '900', color: '#fff' },
  phoneStatusLeft: { position: 'absolute', top: 6, left: 12, flexDirection: 'row-reverse', gap: 4 },
  phoneStatusDot: { width: 8, height: 8, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.85)' },
  phoneHeader: { position: 'absolute', top: 0, left: 0, right: 0, height: 44, backgroundColor: '#075E54', flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 8, paddingTop: 8 },
  phoneAvatar: { width: 20, height: 20, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.2)', marginLeft: 6 },
  phoneHeaderTitle: { fontSize: 11, fontWeight: '900', color: '#fff', textAlign: 'right', flexShrink: 1 },

  bubble: {
    marginTop: 34,
    alignSelf: 'flex-end',
    maxWidth: '90%',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderTopRightRadius: 3,
    paddingHorizontal: 8,
    paddingVertical: 6,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 4px 12px rgba(0,0,0,0.08)' } as any) : null),
  },
  bubbleText: { fontSize: 10, lineHeight: 14, fontWeight: '800', color: '#111827', textAlign: 'right' },
  bubbleTime: { position: 'absolute', left: 8, bottom: 4, fontSize: 7, fontWeight: '900', color: '#9CA3AF' },
  datePill: { alignSelf: 'center', marginTop: 12, backgroundColor: '#DCF8C6', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  datePillText: { fontSize: 9, fontWeight: '900', color: '#475569' },

  sidebarFooter: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    flexDirection: 'row-reverse',
    gap: 10,
  },
  saveBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', boxShadow: '0 12px 28px rgba(79,70,229,0.18)' } as any) : null),
  },
  saveBtnHover: { backgroundColor: '#4338CA' },
  saveBtnDisabled: { opacity: 0.6, ...(Platform.OS === 'web' ? ({ cursor: 'default' } as any) : null) },
  saveBtnText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  cancelBtn: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  cancelBtnHover: { backgroundColor: '#F9FAFB' },
  cancelBtnText: { fontSize: 13, fontWeight: '900', color: '#6B7280' },

  // Main column (מרכז)
  mainCol: { flex: 1, minWidth: 0, backgroundColor: '#fff' },
  mainColContent: { padding: 24, paddingBottom: 40, gap: 20 },

  timelineCard: {
    borderRadius: 12,
    backgroundColor: '#fff',
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 4px 16px rgba(0,0,0,0.04)' } as any) : null),
  },

  timelineHeaderRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  timelineHeaderRight: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, width: 180 },
  backSmall: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  timelineHeaderDivider: { width: 1, height: 22, backgroundColor: '#E5E7EB' },
  timelineHeaderCrumb: { fontSize: 12, fontWeight: '900', color: '#64748B' },
  timelineHeaderCenter: { alignItems: 'center', flex: 1 },
  timelineHeaderTitle: { fontSize: 16, fontWeight: '900', color: '#111827' },
  timelineHeaderSubtitle: { fontSize: 12, fontWeight: '800', color: '#4F46E5', marginTop: 2 },

  timelineSubtitle: { fontSize: 14, fontWeight: '800', color: '#6B7280', textAlign: 'right', marginBottom: 16 },
  timelineRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between' },
  timelineItem: { alignItems: 'center', gap: 8, flex: 1, ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null) },
  timelineLabel: { fontSize: 12, fontWeight: '800', color: '#9CA3AF', textAlign: 'center' },
  timelineDot: {
    width: 14,
    height: 14,
    borderRadius: 999,
    backgroundColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineActiveLine: { width: 2, height: 26, marginVertical: 2 },
  timelineTitle: { fontSize: 13, fontWeight: '800', color: '#9CA3AF', textAlign: 'center' },
  timelineDate: { fontSize: 11, fontWeight: '800', color: '#D1D5DB', textAlign: 'center', marginTop: 2 },
  timelineConnector: { width: 60, height: 1, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 50 },

  cardsContainer: { gap: 16 },
  cardsRow: {
    ...(Platform.OS === 'web'
      ? ({
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 16,
          alignItems: 'stretch',
        } as any)
      : ({
          flexDirection: 'row-reverse',
          alignItems: 'stretch',
          justifyContent: 'flex-start',
          gap: 16,
          flexWrap: 'wrap',
        } as any)),
  },
  whatsappRow: {
    ...(Platform.OS === 'web'
      ? ({
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 16,
          alignItems: 'stretch',
        } as any)
      : ({
          flexDirection: 'row-reverse',
          gap: 16,
          alignItems: 'stretch',
          justifyContent: 'flex-start',
        } as any)),
  },

  messageCard: {
    ...(Platform.OS === 'web' ? ({} as any) : ({ flexGrow: 1, flexBasis: '32%', minWidth: 240 } as any)),
    borderRadius: 14,
    backgroundColor: '#fff',
    padding: 18,
    borderWidth: 2,
    borderColor: '#F3F4F6',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', boxShadow: '0 6px 20px rgba(0,0,0,0.05)' } as any) : null),
  },
  messageCardHover: { borderColor: '#E5E7EB' },
  messageCardSelected: { borderColor: '#4F46E5', ...(Platform.OS === 'web' ? ({ boxShadow: '0 8px 28px rgba(79,70,229,0.12)' } as any) : null) },

  cardTopRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 },
  cardNumber: { fontSize: 36, fontWeight: '900', color: '#F3F4F6' },
  cardIconWrap: { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(79,70,229,0.08)', alignItems: 'center', justifyContent: 'center' },

  cardTitle: { fontSize: 20, fontWeight: '900', color: '#111827', textAlign: 'right', marginBottom: 10 },

  cardMetaRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginBottom: 14 },
  cardMetaText: { fontSize: 13, fontWeight: '800', color: '#6B7280', textAlign: 'right' },

  cardBottomRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 4, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' },
  statusText: { fontSize: 12, fontWeight: '900' },
  statusSuccessText: { color: '#16A34A' },
  statusOffText: { color: '#6B7280' },

  editBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  editBtnText: { fontSize: 14, fontWeight: '900' },

  whatsappCard: {
    borderRadius: 14,
    backgroundColor: '#F0FDF4',
    padding: 20,
    borderWidth: 1,
    borderColor: '#86EFAC',
    ...(Platform.OS === 'web' ? ({ gridColumn: '1 / span 1' } as any) : ({ width: '32%', minWidth: 240 } as any)),
  },
  whatsappHeader: { flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 },
  whatsappIconWrap: { width: 48, height: 48, borderRadius: 999, backgroundColor: '#25D366', alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? ({ boxShadow: '0 8px 24px rgba(37,211,102,0.25)' } as any) : null) },
  premiumBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: '#DCFCE7' },
  premiumText: { fontSize: 9, fontWeight: '900', color: '#16A34A', letterSpacing: 0.8 },

  whatsappTitle: { fontSize: 20, fontWeight: '900', color: '#111827', textAlign: 'right', marginBottom: 8 },
  whatsappDesc: { fontSize: 14, fontWeight: '700', color: '#6B7280', textAlign: 'right', marginBottom: 18, lineHeight: 22 },

  whatsappButtons: { flexDirection: 'row-reverse', gap: 10 },
  whatsappBtnPrimary: { flex: 1, height: 44, borderRadius: 10, backgroundColor: '#25D366', alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? ({ cursor: 'pointer', boxShadow: '0 8px 20px rgba(37,211,102,0.2)' } as any) : null) },
  whatsappBtnPrimaryText: { fontSize: 14, fontWeight: '900', color: '#fff' },
  whatsappBtnSecondary: { flex: 1, height: 44, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#86EFAC', alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null) },
  whatsappBtnSecondaryText: { fontSize: 14, fontWeight: '900', color: '#16A34A' },
});

