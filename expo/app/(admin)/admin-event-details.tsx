import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, BackHandler, Easing, View, Text, StyleSheet, ScrollView, ActivityIndicator, StatusBar, TouchableOpacity, Platform, useWindowDimensions, Modal, Alert, Pressable, TextInput, KeyboardAvoidingView, RefreshControl } from 'react-native';
import { BlurView } from 'expo-blur';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { eventService } from '@/lib/services/eventService';
import { Ionicons } from '@expo/vector-icons';
import { Event, Guest } from '@/types';
import { supabase } from '@/lib/supabase';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import BackSwipe from '@/components/BackSwipe';
import { useAdminEventDetailsModel } from '@/features/events/useAdminEventDetailsModel';
import { ALIGN_RIGHT, ROW_DIR } from '@/lib/rtl';
import { getFloatingTabBarContentPadding } from '@/lib/floatingTabBarInset';
import { useUserStore } from '@/store/userStore';
import RsvpDonut from '@/features/events/event-details/RsvpDonut';

const PALETTE = {
  ink: '#06173e',
  inkDeep: '#040E24',
  gold: '#CCA000',
  goldLight: '#F0CB46',
  goldPale: '#F7DE8B',
  sheet: '#F4F7FD',
  confirmed: '#2FA36B',
  pending: '#E0A82E',
  declined: '#E2544A',
} as const;

// Hero accent ramp — the dark header runs cool blue + white only.
const ACCENT = {
  cyan: '#6EE7FF',
  electric: '#4C8DFF',
  deep: '#1E4FD8',
  soft: '#A9C8FF',
} as const;

