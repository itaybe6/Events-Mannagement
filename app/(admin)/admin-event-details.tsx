import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Platform, useWindowDimensions, Modal, Alert, Pressable, TextInput, KeyboardAvoidingView, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { eventService } from '@/lib/services/eventService';
import { Ionicons } from '@expo/vector-icons';
import { Event, Guest } from '@/types';
import { supabase } from '@/lib/supabase';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import BackSwipe from '@/components/BackSwipe';
import { useAdminEventDetailsModel } from '@/features/events/useAdminEventDetailsModel';
import { ALIGN_LEFT, ALIGN_RIGHT, ROW_DIR } from '@/lib/rtl';
import { useUserStore } from '@/store/userStore';

export default function AdminEventDetailsScreen() {
  const { id, eventId } = useLocalSearchParams();
  const router = useRouter();
  const userType = useUserStore((state) => state.userType);
  const resolvedEventId = useMemo(() => {
    const fromId = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : '';
    const fromEventId = typeof eventId === 'string' ? eventId : Array.isArray(eventId) ? eventId[0] : '';
    return fromId || fromEventId || '';
  }, [eventId, id]);
  const { event, setEvent, guests, userName, userAvatarUrl, loading, error, stats, refresh } =
    useAdminEventDetailsModel(resolvedEventId);
  const [avatarPreviewOpen, setAvatarPreviewOpen] = useState(false);
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
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const isEmployeeAppUser = userType === 'employee' && Platform.OS !== 'web';

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
    bg: '#EDF5FF',
    text: colors.richBlack,
    muted: 'rgba(0, 53, 102, 0.72)',
    primary: colors.richBlack,
    accent: colors.gold,
    glassBorder: 'rgba(21, 76, 151, 0.10)',
    glassFill: 'rgba(244, 249, 255, 0.92)',
  } as const;

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

  const getInitials = (name: string) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return '';
    const parts = trimmed.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] ?? '';
    const second = parts.length > 1 ? parts[1]?.[0] ?? '' : '';
    return (first + second).toUpperCase();
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

  const heroTopSpacing = 58;
  const heroBaseHeight = Math.max(420, Math.min(620, windowHeight * 0.62));
  const weddingHeroExtraHeight = isWeddingEvent() ? 110 : 0;
  const heroHeight = heroBaseHeight + Math.max(0, heroTopSpacing - 22) + weddingHeroExtraHeight;
  // Keep the end of the scroll content above the tab bar
  const tabBarBottomOffset = Platform.OS === 'ios' ? 30 : 20;
  const tabBarHeight = 65;
  const getProgressPercent = (value: number, total: number) =>
    total ? Math.max(0, Math.min(100, Math.round((value / total) * 100))) : 0;
  const tabBarReserve = tabBarBottomOffset + tabBarHeight + 24;

  return (
    <View style={styles.screenRoot}>
      <View style={[styles.safeRoot, { backgroundColor: ui.bg }]}>
        <View style={styles.safe}>
        {/* App background gradient */}
        <View pointerEvents="none" style={styles.bgLayer}>
          <LinearGradient
            colors={['#F7FAFF', '#EEF5FF', '#E1EEFF']}
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
            colors={['rgba(123,164,224,0.24)', 'rgba(214,231,255,0.20)', 'rgba(214,231,255,0)']}
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
            paddingBottom: 0,
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isPullRefreshing}
            onRefresh={() => void handlePullToRefresh()}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor="rgba(255,255,255,0.96)"
            progressViewOffset={Math.max(72, insets.top + 56)}
          />
        }
      >
        {/* Hero (background + nav + card) - scrolls with the page */}
        <View
          style={[
            styles.heroStack,
            {
              height: heroHeight,
              paddingTop: heroTopSpacing,
            },
          ]}
        >
          <View pointerEvents="none" style={styles.heroGradientLayer}>
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
          </View>
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
                      style={[
                        styles.heroAvatarEditBadge,
                        isEmployeeAppUser ? styles.heroAvatarEditBadgeDisabled : null,
                      ]}
                      onPress={() => {
                        if (isEmployeeAppUser) return;
                        openEditEvent();
                      }}
                      activeOpacity={0.9}
                      disabled={editSaving || isEmployeeAppUser}
                      accessibilityRole="button"
                      accessibilityLabel="עריכת אירוע"
                    >
                      <Ionicons
                        name="create-outline"
                        size={16}
                        color={isEmployeeAppUser ? colors.gray[600] : colors.white}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.heroTitleWrap}>
                  {userName ? (
                    <View style={styles.heroOwnerTag}>
                      <Text style={[styles.heroOwnerTagText, { color: ui.accent }]}>{userName}</Text>
                    </View>
                  ) : null}
                  <Text style={[styles.heroTitleType, { color: ui.text }]}>{getEventDisplayTitle()}</Text>
                  <View style={styles.heroEventTypeTag}>
                    <Text style={[styles.heroEventTypeTagText, { color: ui.text }]}>{getEventTypeLabel()}</Text>
                  </View>
                </View>

                <View style={styles.heroMetaCardsRow}>
                  <View style={styles.heroMetaCard}>
                    <View style={styles.heroMetaCardIcon}>
                      <Ionicons name="calendar-outline" size={16} color={ui.accent} />
                    </View>
                    <Text style={[styles.heroMetaCardText, { color: ui.text }]}>{`${weekday}, ${day}`}</Text>
                  </View>

                  <View style={styles.heroMetaCard}>
                    <View style={styles.heroMetaCardIcon}>
                      <Ionicons name="business-outline" size={16} color={ui.accent} />
                    </View>
                    <Text style={[styles.heroMetaCardText, { color: ui.text }]}>{String(event.location ?? '').trim() || 'מיקום לא הוזן'}</Text>
                  </View>
                </View>

                {isWeddingEvent() ? (
                  <View style={styles.heroCoupleCard}>
                    <View style={styles.heroCoupleHeader}>
                      <View style={styles.heroCoupleHeaderIcon}>
                        <Ionicons name="heart-outline" size={16} color={ui.accent} />
                      </View>
                      <Text style={[styles.heroCoupleHeaderText, { color: ui.muted }]}>פרטי החתונה</Text>
                    </View>

                    <View style={styles.heroCoupleChips}>
                      <View style={styles.heroCoupleChip}>
                        <Text style={[styles.heroCoupleChipLabel, { color: ui.muted }]}>חתן</Text>
                        <Text style={[styles.heroCoupleChipValue, { color: ui.text }]} numberOfLines={2}>
                          {groomLabel()}
                        </Text>
                      </View>

                      <View style={styles.heroCoupleDivider}>
                        <Ionicons name="heart" size={12} color={ui.accent} />
                      </View>

                      <View style={styles.heroCoupleChip}>
                        <Text style={[styles.heroCoupleChipLabel, { color: ui.muted }]}>כלה</Text>
                        <Text style={[styles.heroCoupleChipValue, { color: ui.text }]} numberOfLines={2}>
                          {brideLabel()}
                        </Text>
                      </View>
                    </View>
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        </View>

        {/* White bottom sheet with rounded corners (like the reference) */}
        <View
          style={[
            styles.sheet,
            isWeddingEvent() ? styles.sheetWeddingSpacing : null,
            {
              marginBottom: Platform.OS === 'web' ? 30 : 0,
              paddingBottom: Platform.OS === 'web' ? 24 : tabBarReserve,
            },
          ]}
        >
          {!isEmployeeAppUser ? (
            <TouchableOpacity
              style={styles.tileWideOuter}
              activeOpacity={0.9}
              onPress={() => router.push(`/(admin)/admin-rsvp-approvals?eventId=${event.id}`)}
              accessibilityRole="button"
              accessibilityLabel="פתיחת אישורי הגעה"
            >
              <View style={styles.rsvpCardInner}>
                <View style={styles.rsvpHeaderRow}>
                  <View style={styles.rsvpHeaderRight}>
                    <View style={styles.rsvpHeaderValueRow}>
                      <Text style={[styles.rsvpHeaderValue, { color: ui.accent }]}>{invitedPeople}</Text>
                      <Text style={styles.rsvpHeaderLabelInline}>מוזמנים לאירוע</Text>
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
          ) : null}

          {/* Guest status (rings) */}
          <GlassPanel style={styles.panel}>
            <View style={styles.panelHeaderRow}>
              <Text style={[styles.panelTitle, { color: ui.text }]}>סטטוס אורחים</Text>
              <View style={[styles.totalChip, { backgroundColor: 'rgba(204,160,0,0.12)' }]}>
                <Text style={[styles.totalChipText, { color: ui.text }]}>{`${totalGuests} סה״כ`}</Text>
              </View>
            </View>

            <View style={styles.guestStatusGrid}>
              <View style={styles.guestStatusCard}>
                <View style={styles.guestStatusTopRow}>
                  <Text style={[styles.guestStatusLabel, { color: 'rgba(17,24,39,0.62)' }]}>אישרו</Text>
                  <Text style={[styles.guestStatusPercent, { color: colors.yaleBlue }]}>{`${getProgressPercent(confirmed, totalGuests)}%`}</Text>
                </View>
                <Text style={[styles.guestStatusValue, { color: ui.text }]}>{confirmed}</Text>
                <View style={styles.guestStatusBarTrack}>
                  <View style={[styles.guestStatusBarFill, { width: `${getProgressPercent(confirmed, totalGuests)}%`, backgroundColor: colors.yaleBlue }]} />
                </View>
              </View>

              <View style={styles.guestStatusCard}>
                <View style={styles.guestStatusTopRow}>
                  <Text style={[styles.guestStatusLabel, { color: 'rgba(17,24,39,0.62)' }]}>ממתינים</Text>
                  <Text style={[styles.guestStatusPercent, { color: colors.gold }]}>{`${getProgressPercent(pending, totalGuests)}%`}</Text>
                </View>
                <Text style={[styles.guestStatusValue, { color: ui.text }]}>{pending}</Text>
                <View style={styles.guestStatusBarTrack}>
                  <View style={[styles.guestStatusBarFill, { width: `${getProgressPercent(pending, totalGuests)}%`, backgroundColor: colors.gold }]} />
                </View>
              </View>

              <View style={styles.guestStatusCard}>
                <View style={styles.guestStatusTopRow}>
                  <Text style={[styles.guestStatusLabel, { color: 'rgba(17,24,39,0.62)' }]}>לא מגיעים</Text>
                  <Text style={[styles.guestStatusPercent, { color: colors.error }]}>{`${getProgressPercent(declined, totalGuests)}%`}</Text>
                </View>
                <Text style={[styles.guestStatusValue, { color: ui.text }]}>{declined}</Text>
                <View style={styles.guestStatusBarTrack}>
                  <View style={[styles.guestStatusBarFill, { width: `${getProgressPercent(declined, totalGuests)}%`, backgroundColor: colors.error }]} />
                </View>
              </View>
            </View>
          </GlassPanel>

          <View style={styles.summaryTilesRow}>
            <GlassPanel style={styles.summaryTile}>
              <View style={styles.summaryTileHeader}>
                <View style={[styles.summaryTileIcon, { backgroundColor: 'rgba(0,53,102,0.08)' }]}>
                  <Ionicons name="checkbox-outline" size={18} color={colors.yaleBlue} />
                </View>
                <Text style={[styles.summaryTileLabel, { color: 'rgba(17,24,39,0.62)' }]}>הושבו</Text>
              </View>
              <Text style={[styles.summaryTileValue, { color: ui.text }]}>{`${seatedPercent}%`}</Text>
              <View style={styles.guestStatusBarTrack}>
                <View style={[styles.guestStatusBarFill, { width: `${Math.max(0, Math.min(100, seatedPercent))}%`, backgroundColor: colors.yaleBlue }]} />
              </View>
            </GlassPanel>

            <GlassPanel style={styles.summaryTile}>
              <View style={styles.summaryTileHeader}>
                <View style={[styles.summaryTileIcon, { backgroundColor: 'rgba(240,203,70,0.18)' }]}>
                  <Ionicons name="people-outline" size={18} color={colors.gold} />
                </View>
                <Text style={[styles.summaryTileLabel, { color: 'rgba(17,24,39,0.62)' }]}>אורחים אישרו</Text>
              </View>
              <Text style={[styles.summaryTileValue, { color: ui.text }]}>{confirmed}</Text>
              <View style={styles.guestStatusBarTrack}>
                <View style={[styles.guestStatusBarFill, { width: `${getProgressPercent(confirmed, totalGuests)}%`, backgroundColor: colors.gold }]} />
              </View>
            </GlassPanel>
          </View>

          {/* Bottom actions (match provided design): two stacked action cards */}
          <View style={styles.bottomActions}>
            {!isEmployeeAppUser ? (
              <ActionRow
                title="לינק להזמנה"
                subtitle="הגדרת תמונה/כותרת והעתקת קישורים אישיים למוזמנים"
                iconName="link-outline"
                iconBg="rgba(204,160,0,0.14)"
                iconColor={colors.gold}
                onPress={() => router.push(`/(admin)/admin-invitation-links?eventId=${event.id}`)}
                accessibilityLabel="לינק להזמנה"
              />
            ) : null}
            <ActionRow
              title="רשימת שולחנות"
              subtitle="צפייה וניהול רשימת שולחנות"
              iconName="list-outline"
              iconBg="rgba(240,203,70,0.18)"
              iconColor={colors.gold}
              onPress={() => router.push(`/(admin)/TablesList?eventId=${event.id}`)}
              accessibilityLabel="שולחנות"
            />
            {!isEmployeeAppUser ? (
              <ActionRow
                title="הודעות אוטומטיות"
                subtitle="עריכה והפעלה של תזכורות והודעות וואטסאפ"
                iconName="chatbubble-ellipses-outline"
                iconBg="rgba(0,53,102,0.10)"
                iconColor={colors.yaleBlue}
                onPress={() =>
                  router.push(
                    `/(admin)/admin-event-messages?eventId=${event.id}&returnTo=${encodeURIComponent(`/(admin)/admin-event-details?id=${event.id}`)}`
                  )
                }
                accessibilityLabel="עריכת הודעות"
              />
            ) : null}
            {!isEmployeeAppUser ? (
              <ActionRow
                title="אישורי הגעה"
                subtitle="מעקב אחרי מוזמנים, סטטוסים ומי כבר אישר הגעה"
                iconName="people-outline"
                iconBg="rgba(240,203,70,0.18)"
                iconColor={colors.gold}
                onPress={() => router.push(`/(admin)/admin-rsvp-approvals?eventId=${event.id}`)}
                accessibilityLabel="אישורי הגעה"
              />
            ) : null}
            <ActionRow
              title="צ׳ק-אין אורחים"
              subtitle="סימון הגעה של אורחים בזמן אמת"
              iconName="checkbox-outline"
              iconBg="rgba(0,53,102,0.10)"
              iconColor={colors.yaleBlue}
              onPress={() =>
                router.push(
                  `/(admin)/admin-guest-checkin?eventId=${event.id}&returnTo=${encodeURIComponent(`/(admin)/admin-event-details?id=${event.id}`)}`
                )
              }
              accessibilityLabel="צ׳ק-אין אורחים"
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
                  <Ionicons name="create-outline" size={18} color={ui.primary} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: { flex: 1 },
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
  heroGradientLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
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
    backgroundColor: '#EDF5FF',
    borderTopLeftRadius: 34,
    borderTopRightRadius: 34,
    borderTopWidth: 1,
    borderColor: 'rgba(21, 76, 151, 0.08)',
    zIndex: 4,
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -2 },
    elevation: 6,
  },
  sheetWeddingSpacing: {
    marginTop: -132,
    paddingTop: 30,
  },
  heroTitleWrap: {
    alignItems: 'center',
  },
  heroOwnerTag: {
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(240,203,70,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(204,160,0,0.22)',
  },
  heroOwnerTagText: {
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 22,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  heroTitleType: {
    fontSize: 36,
    fontWeight: '900',
    lineHeight: 40,
    textAlign: 'center',
    letterSpacing: -0.6,
  },
  heroEventTypeTag: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(6, 23, 62, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(6, 23, 62, 0.1)',
  },
  heroEventTypeTagText: {
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 18,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  heroMetaRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    justifyContent: 'center',
  },
  heroMetaCardsRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 14,
    flexWrap: 'wrap',
  },
  heroMetaCard: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(6, 23, 62, 0.08)',
    shadowColor: colors.black,
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  heroMetaCardIcon: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(240,203,70,0.16)',
  },
  heroMetaCardText: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  heroMetaText: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  heroCoupleCard: {
    width: '100%',
    maxWidth: 420,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(6, 23, 62, 0.08)',
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  heroCoupleHeader: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  heroCoupleHeaderIcon: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(240,203,70,0.16)',
  },
  heroCoupleHeaderText: {
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  heroCoupleChips: {
    flexDirection: ROW_DIR,
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: 10,
  },
  heroCoupleChip: {
    flex: 1,
    minHeight: 78,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: 'rgba(247,250,255,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(6, 23, 62, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  heroCoupleChipLabel: {
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  heroCoupleChipValue: {
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 24,
    textAlign: 'center',
  },
  heroCoupleDivider: {
    width: 22,
    alignItems: 'center',
    justifyContent: 'center',
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
  heroAvatarEditBadgeDisabled: {
    backgroundColor: 'rgba(201, 207, 218, 0.95)',
    shadowOpacity: 0.05,
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
    backgroundColor: 'rgba(248,252,255,0.96)',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(21, 76, 151, 0.08)',
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
    backgroundColor: 'rgba(21, 76, 151, 0.08)',
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
  guestStatusGrid: {
    gap: 10,
  },
  guestStatusCard: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(248,252,255,0.84)',
    borderWidth: 1,
    borderColor: 'rgba(21, 76, 151, 0.08)',
  },
  guestStatusTopRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  guestStatusLabel: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },
  guestStatusPercent: {
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'left',
  },
  guestStatusValue: {
    marginTop: 6,
    marginBottom: 10,
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'right',
    letterSpacing: -0.5,
  },
  guestStatusBarTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(17,24,39,0.08)',
    overflow: 'hidden',
    alignItems: 'flex-end',
  },
  guestStatusBarFill: {
    height: '100%',
    borderRadius: 999,
    alignSelf: 'flex-end',
  },

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

  summaryTilesRow: {
    flexDirection: ROW_DIR,
    gap: 12,
    alignItems: 'stretch',
    marginTop: 14,
  },
  summaryTile: {
    flex: 1,
    height: 120,
  },
  tileWideOuter: {
    width: "100%",
    minHeight: 208,
    borderRadius: 24,
    padding: 14,
    backgroundColor: "rgba(246,250,255,0.96)",
    borderWidth: 1,
    borderColor: "rgba(21, 76, 151, 0.08)",
    shadowColor: colors.black,
    shadowOpacity: 0.04,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
    overflow: "hidden",
    marginBottom: 14,
  },

  rsvpCardInner: { flex: 1, justifyContent: "space-between" },
  rsvpHeaderRow: {
    flexDirection: ROW_DIR,
    alignItems: "center",
    justifyContent: "center",
  },
  rsvpHeaderRight: {
    width: "100%",
    alignItems: "center",
    gap: 4,
  },
  rsvpHeaderValueRow: {
    flexDirection: ROW_DIR,
    alignItems: "baseline",
    justifyContent: "center",
    gap: 10,
  },
  rsvpHeaderValue: {
    fontSize: 46,
    fontWeight: "900",
    letterSpacing: -1.0,
    lineHeight: 48,
    textAlign: "center",
  },
  rsvpHeaderLabelInline: {
    fontSize: 15,
    fontWeight: "800",
    color: "rgba(0,53,102,0.68)",
    textAlign: "center",
    marginBottom: 6,
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
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "rgba(17,24,39,0.06)",
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
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "rgba(17,24,39,0.06)",
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
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "rgba(17,24,39,0.06)",
  },
  summaryTileHeader: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryTileIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryTileValue: {
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'right',
    letterSpacing: -0.6,
    marginBottom: 12,
  },
  summaryTileLabel: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
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