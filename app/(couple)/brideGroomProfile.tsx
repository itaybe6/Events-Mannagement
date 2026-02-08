import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Modal, TextInput, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { useUserStore } from '@/store/userStore';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';

interface NotificationSetting {
  id?: string;
  notification_type: string;
  title: string;
  enabled: boolean;
  message_content?: string;
  days_from_wedding?: number; // negative=before, 0=event day, positive=after
  channel?: 'SMS' | 'WHATSAPP';
}

const DEFAULT_NOTIFICATION_TEMPLATES: Omit<NotificationSetting, 'id' | 'enabled'>[] = [
  // 3 regular (SMS) before the event
  // reminder_1 default is generated dynamically based on event type + owner name
  { notification_type: 'reminder_1', title: 'הודעה רגילה 1 (לפני האירוע)', days_from_wedding: -30, channel: 'SMS', message_content: '' },
  { notification_type: 'reminder_2', title: 'הודעה רגילה 2 (לפני האירוע)', days_from_wedding: -14, channel: 'SMS', message_content: 'היי! האירוע בעוד שבועיים, מחכים לראות אתכם!' },
  { notification_type: 'reminder_3', title: 'הודעה רגילה 3 (לפני האירוע)', days_from_wedding: -7, channel: 'SMS', message_content: 'תזכורת אחרונה: האירוע בעוד שבוע. נשמח לראותכם!' },
  // 1 WhatsApp on the event day
  { notification_type: 'whatsapp_event_day', title: 'וואטסאפ ביום האירוע', days_from_wedding: 0, channel: 'WHATSAPP', message_content: 'היום האירוע! נתראה שם' },
  // 1 regular (SMS) after the event
  { notification_type: 'after_1', title: 'הודעה רגילה אחרי האירוע', days_from_wedding: 1, channel: 'SMS', message_content: 'תודה שבאתם! היה לנו כיף גדול איתכם.' },
];