export default function AdminEventDetailsScreen() {
  const { id, eventId } = useLocalSearchParams();
  const router = useRouter();
  const userType = useUserStore((state) => state.userType);
  const resolvedEventId = useMemo(() => {
    const fromId = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : '';
    const fromEventId = typeof eventId === 'string' ? eventId : Array.isArray(eventId) ? eventId[0] : '';
    return fromId || fromEventId || '';
  }, [eventId, id]);
  const { event, setEvent, guests, userName, loading, error, stats, refresh } =
    useAdminEventDetailsModel(resolvedEventId);
  const [noTablesModalOpen, setNoTablesModalOpen] = useState(false);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);

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
  const { height: windowHeight } = useWindowDimensions();
  const isEmployeeAppUser = userType === 'employee' && Platform.OS !== 'web';

  const heroIntro = useRef(new Animated.Value(0)).current;
  const sheetIntro = useRef(new Animated.Value(0)).current;
  // One driver per hero line so they can cascade in rather than land as a block.
  const heroSteps = useRef(Array.from({ length: 6 }, () => new Animated.Value(0))).current;
  const aurora = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(new Animated.Value(0)).current;
  const [heroHeight, setHeroHeight] = useState(0);
  const SHEET_OVERLAP = 44;

  useEffect(() => {
    if (loading) return;
    Animated.stagger(110, [
      Animated.timing(heroIntro, { toValue: 1, duration: 520, useNativeDriver: true }),
      Animated.timing(sheetIntro, { toValue: 1, duration: 520, useNativeDriver: true }),
    ]).start();

    Animated.stagger(
      85,
      heroSteps.map((value) =>
        Animated.timing(value, {
          toValue: 1,
          duration: 560,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        })
      )
    ).start();
  }, [loading, heroIntro, sheetIntro, heroSteps]);

  // Background aurora drifts forever; it is what makes the header feel alive.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(aurora, {
          toValue: 1,
          duration: 9000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(aurora, {
          toValue: 0,
          duration: 9000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [aurora]);

  // Radar ping on the status dot.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1900,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(320),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
      pulse.setValue(0);
    };
  }, [pulse]);

  const countdownLabel = useMemo(() => {
    const raw = event?.date;
    if (!raw) return '';
    const target = new Date(raw);
    if (!Number.isFinite(target.getTime())) return '';

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfEvent = new Date(target);
    startOfEvent.setHours(0, 0, 0, 0);

    const days = Math.round((startOfEvent.getTime() - startOfToday.getTime()) / 86400000);
    if (days > 1) return `עוד ${days} ימים`;
    if (days === 1) return 'מחר הגדול';
    if (days === 0) return 'האירוע היום';
    if (days === -1) return 'התקיים אתמול';
    return 'האירוע הסתיים';
  }, [event?.date]);

  const isUpcoming = useMemo(() => {
    const raw = event?.date;
    if (!raw) return true;
    const target = new Date(raw);
    if (!Number.isFinite(target.getTime())) return true;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfEvent = new Date(target);
    startOfEvent.setHours(0, 0, 0, 0);
    return startOfEvent.getTime() >= startOfToday.getTime();
  }, [event?.date]);

  // Always go back to admin events list from this screen.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      router.replace('/(admin)/admin-events');
      return true;
    });
    return () => sub.remove();
  }, [router]);

  const handlePullToRefresh = useCallback(async () => {
    if (!resolvedEventId || isPullRefreshing) return;
    const refreshStartedAt = Date.now();
    setIsPullRefreshing(true);
    try {
      await refresh({ silent: true });
    } finally {
      const minLoaderDurationMs = 700;
      const remainingTime = minLoaderDurationMs - (Date.now() - refreshStartedAt);
      if (remainingTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, remainingTime));
      }
      setIsPullRefreshing(false);
    }
  }, [resolvedEventId, isPullRefreshing, refresh]);

  if (loading) {
    return (
      <BackSwipe
        fallbackHref="/(admin)/admin-events"
        onBack={() => router.replace('/(admin)/admin-events')}
      >
        <View style={{ flex: 1, backgroundColor: '#071B45', justifyContent: 'center', alignItems: 'center', paddingTop: insets.top }}>
          <StatusBar barStyle="light-content" backgroundColor="#071B45" />
          <ActivityIndicator size="large" color={ACCENT.cyan} />
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

  const confirmed = stats.confirmedPeople;
  const declined = stats.declinedPeople;
  const pending = stats.pendingPeople;
  const totalGuests = stats.invitedPeople;
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

  const getEventTypeLabel = () => {
    const raw = String(event?.title ?? '').trim();
    if (!raw) return 'אירוע';
    // Common pattern in the design: "סוג אירוע – ..." → keep only the type
    const parts = raw.split(/(?:\s*[–—-]\s*)/g).map(p => p.trim()).filter(Boolean);
    return parts[0] || raw;
  };

  const getEventDisplayTitle = () => {
    const raw = String(event?.title ?? '').trim();
    if (!raw) return 'אירוע';
    const parts = raw.split(/(?:\s*[–—-]\s*)/g).map(p => p.trim()).filter(Boolean);
    if (parts.length > 1) {
      return parts.slice(1).join(' - ');
    }
    return raw;
  };

  const isWeddingEvent = () => {
    const label = getEventTypeLabel();
    return label === 'חתונה' || String(event?.title ?? '').includes('חתונה');
  };

  const groomLabel = () => (event?.groomName || '').trim() || 'לא הוזן';
  const brideLabel = () => (event?.brideName || '').trim() || 'לא הוזן';

  const getProgressPercent = (value: number, total: number) =>
    total ? Math.max(0, Math.min(100, Math.round((value / total) * 100))) : 0;
  const tabBarReserve = getFloatingTabBarContentPadding(insets.bottom);

  const eventTypeLabel = getEventTypeLabel();
  const displayTitle = getEventDisplayTitle();
  const showTypeChip = eventTypeLabel !== displayTitle;
  const venueLabel = String(event.location ?? '').trim() || 'מיקום לא הוזן';
  const cityLabel = String(event.city ?? '').trim();
  const invitationImageUrl = String(event.invitationImageUrl ?? '').trim();
  const hasInvitationBackdrop = invitationImageUrl.length > 0;
  const measuredHeroHeight = heroHeight > 0 ? heroHeight : Math.round(windowHeight * 0.44);
  const sheetPadTop = Math.max(measuredHeroHeight - SHEET_OVERLAP, 200);

  const heroAnimatedStyle = {
    opacity: heroIntro,
    transform: [{ translateY: heroIntro.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
  };

  // Sticky hero: the curved sheet scrolls up over it. Subtle parallax keeps it alive.
  const heroParallaxStyle = {
    transform: [
      {
        translateY: scrollY.interpolate({
          inputRange: [-140, 0, 260],
          outputRange: [56, 0, -48],
          extrapolate: 'clamp',
        }),
      },
      {
        scale: scrollY.interpolate({
          inputRange: [-140, 0, 260],
          outputRange: [1.06, 1, 0.96],
          extrapolate: 'clamp',
        }),
      },
    ],
    opacity: scrollY.interpolate({
      inputRange: [0, 180, 300],
      outputRange: [1, 0.72, 0.4],
      extrapolate: 'clamp',
    }),
  };

  const stepStyle = (index: number, rise = 18) => ({
    opacity: heroSteps[index],
    transform: [
      { translateY: heroSteps[index].interpolate({ inputRange: [0, 1], outputRange: [rise, 0] }) },
    ],
  });
  // The rule draws itself out from the centre instead of fading in.
  const ruleStyle = {
    opacity: heroSteps[3],
    transform: [{ scaleX: heroSteps[3] }],
  };
  const drift = (x: [number, number], y: [number, number], s: [number, number]) => ({
    transform: [
      { translateX: aurora.interpolate({ inputRange: [0, 1], outputRange: x }) },
      { translateY: aurora.interpolate({ inputRange: [0, 1], outputRange: y }) },
      { scale: aurora.interpolate({ inputRange: [0, 1], outputRange: s }) },
    ],
  });
  const pingStyle = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 3.2] }) }],
  };
  const sheetAnimatedStyle = {
    opacity: sheetIntro,
    transform: [{ translateY: sheetIntro.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) }],
  };

  const actionTiles: ActionTile[] = [];
  if (!isEmployeeAppUser) {
    actionTiles.push({
      key: 'invitation',
      title: 'לינק להזמנה',
      caption: 'קישורים אישיים למוזמנים',
      icon: 'link-outline',
      tint: ['#FFF6DC', '#FBE9B4'],
      iconColor: PALETTE.gold,
      onPress: () => router.push(`/(admin)/admin-invitation-links?eventId=${event.id}`),
    });
  }
  actionTiles.push({
    key: 'tables',
    title: 'רשימת שולחנות',
    caption: 'צפייה וניהול שולחנות',
    icon: 'list-outline',
    tint: ['#E8F0FF', '#D5E4FF'],
    iconColor: colors.yaleBlue,
    onPress: () => router.push(`/(admin)/TablesList?eventId=${event.id}`),
  });
  if (!isEmployeeAppUser) {
    actionTiles.push({
      key: 'messages',
      title: 'הודעות אוטומטיות',
      caption: 'תזכורות והודעות וואטסאפ',
      icon: 'chatbubble-ellipses-outline',
      tint: ['#E9FBF2', '#D2F2E2'],
      iconColor: PALETTE.confirmed,
      onPress: () =>
        router.push(
          `/(admin)/admin-event-messages?eventId=${event.id}&returnTo=${encodeURIComponent(`/(admin)/admin-event-details?id=${event.id}`)}`
        ),
    });
    actionTiles.push({
      key: 'rsvp',
      title: 'אישורי הגעה',
      caption: 'מעקב סטטוסים של מוזמנים',
      icon: 'people-outline',
      tint: ['#FFF6DC', '#FBE9B4'],
      iconColor: PALETTE.gold,
      onPress: () => router.push(`/(admin)/admin-rsvp-approvals?eventId=${event.id}`),
    });
  }
  actionTiles.push({
    key: 'checkin',
    title: 'צ׳ק-אין אורחים',
    caption: 'סימון הגעה בזמן אמת',
    icon: 'qr-code-outline',
    tint: ['#E8F0FF', '#D5E4FF'],
    iconColor: colors.yaleBlue,
    onPress: () =>
      router.push(
        `/(admin)/admin-guest-checkin?eventId=${event.id}&returnTo=${encodeURIComponent(`/(admin)/admin-event-details?id=${event.id}`)}`
      ),
  });
  actionTiles.push({
    key: 'live-seating',
    title: 'מפת לייב באירוע',
    caption: 'כמה באמת יושבים בכל שולחן',
    icon: 'pulse-outline',
    tint: ['#FFE9E9', '#FFD5D5'],
    iconColor: '#DC2626',
    onPress: () =>
      router.push(
        `/(admin)/live-seating?eventId=${event.id}&returnTo=${encodeURIComponent(`/(admin)/admin-event-details?id=${event.id}`)}`
      ),
  });
  actionTiles.push({
    key: 'seating',
    title: 'מפת הושבה',
    caption: 'צפייה וניהול מפת האולם',
    icon: 'grid-outline',
    tint: ['#EDEBFF', '#DEDBFB'],
    iconColor: '#5B54C9',
    onPress: handleSeatingMap,
  });

  return (
    <View style={styles.screenRoot}>
      <StatusBar barStyle="light-content" backgroundColor="#071B45" />
      <View style={styles.safeRoot}>
        <View style={styles.safe}>
          {/* Sticky hero — stays put while the curved sheet rises over it */}
          <Animated.View
            pointerEvents="none"
            style={[styles.heroFixed, heroParallaxStyle]}
            onLayout={(e) => {
              const next = Math.round(e.nativeEvent.layout.height);
              if (next > 0 && next !== heroHeight) setHeroHeight(next);
            }}
          >
            <View style={[styles.hero, { paddingTop: insets.top + 8 }]}>
              <View pointerEvents="none" style={styles.heroGradientLayer}>
                <LinearGradient
                  colors={['#0C3070', '#071B45', PALETTE.inkDeep]}
                  locations={[0, 0.58, 1]}
                  start={{ x: 0.15, y: 0 }}
                  end={{ x: 0.85, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />

                {hasInvitationBackdrop ? (
                  <View style={styles.heroBackdrop}>
                    <Image
                      source={{ uri: invitationImageUrl }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      transition={220}
                    />
                    <LinearGradient
                      colors={['rgba(5,16,44,0.94)', 'rgba(6,20,52,0.56)', 'rgba(4,12,32,0.92)']}
                      locations={[0, 0.4, 1]}
                      start={{ x: 0.5, y: 0 }}
                      end={{ x: 0.5, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                  </View>
                ) : null}

                <View
                  style={[styles.heroAura, hasInvitationBackdrop ? styles.heroAuraSoft : null]}
                >
                  <Animated.View style={[StyleSheet.absoluteFill, drift([-30, 26], [12, -20], [1, 1.18])]}>
                    <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
                      <Defs>
                        <RadialGradient id="auraCyan" cx="50%" cy="50%" r="50%">
                          <Stop offset="0" stopColor={ACCENT.cyan} stopOpacity="0.34" />
                          <Stop offset="0.55" stopColor={ACCENT.cyan} stopOpacity="0.10" />
                          <Stop offset="1" stopColor={ACCENT.cyan} stopOpacity="0" />
                        </RadialGradient>
                      </Defs>
                      <Ellipse cx="50" cy="50" rx="62" ry="40" fill="url(#auraCyan)" />
                    </Svg>
                  </Animated.View>

                  <Animated.View style={[StyleSheet.absoluteFill, drift([24, -22], [-14, 16], [1.12, 1])]}>
                    <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
                      <Defs>
                        <RadialGradient id="auraElectric" cx="50%" cy="50%" r="50%">
                          <Stop offset="0" stopColor={ACCENT.electric} stopOpacity="0.40" />
                          <Stop offset="1" stopColor={ACCENT.electric} stopOpacity="0" />
                        </RadialGradient>
                      </Defs>
                      <Ellipse cx="84" cy="8" rx="54" ry="34" fill="url(#auraElectric)" />
                    </Svg>
                  </Animated.View>

                  <Animated.View style={[StyleSheet.absoluteFill, drift([16, -18], [8, -10], [1, 1.1])]}>
                    <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
                      <Defs>
                        <RadialGradient id="auraDeep" cx="50%" cy="50%" r="50%">
                          <Stop offset="0" stopColor={ACCENT.electric} stopOpacity="0.34" />
                          <Stop offset="1" stopColor={ACCENT.electric} stopOpacity="0" />
                        </RadialGradient>
                      </Defs>
                      <Ellipse cx="42" cy="104" rx="70" ry="26" fill="url(#auraDeep)" />
                    </Svg>
                  </Animated.View>
                </View>
              </View>

              {/* Spacer matching the floating top bar so body layout stays correct */}
              <View style={styles.heroTopBarSpacerBlock} />

              <Animated.View style={[styles.heroBody, heroAnimatedStyle]}>
                {showTypeChip ? (
                  <Animated.View style={[styles.glassWrap, styles.typeChip, stepStyle(0, 12)]}>
                    <BlurView intensity={26} tint="dark" style={StyleSheet.absoluteFill} />
                    <View style={styles.typeDot} />
                    <Text style={styles.typeChipText}>{eventTypeLabel}</Text>
                  </Animated.View>
                ) : null}

                {userName ? (
                  <Animated.Text style={[styles.heroEyebrow, stepStyle(1)]} numberOfLines={1}>
                    {userName}
                  </Animated.Text>
                ) : null}

                <Animated.Text
                  style={[styles.heroTitle, userName ? null : styles.heroTitleSolo, stepStyle(2, 22)]}
                  numberOfLines={2}
                >
                  {displayTitle}
                </Animated.Text>

                <Animated.View style={[styles.ruleWrap, ruleStyle]}>
                  <LinearGradient
                    colors={['rgba(110,231,255,0)', ACCENT.cyan, 'rgba(110,231,255,0)']}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={styles.ruleLine}
                  />
                </Animated.View>

                {isWeddingEvent() ? (
                  <Animated.View style={[styles.coupleRow, stepStyle(4)]}>
                    <Text style={styles.coupleName} numberOfLines={1}>
                      {groomLabel()}
                    </Text>
                    <Ionicons name="heart" size={13} color={ACCENT.cyan} />
                    <Text style={styles.coupleName} numberOfLines={1}>
                      {brideLabel()}
                    </Text>
                  </Animated.View>
                ) : null}

                {countdownLabel ? (
                  <Animated.View style={stepStyle(4)}>
                    {isUpcoming ? (
                      <LinearGradient
                        colors={[ACCENT.electric, ACCENT.deep]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.countdownPill}
                      >
                        <View style={styles.dotWrap}>
                          <Animated.View style={[styles.dotPing, pingStyle]} />
                          <View style={styles.dotCore} />
                        </View>
                        <Text style={styles.countdownText}>{countdownLabel}</Text>
                      </LinearGradient>
                    ) : (
                      <View style={[styles.glassWrap, styles.countdownPill, styles.countdownPillPast]}>
                        <BlurView intensity={26} tint="dark" style={StyleSheet.absoluteFill} />
                        <Ionicons name="checkmark-circle" size={13} color="rgba(255,255,255,0.72)" />
                        <Text style={[styles.countdownText, styles.countdownTextPast]}>{countdownLabel}</Text>
                      </View>
                    )}
                  </Animated.View>
                ) : null}

                <Animated.View style={[styles.glassWrap, styles.metaBar, stepStyle(5)]}>
                  <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />
                  <View style={styles.metaItemFixed}>
                    <Ionicons name="calendar-outline" size={13} color={ACCENT.cyan} />
                    <Text style={styles.metaText} numberOfLines={1}>{`${weekday}, ${day}`}</Text>
                  </View>

                  <View style={styles.metaDivider} />

                  <View style={styles.metaItem}>
                    <Ionicons name="location-outline" size={13} color={ACCENT.cyan} />
                    <Text style={styles.metaText} numberOfLines={1}>
                      {cityLabel ? `${venueLabel} · ${cityLabel}` : venueLabel}
                    </Text>
                  </View>
                </Animated.View>
              </Animated.View>
            </View>
          </Animated.View>

          {/* Floating chrome — stays tappable above the rising sheet */}
          <View style={[styles.heroTopBarFloating, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
            <View style={styles.heroTopBar}>
              {!isEmployeeAppUser ? (
                <TouchableOpacity
                  style={styles.heroIconBtn}
                  onPress={openEditEvent}
                  activeOpacity={0.85}
                  disabled={editSaving}
                  accessibilityRole="button"
                  accessibilityLabel="עריכת אירוע"
                >
                  <Ionicons name="create-outline" size={19} color="rgba(255,255,255,0.92)" />
                </TouchableOpacity>
              ) : (
                <View style={styles.heroIconBtnPlaceholder} />
              )}

              <View style={styles.heroTopBarSpacer} />

              <TouchableOpacity
                style={styles.heroIconBtn}
                onPress={handleBackPress}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="חזרה לעמוד הקודם"
              >
                <Ionicons name="chevron-back" size={20} color="rgba(255,255,255,0.92)" />
              </TouchableOpacity>
            </View>
          </View>

          <Animated.ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.content, { paddingTop: sheetPadTop }]}
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
              useNativeDriver: true,
            })}
            refreshControl={
              <RefreshControl
                refreshing={isPullRefreshing}
                onRefresh={() => void handlePullToRefresh()}
                tintColor={ACCENT.cyan}
                colors={[ACCENT.cyan]}
                progressBackgroundColor={PALETTE.ink}
                progressViewOffset={Math.max(72, insets.top + 56)}
              />
            }
          >
            {/* Light content sheet that curves up over the sticky hero */}
            <Animated.View
              style={[
                styles.sheet,
                sheetAnimatedStyle,
                {
                  minHeight: windowHeight * 0.55,
                  paddingBottom: tabBarReserve,
                },
              ]}
            >
              <View style={styles.sheetHandle} />

              <RsvpOverviewCard
                interactive={!isEmployeeAppUser}
                invitedPeople={invitedPeople}
                confirmedPeople={confirmedPeople}
                pendingPeople={pendingPeople}
                declinedPeople={declinedPeople}
                onPress={() => router.push(`/(admin)/admin-rsvp-approvals?eventId=${event.id}`)}
              />

              <SectionHeading title="התקדמות" caption="מבט מהיר על מצב ההפקה" />

              <View style={styles.progressRow}>
                <ProgressCard
                  label="הושבו"
                  value={`${seatedPercent}%`}
                  caption={`${stats.seated} מתוך ${totalGuests} אורחים`}
                  percent={seatedPercent}
                  color={colors.yaleBlue}
                  icon="grid-outline"
                />
                <ProgressCard
                  label="הודעות נשלחו"
                  value={String(stats.sentMessageCount)}
                  caption={`מתוך ${totalGuests} מוזמנים`}
                  percent={getProgressPercent(stats.sentMessageCount, totalGuests)}
                  color={PALETTE.gold}
                  icon="paper-plane-outline"
                />
              </View>

              <SectionHeading title="ניהול האירוע" caption="כל הכלים במקום אחד" />

              <View style={styles.actionGrid}>
                {actionTiles.map((tile) => (
                  <TouchableOpacity
                    key={tile.key}
                    style={styles.actionTile}
                    activeOpacity={0.88}
                    onPress={tile.onPress}
                    accessibilityRole="button"
                    accessibilityLabel={tile.title}
                  >
                    <LinearGradient
                      colors={tile.tint}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.actionTileIcon}
                    >
                      <Ionicons name={tile.icon} size={21} color={tile.iconColor} />
                    </LinearGradient>

                    <Text style={styles.actionTileTitle} numberOfLines={1}>
                      {tile.title}
                    </Text>
                    <Text style={styles.actionTileCaption} numberOfLines={2}>
                      {tile.caption}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Animated.View>
          </Animated.ScrollView>
        </View>

      {/* Edit event modal */}
      <Modal transparent visible={editOpen} animationType="fade" onRequestClose={() => setEditOpen(false)}>
        <View style={styles.editOverlay}>
          <Pressable
            style={styles.editBackdrop}
            onPress={() => {
              if (deleteConfirmOpen && !deleteSaving) {
                setDeleteConfirmOpen(false);
                return;
              }
              setEditOpen(false);
            }}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 18 : 0}
            style={styles.editKeyboardWrap}
            pointerEvents="box-none"
          >
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

                <View style={styles.editHeaderTextWrap}>
                  <Text style={styles.editTitle}>עריכת אירוע</Text>
                  <Text style={styles.editSubtitle} numberOfLines={1}>
                    {getEventDisplayTitle()}
                  </Text>
                  <View style={styles.editTypeChip}>
                    <Text style={styles.editTypeChipText}>{getEventTypeLabel()}</Text>
                  </View>
                </View>

                <View style={styles.editHeaderIcon}>
                  <Ionicons name="create-outline" size={18} color={PALETTE.ink} />
                </View>
              </View>

              <View style={styles.editDivider} />

              <ScrollView
                style={styles.editScroll}
                contentContainerStyle={[styles.editBody, { paddingBottom: Math.max(insets.bottom + 18, 24) }]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="always"
                nestedScrollEnabled
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                bounces={false}
                alwaysBounceVertical={false}
                overScrollMode="never"
              >
                <View style={styles.editSectionCard}>
                  <View style={styles.editSectionHeader}>
                    <Text style={styles.editSectionTitle}>פרטי האירוע</Text>
                    <Text style={styles.editSectionHint}>עדכן את התאריך והמיקום שיוצגו באפליקציה</Text>
                  </View>

                  <View style={styles.editFieldBlock}>
                    <Text style={styles.editFieldLabel}>תאריך האירוע</Text>
                    <TouchableOpacity
                      style={styles.dateRow}
                      onPress={() => setEditDatePickerOpen(true)}
                      activeOpacity={0.9}
                      accessibilityRole="button"
                      accessibilityLabel="בחירת תאריך"
                    >
                      <View style={styles.editFieldIcon}>
                        <Ionicons name="calendar-outline" size={16} color={'rgba(0,53,102,0.78)'} />
                      </View>
                      <Text style={styles.dateRowText}>
                        {Number.isFinite(editForm.date.getTime())
                          ? editForm.date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
                          : ''}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.editFieldBlock}>
                    <Text style={styles.editFieldLabel}>מיקום</Text>
                    <TextInput
                      value={editForm.location}
                      onChangeText={(t) => setEditForm((f) => ({ ...f, location: t }))}
                      placeholder="הזן אולם או מקום"
                      placeholderTextColor={'rgba(17,24,39,0.35)'}
                      style={styles.editInput}
                      textAlign="right"
                    />
                  </View>

                  <View style={styles.editFieldBlock}>
                    <Text style={styles.editFieldLabel}>עיר</Text>
                    <TextInput
                      value={editForm.city}
                      onChangeText={(t) => setEditForm((f) => ({ ...f, city: t }))}
                      placeholder="הזן עיר"
                      placeholderTextColor={'rgba(17,24,39,0.35)'}
                      style={styles.editInput}
                      textAlign="right"
                    />
                  </View>
                </View>

                {isWeddingEvent() ? (
                  <View style={styles.editSectionCard}>
                    <View style={styles.editSectionHeader}>
                      <Text style={styles.editSectionTitle}>פרטי חתונה</Text>
                      <Text style={styles.editSectionHint}>שמות שיופיעו באזור המידע של האירוע</Text>
                    </View>

                    <View style={styles.editFieldBlock}>
                      <Text style={styles.editFieldLabel}>שם חתן</Text>
                      <TextInput
                        value={editForm.groomName}
                        onChangeText={(t) => setEditForm((f) => ({ ...f, groomName: t }))}
                        placeholder="שם החתן"
                        placeholderTextColor={'rgba(17,24,39,0.35)'}
                        style={styles.editInput}
                        textAlign="right"
                      />
                    </View>

                    <View style={styles.editFieldBlock}>
                      <Text style={styles.editFieldLabel}>שם כלה</Text>
                      <TextInput
                        value={editForm.brideName}
                        onChangeText={(t) => setEditForm((f) => ({ ...f, brideName: t }))}
                        placeholder="שם הכלה"
                        placeholderTextColor={'rgba(17,24,39,0.35)'}
                        style={styles.editInput}
                        textAlign="right"
                      />
                    </View>
                  </View>
                ) : null}

                <View style={{ height: 6 }} />
              </ScrollView>

              <View style={styles.editFooter}>
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
        </View>
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
                <Ionicons name="grid-outline" size={18} color={PALETTE.ink} />
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
    </View>
  );
}

type ActionTile = {
  key: string;
  title: string;
  caption: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: readonly [string, string];
  iconColor: string;
  onPress: () => void;
};

function SectionHeading({ title, caption }: { title: string; caption: string }) {
  return (
    <View style={styles.sectionHead}>
      <View style={styles.sectionHeadTextWrap}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionCaption}>{caption}</Text>
      </View>
      <View style={styles.sectionRule} />
    </View>
  );
}

function RsvpLegendRow({
  color,
  label,
  value,
  percent,
}: {
  color: string;
  label: string;
  value: number;
  percent: number;
}) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.legendValue, { color }]}>{value}</Text>
      <Text style={styles.legendPercent}>{`${percent}%`}</Text>
    </View>
  );
}

