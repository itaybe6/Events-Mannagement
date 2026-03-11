import React, { useEffect, useMemo, useState } from 'react';
import { BackHandler, View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Platform, useWindowDimensions, Modal, Alert, Pressable, TextInput, KeyboardAvoidingView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { eventService } from '@/lib/services/eventService';
import { Ionicons } from '@expo/vector-icons';
import { Event, Guest } from '@/types';
import { supabase } from '@/lib/supabase';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import BackSwipe from '@/components/BackSwipe';
import { AppKeyboardAwareScrollView } from '@/components/AppKeyboardAware';
import { useAdminEventDetailsModel } from '@/features/events/useAdminEventDetailsModel';
import { ALIGN_RIGHT, ROW_DIR } from '@/lib/rtl';

export default function AdminEventDetailsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const eventId = useMemo(
    () => (typeof id === 'string' ? id : Array.isArray(id) ? id[0] : ''),
    [id]
  );
  const { event, setEvent, guests, userName, userAvatarUrl, loading, error, stats } =
    useAdminEventDetailsModel(eventId);
  const [avatarPreviewOpen, setAvatarPreviewOpen] = useState(false);
  const [noTablesModalOpen, setNoTablesModalOpen] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editDatePickerOpen, setEditDatePickerOpen] = useState(false);
  const [editForm, setEditForm] = useState<{
    date: Date;
    location: string;
    city: string;
    groomName: string;
    brideName: string;
  }>({
    date: new Date(),
    location: '',
    city: '',
    groomName: '',
    brideName: '',
  });
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();

  // Always go back to admin events list from this screen.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      router.replace('/(admin)/admin-events');
      return true;
    });
    return () => sub.remove();
  }, [router]);

  if (loading) {
    return (
      <BackSwipe
        fallbackHref="/(admin)/admin-events"
        onBack={() => router.replace('/(admin)/admin-events')}
      >
        <View style={{ flex: 1, backgroundColor: colors.gray[100], justifyContent: 'center', alignItems: 'center', paddingTop: insets.top }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </BackSwipe>
    );
  }

  if (error) {
    return (
      <BackSwipe
        fallbackHref="/(admin)/admin-events"
        onBack={() => router.replace('/(admin)/admin-events')}
      >
        <View style={{ flex: 1, backgroundColor: colors.gray[100], justifyContent: 'center', alignItems: 'center', padding: 24, paddingTop: 24 + insets.top }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, textAlign: 'center' }}>{error}</Text>
          <TouchableOpacity
            onPress={() => router.replace('/(admin)/admin-events')}
            style={{ marginTop: 16, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.primary }}
            activeOpacity={0.9}
          >
            <Text style={{ color: '#fff', fontWeight: '800' }}>חזרה לרשימת אירועים</Text>
          </TouchableOpacity>
        </View>
      </BackSwipe>
    );
  }

  if (!event) {
    return (
      <BackSwipe
        fallbackHref="/(admin)/admin-events"
        onBack={() => router.replace('/(admin)/admin-events')}
      >
        <View style={{ flex: 1, backgroundColor: colors.gray[100], justifyContent: 'center', alignItems: 'center', padding: 24, paddingTop: 24 + insets.top }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, textAlign: 'center' }}>האירוע לא נמצא</Text>
          <TouchableOpacity
            onPress={() => router.replace('/(admin)/admin-events')}
            style={{ marginTop: 16, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.primary }}
            activeOpacity={0.9}
          >
            <Text style={{ color: '#fff', fontWeight: '800' }}>חזרה לרשימת אירועים</Text>
          </TouchableOpacity>
        </View>
      </BackSwipe>
    );
  }

  const confirmed = stats.confirmed;
  const declined = stats.declined;
  const pending = stats.pending;
  const totalGuests = stats.totalGuests;
  const seatedPercent = stats.seatedPercent;
  const invitedPeople = stats.invitedPeople;
  const confirmedPeople = stats.confirmedPeople;
  const pendingPeople = stats.pendingPeople;
  const declinedPeople = stats.declinedPeople;

  // Format date: 23.10 | חמישי
  const dateObj = new Date(event.date);
  const day = dateObj.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
  const weekday = dateObj.toLocaleDateString('he-IL', { weekday: 'long' });

  // פונקציה חדשה: בדוק/צור מפת הושבה
  const handleSeatingMap = async () => {
    if (!event?.id) return;
    // בדוק אם קיימים שולחנות במפה. מפה קיימת תמיד, אבל שולחנות לא תמיד קיימים.
    const { data, error } = await supabase
      .from('seating_maps')
      .select('num_tables, tables')
      .eq('event_id', event.id)
      .maybeSingle();

    if (error) {
      Alert.alert('שגיאה', 'לא ניתן לבדוק אם קיימת מפת הושבה כרגע');
      return;
    }

    const numTables = Number((data as any)?.num_tables ?? 0);
    const tables = Array.isArray((data as any)?.tables) ? (data as any).tables : [];
    const hasAtLeastOneTable =
      (Number.isFinite(numTables) && numTables > 0) || (Array.isArray(tables) && tables.length > 0);

    if (!hasAtLeastOneTable) {
      setNoTablesModalOpen(true);
      return;
    }

    // IMPORTANT: Keep admin tab bar by staying inside /(admin) group
    router.push(`/(admin)/BrideGroomSeating?eventId=${event.id}`);
  };

  const handleBackPress = () => {
    const canGoBack = typeof (router as any)?.canGoBack === 'function' ? (router as any).canGoBack() : false;
    if (canGoBack) {
      router.back();
      return;
    }
    router.replace('/(admin)/admin-events');
  };

  const openEditEvent = () => {
    if (!event) return;
    const nextDate = event?.date ? new Date(event.date) : new Date();
    setEditForm({
      date: Number.isFinite(nextDate.getTime()) ? nextDate : new Date(),
      location: String(event.location ?? ''),
      city: String(event.city ?? ''),
      groomName: String((event as any).groomName ?? ''),
      brideName: String((event as any).brideName ?? ''),
    });
    setEditOpen(true);
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

  const performDeleteEvent = async () => {
    if (!event?.id) return;
    if (deleteSaving) return;

    setDeleteSaving(true);
    try {
      // Preferred: Edge Function that does a full, server-side delete.
      const { data, error: fnError } = await supabase.functions.invoke('delete-event', {
        body: { eventId: event.id },
      });
      if (fnError) throw fnError;
      if (data?.ok !== true) throw new Error(String(data?.error ?? 'Failed to delete event'));

      setDeleteConfirmOpen(false);
      setEditOpen(false);
      Alert.alert('נמחק', 'האירוע נמחק בהצלחה');
      router.replace('/(admin)/admin-events');
      return;
    } catch (e) {
      // Fallback: client-side delete (DB has ON DELETE CASCADE for most tables).
      try {
        await supabase.from('notifications').delete().eq('event_id', event.id);
      } catch {}
      try {
        await eventService.deleteEvent(event.id);
        setDeleteConfirmOpen(false);
        setEditOpen(false);
        Alert.alert('נמחק', 'האירוע נמחק בהצלחה');
        router.replace('/(admin)/admin-events');
        return;
      } catch (e2) {
        console.error('Delete event error:', e2);
        Alert.alert('שגיאה', 'לא ניתן למחוק את האירוע כרגע');
      }
    } finally {
      setDeleteSaving(false);
    }
  };

  const confirmDeleteEvent = () => {
    if (!event?.id) return;
    setDeleteConfirmOpen(true);
  };

  // Color system inspired by the provided HTML mock (kept local to this screen)
  // IMPORTANT: do not use a hook here, because this screen has an early return during loading
  // (changing hook order between renders breaks the Rules of Hooks).
  const ui = {
    bg: '#FFF9EE',
    text: colors.richBlack,
    muted: 'rgba(0, 53, 102, 0.72)',
    primary: colors.richBlack,
    accent: colors.gold,
    glassBorder: 'rgba(6, 23, 62, 0.08)',
    glassFill: 'rgba(255,255,255,0.88)',
  } as const;

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
          <View style={[styles.actionRowIconSquare, { backgroundColor: iconBg }]}>
            <Ionicons name={iconName} size={22} color={iconColor} />
          </View>

          <View style={styles.actionRowTextWrap}>
            <Text style={[styles.actionRowTitle, { color: ui.text }]}>{title}</Text>
            <Text style={[styles.actionRowSubtitle, { color: 'rgba(17, 24, 39, 0.60)' }]}>{subtitle}</Text>
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
  const tabBarBottomOffset = Platform.OS === 'ios' ? 30 : 20;
  const tabBarHeight = 65;
  const tabBarReserve = tabBarBottomOffset + tabBarHeight + 24;

  return (
    <BackSwipe
      fallbackHref="/(admin)/admin-events"
      onBack={() => router.replace('/(admin)/admin-events')}
    >
      <View style={[styles.safeRoot, { backgroundColor: ui.bg }]}>
        <View style={[styles.safe, { paddingTop: insets.top }]}>
        {/* App background gradient */}
        <View pointerEvents="none" style={styles.bgLayer}>
          <LinearGradient
            colors={['#F7FAFF', '#E8F1FF', '#F2E0BA']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.bgBase}
          />
          <LinearGradient
            colors={['rgba(255,255,255,0.68)', 'rgba(255,255,255,0)']}
            start={{ x: 0.05, y: 0 }}
            end={{ x: 0.75, y: 0.55 }}
            style={styles.bgHighlight}
          />
          <LinearGradient
            colors={['rgba(232,196,122,0.58)', 'rgba(244,224,186,0.22)', 'rgba(244,224,186,0)']}
            start={{ x: 1, y: 0.95 }}
            end={{ x: 0.18, y: 0.22 }}
            style={styles.bgWarmGlow}
          />
          <LinearGradient
            colors={['rgba(240,203,70,0.18)', 'rgba(240,203,70,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.blob, styles.blobLeft]}
          />
          <LinearGradient
            colors={['rgba(0,53,102,0.16)', 'rgba(0,53,102,0)']}
            start={{ x: 1, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[styles.blob, styles.blobRight]}
          />
        </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: tabBarReserve,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero (background + nav + card) - scrolls with the page */}
        <View
          style={[
            styles.heroStack,
            {
              height: heroHeight,
              paddingTop: 10,
            },
          ]}
        >
          <View style={styles.hero}>
            <View style={styles.heroWindowOuter}>
              <View style={styles.heroWindowInner}>
                <TouchableOpacity
                  style={styles.heroBackButton}
                  onPress={handleBackPress}
                  activeOpacity={0.88}
                  accessibilityRole="button"
                  accessibilityLabel="חזרה לעמוד הקודם"
                >
                  <Ionicons name="chevron-forward" size={20} color={colors.richBlack} />
                </TouchableOpacity>

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
                      <Ionicons name="create-outline" size={16} color={colors.white} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.heroTitleWrap}>
                  <Text style={[styles.heroTitleType, { color: ui.text }]}>{getEventTypeLabel()}</Text>
                  {userName ? <Text style={[styles.heroTitleOwner, { color: ui.accent }]}>{`לקוח: ${userName}`}</Text> : null}
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
            </View>
          </View>
        </View>

        {/* White bottom sheet with rounded corners (like the reference) */}
        <View style={[styles.sheet, { marginBottom: Platform.OS === 'web' ? 30 : 0 }]}>
          {/* RSVP approvals (top tile) */}
          <TouchableOpacity
            style={styles.tileWideOuter}
            activeOpacity={0.9}
            onPress={() => router.push(`/(admin)/admin-rsvp-approvals?eventId=${event.id}`)}
            accessibilityRole="button"
            accessibilityLabel="פתיחת אישורי הגעה"
          >
            <View pointerEvents="none" style={styles.tileLightDecorWrap}>
              <View style={styles.tileLightDecorCircle} />
              <View style={styles.tileLightDecorCircle2} />
            </View>

            <View style={styles.rsvpCardInner}>
              <View style={styles.rsvpHeaderRow}>
                <View style={styles.rsvpHeaderRight}>
                  <View style={styles.rsvpHeaderValueRow}>
                    <Text style={[styles.rsvpHeaderValue, { color: ui.accent }]}>{invitedPeople}</Text>
                    <Text style={styles.rsvpHeaderLabelInline}>מוזמנים לאירוע</Text>
                  </View>
                </View>

                <View style={styles.rsvpHeaderLeft}>
                  <View style={styles.rsvpArrowCircle}>
                    <Ionicons name="chevron-back" size={18} color={"rgba(17,24,39,0.55)"} />
                  </View>
                </View>
              </View>

              <View style={styles.rsvpDivider} />

              <View style={styles.rsvpGrid}>
                <View style={styles.rsvpStatCardGreen}>
                  <View style={styles.rsvpStatIconCircle}>
                    <Ionicons name="checkmark" size={16} color={colors.success} />
                  </View>
                  <Text style={styles.rsvpStatValue}>{confirmedPeople}</Text>
                  <Text style={[styles.rsvpStatLabel, { color: colors.success }]}>אישרו</Text>
                </View>

                <View style={styles.rsvpStatCardYellow}>
                  <View style={styles.rsvpStatIconCircle}>
                    <Ionicons name="time" size={16} color={colors.warning} />
                  </View>
                  <Text style={styles.rsvpStatValue}>{pendingPeople}</Text>
                  <Text style={[styles.rsvpStatLabel, { color: colors.warning }]}>ממתינים</Text>
                </View>

                <View style={styles.rsvpStatCardRed}>
                  <View style={styles.rsvpStatIconCircle}>
                    <Ionicons name="close" size={16} color={colors.error} />
                  </View>
                  <Text style={styles.rsvpStatValue}>{declinedPeople}</Text>
                  <Text style={[styles.rsvpStatLabel, { color: colors.error }]}>לא</Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>

          {/* Guest status (rings) */}
          <GlassPanel style={styles.panel}>
            <View style={styles.panelHeaderRow}>
              <Text style={[styles.panelTitle, { color: ui.text }]}>סטטוס אורחים</Text>
              <View style={[styles.totalChip, { backgroundColor: 'rgba(204,160,0,0.12)' }]}>
                <Text style={[styles.totalChipText, { color: ui.text }]}>{`${totalGuests} סה״כ`}</Text>
              </View>
            </View>

            <View style={styles.ringsRow}>
              <ProgressRing
                size={84}
                strokeWidth={9}
                progress={totalGuests ? confirmed / totalGuests : 0}
                color={colors.yaleBlue}
                value={confirmed}
                label="אישרו"
                valueFontSize={20}
              />
              <ProgressRing
                size={68}
                strokeWidth={9}
                progress={totalGuests ? pending / totalGuests : 0}
                color={colors.gold}
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
                colors={[colors.richBlack, colors.yaleBlue]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.tileDark}
              >
                <View style={styles.tileDarkTopRow}>
                  <View style={styles.tileBadge}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.yellow} />
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
                  <Ionicons name="people" size={18} color={colors.richBlack} />
                </View>
                <Text style={styles.tileLightPercentHint}>
                  {totalGuests ? `${Math.max(0, Math.min(100, Math.round((confirmed / totalGuests) * 100)))}%+` : '0%'}
                </Text>
              </View>

              <Text style={[styles.tileLightValue, { color: ui.text }]}>{confirmed}</Text>
              <Text style={styles.tileLightLabel}>אורחים אישרו</Text>
            </GlassPanel>
          </View>

          {/* Bottom actions (match provided design): two stacked action cards */}
          <View style={styles.bottomActions}>
            <ActionRow
              title="לינק להזמנה"
              subtitle="הגדרת תמונה/כותרת והעתקת קישורים אישיים למוזמנים"
              iconName="link-outline"
              iconBg="rgba(204,160,0,0.14)"
              iconColor={colors.gold}
              onPress={() => router.push(`/(admin)/admin-invitation-links?eventId=${event.id}`)}
              accessibilityLabel="לינק להזמנה"
            />
            <ActionRow
              title="עריכת סקיצה"
              subtitle="ניהול סידורי הושבה וסקיצות"
              iconName="create-outline"
              iconBg="rgba(6,23,62,0.10)"
              iconColor={colors.richBlack}
              onPress={() => Alert.alert('את הסקיצה ניתן לערוך רק מהאתר')}
              accessibilityLabel="עריכת סקיצה"
            />
            <ActionRow
              title="צ׳ק-אין אורחים"
              subtitle="סימון הגעה של אורחים בזמן אמת"
              iconName="checkbox-outline"
              iconBg="rgba(0,53,102,0.10)"
              iconColor={colors.yaleBlue}
              onPress={() => router.push(`/(admin)/admin-guest-checkin?eventId=${event.id}`)}
              accessibilityLabel="צ׳ק-אין אורחים"
            />
            <ActionRow
              title="שולחנות"
              subtitle="צפייה וניהול רשימת שולחנות"
              iconName="list-outline"
              iconBg="rgba(240,203,70,0.18)"
              iconColor={colors.gold}
              onPress={() => router.push(`/(admin)/TablesList?eventId=${event.id}`)}
              accessibilityLabel="שולחנות"
            />
            <ActionRow
              title="הודעות אוטומטיות"
              subtitle="עריכה והפעלה של תזכורות והודעות וואטסאפ"
              iconName="chatbubble-ellipses-outline"
              iconBg="rgba(0,53,102,0.10)"
              iconColor={colors.yaleBlue}
              onPress={() => router.push(`/(admin)/admin-event-messages?eventId=${event.id}`)}
              accessibilityLabel="עריכת הודעות"
            />
            <ActionRow
              title="מפת הושבה"
              subtitle="צפייה וניהול מפת האולם"
              iconName="grid-outline"
              iconBg="rgba(6,23,62,0.10)"
              iconColor={colors.richBlack}
              onPress={handleSeatingMap}
              accessibilityLabel="מפת הושבה"
            />
          </View>
        </View>
      </ScrollView>
      </View>

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
        <Pressable
          style={styles.editOverlay}
          onPress={() => {
            if (deleteConfirmOpen && !deleteSaving) {
              setDeleteConfirmOpen(false);
              return;
            }
            setEditOpen(false);
          }}
        >
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

              <AppKeyboardAwareScrollView contentContainerStyle={styles.editBody} showsVerticalScrollIndicator={false}>
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
              </AppKeyboardAwareScrollView>

              <View style={styles.editDangerWrap}>
                <TouchableOpacity
                  style={[styles.footerBtnDanger, deleteSaving ? { opacity: 0.88 } : null]}
                  onPress={confirmDeleteEvent}
                  activeOpacity={0.92}
                  disabled={deleteSaving || editSaving}
                  accessibilityRole="button"
                  accessibilityLabel="מחיקת אירוע"
                >
                  {deleteSaving ? (
                    <ActivityIndicator color={colors.error} />
                  ) : (
                    <>
                      <Ionicons name="trash-outline" size={16} color={colors.error} />
                      <Text style={styles.footerBtnDangerText}>מחק אירוע</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

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
                  style={[styles.footerBtnPrimary, editSaving ? { opacity: 0.85 } : null]}
                  onPress={saveEditEvent}
                  activeOpacity={0.92}
                  disabled={editSaving || deleteSaving}
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

          {/* Delete confirmation overlay (styled, RTL) */}
          {deleteConfirmOpen ? (
            <Pressable
              style={styles.deleteOverlay}
              onPress={() => {
                if (!deleteSaving) setDeleteConfirmOpen(false);
              }}
            >
              <Pressable style={styles.deleteCard} onPress={() => null}>
                <View style={styles.deleteHeaderRow}>
                  <View style={styles.deleteIconCircle}>
                    <Ionicons name="trash-outline" size={18} color={colors.error} />
                  </View>
                  <View style={styles.deleteHeaderText}>
                    <Text style={styles.deleteTitle}>מחיקת אירוע</Text>
                    <Text style={styles.deleteSubtitle} numberOfLines={2}>
                      פעולה זו בלתי הפיכה
                    </Text>
                  </View>
                </View>

                <View style={styles.deleteDivider} />

                <View style={styles.deleteBody}>
                  <Text style={styles.deleteBodyText}>
                    אתה עומד למחוק את האירוע ואת כל הנתונים שמקושרים אליו:
                  </Text>

                  <View style={styles.deleteList}>
                    {[
                      'מוזמנים וסטטוסים',
                      'קטגוריות מוזמנים',
                      'שולחנות ומפת הושבה',
                      'משימות והודעות',
                    ].map((t) => (
                      <View key={t} style={styles.deleteListRow}>
                        <View style={styles.deleteBullet} />
                        <Text style={styles.deleteListText}>{t}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.deleteHintBox}>
                    <Ionicons name="alert-circle-outline" size={16} color={'rgba(255, 59, 48, 0.9)'} />
                    <Text style={styles.deleteHintText}>
                      מומלץ לוודא שזה האירוע הנכון לפני מחיקה.
                    </Text>
                  </View>
                </View>

                <View style={styles.deleteFooter}>
                  <TouchableOpacity
                    style={styles.deleteBtnSecondary}
                    onPress={() => setDeleteConfirmOpen(false)}
                    activeOpacity={0.9}
                    disabled={deleteSaving}
                    accessibilityRole="button"
                    accessibilityLabel="ביטול מחיקה"
                  >
                    <Text style={styles.deleteBtnSecondaryText}>ביטול</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.deleteBtnDanger, deleteSaving ? { opacity: 0.88 } : null]}
                    onPress={() => void performDeleteEvent()}
                    activeOpacity={0.92}
                    disabled={deleteSaving}
                    accessibilityRole="button"
                    accessibilityLabel="אישור מחיקת אירוע"
                  >
                    {deleteSaving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="trash-outline" size={16} color="#fff" />
                        <Text style={styles.deleteBtnDangerText}>מחק אירוע</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </Pressable>
            </Pressable>
          ) : null}
        </Pressable>
      </Modal>

      {/* No tables modal (RTL, styled) */}
      <Modal
        transparent
        visible={noTablesModalOpen}
        animationType="fade"
        onRequestClose={() => setNoTablesModalOpen(false)}
      >
        <Pressable style={styles.noTablesOverlay} onPress={() => setNoTablesModalOpen(false)}>
          <Pressable style={styles.noTablesCard} onPress={() => null}>
            <View style={styles.noTablesHeaderRow}>
              <View style={styles.noTablesIconCircle}>
                <Ionicons name="grid-outline" size={18} color={ui.primary} />
              </View>
              <View style={styles.noTablesHeaderText}>
                <Text style={styles.noTablesTitle}>אין שולחנות במפה</Text>
                <Text style={styles.noTablesSubtitle} numberOfLines={2}>
                  כדי להיכנס למפת הושבה צריך ליצור לפחות שולחן אחד.
                </Text>
              </View>
            </View>

            <View style={styles.noTablesDivider} />

            <View style={styles.noTablesBody}>
              <View style={styles.noTablesHintBox}>
                <Ionicons name="information-circle-outline" size={16} color={'rgba(15,69,230,0.95)'} />
                <Text style={styles.noTablesHintText}>
                  צור שולחן אחד ומעלה, ואז נסה שוב ללחוץ על “מפת הושבה”.
                </Text>
              </View>
            </View>

            <View style={styles.noTablesFooter}>
              <TouchableOpacity
                style={styles.noTablesBtnPrimary}
                onPress={() => setNoTablesModalOpen(false)}
                activeOpacity={0.92}
                accessibilityRole="button"
                accessibilityLabel="סגירת הודעה"
              >
                <Text style={styles.noTablesBtnPrimaryText}>הבנתי</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      </View>
    </BackSwipe>
  );
}

const styles = StyleSheet.create({
  safeRoot: { flex: 1 },
  safe: { flex: 1, backgroundColor: 'transparent' },

  bgLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: -3,
  },
  bgBase: {
    ...StyleSheet.absoluteFillObject,
  },
  bgHighlight: {
    ...StyleSheet.absoluteFillObject,
  },
  bgWarmGlow: {
    ...StyleSheet.absoluteFillObject,
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
    backgroundColor: 'transparent',
  },
  scroll: {
    flex: 1,
    zIndex: 3,
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
    marginTop: -184,
    marginHorizontal: -24, // extend to screen edges (counteracts content padding)
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 24,
    backgroundColor: '#FFFCF6',
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
    flexDirection: ROW_DIR,
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
    borderRadius: 0,
  },
  heroWindowInner: {
    paddingHorizontal: 18,
    paddingVertical: 18,
    alignItems: 'center',
    position: 'relative',
  },
  heroBackButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(204,160,0,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  heroTopRow: {
    width: '100%',
    flexDirection: ROW_DIR,
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
    backgroundColor: 'rgba(240,203,70,0.18)',
  },
  heroAvatarInitials: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.richBlack,
  },
  heroAvatarEditBadge: {
    position: 'absolute',
    bottom: -8,
    left: -8,
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: colors.richBlack,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.40)',
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
    backgroundColor: 'rgba(6,23,62,0.46)',
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
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  editCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: 'rgba(240,203,70,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editTitle: { fontSize: 18, fontWeight: '900', color: colors.richBlack, textAlign: 'center' },
  editSubtitle: { marginTop: 4, fontSize: 12, fontWeight: '800', color: 'rgba(0,53,102,0.64)', textAlign: 'center' },
  editDivider: { height: 1, backgroundColor: 'rgba(6,23,62,0.08)', marginHorizontal: 16 },
  editBody: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, gap: 12 },
  editBlock: { gap: 10 },
  editBlockHeaderRow: { flexDirection: ROW_DIR, alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  editBlockLabel: { fontSize: 13, fontWeight: '900', color: colors.richBlack, textAlign: 'right' },
  editInput: {
    height: 48,
    borderRadius: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.10)',
    backgroundColor: 'rgba(255,255,255,0.86)',
    color: colors.richBlack,
    fontSize: 14,
    fontWeight: '700',
  },
  smallBtn: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(240,203,70,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(204,160,0,0.22)',
  },
  smallBtnText: { fontSize: 12, fontWeight: '900', color: colors.richBlack },
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
    borderColor: 'rgba(6,23,62,0.10)',
    backgroundColor: 'rgba(255,255,255,0.86)',
    paddingHorizontal: 14,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateRowText: { fontSize: 15, fontWeight: '900', color: colors.richBlack },
  editFooter: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(17,24,39,0.08)',
    flexDirection: ROW_DIR,
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.98)',
  },
  editDangerWrap: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 2,
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
  footerBtnDanger: {
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 59, 48, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.22)',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: ROW_DIR,
    gap: 8,
  },
  footerBtnDangerText: { fontSize: 13, fontWeight: '900', color: colors.error },
  footerBtnPrimary: {
    flex: 2,
    height: 50,
    borderRadius: 14,
    backgroundColor: colors.richBlack,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: ROW_DIR,
    gap: 8,
    shadowColor: colors.richBlack,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  footerBtnPrimaryText: { fontSize: 14, fontWeight: '900', color: '#fff' },

  // Delete confirmation modal (RTL)
  deleteOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
    zIndex: 30,
  },
  deleteCard: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
    shadowColor: colors.black,
    shadowOpacity: 0.22,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
    overflow: 'hidden',
  },
  deleteHeaderRow: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 12,
  },
  deleteIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 59, 48, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteHeaderText: { flex: 1, alignItems: ALIGN_RIGHT },
  deleteTitle: { fontSize: 18, fontWeight: '900', color: '#111827', textAlign: 'right' },
  deleteSubtitle: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(17,24,39,0.55)',
    textAlign: 'right',
  },
  deleteDivider: { height: 1, backgroundColor: 'rgba(17,24,39,0.08)', marginHorizontal: 16 },
  deleteBody: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, gap: 12 },
  deleteBodyText: {
    fontSize: 13,
    fontWeight: '800',
    color: 'rgba(17,24,39,0.78)',
    textAlign: 'right',
    lineHeight: 20,
  },
  deleteList: { gap: 10, paddingTop: 4 },
  deleteListRow: { flexDirection: ROW_DIR, alignItems: 'center', gap: 10 },
  deleteBullet: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 59, 48, 0.85)',
  },
  deleteListText: { flex: 1, fontSize: 13, fontWeight: '900', color: '#111827', textAlign: 'right' },
  deleteHintBox: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 59, 48, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.14)',
  },
  deleteHintText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(17,24,39,0.70)',
    textAlign: 'right',
    lineHeight: 18,
  },
  deleteFooter: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(17,24,39,0.08)',
    flexDirection: ROW_DIR,
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.98)',
  },
  deleteBtnSecondary: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(17,24,39,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtnSecondaryText: { fontSize: 13, fontWeight: '900', color: '#111827' },
  deleteBtnDanger: {
    flex: 2,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: ROW_DIR,
    gap: 8,
    shadowColor: colors.error,
    shadowOpacity: 0.20,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  deleteBtnDangerText: { fontSize: 13, fontWeight: '900', color: '#fff' },

  // No tables modal (RTL, styled)
  noTablesOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
    zIndex: 40,
  },
  noTablesCard: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
    shadowColor: colors.black,
    shadowOpacity: 0.22,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
    overflow: 'hidden',
  },
  noTablesHeaderRow: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 12,
  },
  noTablesIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: 'rgba(240,203,70,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(204,160,0,0.22)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  noTablesHeaderText: { flex: 1, alignItems: ALIGN_RIGHT },
  noTablesTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.richBlack,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  noTablesSubtitle: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(0,53,102,0.72)',
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 18,
  },
  noTablesDivider: { height: 1, backgroundColor: 'rgba(17,24,39,0.08)', marginHorizontal: 16 },
  noTablesBody: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, gap: 12 },
  noTablesHintBox: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(240,203,70,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(204,160,0,0.18)',
  },
  noTablesHintText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(17,24,39,0.72)',
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 18,
  },
  noTablesFooter: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(17,24,39,0.08)',
    backgroundColor: 'rgba(255,255,255,0.98)',
  },
  noTablesBtnPrimary: {
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.richBlack,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.richBlack,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  noTablesBtnPrimaryText: { fontSize: 14, fontWeight: '900', color: '#fff', writingDirection: 'rtl' },

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
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(204,160,0,0.12)',
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  actionRowContent: {
    flex: 1,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 14,
  },
  actionRowTextWrap: {
    flex: 1,
    alignItems: ALIGN_RIGHT,
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
    backgroundColor: 'rgba(240,203,70,0.16)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  panelHeaderRow: {
    flexDirection: ROW_DIR,
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
    flexDirection: ROW_DIR,
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
    flexDirection: ROW_DIR,
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
    alignItems: ALIGN_RIGHT,
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
    flexDirection: ROW_DIR,
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
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tileBadge: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: 'rgba(240,203,70,0.16)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(240,203,70,0.24)',
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
    color: 'rgba(255,255,255,0.78)',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    marginTop: -10,
  },
  tileProgressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
    overflow: 'hidden',
  },
  tileProgressFill: {
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.gold,
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
    backgroundColor: 'rgba(240,203,70,0.16)',
  },
  tileLightDecorCircle2: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 999,
    top: -32,
    left: 30,
    backgroundColor: 'rgba(6,23,62,0.08)',
  },
  tileWideOuter: {
    width: "100%",
    minHeight: 232,
    borderRadius: 24,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.94)",
    borderWidth: 1,
    borderColor: "rgba(204,160,0,0.12)",
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
    overflow: "hidden",
    marginBottom: 14,
  },

  rsvpCardInner: { flex: 1, justifyContent: "space-between" },
  rsvpHeaderRow: {
    flexDirection: ROW_DIR,
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  rsvpHeaderRight: {
    alignItems: ALIGN_RIGHT,
    gap: 4,
  },
  rsvpHeaderLeft: {
    alignItems: "flex-start",
    justifyContent: "flex-start",
  },
  rsvpHeaderValueRow: {
    flexDirection: ROW_DIR,
    alignItems: "baseline",
    gap: 10,
  },
  rsvpHeaderValue: {
    fontSize: 54,
    fontWeight: "900",
    letterSpacing: -1.0,
    lineHeight: 56,
    textAlign: "right",
  },
  rsvpHeaderLabelInline: {
    fontSize: 16,
    fontWeight: "800",
    color: "rgba(0,53,102,0.68)",
    textAlign: "right",
    marginBottom: 8,
  },
  rsvpArrowCircle: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: "rgba(240,203,70,0.16)",
    borderWidth: 1,
    borderColor: "rgba(204,160,0,0.16)",
    justifyContent: "center",
    alignItems: "center",
  },
  rsvpDivider: {
    height: 1,
    width: "100%",
    backgroundColor: "rgba(17, 24, 39, 0.07)",
    marginTop: 8,
    marginBottom: 10,
  },
  rsvpGrid: {
    flexDirection: ROW_DIR,
    alignItems: "stretch",
    gap: 10,
  },
  rsvpStatIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.65)",
    borderWidth: 1,
    borderColor: "rgba(17, 24, 39, 0.06)",
    justifyContent: "center",
    alignItems: "center",
  },
  rsvpStatValue: {
    fontSize: 20,
    fontWeight: "900",
    color: "rgba(17,24,39,0.92)",
    marginTop: 2,
    textAlign: "center",
  },
  rsvpStatLabel: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.4,
    textAlign: "center",
  },
  rsvpStatCardGreen: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    overflow: "hidden",
    backgroundColor: "rgba(52, 199, 89, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(52, 199, 89, 0.18)",
  },
  rsvpStatCardYellow: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    overflow: "hidden",
    backgroundColor: "rgba(240,203,70,0.18)",
    borderWidth: 2,
    borderColor: "rgba(204,160,0,0.24)",
  },
  rsvpStatCardRed: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    overflow: "hidden",
    backgroundColor: "rgba(255, 59, 48, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(255, 59, 48, 0.18)",
  },
  tileLightTopRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  tileLightIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: 'rgba(240,203,70,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tileLightPercentHint: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gold,
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
    color: 'rgba(0,53,102,0.70)',
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
    flexDirection: ROW_DIR,
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
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  secondaryActionText: {
    fontSize: 14,
    fontWeight: '800',
  },
}); 