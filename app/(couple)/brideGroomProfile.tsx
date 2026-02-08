import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Platform, ActivityIndicator } from 'react-native';
import { useUserStore } from '@/store/userStore';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';

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
  const [eventMeta, setEventMeta] = useState<{
    id: string;
    title: string;
    date: Date;
    groomName?: string;
    brideName?: string;
    rsvpLink?: string;
    image?: string;
  } | null>(null);
  const [notifications, setNotifications] = useState<NotificationSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [coverUploading, setCoverUploading] = useState(false);


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
        // Refresh event meta too (image/date/names) so cover updates immediately after editing elsewhere.
        fetchWeddingDate();
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
        .select('id, title, date, groom_name, bride_name, rsvp_link, image')
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
        image: (data as any).image ?? undefined,
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

  const guessImageExt = (asset: any): string => {
    const fileName = String(asset?.fileName ?? '');
    const uri = String(asset?.uri ?? '');
    const mimeType = String(asset?.mimeType ?? '');

    const fromMime = mimeType.split('/')[1]?.toLowerCase();
    if (fromMime && ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes(fromMime)) {
      return fromMime === 'jpeg' ? 'jpg' : fromMime;
    }

    const candidate = (fileName || uri).split('?')[0];
    const dot = candidate.lastIndexOf('.');
    if (dot !== -1 && dot < candidate.length - 1) {
      const ext = candidate.slice(dot + 1).toLowerCase();
      if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes(ext)) {
        return ext === 'jpeg' ? 'jpg' : ext;
      }
    }

    return 'jpg';
  };

  const base64ToUint8Array = (base64: string) => {
    const cleaned = String(base64 || '').replace(/[^A-Za-z0-9+/=]/g, '');
    const padding = cleaned.endsWith('==') ? 2 : cleaned.endsWith('=') ? 1 : 0;
    const byteLength = (cleaned.length * 3) / 4 - padding;
    const bytes = new Uint8Array(byteLength);

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let byteIndex = 0;

    for (let i = 0; i < cleaned.length; i += 4) {
      const c1 = chars.indexOf(cleaned[i]);
      const c2 = chars.indexOf(cleaned[i + 1]);
      const c3 = chars.indexOf(cleaned[i + 2]);
      const c4 = chars.indexOf(cleaned[i + 3]);

      const triple = (c1 << 18) | (c2 << 12) | ((c3 & 63) << 6) | (c4 & 63);
      if (byteIndex < byteLength) bytes[byteIndex++] = (triple >> 16) & 0xff;
      if (byteIndex < byteLength) bytes[byteIndex++] = (triple >> 8) & 0xff;
      if (byteIndex < byteLength) bytes[byteIndex++] = triple & 0xff;
    }

    return bytes;
  };

  const guessContentType = (ext: string, fallback?: string | null) => {
    if (fallback) return fallback;
    switch (ext) {
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      case 'gif':
        return 'image/gif';
      case 'heic':
      case 'heif':
        return 'image/heic';
      case 'jpg':
      default:
        return 'image/jpeg';
    }
  };

  const pickAndUploadEventCover = async () => {
    const eventId = String(eventMeta?.id ?? userData?.event_id ?? '').trim();
    if (!eventId) {
      Alert.alert('שגיאה', 'לא נמצא מזהה אירוע לעדכון תמונה');
      return;
    }

    try {
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('הרשאה נדרשת', 'כדי לבחור תמונה יש לאשר גישה לגלריה');
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.85,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0] as any;

      const ext = guessImageExt(asset);
      const filePath = `events/${eventId}/${Date.now()}.${ext}`;
      const contentType = guessContentType(ext, asset?.mimeType);

      setCoverUploading(true);

      let uploadBody: Blob | Uint8Array | null = null;
      if (asset?.base64) {
        uploadBody = base64ToUint8Array(asset.base64);
      } else {
        const res = await fetch(asset.uri);
        uploadBody = await res.blob();
      }
      if (!uploadBody) throw new Error('חסרים נתוני תמונה להעלאה');

      const { error: uploadError } = await supabaseAdmin.storage
        .from('event-images')
        .upload(filePath, uploadBody as any, { upsert: true, contentType });
      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage.from('event-images').getPublicUrl(filePath);
      const publicUrl = publicData.publicUrl;

      let finalUrl = publicUrl;
      try {
        const probe = await fetch(publicUrl, { method: 'GET' });
        if (!probe.ok) throw new Error('Public URL not accessible');
      } catch {
        const { data: signedData } = await supabaseAdmin.storage
          .from('event-images')
          .createSignedUrl(filePath, 60 * 60 * 24 * 30);
        if (signedData?.signedUrl) finalUrl = signedData.signedUrl;
      }

      const { error: updateError } = await supabase.from('events').update({ image: finalUrl }).eq('id', eventId);
      if (updateError) throw updateError;

      setEventMeta((prev) => (prev ? { ...prev, image: finalUrl } : prev));
      Alert.alert('נשמר', 'תמונת האירוע עודכנה');
    } catch (e: any) {
      const message = e?.message ? String(e.message) : 'שגיאה לא ידועה';
      Alert.alert('שגיאה', `לא ניתן להעלות תמונת אירוע.\n\n${message}`);
    } finally {
      setCoverUploading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const groomName = String(eventMeta?.groomName ?? '').trim();
  const brideName = String(eventMeta?.brideName ?? '').trim();
  const weddingNames = groomName && brideName ? `${groomName} ו${brideName}` : '';

  const getEventCoverSource = () => {
    const title = String(eventMeta?.title ?? '').toLowerCase();

    const hasBarMitzvah =
      title.includes('בר מצו') || title.includes('בר-מצו') || title.includes('bar mitz');
    const hasBaby =
      title.includes('ברית') ||
      title.includes('בריתה') ||
      title.includes('תינוק') ||
      title.includes('תינוקת') ||
      title.includes('baby') ||
      title.includes('בייבי');

    const img = String(eventMeta?.image ?? '').trim();
    if (/^https?:\/\//i.test(img)) return { uri: img };

    if (hasBarMitzvah) return require('../../assets/images/Bar Mitzvah.jpg');
    if (hasBaby) return require('../../assets/images/baby.jpg');

    const hasCoupleNames = Boolean(eventMeta?.groomName || eventMeta?.brideName);
    const isWedding = hasCoupleNames || title.includes('חתונה') || title.includes('wedding');
    if (isWedding) return require('../../assets/images/bride and groom.jpg');

    return require('../../assets/images/wedding.jpg');
  };

  const openEditScreen = (notification: NotificationSetting) => {
    router.push({
      pathname: '/(couple)/notification-editor',
      params: { notificationType: notification.notification_type },
    });
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
              onPress={() => openEditScreen(notification)}
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

          <View style={styles.eventCoverWrap}>
            <Image
              source={getEventCoverSource()}
              style={styles.eventCoverImg}
              contentFit="cover"
              transition={150}
            />
            <TouchableOpacity
              style={[styles.coverEditBtn, coverUploading && styles.coverEditBtnDisabled]}
              onPress={pickAndUploadEventCover}
              disabled={coverUploading}
              accessibilityRole="button"
              accessibilityLabel="עריכת תמונת אירוע"
            >
              {coverUploading ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Ionicons name="camera" size={18} color={colors.white} />
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.profileContent}>
          
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
    alignItems: 'center',
    shadowColor: colors.richBlack,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 32,
    position: 'relative',
    overflow: 'hidden',
  },
  eventCoverWrap: {
    width: '100%',
    height: 140,
    backgroundColor: colors.gray[100],
    position: 'relative',
  },
  eventCoverImg: {
    width: '100%',
    height: '100%',
  },
  coverEditBtn: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(17,24,39,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  coverEditBtnDisabled: {
    opacity: 0.75,
  },
  profileContent: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 24,
  },
  profileIconContainer: {
    marginTop: -44,
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