function RsvpOverviewCard({
  interactive,
  invitedPeople,
  confirmedPeople,
  pendingPeople,
  declinedPeople,
  onPress,
}: {
  interactive: boolean;
  invitedPeople: number;
  confirmedPeople: number;
  pendingPeople: number;
  declinedPeople: number;
  onPress: () => void;
}) {
  const share = (value: number) =>
    invitedPeople ? Math.max(0, Math.min(100, Math.round((value / invitedPeople) * 100))) : 0;

  const body = (
    <>
      <View style={styles.overviewTopRow}>
        <RsvpDonut
          segments={[
            { key: 'confirmed', value: confirmedPeople, color: PALETTE.confirmed },
            { key: 'pending', value: pendingPeople, color: PALETTE.pending },
            { key: 'declined', value: declinedPeople, color: PALETTE.declined },
          ]}
          centerValue={String(invitedPeople)}
          centerLabel="מוזמנים"
        />

        <View style={styles.legendCol}>
          <RsvpLegendRow
            color={PALETTE.confirmed}
            label="אישרו"
            value={confirmedPeople}
            percent={share(confirmedPeople)}
          />
          <RsvpLegendRow
            color={PALETTE.pending}
            label="ממתינים"
            value={pendingPeople}
            percent={share(pendingPeople)}
          />
          <RsvpLegendRow
            color={PALETTE.declined}
            label="לא מגיעים"
            value={declinedPeople}
            percent={share(declinedPeople)}
          />
        </View>
      </View>

      {interactive ? (
        <View style={styles.overviewFooter}>
          <Text style={styles.overviewFooterText}>ניהול אישורי הגעה</Text>
          <Ionicons name="chevron-back" size={16} color={PALETTE.gold} />
        </View>
      ) : null}
    </>
  );

  if (!interactive) {
    return <View style={styles.overviewCard}>{body}</View>;
  }

  return (
    <TouchableOpacity
      style={styles.overviewCard}
      activeOpacity={0.9}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="פתיחת אישורי הגעה"
    >
      {body}
    </TouchableOpacity>
  );
}

