import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, SafeAreaView, TouchableOpacity, Platform, useWindowDimensions, Modal, Alert, Pressable, TextInput, KeyboardAvoidingView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { eventService } from '@/lib/services/eventService';
import { guestService } from '@/lib/services/guestService';
import { Ionicons } from '@expo/vector-icons';
import { Event, Guest } from '@/types';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import DateTimePickerModal from 'react-native-modal-datetime-picker';

const HERO_IMAGES = {
  baby: require('../../assets/images/baby.jpg'),
  barMitzvah: require('../../assets/images/Bar Mitzvah.jpg'),
  wedding: require('../../assets/images/wedding.jpg'),
} as const;

export default function AdminEventDetailsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [event, setEvent] = useState<Event | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [userName, setUserName] = useState<string>('');
  const [userAvatarUrl, setUserAvatarUrl] = useState<string>('');
  const [avatarPreviewOpen, setAvatarPreviewOpen] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [editDatePickerOpen, setEditDatePickerOpen] = useState(false);
  const [editForm, setEditForm] = useState<{
    date: Date;
    location: string;
    city: string;
    image: string;
    groomName: string;
    brideName: string;
  }>({
    date: new Date(),
    location: '',
    city: '',
    image: '',
    groomName: '',
    brideName: '',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  // Tabs header height (see `app/(admin)/_layout.tsx` headerStyle.height)
  const headerHeight = 76;

  useEffect(() => {
    const eventId =
      typeof id === 'string' ? id : Array.isArray(id) ? id[0] : undefined;

    let active = true;
    const load = async () => {
      if (!eventId) {
        if (!active) return;
        setError('חסר מזהה אירוע');
        setEvent(null);
        setGuests([]);
        setLoading(false);
        return;
      }

      if (!active) return;
      setLoading(true);
      setError(null);

      try {
        const [eventData, guestsData] = await Promise.all([
          eventService.getEvent(eventId),
          guestService.getGuests(eventId),
        ]);

        if (!active) return;

        setEvent(eventData ?? null);
        setGuests(Array.isArray(guestsData) ? guestsData : []);

        if (!eventData) {
          setError('האירוע לא נמצא');
          return;
        }

        // שליפת שם המשתמש
        if (eventData.user_id) {
          const { data: userData, error: userError } = await supabase
            .from('users')
            .select('name, avatar_url')
            .eq('id', eventData.user_id)
            .maybeSingle();

          if (active && !userError && userData) {
            setUserName(String(userData.name || ''));
            setUserAvatarUrl(String((userData as any).avatar_url || ''));
          }
        }
      } catch (e) {
        console.error('Admin event details load error:', e);
        if (!active) return;
        setError('שגיאה בטעינת האירוע');
        setEvent(null);
        setGuests([]);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.gray[100], justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.gray[100], justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, textAlign: 'center' }}>{error}</Text>
        <TouchableOpacity
          onPress={() => router.replace('/(admin)/admin-events')}
          style={{ marginTop: 16, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.primary }}
          activeOpacity={0.9}
        >
          <Text style={{ color: '#fff', fontWeight: '800' }}>חזרה לרשימת אירועים</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.gray[100], justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, textAlign: 'center' }}>האירוע לא נמצא</Text>
        <TouchableOpacity
          onPress={() => router.replace('/(admin)/admin-events')}
          style={{ marginTop: 16, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.primary }}
          activeOpacity={0.9}
        >
          <Text style={{ color: '#fff', fontWeight: '800' }}>חזרה לרשימת אירועים</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const confirmed = guests.filter(g => g.status === 'מגיע').length;
  const declined = guests.filter(g => g.status === 'לא מגיע').length;
  const pending = guests.filter(g => g.status === 'ממתין').length;
  const seated = guests.filter(g => g.tableId).length;
  const totalGuests = guests.length;
  const seatedPercent = totalGuests ? Math.round((seated / totalGuests) * 100) : 0;

  // Format date: 23.10 | חמישי
  const dateObj = new Date(event.date);
  const day = dateObj.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
  const weekday = dateObj.toLocaleDateString('he-IL', { weekday: 'long' });

  // פונקציה חדשה: בדוק/צור מפת הושבה
  const handleSeatingMap = async () => {
    if (!event?.id) return;
    // בדוק אם קיימת מפה
    const { data, error } = await supabase
      .from('seating_maps')
      .select('*')
      .eq('event_id', event.id)
      .single();
    if (!data) {
      // צור מפה חדשה
      await supabase.from('seating_maps').insert({
        event_id: event.id,
        num_tables: 0,
        tables: [],
        annotations: [],
      });
    }
    // IMPORTANT: Keep admin tab bar by staying inside /(admin) group
    router.push(`/(admin)/BrideGroomSeating?eventId=${event.id}`);
  };

  const openEditEvent = () => {
    if (!event) return;
    const nextDate = event?.date ? new Date(event.date) : new Date();
    setEditForm({
      date: Number.isFinite(nextDate.getTime()) ? nextDate : new Date(),
      location: String(event.location ?? ''),
      city: String(event.city ?? ''),
      image: String(event.image ?? ''),
      groomName: String((event as any).groomName ?? ''),
      brideName: String((event as any).brideName ?? ''),
    });
    setEditOpen(true);
  };

  const base64ToUint8Array = (base64: string) => {
    const cleaned = base64.replace(/[^A-Za-z0-9+/=]/g, '');
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

  const guessImageExt = (asset: { uri: string; fileName?: string | null; mimeType?: string | null }) => {
    const mime = String(asset.mimeType || '').toLowerCase();
    const fromMime = mime.split('/')[1];
    if (fromMime && ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes(fromMime)) {
      return fromMime === 'jpeg' ? 'jpg' : fromMime;
    }

    const candidate = String(asset.fileName || asset.uri).split('?')[0];
    const dot = candidate.lastIndexOf('.');
    if (dot !== -1 && dot < candidate.length - 1) {
      const ext = candidate.slice(dot + 1).toLowerCase();
      if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes(ext)) {
        return ext === 'jpeg' ? 'jpg' : ext;
      }
    }

    return 'jpg';
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
    if (!event?.id) return;

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
      const asset = result.assets[0];

      const ext = guessImageExt(asset);
      const filePath = `events/${event.id}/${Date.now()}.${ext}`;
      const contentType = guessContentType(ext, (asset as any)?.mimeType);

      setCoverUploading(true);

      let uploadBody: Blob | Uint8Array | null = null;
      if ((asset as any)?.base64) {
        uploadBody = base64ToUint8Array((asset as any).base64);
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
        const { data: signedData } = await supabaseAdmin.storage.from('event-images').createSignedUrl(filePath, 60 * 60 * 24 * 30);
        if (signedData?.signedUrl) finalUrl = signedData.signedUrl;
      }

      setEditForm(f => ({ ...f, image: finalUrl }));
    } catch (e) {
      const message = e instanceof Error ? e.message : 'שגיאה לא ידועה';
      Alert.alert('שגיאה', `לא ניתן להעלות תמונה.\n\n${message}`);
    } finally {
      setCoverUploading(false);
    }
  };

  const saveEditEvent = async () => {
    if (!event?.id) return;

    const nextLocation = (editForm.location || '').trim();
    if (!nextLocation) {
      Alert.alert('שגיאה', 'יש להזין מיקום');
      return;
    }

    // If wedding, require names (basic validation)
    if (isWeddingEvent()) {
      const g = (editForm.groomName || '').trim();
      const b = (editForm.brideName || '').trim();
      if (!g || !b) {
        Alert.alert('שגיאה', 'באירוע חתונה יש להזין שם חתן ושם כלה');
        return;
      }
    }

    setEditSaving(true);
    try {
      const updates: any = {
        date: editForm.date,
        location: nextLocation,
        city: (editForm.city || '').trim(),
      };
      const img = (editForm.image || '').trim();
      if (img) updates.image = img;

      if (isWeddingEvent()) {
        updates.groomName = (editForm.groomName || '').trim();
        updates.brideName = (editForm.brideName || '').trim();
      }

      const updated = await eventService.updateEvent(event.id, updates);
      setEvent(updated);
      setEditOpen(false);
      Alert.alert('נשמר', 'פרטי האירוע עודכנו');
    } catch (e) {
      console.error('Save event edit error:', e);
      Alert.alert('שגיאה', 'לא ניתן לשמור את השינויים');
    } finally {
      setEditSaving(false);
    }
  };

  // Color system inspired by the provided HTML mock (kept local to this screen)
  // IMPORTANT: do not use a hook here, because this screen has an early return during loading
  // (changing hook order between renders breaks the Rules of Hooks).
  const ui = {
    bg: '#F3F4F6',
    text: '#0d111c',
    muted: '#5d6b88',
    primary: '#0f45e6',
    glassBorder: 'rgba(17, 24, 39, 0.08)',
    glassFill: '#FFFFFF',
  } as const;

  const getHeroImageSource = () => {
    const title = String(event?.title ?? '').toLowerCase();
    const hasBarMitzvah =
      title.includes('בר מצו') || title.includes('בר-מצו') || title.includes('bar mitz');
    const hasBaby =
      title.includes('ברית') ||
      title.includes('בריתה') ||
      title.includes('תינוק') ||
      title.includes('תינוקת') ||
      title.includes('baby') ||
      title.includes('בייבי');

    if (hasBarMitzvah) return HERO_IMAGES.barMitzvah;
    if (hasBaby) return HERO_IMAGES.baby;

    const img = String(event?.image ?? '').trim();
    if (/^https?:\/\//i.test(img)) return { uri: img };

    return HERO_IMAGES.wedding;
  };

  const getEventTypeLabel = () => {
    const raw = String(event?.title ?? '').trim();
    if (!raw) return 'אירוע';
    // Common pattern in the design: "סוג אירוע – ..." → keep only the type
    const parts = raw.split(/(?:\s*[–—-]\s*)/g).map(p => p.trim()).filter(Boolean);
    return parts[0] || raw;
  };

  const isWeddingEvent = () => {
    const label = getEventTypeLabel();
    return label === 'חתונה' || String(event?.title ?? '').includes('חתונה');
  };

  const groomLabel = () => (event?.groomName || '').trim() || 'לא הוזן';
  const brideLabel = () => (event?.brideName || '').trim() || 'לא הוזן';

  const getInitials = (name: string) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return '';
    const parts = trimmed.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] ?? '';
    const second = parts.length > 1 ? parts[1]?.[0] ?? '' : '';
    return (first + second).toUpperCase();
  };

  const ProgressRing = ({
    size,
    strokeWidth,
    progress,
    color,
    value,
    label,
    valueFontSize,
  }: {
    size: number;
    strokeWidth: number;
    progress: number; // 0..1
    color: string;
    value: number;
    label: string;
    valueFontSize: number;
  }) => {
    const r = (size - strokeWidth) / 2;
    const c = 2 * Math.PI * r;
    const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
    const dashOffset = c * (1 - clamped);

    return (
      <View style={styles.ringWrap}>
        <View style={{ width: size, height: size }}>
          <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={'rgba(17, 24, 39, 0.08)'}
              strokeWidth={strokeWidth}
              fill="transparent"
            />
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              fill="transparent"
              strokeDasharray={`${c} ${c}`}
              strokeDashoffset={dashOffset}
              originX={size / 2}
              originY={size / 2}
              rotation={-90}
            />
          </Svg>
          <View style={styles.ringCenter}>
            <Text style={[styles.ringValue, { fontSize: valueFontSize, color: ui.text }]}>{value}</Text>
          </View>
        </View>
        <Text style={[styles.ringLabel, { color: 'rgba(17, 24, 39, 0.55)' }]}>{label}</Text>
      </View>
    );
  };

  const GlassPanel = ({
    children,
    style,
  }: {
    children: React.ReactNode;
    style?: any;
  }) => {
    // BlurView is supported on native and web, but the visual differs; we keep a consistent fallback fill.
    return (
      <View style={[styles.glassOuter, { borderColor: ui.glassBorder }, style]}>
        <BlurView intensity={28} tint="light" style={styles.glassBlur}>
          <View style={[styles.glassInner, { backgroundColor: ui.glassFill }]}>{children}</View>
        </BlurView>
      </View>
    );
  };

  const ActionRow = ({
    title,
    subtitle,
    iconName,
    iconBg,
    iconColor,
    onPress,
    accessibilityLabel,
  }: {
    title: string;
    subtitle: string;
    iconName: keyof typeof Ionicons.glyphMap;
    iconBg: string;
    iconColor: string;
    onPress: () => void;
    accessibilityLabel: string;
  }) => {
    return (
      <TouchableOpacity
        style={styles.actionRow}
        activeOpacity={0.9}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <View style={styles.actionRowContent}>
          <View style={styles.actionRowTextWrap}>
            <Text style={[styles.actionRowTitle, { color: ui.text }]}>{title}</Text>
            <Text style={[styles.actionRowSubtitle, { color: 'rgba(17, 24, 39, 0.60)' }]}>{subtitle}</Text>
          </View>

          <View style={[styles.actionRowIconSquare, { backgroundColor: iconBg }]}>
            <Ionicons name={iconName} size={22} color={iconColor} />
          </View>
        </View>

        <View style={styles.actionRowChevronCircle}>
          <Ionicons name="chevron-back" size={20} color={'rgba(17, 24, 39, 0.55)'} />
        </View>
      </TouchableOpacity>
    );
  };

  const heroHeight = Math.max(420, Math.min(620, windowHeight * 0.62));
  // Keep the end of the scroll content above the tab bar
  const tabBarReserve = Platform.OS === 'web' ? 30 : (Platform.OS === 'ios' ? 30 : 20) + 65 + 24;

  return (
    <View style={[styles.safeRoot, { backgroundColor: ui.bg }]}>
      <SafeAreaView style={styles.safe}>
      {/* Background blobs */}
      <View pointerEvents="none" style={styles.bgLayer}>
        <LinearGradient
          colors={['rgba(224,231,255,0.95)', 'rgba(224,231,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.blob, styles.blobLeft]}
        />
        <LinearGradient
          colors={['rgba(237,233,254,0.95)', 'rgba(237,233,254,0)']}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[styles.blob, styles.blobRight]}
        />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          Platform.OS !== 'web'
            ? {
                paddingBottom: tabBarReserve + insets.bottom,
              }
            : null,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero (background + nav + card) - scrolls with the page */}
        <View
          style={[
            styles.heroStack,
            {
              height: heroHeight + insets.top,
              marginTop: -insets.top,
              paddingTop: insets.top + headerHeight + 10,
            },
          ]}
        >
          <View pointerEvents="none" style={styles.heroBackdrop}>
            <Image source={getHeroImageSource()} style={styles.heroBackdropImg} contentFit="cover" transition={150} />
            <LinearGradient
              colors={['rgba(246,246,248,0.10)', 'rgba(246,246,248,0.78)', ui.bg]}
              locations={[0, 0.68, 1]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.heroBackdropFade}
            />
            <View style={styles.heroBackdropTint} />
          </View>

          <View style={[styles.nav, { top: insets.top + 10 }]} pointerEvents="box-none">
            <TouchableOpacity
              style={styles.navBtn}
              onPress={() => router.replace('/(admin)/admin-events')}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="חזרה"
            >
              <Ionicons name="chevron-forward" size={22} color={ui.text} />
            </TouchableOpacity>
            <View style={styles.navRightSpacer} />
          </View>

          <View style={styles.hero}>
            <View style={styles.heroWindowOuter}>
              <BlurView intensity={24} tint="light" style={styles.heroWindowBlur}>
                <View style={[styles.heroWindowInner, { backgroundColor: 'rgba(255,255,255,0.78)' }]}>
                  <View style={styles.heroTopRow}>
                    <View style={styles.heroAvatarWrap}>
                      <TouchableOpacity
                        style={styles.heroAvatarRing}
                        onPress={() => setAvatarPreviewOpen(true)}
                        activeOpacity={0.88}
                        accessibilityRole="button"
                        accessibilityLabel="הגדלת תמונת פרופיל"
                      >
                        {userAvatarUrl ? (
                          <Image source={{ uri: userAvatarUrl }} style={styles.heroAvatar} contentFit="cover" transition={150} />
                        ) : (
                          <View style={styles.heroAvatarFallback}>
                            {getInitials(userName) ? (
                              <Text style={styles.heroAvatarInitials}>{getInitials(userName)}</Text>
                            ) : (
                              <Ionicons name="person" size={18} color={'rgba(13,17,28,0.65)'} />
                            )}
                          </View>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.heroAvatarEditBadge}
                        onPress={openEditEvent}
                        activeOpacity={0.9}
                        disabled={editSaving}
                        accessibilityRole="button"
                        accessibilityLabel="עריכת אירוע"
                      >
                        <Ionicons name="create-outline" size={16} color={ui.primary} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.heroTitleWrap}>
                    <Text style={[styles.heroTitleType, { color: ui.text }]}>{getEventTypeLabel()}</Text>
                    {userName ? <Text style={[styles.heroTitleOwner, { color: ui.primary }]}>{`לקוח: ${userName}`}</Text> : null}
                  </View>

                  <View style={styles.heroMetaRow}>
                    <Ionicons name="calendar-outline" size={18} color={ui.muted} />
                    <Text style={[styles.heroMetaText, { color: ui.muted }]}>
                      {`${weekday}, ${day} | ${String(event.location ?? '')}`}
                    </Text>
                  </View>

                  {isWeddingEvent() ? (
                    <View style={styles.heroMetaRow}>
                      <Ionicons name="heart-outline" size={18} color={ui.muted} />
                      <Text style={[styles.heroMetaText, { color: ui.muted }]}>
                        {`חתן: ${groomLabel()} | כלה: ${brideLabel()}`}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </BlurView>
            </View>
          </View>
        </View>

        {/* White bottom sheet with rounded corners (like the reference) */}
        <View style={[styles.sheet, { marginBottom: Platform.OS === 'web' ? 30 : 0 }]}>
          {/* Guest status (rings) */}
          <GlassPanel style={styles.panel}>
            <View style={styles.panelHeaderRow}>
              <Text style={[styles.panelTitle, { color: ui.text }]}>סטטוס אורחים</Text>
              <View style={[styles.totalChip, { backgroundColor: 'rgba(15,69,230,0.05)' }]}>
                <Text style={[styles.totalChipText, { color: ui.primary }]}>{`${totalGuests} סה״כ`}</Text>
              </View>
            </View>

            <View style={styles.ringsRow}>
              <ProgressRing
                size={84}
                strokeWidth={9}
                progress={totalGuests ? confirmed / totalGuests : 0}
                color={'#34C759'}
                value={confirmed}
                label="אישרו"
                valueFontSize={20}
              />
              <ProgressRing
                size={68}
                strokeWidth={9}
                progress={totalGuests ? pending / totalGuests : 0}
                color={ui.primary}
                value={pending}
                label="אולי"
                valueFontSize={18}
              />
              <ProgressRing
                size={68}
                strokeWidth={9}
                progress={totalGuests ? declined / totalGuests : 0}
                color={'#FF3B30'}
                value={declined}
                label="לא"
                valueFontSize={18}
              />
            </View>
          </GlassPanel>

          {/* Stat tiles (match screenshot style) */}
          <View style={styles.tilesRow}>
            {/* Dark tile: seating progress */}
            <View style={styles.tileDarkOuter}>
              <LinearGradient
                colors={['#0B1020', '#111B3A']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.tileDark}
              >
                <View style={styles.tileDarkTopRow}>
                  <View style={styles.tileBadge}>
                    <Ionicons name="checkmark-circle" size={16} color="#E5E7EB" />
                  </View>
                </View>

                <Text style={styles.tilePercent}>{`${seatedPercent}%`}</Text>
                <Text style={styles.tileDarkLabel}>הושבו</Text>

                <View style={styles.tileProgressTrack}>
                  <View style={[styles.tileProgressFill, { width: `${Math.max(0, Math.min(100, seatedPercent))}%` }]} />
                </View>
              </LinearGradient>
            </View>

            {/* Light tile: confirmed guests */}
            <GlassPanel style={styles.tileLight}>
              <View pointerEvents="none" style={styles.tileLightDecorWrap}>
                <View style={styles.tileLightDecorCircle} />
                <View style={styles.tileLightDecorCircle2} />
              </View>

              <View style={styles.tileLightTopRow}>
                <View style={styles.tileLightIconCircle}>
                  <Ionicons name="people" size={18} color={ui.primary} />
                </View>
                <Text style={styles.tileLightPercentHint}>
                  {totalGuests ? `${Math.max(0, Math.min(100, Math.round((confirmed / totalGuests) * 100)))}%+` : '0%'}
                </Text>
              </View>

              <Text style={[styles.tileLightValue, { color: ui.text }]}>{confirmed}</Text>
              <Text style={styles.tileLightLabel}>אורחים אישרו</Text>
            </GlassPanel>
          </View>

          {/* Notifications "window" → dedicated screen (should be under the two tiles) */}
          <View style={styles.notificationsPanel}>
            <ActionRow
              title="הודעות אוטומטיות"
              subtitle="עריכה והפעלה של תזכורות והודעות וואטסאפ"
              iconName="chatbubble-ellipses-outline"
              iconBg="rgba(37, 99, 235, 0.10)"
              iconColor={ui.primary}
              onPress={() => router.push(`/(admin)/admin-event-notifications?eventId=${event.id}`)}
              accessibilityLabel="הודעות אוטומטיות"
            />
          </View>

          {/* Bottom actions (match provided design): two stacked action cards */}
          <View style={styles.bottomActions}>
            <ActionRow
              title="עריכת סקיצה"
              subtitle="ניהול סידורי הושבה וסקיצות"
              iconName="create-outline"
              iconBg="rgba(249, 115, 22, 0.14)"
              iconColor="#F97316"
              onPress={() => router.push(`/(admin)/seating-templates?eventId=${event.id}`)}
              accessibilityLabel="עריכת סקיצה"
            />
            <ActionRow
              title="מפת הושבה"
              subtitle="צפייה וניהול מפת האולם"
              iconName="grid-outline"
              iconBg="rgba(168, 85, 247, 0.14)"
              iconColor="#A855F7"
              onPress={handleSeatingMap}
              accessibilityLabel="מפת הושבה"
            />
          </View>
        </View>
      </ScrollView>
      </SafeAreaView>

      {/* Avatar preview (big centered) */}
      <Modal
        transparent
        visible={avatarPreviewOpen}
        animationType="fade"
        onRequestClose={() => setAvatarPreviewOpen(false)}
      >
        <Pressable style={styles.previewOverlay} onPress={() => setAvatarPreviewOpen(false)}>
          <TouchableOpacity
            style={[styles.previewCloseBtn, { top: Math.max(18, insets.top + 10) }]}
            onPress={() => setAvatarPreviewOpen(false)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="סגירת תמונה"
          >
            <Ionicons name="close" size={18} color={'rgba(255,255,255,0.90)'} />
          </TouchableOpacity>

          <Pressable onPress={() => null} style={styles.previewContent}>
            {userAvatarUrl ? (
              <Image
                source={{ uri: userAvatarUrl }}
                style={{
                  width: Math.min(windowWidth * 0.96, 920),
                  height: Math.min(windowHeight * 0.86, 820),
                  borderRadius: 22,
                  backgroundColor: 'rgba(255,255,255,0.06)',
                }}
                contentFit="contain"
                transition={150}
              />
            ) : (
              <View style={styles.previewFallback}>
                <Ionicons name="person" size={34} color={'rgba(255,255,255,0.78)'} />
                <Text style={[styles.previewFallbackText, { color: 'rgba(255,255,255,0.78)' }]}>אין תמונה להצגה</Text>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Edit event modal */}
      <Modal transparent visible={editOpen} animationType="fade" onRequestClose={() => setEditOpen(false)}>
        <Pressable style={styles.editOverlay} onPress={() => setEditOpen(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
            <Pressable style={styles.editCard} onPress={() => null}>
              <View style={styles.editHeader}>
                <TouchableOpacity
                  style={styles.editCloseBtn}
                  onPress={() => setEditOpen(false)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="סגירה"
                >
                  <Ionicons name="close" size={18} color={'rgba(17,24,39,0.70)'} />
                </TouchableOpacity>

                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={styles.editTitle}>עריכת אירוע</Text>
                  <Text style={styles.editSubtitle} numberOfLines={1}>
                    {getEventTypeLabel()}
                  </Text>
                </View>

                <View style={{ width: 40 }} />
              </View>

              <View style={styles.editDivider} />

              <ScrollView contentContainerStyle={styles.editBody} showsVerticalScrollIndicator={false}>
                {/* Cover image */}
                <View style={styles.editBlock}>
                  <View style={styles.editBlockHeaderRow}>
                    <Text style={styles.editBlockLabel}>תמונת אירוע</Text>
                    <TouchableOpacity
                      style={[styles.smallBtn, coverUploading ? { opacity: 0.75 } : null]}
                      onPress={pickAndUploadEventCover}
                      disabled={coverUploading}
                      activeOpacity={0.9}
                      accessibilityRole="button"
                      accessibilityLabel="בחר תמונת אירוע"
                    >
                      {coverUploading ? (
                        <ActivityIndicator size="small" color={ui.primary} />
                      ) : (
                        <Ionicons name="image-outline" size={16} color={ui.primary} />
                      )}
                      <Text style={styles.smallBtnText}>{coverUploading ? 'מעלה...' : 'בחר תמונה'}</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.coverPreviewWrap}>
                    {(editForm.image || '').trim() ? (
                      <Image
                        source={{ uri: (editForm.image || '').trim() }}
                        style={styles.coverPreviewImg}
                        contentFit="cover"
                        transition={150}
                      />
                    ) : (
                      <View style={styles.coverPreviewFallback}>
                        <Ionicons name="image" size={26} color={'rgba(17,24,39,0.35)'} />
                        <Text style={styles.coverPreviewFallbackText}>לא נבחרה תמונה</Text>
                      </View>
                    )}
                  </View>

                  <TextInput
                    value={editForm.image}
                    onChangeText={(t) => setEditForm((f) => ({ ...f, image: t }))}
                    placeholder="או הדבק/י קישור לתמונה (URL)"
                    placeholderTextColor={'rgba(17,24,39,0.35)'}
                    style={styles.editInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textAlign="right"
                  />
                </View>

                {/* Date */}
                <View style={styles.editBlock}>
                  <Text style={styles.editBlockLabel}>תאריך האירוע</Text>
                  <TouchableOpacity
                    style={styles.dateRow}
                    onPress={() => setEditDatePickerOpen(true)}
                    activeOpacity={0.9}
                    accessibilityRole="button"
                    accessibilityLabel="בחירת תאריך"
                  >
                    <Ionicons name="calendar-outline" size={18} color={'rgba(17,24,39,0.55)'} />
                    <Text style={styles.dateRowText}>
                      {Number.isFinite(editForm.date.getTime())
                        ? editForm.date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
                        : ''}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Location + City */}
                <View style={styles.editBlock}>
                  <Text style={styles.editBlockLabel}>מיקום</Text>
                  <TextInput
                    value={editForm.location}
                    onChangeText={(t) => setEditForm((f) => ({ ...f, location: t }))}
                    placeholder="מיקום"
                    placeholderTextColor={'rgba(17,24,39,0.35)'}
                    style={styles.editInput}
                    textAlign="right"
                  />

                  <Text style={[styles.editBlockLabel, { marginTop: 10 }]}>עיר</Text>
                  <TextInput
                    value={editForm.city}
                    onChangeText={(t) => setEditForm((f) => ({ ...f, city: t }))}
                    placeholder="עיר"
                    placeholderTextColor={'rgba(17,24,39,0.35)'}
                    style={styles.editInput}
                    textAlign="right"
                  />
                </View>

                {/* Groom / Bride */}
                {isWeddingEvent() ? (
                  <View style={styles.editBlock}>
                    <Text style={styles.editBlockLabel}>פרטי חתונה</Text>

                    <Text style={[styles.editBlockLabel, { marginTop: 10, fontSize: 12, color: 'rgba(17,24,39,0.60)' }]}>
                      שם חתן
                    </Text>
                    <TextInput
                      value={editForm.groomName}
                      onChangeText={(t) => setEditForm((f) => ({ ...f, groomName: t }))}
                      placeholder="שם החתן"
                      placeholderTextColor={'rgba(17,24,39,0.35)'}
                      style={styles.editInput}
                      textAlign="right"
                    />

                    <Text style={[styles.editBlockLabel, { marginTop: 10, fontSize: 12, color: 'rgba(17,24,39,0.60)' }]}>
                      שם כלה
                    </Text>
                    <TextInput
                      value={editForm.brideName}
                      onChangeText={(t) => setEditForm((f) => ({ ...f, brideName: t }))}
                      placeholder="שם הכלה"
                      placeholderTextColor={'rgba(17,24,39,0.35)'}
                      style={styles.editInput}
                      textAlign="right"
                    />
                  </View>
                ) : null}

                <View style={{ height: 6 }} />
              </ScrollView>

              <View style={styles.editFooter}>
                <TouchableOpacity
                  style={styles.footerBtnSecondary}
                  onPress={() => setEditOpen(false)}
                  activeOpacity={0.9}
                  accessibilityRole="button"
                  accessibilityLabel="ביטול"
                >
                  <Text style={styles.footerBtnSecondaryText}>ביטול</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.footerBtnPrimary, (editSaving || coverUploading) ? { opacity: 0.85 } : null]}
                  onPress={saveEditEvent}
                  activeOpacity={0.92}
                  disabled={editSaving || coverUploading}
                  accessibilityRole="button"
                  accessibilityLabel="שמירת שינויים"
                >
                  {editSaving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="save-outline" size={16} color="#fff" />
                      <Text style={styles.footerBtnPrimaryText}>שמור</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              <DateTimePickerModal
                isVisible={editDatePickerOpen}
                mode="date"
                onConfirm={(d) => {
                  setEditDatePickerOpen(false);
                  if (d) setEditForm((f) => ({ ...f, date: d }));
                }}
                onCancel={() => setEditDatePickerOpen(false)}
                locale="he-IL"
                date={editForm.date}
              />
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safeRoot: { flex: 1 },
  safe: { flex: 1, backgroundColor: 'transparent' },

  bgLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: -3,
  },

  heroBackdrop: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  heroBackdropImg: {
    ...StyleSheet.absoluteFillObject,
  },
  heroBackdropFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 240,
  },
  heroBackdropTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,69,230,0.06)',
  },
  blob: {
    position: 'absolute',
    width: 520,
    height: 520,
    borderRadius: 520,
  },
  blobLeft: {
    top: -240,
    left: -280,
  },
  blobRight: {
    top: -260,
    right: -280,
  },

  heroStack: {
    position: 'relative',
    justifyContent: 'flex-start',
    marginHorizontal: -24, // extend hero image to screen edges
  },
  nav: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 10 : 18,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 5,
  },
  scroll: {
    zIndex: 3,
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.40)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
    overflow: 'hidden',
  },
  navRightSpacer: { width: 40, height: 40 },

  content: {
    paddingHorizontal: 24,
    paddingTop: 0,
    paddingBottom: 80,
    gap: 16,
  },

  hero: {
    marginTop: 0,
    paddingTop: 10,
    paddingBottom: 4,
    alignItems: 'center',
  },

  // Bottom "sheet" (white background with rounded top corners)
  sheet: {
    // Pull the sheet upward so it slightly overlaps the hero image (like the reference)
    // Tweak this value if you want more/less overlap.
    marginTop: -34,
    marginHorizontal: -24, // extend to screen edges (counteracts content padding)
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 24,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 34,
    borderTopRightRadius: 34,
    zIndex: 4,
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -2 },
    elevation: 6,
  },
  heroTitleWrap: {
    alignItems: 'center',
  },
  heroTitleType: {
    fontSize: 36,
    fontWeight: '900',
    lineHeight: 40,
    textAlign: 'center',
    letterSpacing: -0.6,
  },
  heroTitleOwner: {
    marginTop: 6,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 28,
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  heroMetaRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    justifyContent: 'center',
  },
  heroMetaText: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },

  heroWindowOuter: {
    width: '100%',
    maxWidth: 560,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    overflow: 'hidden',
    shadowColor: colors.black,
    shadowOpacity: 0.10,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 16 },
    elevation: 5,
  },
  heroWindowBlur: {
    width: '100%',
  },
  heroWindowInner: {
    paddingHorizontal: 18,
    paddingVertical: 18,
    alignItems: 'center',
  },
  heroTopRow: {
    width: '100%',
    flexDirection: 'row-reverse',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heroAvatarWrap: {
    position: 'relative',
  },
  heroAvatarRing: {
    width: 92,
    height: 92,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(13,17,28,0.10)',
    shadowColor: colors.black,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
    overflow: 'hidden',
  },
  heroAvatar: {
    width: '100%',
    height: '100%',
  },
  heroAvatarFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(15,69,230,0.08)',
  },
  heroAvatarInitials: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0d111c',
  },
  heroAvatarEditBadge: {
    position: 'absolute',
    bottom: -8,
    left: -8,
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(13,17,28,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.black,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },

  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  previewContent: { alignItems: 'center', justifyContent: 'center' },
  previewCloseBtn: {
    position: 'absolute',
    left: 16,
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  previewFallback: {
    width: 280,
    height: 240,
    borderRadius: 18,
    backgroundColor: 'rgba(17,24,39,0.04)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  previewFallbackText: {
    fontSize: 14,
    fontWeight: '800',
    color: 'rgba(17,24,39,0.60)',
    textAlign: 'center',
  },

  editOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  editCard: {
    width: '100%',
    maxWidth: 560,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    shadowColor: colors.black,
    shadowOpacity: 0.20,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
    overflow: 'hidden',
    maxHeight: '88%',
  },
  editHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  editCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: 'rgba(17,24,39,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editTitle: { fontSize: 18, fontWeight: '900', color: '#111827', textAlign: 'center' },
  editSubtitle: { marginTop: 4, fontSize: 12, fontWeight: '800', color: 'rgba(17,24,39,0.55)', textAlign: 'center' },
  editDivider: { height: 1, backgroundColor: 'rgba(17,24,39,0.08)', marginHorizontal: 16 },
  editBody: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, gap: 12 },
  editBlock: { gap: 10 },
  editBlockHeaderRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  editBlockLabel: { fontSize: 13, fontWeight: '900', color: '#111827', textAlign: 'right' },
  editInput: {
    height: 48,
    borderRadius: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.10)',
    backgroundColor: 'rgba(17,24,39,0.04)',
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
  },
  smallBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(15,69,230,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(15,69,230,0.16)',
  },
  smallBtnText: { fontSize: 12, fontWeight: '900', color: '#0f45e6' },
  coverPreviewWrap: {
    height: 160,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.10)',
    backgroundColor: 'rgba(17,24,39,0.04)',
  },
  coverPreviewImg: { width: '100%', height: '100%' },
  coverPreviewFallback: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  coverPreviewFallbackText: { fontSize: 12, fontWeight: '800', color: 'rgba(17,24,39,0.55)' },
  dateRow: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.10)',
    backgroundColor: 'rgba(17,24,39,0.04)',
    paddingHorizontal: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateRowText: { fontSize: 15, fontWeight: '900', color: '#111827' },
  editFooter: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(17,24,39,0.08)',
    flexDirection: 'row-reverse',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.98)',
  },
  footerBtnSecondary: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    backgroundColor: 'rgba(17,24,39,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerBtnSecondaryText: { fontSize: 14, fontWeight: '900', color: '#111827' },
  footerBtnPrimary: {
    flex: 2,
    height: 50,
    borderRadius: 14,
    backgroundColor: '#1d4ed8',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row-reverse',
    gap: 8,
    shadowColor: '#1d4ed8',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  footerBtnPrimaryText: { fontSize: 14, fontWeight: '900', color: '#fff' },

  glassOuter: {
    borderWidth: 1,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: colors.black,
    shadowOpacity: 0.07,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  glassBlur: {
    width: '100%',
  },
  glassInner: {
    padding: 18,
  },

  panel: {},
  notificationsPanel: {
    marginTop: 14,
    alignItems: 'center',
  },

  actionRow: {
    width: '100%',
    maxWidth: 560,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(17, 24, 39, 0.06)',
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  actionRowContent: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 14,
  },
  actionRowTextWrap: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  actionRowTitle: {
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'right',
    letterSpacing: -0.2,
  },
  actionRowSubtitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
    lineHeight: 18,
  },
  actionRowIconSquare: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionRowChevronCircle: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: 'rgba(17, 24, 39, 0.04)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  panelHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'right',
  },
  totalChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  totalChipText: {
    fontSize: 13,
    fontWeight: '800',
  },

  ringsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    gap: 8,
  },
  ringWrap: { alignItems: 'center', gap: 10 },
  ringCenter: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringValue: { fontWeight: '900' },
  ringLabel: { fontSize: 13, fontWeight: '600' },

  grid2: {
    flexDirection: 'row-reverse',
    gap: 12,
  },
  miniCard: {
    flex: 1,
    height: 148,
    position: 'relative',
  },
  miniOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.9,
  },
  miniContent: {
    alignItems: 'flex-end',
    gap: 6,
  },
  miniLabel: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
  },
  miniValue: {
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'right',
  },
  miniSubValue: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
  },
  miniArrow: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    width: 34,
    height: 34,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.black,
    shadowOpacity: 0.10,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  miniGlow: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 999,
    right: -50,
    bottom: -60,
    opacity: 0.08,
  },

  tilesRow: {
    flexDirection: 'row-reverse',
    gap: 12,
    alignItems: 'stretch',
    marginTop: 14,
  },

  tileDarkOuter: {
    flex: 1,
    height: 120,
  },
  tileDark: {
    flex: 1,
    borderRadius: 24,
    padding: 14,
    justifyContent: 'space-between',
    shadowColor: colors.black,
    shadowOpacity: 0.20,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
    overflow: 'hidden',
  },
  tileDarkTopRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tileBadge: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  tilePercent: {
    color: '#EEF2FF',
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'right',
    letterSpacing: -0.6,
    marginTop: -2,
  },
  tileDarkLabel: {
    color: 'rgba(238,242,255,0.70)',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    marginTop: -10,
  },
  tileProgressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  tileProgressFill: {
    height: 6,
    borderRadius: 999,
    backgroundColor: '#4F7DFF',
  },

  tileLight: {
    flex: 1,
    height: 120,
  },
  tileLightDecorWrap: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    borderRadius: 28,
  },
  tileLightDecorCircle: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 999,
    top: -55,
    left: -40,
    backgroundColor: 'rgba(15,69,230,0.10)',
  },
  tileLightDecorCircle2: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 999,
    top: -32,
    left: 30,
    backgroundColor: 'rgba(15,69,230,0.06)',
  },
  tileLightTopRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  tileLightIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: 'rgba(15,69,230,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tileLightPercentHint: {
    fontSize: 12,
    fontWeight: '800',
    color: '#22C55E',
    textAlign: 'left',
  },
  tileLightValue: {
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'right',
    letterSpacing: -0.6,
  },
  tileLightLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(17, 24, 39, 0.60)',
    textAlign: 'right',
    marginTop: 2,
  },

  bottomActions: {
    marginTop: 14,
    alignItems: 'center',
    gap: 12,
  },
  primaryAction: {
    width: '100%',
    maxWidth: 420,
    height: 64,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    shadowColor: '#0f45e6',
    shadowOpacity: 0.16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  primaryActionLeftIcon: {
    width: 48,
    height: 48,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryActionText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '900',
    color: '#fff',
  },
  primaryActionRightIcon: {
    width: 48,
    height: 48,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.96)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.black,
    shadowOpacity: 0.10,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  secondaryAction: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  secondaryActionText: {
    fontSize: 14,
    fontWeight: '800',
  },
}); 