export default function BrideGroomSettings() {
  const { userData, logout } = useUserStore();
  const router = useRouter();
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const [notificationsY, setNotificationsY] = useState<number | null>(null);
  const [didAutoScroll, setDidAutoScroll] = useState(false);
  const [weddingDate, setWeddingDate] = useState<Date | null>(null);
  const [eventMeta, setEventMeta] = useState<{ id: string; title: string; date: Date; groomName?: string; brideName?: string; rsvpLink?: string } | null>(null);
  const [notifications, setNotifications] = useState<NotificationSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingNotification, setEditingNotification] = useState<NotificationSetting | null>(null);
  const [editedMessage, setEditedMessage] = useState('');
  const [timingMode, setTimingMode] = useState<'before' | 'after'>('before');
  const [editedAbsDays, setEditedAbsDays] = useState<string>('0');

  const notificationUI = {
    primary: '#3b82f6',
    whatsapp: '#25D366',
    bg: '#F9FAFB',
    card: '#FFFFFF',
    border: '#E5E7EB',
    text: '#111827',
    muted: '#6B7280',
    faint: 'rgba(17,24,39,0.45)',
    green: '#16A34A',
  };

  const getDefaultMessageContent = (userName?: string) => {
    const displayName = userName && userName.trim().length > 0 ? userName.trim() : 'בעל/ת האירוע';
    return `הנכם מוזמנים לטקס החינה של ${displayName}\nפרטי האירוע ואישור הגעתכם בקישור\nנשמח לראותכם בין אורחינו.`;
  };

  const getDefaultFirstReminderMessage = () => {
    const ownerName = (userData?.name || '').trim() || 'בעל/ת האירוע';
    const title = String(eventMeta?.title ?? '').toLowerCase();
    const hasCoupleNames = Boolean(eventMeta?.groomName || eventMeta?.brideName);

    const kind: 'wedding' | 'brit' | 'barMitzvah' | 'batMitzvah' | 'henna' | 'event' =
      hasCoupleNames || title.includes('חתונה') || title.includes('wedding')
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

    const groom = String(eventMeta?.groomName ?? '').trim();
    const bride = String(eventMeta?.brideName ?? '').trim();
    const couple = groom && bride ? `${groom} ול${bride}` : ownerName;

    const label =
      kind === 'wedding'
        ? `לחתונה של ${couple}`
        : kind === 'brit'
          ? `לברית של ${ownerName}`
          : kind === 'barMitzvah'
            ? `לבר מצווה של ${ownerName}`
            : kind === 'batMitzvah'
              ? `לבת מצווה של ${ownerName}`
              : kind === 'henna'
                ? `לחינה של ${ownerName}`
                : `לאירוע של ${ownerName}`;

    const dateText = eventMeta?.date ? eventMeta.date.toLocaleDateString('he-IL') : '';
    const explicitLink = String(eventMeta?.rsvpLink ?? '').trim();
    const base = 'https://i.e2grsvp.com/e/';
    const code = String((eventMeta as any)?.id ?? userData?.event_id ?? '').trim();
    const link = explicitLink || `${base}${code}`;

    return `שלום, הוזמנתם ${label} בתאריך ${dateText}.\nלפרטים ואישור הגעה היכנסו לקישור הבא:\n${link}`;
  };

  useEffect(() => {
    if (userData?.event_id) {
      initializeData();
    }
  }, [userData?.event_id]);

  useEffect(() => {
    // When arriving via deep-link to the notifications section.
    if (focus !== 'notifications') {
      if (didAutoScroll) setDidAutoScroll(false);
      return;
    }
    if (notificationsY == null) return;
    if (didAutoScroll) return;

    // Small offset so the section title is visible below any headers.
    scrollRef.current?.scrollTo({ y: Math.max(0, notificationsY - 16), animated: true });
    setDidAutoScroll(true);
  }, [focus, notificationsY, didAutoScroll]);

  // Refresh data when screen comes into focus (e.g., returning from message editor)
  useFocusEffect(
    React.useCallback(() => {
      if (userData?.event_id && !loading) {
        fetchOrCreateNotificationSettings();
      }
    }, [userData?.event_id, loading])
  );

  const initializeData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        fetchWeddingDate(),
        fetchOrCreateNotificationSettings()
      ]);
    } catch (error) {
      console.error('Error initializing data:', error);
      Alert.alert('שגיאה', 'לא ניתן לטעון את ההגדרות');
    } finally {
      setLoading(false);
    }
  };

  const fetchWeddingDate = async () => {
    if (!userData?.event_id) return;
    
    const { data, error } = await supabase
      .from('events')
        .select('id, title, date, groom_name, bride_name, rsvp_link')
      .eq('id', userData.event_id)
      .single();
    
    if (!error && data) {
      setWeddingDate(new Date(data.date));
      setEventMeta({
        id: data.id,
        title: String((data as any).title || ''),
        date: new Date(data.date),
        groomName: (data as any).groom_name ?? undefined,
        brideName: (data as any).bride_name ?? undefined,
          rsvpLink: (data as any).rsvp_link ?? undefined,
      });
    }
  };

  const fetchOrCreateNotificationSettings = async () => {
    if (!userData?.event_id) return;

    const { data: existingSettings, error: fetchError } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('event_id', userData.event_id)
      .order('days_from_wedding', { ascending: true });

    if (fetchError) {
      console.error('Error fetching notification settings:', fetchError);
    }

    // Create a map of existing settings by notification_type
    const existingSettingsMap = new Map(
      (((existingSettings as any[]) || [])).map(setting => [setting.notification_type, setting])
    );

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

    const legacyFixes: Array<{ id: string; message_content: string }> = [];

    // Merge templates with existing settings
    const mergedNotifications = DEFAULT_NOTIFICATION_TEMPLATES.map(template => {
      const existingSetting = existingSettingsMap.get(template.notification_type);
      if (existingSetting) {
        // Use existing setting from database
        if (template.notification_type === 'reminder_1' && existingSetting.id) {
          const currentMsg = String(existingSetting.message_content ?? '');
          if (shouldReplaceLegacyFirstReminder(currentMsg)) {
            const nextMsg = getDefaultFirstReminderMessage();
            legacyFixes.push({ id: existingSetting.id, message_content: nextMsg });
            return {
              ...existingSetting,
              message_content: nextMsg,
              days_from_wedding:
                typeof existingSetting.days_from_wedding === 'number'
                  ? existingSetting.days_from_wedding
                  : (template.days_from_wedding ?? 0),
              channel: (existingSetting.channel as any) || (template.channel as any) || 'SMS',
            };
          }
        }
        return {
          ...existingSetting,
          days_from_wedding:
            typeof existingSetting.days_from_wedding === 'number'
              ? existingSetting.days_from_wedding
              : (template.days_from_wedding ?? 0),
          channel: (existingSetting.channel as any) || (template.channel as any) || 'SMS',
        };
      } else {
        // Use template with enabled = false (not saved to DB yet)
        const message =
          template.notification_type === 'reminder_1'
            ? getDefaultFirstReminderMessage()
            : (template.message_content || getDefaultMessageContent(userData?.name));
        return {
          ...template,
          enabled: false,
          message_content: message,
        };
      }
    });

    setNotifications(mergedNotifications);

    // Best-effort: persist the fixed default for legacy reminder_1 rows.
    if (legacyFixes.length) {
      legacyFixes.forEach((fix) => {
        supabase
          .from('notification_settings')
          .update({ message_content: fix.message_content })
          .eq('id', fix.id)
          .then(({ error: updateError }) => {
            if (updateError) {
              console.warn('Failed to auto-update legacy reminder_1 message (couple):', updateError);
            }
          });
      });
    }
  };

  const computeSendDate = (days: number) => {
    if (!weddingDate) return null;
    const d = new Date(weddingDate);
    d.setDate(d.getDate() + days);
    return d;
  };

  const formatSendLabel = (days: number) => {
    if (days === 0) return 'ביום האירוע';
    const abs = Math.abs(days);
    return days < 0 ? `${abs} ימים לפני האירוע` : `${abs} ימים אחרי האירוע`;
  };

  const formatDate = (d: Date | null) => {
    if (!d) return '';
    return d.toLocaleDateString('he-IL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const isMissingColumn = (err: any, column: string) =>
    String(err?.code) === '42703' && String(err?.message || '').toLowerCase().includes(column.toLowerCase());

  const toggleNotification = async (id: string | undefined, notification_type: string, currentEnabled: boolean) => {
    try {
      const newEnabled = !currentEnabled;

      if (id) {
        // Update existing setting in database
        const { error } = await supabase
          .from('notification_settings')
          .update({ enabled: newEnabled })
          .eq('id', id);

        if (error) {
          console.error('Error updating notification setting:', error);
          Alert.alert('שגיאה', 'לא ניתן לעדכן את ההגדרה');
          return;
        }

        // Update local state
        setNotifications(prev => 
          prev.map(notification => 
            notification.notification_type === notification_type
              ? { ...notification, enabled: newEnabled }
              : notification
          )
        );
      } else {
        // No ID means this setting doesn't exist in DB yet - create it
        const template = DEFAULT_NOTIFICATION_TEMPLATES.find(t => t.notification_type === notification_type);
        if (!template || !userData?.event_id) return;

        const defaultMsg =
          notification_type === 'reminder_1'
            ? getDefaultFirstReminderMessage()
            : (template.message_content || getDefaultMessageContent(userData?.name));

        const newSetting: any = {
          ...template,
          event_id: userData.event_id,
          enabled: true,
          message_content: defaultMsg,
          days_from_wedding: template.days_from_wedding ?? 0,
          channel: template.channel || 'SMS',
        };

        let { data, error } = await supabase
          .from('notification_settings')
          .insert(newSetting)
          .select()
          .single();
        if (error && isMissingColumn(error, 'channel')) {
          delete newSetting.channel;
          const retry = await supabase
            .from('notification_settings')
            .insert(newSetting)
            .select()
            .single();
          data = retry.data as any;
          error = retry.error as any;
        }

        if (error) {
          console.error('Error creating notification setting:', error);
          Alert.alert('שגיאה', 'לא ניתן ליצור את ההגדרה');
          return;
        }

        // Update local state with the new setting that has an ID
        setNotifications(prev => 
          prev.map(notification => 
            notification.notification_type === notification_type
              ? data
              : notification
          )
        );
      }
    } catch (error) {
      console.error('Error toggling notification:', error);
      Alert.alert('שגיאה', 'לא ניתן לעדכן את ההגדרה');
    }
  };

  // Removed navigation to separate message editor; editing happens in modal now

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const groomName = String(eventMeta?.groomName ?? '').trim();
  const brideName = String(eventMeta?.brideName ?? '').trim();
  const weddingNames = groomName && brideName ? `${groomName} ו${brideName}` : '';

  const openEditModal = (notification: NotificationSetting) => {
    const rawDays = notification.days_from_wedding ?? 0;
    setEditingNotification(notification);
    setEditedMessage(notification.message_content || '');
    setTimingMode(rawDays < 0 ? 'before' : 'after');
    setEditedAbsDays(String(Math.abs(rawDays)));
    setEditModalVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!editingNotification || !userData?.event_id) return;

    try {
      const abs = Number.parseInt((editedAbsDays || '').trim(), 10);
      const signed =
        Number.isFinite(abs) ? (abs === 0 ? 0 : timingMode === 'before' ? -Math.abs(abs) : Math.abs(abs)) : NaN;
      const daysToSave = Number.isFinite(signed) ? signed : (editingNotification.days_from_wedding ?? 0);

      if (editingNotification.id) {
        const updatePayload: any = { message_content: editedMessage, days_from_wedding: daysToSave, channel: editingNotification.channel };
        let { error } = await supabase
          .from('notification_settings')
          .update(updatePayload)
          .eq('id', editingNotification.id);
        if (error && isMissingColumn(error, 'channel')) {
          delete updatePayload.channel;
          const retry = await supabase
            .from('notification_settings')
            .update(updatePayload)
            .eq('id', editingNotification.id);
          error = retry.error as any;
        }

        if (error) {
          console.error('Error updating notification:', error);
          Alert.alert('שגיאה', 'לא ניתן לעדכן את ההודעה');
          return;
        }

        setNotifications(prev =>
          prev.map(n =>
            n.notification_type === editingNotification.notification_type
              ? {
                  ...n,
                  message_content: editedMessage,
                  days_from_wedding: daysToSave,
                }
              : n
          )
        );
      } else {
        const insertPayload: any = {
          event_id: userData.event_id,
          notification_type: editingNotification.notification_type,
          title: editingNotification.title,
          message_content: editedMessage,
          enabled: editingNotification.enabled ?? false,
          days_from_wedding: daysToSave,
          channel: editingNotification.channel || 'SMS',
        };
        let { data, error } = await supabase
          .from('notification_settings')
          .insert(insertPayload)
          .select()
          .single();
        if (error && isMissingColumn(error, 'channel')) {
          delete insertPayload.channel;
          const retry = await supabase
            .from('notification_settings')
            .insert(insertPayload)
            .select()
            .single();
          data = retry.data as any;
          error = retry.error as any;
        }

        if (error) {
          console.error('Error creating notification:', error);
          Alert.alert('שגיאה', 'לא ניתן ליצור את ההודעה');
          return;
        }

        setNotifications(prev =>
          prev.map(n =>
            n.notification_type === editingNotification.notification_type ? data as any : n
          )
        );
      }

      setEditModalVisible(false);
    } catch (e) {
      console.error('Error saving edit:', e);
      Alert.alert('שגיאה', 'לא ניתן לשמור את ההודעה');
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.loadingText}>טוען הגדרות...</Text>
      </View>
    );
  }

  // Group notifications by type
  const regularNotifications = notifications.filter(n => (n.channel || 'SMS') !== 'WHATSAPP');
  const whatsappNotifications = notifications.filter(n => (n.channel || 'SMS') === 'WHATSAPP');

  const renderNotificationGroup = (title: string, notificationsList: NotificationSetting[], variant: 'regular' | 'whatsapp') => (
    <View style={styles.notificationGroup}>
      <View style={styles.groupHeader}>
        <Text style={styles.groupTitle}>{title}</Text>
      </View>
      
      <View style={styles.cardsStack}>
        {notificationsList.map((notification) => {
          const enabled = Boolean(notification.enabled);
          const days = notification.days_from_wedding ?? 0;
          const computed = weddingDate ? formatDate(computeSendDate(days)) : '';

          return (
            <TouchableOpacity
              key={notification.notification_type}
              activeOpacity={0.92}
              style={[
                styles.notificationCard,
                { backgroundColor: notificationUI.card, borderColor: notificationUI.border },
                variant === 'whatsapp' ? styles.notificationCardWhatsapp : null,
              ]}
              onPress={() => openEditModal(notification)}
              accessibilityRole="button"
              accessibilityLabel={`עריכת ${notification.title}`}
            >
              {variant === 'whatsapp' ? (
                <View style={[styles.whatsappAccent, { backgroundColor: notificationUI.whatsapp }]} />
              ) : null}

              <View style={styles.cardMain}>
                <Text style={[styles.cardTitle, { color: notificationUI.text }]} numberOfLines={2}>
                  {notification.title}
                </Text>

                <View style={styles.cardMetaRow}>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    style={styles.statusBtn}
                    onPress={(e) => {
                      (e as any)?.stopPropagation?.();
                      toggleNotification(notification.id, notification.notification_type, enabled);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={enabled ? 'כיבוי הודעה' : 'הפעלת הודעה'}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        { color: enabled ? notificationUI.green : notificationUI.faint },
                      ]}
                    >
                      {enabled ? 'פעיל' : 'כבוי'}
                    </Text>
                  </TouchableOpacity>

                  <Text style={[styles.metaBullet, { color: 'rgba(107,114,128,0.70)' }]}>•</Text>
                  <Text style={[styles.metaText, { color: notificationUI.muted }]} numberOfLines={1}>
                    {formatSendLabel(days)}
                  </Text>

                  {computed ? (
                    <>
                      <Text style={[styles.metaBullet, { color: 'rgba(107,114,128,0.70)' }]}>•</Text>
                      <Text style={[styles.metaText, { color: notificationUI.muted }]} numberOfLines={1}>
                        {computed}
                      </Text>
                    </>
                  ) : null}
                </View>
              </View>

              <View style={styles.cardChevron}>
                <Ionicons name="chevron-back" size={20} color={notificationUI.faint} />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView 
        ref={scrollRef}
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <TouchableOpacity style={styles.editProfileIconButton} onPress={() => router.push('/profile-editor')}>
            <Ionicons name="create-outline" size={20} color={colors.primary} />
          </TouchableOpacity>
          
          <View style={styles.profileIconContainer}>
            {userData?.avatar_url ? (
              <Image
                source={{ uri: userData.avatar_url }}
                style={styles.profileAvatar}
                contentFit="cover"
                transition={120}
              />
            ) : (
              <Ionicons name="person-circle" size={80} color={colors.primary} />
            )}
          </View>
          <Text style={styles.profileName}>{weddingNames || userData?.name}</Text>
          {weddingNames ? <Text style={styles.profileSubName}>{userData?.name}</Text> : null}
          <Text style={styles.profileEmail}>{userData?.email}</Text>
        </View>

        {/* Removed separate message editor button; editing per reminder row */}

        {/* Notifications Section */}
        <View
          style={styles.notificationsSection}
          onLayout={(e) => {
            setNotificationsY(e.nativeEvent.layout.y);
          }}
        >
          {/* Regular Notifications */}
          {renderNotificationGroup('הודעות רגילות', regularNotifications, 'regular')}
          
          {/* WhatsApp Notifications */}
          {renderNotificationGroup('הודעות וואטסאפ', whatsappNotifications, 'whatsapp')}
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>התנתק</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Unified Edit Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={editModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
        >
          {Platform.OS === 'web' ? (
            <View
              style={[
                StyleSheet.absoluteFillObject,
                { backdropFilter: 'blur(10px)', backgroundColor: 'rgba(107,114,128,0.50)' },
              ]}
            />
          ) : (
            <BlurView intensity={18} tint="default" style={StyleSheet.absoluteFillObject} />
          )}

          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <View style={styles.modalOverlayTouchable} />
          </TouchableWithoutFeedback>

          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalCard}>
              {/* Header */}
              <View style={styles.modalHeader}>
                <TouchableOpacity
                  style={styles.modalCloseBtn}
                  onPress={() => {
                    Keyboard.dismiss();
                    setEditModalVisible(false);
                  }}
                  activeOpacity={0.9}
                  accessibilityRole="button"
                  accessibilityLabel="סגירה"
                >
                  <Ionicons name="close" size={18} color={'rgba(107,114,128,0.95)'} />
                </TouchableOpacity>

                <View style={styles.modalHeaderTitles}>
                  <Text style={styles.modalTitle}>עריכת הודעה</Text>
                  <Text style={styles.modalSubtitle} numberOfLines={2}>
                    {editingNotification?.title ?? ''}
                  </Text>
                </View>
                <View style={{ width: 40 }} />
              </View>

              <View style={styles.modalDivider} />

              {/* Body */}
              <View style={styles.modalBody}>
                <View style={styles.block}>
                  <Text style={styles.blockLabel}>תיזמון ההודעה</Text>
                  <View style={styles.segmentWrap}>
                    <TouchableOpacity
                      style={[styles.segmentBtn, timingMode === 'before' ? styles.segmentBtnActive : null]}
                      onPress={() => setTimingMode('before')}
                      activeOpacity={0.92}
                      accessibilityRole="button"
                      accessibilityLabel="לפני האירוע"
                    >
                      <Text style={[styles.segmentText, timingMode === 'before' ? styles.segmentTextActive : null]}>
                        לפני האירוע
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.segmentBtn, timingMode === 'after' ? styles.segmentBtnActive : null]}
                      onPress={() => setTimingMode('after')}
                      activeOpacity={0.92}
                      accessibilityRole="button"
                      accessibilityLabel="אחרי האירוע"
                    >
                      <Text style={[styles.segmentText, timingMode === 'after' ? styles.segmentTextActive : null]}>
                        אחרי האירוע
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.timingRow}>
                    <View style={styles.daysInputWrap}>
                      <Ionicons name="calendar-outline" size={18} color={'rgba(107,114,128,0.95)'} style={styles.daysIcon} />
                      <TextInput
                        value={editedAbsDays}
                        onChangeText={setEditedAbsDays}
                        placeholder="0"
                        placeholderTextColor={'rgba(107,114,128,0.65)'}
                        style={styles.daysInput}
                        keyboardType="numeric"
                        textAlign="center"
                      />
                      <Text style={styles.daysSuffix}>ימים</Text>
                    </View>

                    <View style={styles.computedPill}>
                      <Text style={styles.computedLabel}>תאריך מחושב</Text>
                      <Text style={styles.computedValue}>
                        {(() => {
                          const abs = Number.parseInt((editedAbsDays || '').trim(), 10);
                          const signed =
                            Number.isFinite(abs) ? (abs === 0 ? 0 : timingMode === 'before' ? -Math.abs(abs) : Math.abs(abs)) : 0;
                          return weddingDate ? formatDate(computeSendDate(signed)) : '';
                        })()}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.bodyDivider} />

                <View style={styles.block}>
                  <View style={styles.messageHeaderRow}>
                    <View style={styles.messageTools}>
                      <TouchableOpacity
                        style={styles.toolBtn}
                        activeOpacity={0.92}
                        onPress={() => setEditedMessage(prev => `${prev}${prev ? ' ' : ''}{{name}}`)}
                        accessibilityRole="button"
                        accessibilityLabel="הוסף שם"
                      >
                        <Ionicons name="person-add-outline" size={16} color={'rgba(107,114,128,0.95)'} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.toolBtn}
                        activeOpacity={0.92}
                        onPress={() => setEditedMessage(prev => `${prev}${prev ? ' ' : ''}{{event_date}}`)}
                        accessibilityRole="button"
                        accessibilityLabel="הוסף תאריך"
                      >
                        <Ionicons name="calendar-outline" size={16} color={'rgba(107,114,128,0.95)'} />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.blockLabel}>תוכן ההודעה</Text>
                  </View>

                  <View style={styles.textareaWrap}>
                    <TextInput
                      style={styles.textarea}
                      value={editedMessage}
                      onChangeText={setEditedMessage}
                      placeholder="הקלד את הודעתך כאן..."
                      placeholderTextColor={'rgba(107,114,128,0.75)'}
                      multiline
                      numberOfLines={5}
                      textAlign="right"
                      textAlignVertical="top"
                    />
                    <View style={styles.charCountPill}>
                      <Text style={styles.charCountText}>{`${editedMessage.length}/160 תווים`}</Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Footer */}
              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.footerBtnSecondary}
                  onPress={() => setEditModalVisible(false)}
                  activeOpacity={0.92}
                  accessibilityRole="button"
                  accessibilityLabel="ביטול"
                >
                  <Text style={styles.footerBtnSecondaryText}>ביטול</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.footerBtnPrimary}
                  onPress={handleSaveEdit}
                  activeOpacity={0.92}
                  accessibilityRole="button"
                  accessibilityLabel="שמור שינויים"
                >
                  <Ionicons name="save-outline" size={16} color="#fff" />
                  <Text style={styles.footerBtnPrimaryText}>שמור שינויים</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray[50],
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: colors.textLight,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 20,
    paddingBottom: 120,
  },
  profileCard: {
    backgroundColor: colors.white,
    marginHorizontal: 20,
    borderRadius: 20,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: colors.richBlack,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 32,
    position: 'relative',
  },
  profileIconContainer: {
    marginBottom: 16,
  },
  profileAvatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: colors.gray[100],
  },
  profileName: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  profileSubName: {
    marginTop: -2,
    fontSize: 14,
    fontWeight: '700',
    color: colors.textLight,
    textAlign: 'center',
    marginBottom: 6,
  },
  profileEmail: {
    fontSize: 16,
    color: colors.textLight,
    textAlign: 'center',
  },
  editProfileIconButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.gray[100],
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.richBlack,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    zIndex: 1,
  },
  editMessagesButton: {
    backgroundColor: colors.primary,
    marginHorizontal: 20,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  editMessagesText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '600',
    marginRight: 8,
  },
  notificationsSection: {
    marginHorizontal: 20,
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 10,
    textAlign: 'right',
  },
  noteWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 6,
    marginBottom: 18,
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    color: '#6B7280',
    textAlign: 'right',
    lineHeight: 18,
  },
  logoutButton: {
    backgroundColor: colors.error,
    marginHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: colors.error,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  logoutButtonText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '600',
  },
  notificationGroup: {
    marginBottom: 32,
  },
  groupHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 8,
    gap: 10,
  },
  groupTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'right',
  },
  cardsStack: {
    gap: 16,
  },
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
    right: 0,
    width: 4,
    height: '100%',
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
  },
  cardMain: {
    flex: 1,
    alignItems: 'flex-end',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'right',
  },
  cardMetaRow: {
    marginTop: 8,
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  statusBtn: {
    paddingVertical: 2,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '800',
  },
  metaBullet: {
    marginHorizontal: 10,
    fontSize: 14,
    fontWeight: '800',
  },
  metaText: {
    fontSize: 14,
    fontWeight: '700',
  },
  cardChevron: {
    paddingRight: 4,
    paddingLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  modalScroll: {
    flex: 1,
    width: '100%',
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
  },
  modalOverlayTouchable: {
    ...StyleSheet.absoluteFillObject,
  },

  modalCard: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 32,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 18 },
    elevation: 8,
    overflow: 'hidden',
  },
  modalHeader: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  modalCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalHeaderTitles: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
  },
  modalSubtitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
    textAlign: 'center',
  },
  modalDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 24,
    width: '90%',
    alignSelf: 'center',
    marginBottom: 18,
  },
  modalBody: {
    paddingHorizontal: 24,
    paddingTop: 0,
    paddingBottom: 22,
    gap: 18,
  },
  block: { gap: 10 },
  blockLabel: { fontSize: 13, fontWeight: '900', color: '#111827', textAlign: 'right' },
  segmentWrap: {
    flexDirection: 'row-reverse',
    gap: 6,
    padding: 4,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
  },
  segmentBtn: {
    flex: 1,
    height: 42,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: colors.black,
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  segmentText: { fontSize: 13, fontWeight: '800', color: '#6B7280' },
  segmentTextActive: { color: '#1d4ed8' },

  timingRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  daysInputWrap: {
    flex: 1,
    height: 54,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
  },
  daysIcon: { position: 'absolute', right: 12 },
  daysSuffix: { position: 'absolute', left: 12, fontSize: 12, fontWeight: '700', color: '#6B7280' },
  daysInput: {
    paddingHorizontal: 40,
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
    height: 54,
  },
  computedPill: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(29,78,216,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(29,78,216,0.16)',
    alignItems: 'flex-end',
    minWidth: 128,
  },
  computedLabel: { fontSize: 11, fontWeight: '800', color: 'rgba(29,78,216,0.75)' },
  computedValue: { marginTop: 4, fontSize: 13, fontWeight: '900', color: 'rgba(29,78,216,0.95)' },

  bodyDivider: { height: 1, backgroundColor: '#E5E7EB' },

  messageHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  messageTools: { flexDirection: 'row-reverse', gap: 8 },
  toolBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textareaWrap: { position: 'relative' },
  textarea: {
    borderWidth: 0,
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    minHeight: 150,
    lineHeight: 20,
    writingDirection: 'rtl',
  },
  charCountPill: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    opacity: 0.75,
  },
  charCountText: { fontSize: 11, fontWeight: '800', color: '#6B7280' },

  modalFooter: {
    padding: 18,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    flexDirection: 'row-reverse',
    gap: 10,
    backgroundColor: '#FFFFFF',
  },
  footerBtnSecondary: {
    flex: 1,
    height: 54,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  footerBtnSecondaryText: { fontSize: 15, fontWeight: '900', color: '#111827' },
  footerBtnPrimary: {
    flex: 2,
    height: 54,
    borderRadius: 16,
    backgroundColor: '#1d4ed8',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row-reverse',
    gap: 8,
    shadowColor: '#1d4ed8',
    shadowOpacity: 0.24,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  footerBtnPrimaryText: { fontSize: 15, fontWeight: '900', color: '#fff' },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  dateDisplay: {
    marginLeft: 8,
    fontSize: 16,
    color: colors.text,
  },
  // (legacy modal styles removed in favor of the new modern editor modal)
}); 