function ProgressCard({
  label,
  value,
  caption,
  percent,
  color,
  icon,
}: {
  label: string;
  value: string;
  caption: string;
  percent: number;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.progressCard}>
      <View style={styles.progressCardHeader}>
        <View style={[styles.progressCardIcon, { backgroundColor: `${color}1A` }]}>
          <Ionicons name={icon} size={16} color={color} />
        </View>
        <Text style={styles.progressCardLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>

      <Text style={styles.progressCardValue}>{value}</Text>

      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${Math.max(0, Math.min(100, percent))}%`, backgroundColor: color },
          ]}
        />
      </View>

      <Text style={styles.progressCardCaption} numberOfLines={1}>
        {caption}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: { flex: 1, backgroundColor: PALETTE.inkDeep },
  safeRoot: { flex: 1, backgroundColor: PALETTE.inkDeep },
  safe: { flex: 1, backgroundColor: 'transparent', overflow: 'hidden' },

  scroll: { flex: 1, zIndex: 2 },
  content: { paddingBottom: 0, flexGrow: 1 },

  // ----- Sticky hero -----
  heroFixed: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 0,
  },
  hero: {
    position: 'relative',
    paddingHorizontal: 24,
    paddingBottom: 56,
    alignItems: 'center',
  },
  heroGradientLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  heroBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  heroAura: {
    ...StyleSheet.absoluteFillObject,
  },
  heroAuraSoft: { opacity: 0.45 },

  heroTopBarFloating: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 5,
    paddingHorizontal: 24,
  },
  heroTopBar: {
    width: '100%',
    flexDirection: ROW_DIR,
    alignItems: 'center',
  },
  heroTopBarSpacer: { flex: 1 },
  heroTopBarSpacerBlock: {
    width: '100%',
    height: 42,
  },
  heroIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroIconBtnPlaceholder: { width: 42, height: 42 },

  heroBody: {
    width: '100%',
    maxWidth: 460,
    alignItems: 'center',
    marginTop: 26,
  },

  heroEyebrow: {
    marginTop: 16,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 3.4,
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'center',
    textShadowColor: 'rgba(4,14,36,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  heroTitle: {
    marginTop: 6,
    fontSize: 36,
    lineHeight: 42,
    fontWeight: '900',
    letterSpacing: -1,
    color: '#FFFFFF',
    textAlign: 'center',
    textShadowColor: 'rgba(4,14,36,0.65)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
  heroTitleSolo: { marginTop: 14 },

  ruleWrap: {
    marginTop: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ruleLine: {
    width: 132,
    height: 2,
    borderRadius: 2,
    shadowColor: ACCENT.cyan,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },

  coupleRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 10,
    maxWidth: '100%',
  },
  coupleName: {
    fontSize: 16,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 0.3,
    flexShrink: 1,
  },

  // Frosted base shared by every hero chip — the blur sits behind the content,
  // so the wrapper must clip it.
  glassWrap: {
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },

  typeChip: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 999,
  },
  typeDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: ACCENT.cyan,
    shadowColor: ACCENT.cyan,
    shadowOpacity: 1,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
  },
  typeChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.92)',
    letterSpacing: 1.6,
  },

  countdownPill: {
    marginTop: 18,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    shadowColor: ACCENT.electric,
    shadowOpacity: 0.55,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  countdownPillPast: { shadowOpacity: 0, elevation: 0 },
  countdownText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  countdownTextPast: { color: 'rgba(255,255,255,0.82)' },

  // Radar ping on the live-status dot.
  dotWrap: { width: 8, height: 8, alignItems: 'center', justifyContent: 'center' },
  dotPing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },
  dotCore: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },

  metaBar: {
    marginTop: 14,
    maxWidth: '100%',
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  metaItem: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  metaItemFixed: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  metaDivider: {
    width: 1,
    height: 16,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  metaText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.86)',
  },

  // ----- Content sheet (rises over the sticky hero) -----
  sheet: {
    paddingHorizontal: 20,
    paddingTop: 14,
    backgroundColor: PALETTE.sheet,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    shadowColor: '#040E24',
    shadowOpacity: 0.22,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: -8 },
    elevation: 14,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 46,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(6,23,62,0.16)',
    marginBottom: 20,
  },

  editOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  editBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6,23,62,0.40)',
  },
  editKeyboardWrap: {
    width: '100%',
    justifyContent: 'center',
  },
  editCard: {
    width: '100%',
    maxWidth: 560,
    borderRadius: 30,
    backgroundColor: 'rgba(252,253,255,0.99)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.78)',
    shadowColor: colors.black,
    shadowOpacity: 0.16,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
    overflow: 'hidden',
    maxHeight: '90%',
  },
  editScroll: {
    flexGrow: 0,
  },
  editHeader: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 108,
    position: 'relative',
  },
  editHeaderIcon: {
    position: 'absolute',
    top: 18,
    right: 18,
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: 'rgba(240,203,70,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(204,160,0,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editHeaderTextWrap: {
    width: '100%',
    paddingHorizontal: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editCloseBtn: {
    position: 'absolute',
    top: 21,
    left: 18,
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: 'rgba(17,24,39,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editTitle: { fontSize: 22, fontWeight: '900', color: colors.richBlack, textAlign: 'center', letterSpacing: -0.3 },
  editSubtitle: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(0,53,102,0.68)',
    textAlign: 'center',
  },
  editTypeChip: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,53,102,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0,53,102,0.10)',
  },
  editTypeChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.richBlack,
    textAlign: 'center',
  },
  editDivider: { height: 1, backgroundColor: 'rgba(6,23,62,0.08)', marginHorizontal: 18 },
  editBody: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 16, gap: 14 },
  editSectionCard: {
    gap: 14,
    padding: 16,
    borderRadius: 22,
    backgroundColor: 'rgba(244,248,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(21,76,151,0.08)',
  },
  editSectionHeader: {
    gap: 4,
    alignItems: ALIGN_RIGHT,
  },
  editSectionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.richBlack,
    textAlign: 'right',
  },
  editSectionHint: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(17,24,39,0.58)',
    textAlign: 'right',
    lineHeight: 18,
  },
  editFieldBlock: {
    gap: 8,
  },
  editFieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(17,24,39,0.68)',
    textAlign: 'right',
  },
  editFieldIcon: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: 'rgba(240,203,70,0.16)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editInput: {
    height: 52,
    borderRadius: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(21,76,151,0.10)',
    backgroundColor: 'rgba(255,255,255,0.96)',
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
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(21,76,151,0.10)',
    backgroundColor: 'rgba(255,255,255,0.96)',
    paddingHorizontal: 16,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateRowText: { fontSize: 15, fontWeight: '900', color: colors.richBlack },
  editFooter: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 18,
    flexDirection: ROW_DIR,
    gap: 10,
    backgroundColor: 'rgba(252,253,255,0.99)',
  },
  footerBtnSecondary: {
    flex: 1,
    height: 50,
    borderRadius: 16,
    backgroundColor: 'rgba(17,24,39,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerBtnSecondaryText: { fontSize: 14, fontWeight: '900', color: '#111827' },
  footerBtnDanger: {
    flex: 1,
    height: 50,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 59, 48, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: ROW_DIR,
    gap: 8,
  },
  footerBtnDangerText: { fontSize: 13, fontWeight: '900', color: colors.error },
  footerBtnPrimary: {
    flex: 1.35,
    height: 50,
    borderRadius: 16,
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

  // ----- RSVP overview -----
  overviewCard: {
    borderRadius: 28,
    padding: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
    shadowColor: '#0B2A5B',
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  overviewTopRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 14,
  },
  legendCol: {
    flex: 1,
    gap: 12,
  },
  legendRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
  },
  legendLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(6,23,62,0.62)',
    textAlign: 'right',
  },
  legendValue: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  legendPercent: {
    minWidth: 38,
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(6,23,62,0.40)',
    textAlign: 'left',
  },
  overviewFooter: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(6,23,62,0.06)',
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  overviewFooterText: {
    fontSize: 13,
    fontWeight: '900',
    color: PALETTE.gold,
    letterSpacing: 0.2,
  },

  // ----- Section headings -----
  sectionHead: {
    marginTop: 28,
    marginBottom: 14,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 14,
  },
  sectionHeadTextWrap: {
    alignItems: ALIGN_RIGHT,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: PALETTE.ink,
    letterSpacing: -0.4,
    textAlign: 'right',
  },
  sectionCaption: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(6,23,62,0.45)',
    textAlign: 'right',
  },
  sectionRule: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(6,23,62,0.10)',
  },

  // ----- Progress cards -----
  progressRow: {
    flexDirection: ROW_DIR,
    gap: 12,
  },
  progressCard: {
    flex: 1,
    borderRadius: 22,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
    shadowColor: '#0B2A5B',
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  progressCardHeader: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 8,
  },
  progressCardIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressCardLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(6,23,62,0.55)',
    textAlign: 'right',
  },
  progressCardValue: {
    marginTop: 12,
    fontSize: 28,
    fontWeight: '900',
    color: PALETTE.ink,
    letterSpacing: -0.8,
    textAlign: 'right',
  },
  progressTrack: {
    marginTop: 10,
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(6,23,62,0.07)',
    overflow: 'hidden',
    alignItems: 'flex-end',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    alignSelf: 'flex-end',
  },
  progressCardCaption: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(6,23,62,0.42)',
    textAlign: 'right',
  },

  // ----- Action grid -----
  actionGrid: {
    flexDirection: ROW_DIR,
    flexWrap: 'wrap',
    gap: 12,
  },
  actionTile: {
    width: '47.8%',
    flexGrow: 1,
    minHeight: 132,
    borderRadius: 22,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(6,23,62,0.06)',
    alignItems: ALIGN_RIGHT,
    shadowColor: '#0B2A5B',
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  actionTileIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionTileTitle: {
    marginTop: 14,
    fontSize: 15,
    fontWeight: '900',
    color: PALETTE.ink,
    letterSpacing: -0.3,
    textAlign: 'right',
  },
  actionTileCaption: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
    color: 'rgba(6,23,62,0.48)',
    textAlign: 'right',
  },
}); 