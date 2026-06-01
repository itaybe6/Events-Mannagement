import React, { useEffect, useMemo, useState } from 'react';
import { Animated, ScrollView, View, Text, StyleSheet, Platform, Pressable, Image, useWindowDimensions } from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useUserStore } from '@/store/userStore';
import { useEventSelectionStore } from '@/store/eventSelectionStore';
import { colors } from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { eventService } from '@/lib/services/eventService';
import { guestService } from '@/lib/services/guestService';
import { tableService } from '@/lib/services/tableService';
import { BlurView } from 'expo-blur';
import { EventSwitcher } from '@/components/EventSwitcher';
import { CoupleHomeDashboardCards } from '@/components/couple/CoupleHomeDashboardCards';
import { ALIGN_RIGHT, ROW_DIR, rtlText } from '@/lib/rtl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const { isLoggedIn, userData, initializeAuth } = useUserStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { eventId: queryEventId } = useLocalSearchParams<{ eventId?: string }>();
  const activeUserId = useEventSelectionStore((s) => s.activeUserId);
  const activeEventId = useEventSelectionStore((s) => s.activeEventId);
  const setActiveEvent = useEventSelectionStore((s) => s.setActiveEvent);
  const [currentEvent, setCurrentEvent] = useState<any>(null);
  const [guests, setGuests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [hasMultipleEvents, setHasMultipleEvents] = useState(false);
  const [tablesCount, setTablesCount] = useState(0);
  const isWeb = Platform.OS === 'web';
  const isDesktopWeb = isWeb && windowWidth >= 1024;
  const AnimatedPressable = useMemo(() => Animated.createAnimatedComponent(Pressable), []);

  const resolvedEventId =
    String(
      queryEventId ||
        (userData?.id && activeUserId === userData.id ? activeEventId : null) ||
        userData?.event_id ||
        ''
    ).trim() || null;

  const handleSelectEventId = (nextEventId: string) => {
    if (userData?.id) setActiveEvent(userData.id, nextEventId);
    // Use a relative route so Expo Router typed routes won't complain.
    router.replace({ pathname: './', params: { eventId: nextEventId } });
  };

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/login');
      return;
    }
    const loadData = async () => {
      try {
        setLoading(true);
        let eventId = resolvedEventId;
        if (!eventId) {
          await initializeAuth();
          eventId = useUserStore.getState().userData?.event_id || null;
        }
        if (!eventId) {
          setCurrentEvent(null);
          setGuests([]);
          setTablesCount(0);
          setLoading(false);
          return;
        }

        if (userData?.id) setActiveEvent(userData.id, eventId);

        const event = await eventService.getEvent(eventId);
        if (event) {
          setCurrentEvent(event);
          const [guestsData, tablesData] = await Promise.all([
            guestService.getGuests(event.id),
            tableService.getTables(event.id),
          ]);
          setGuests(guestsData);
          setTablesCount(tablesData.length);
        } else {
          setCurrentEvent(null);
          setGuests([]);
          setTablesCount(0);
        }
      } catch (error) {
        setCurrentEvent(null);
        setGuests([]);
        setTablesCount(0);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [isLoggedIn, router, userData?.id, resolvedEventId]);

  // טען מחדש נתונים כשהמסך חוזר למוקד
  useFocusEffect(
    React.useCallback(() => {
      if (isLoggedIn && resolvedEventId) {
        const reloadData = async () => {
          try {
            const event = await eventService.getEvent(resolvedEventId as string);
            setCurrentEvent(event);
            if (event) {
              const [guestsData, tablesData] = await Promise.all([
                guestService.getGuests(event.id),
                tableService.getTables(event.id),
              ]);
              setGuests(guestsData);
              setTablesCount(tablesData.length);
            } else {
              setGuests([]);
              setTablesCount(0);
            }
          } catch (error) {
            setGuests([]);
            setTablesCount(0);
          }
        };
        reloadData();
      }
    }, [isLoggedIn, resolvedEventId])
  );

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const countdown = useMemo(() => {
    const target = currentEvent?.date ? new Date(currentEvent.date).getTime() : NaN;
    const diffMs = target - now.getTime();
    if (!Number.isFinite(diffMs)) return null;

    const safeDiff = Math.max(0, diffMs);
    const totalSeconds = Math.floor(safeDiff / 1000);

    return {
      days: Math.floor(totalSeconds / 86400),
      hours: Math.floor((totalSeconds % 86400) / 3600),
      minutes: Math.floor((totalSeconds % 3600) / 60),
      seconds: totalSeconds % 60,
      isComplete: safeDiff <= 0,
    };
  }, [currentEvent?.date, now]);

  if (!isLoggedIn) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerTitle}>אין אירוע פעיל</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerTitle}>טוען...</Text>
      </View>
    );
  }

  if (!currentEvent) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerTitle}>אין אירוע פעיל</Text>
      </View>
    );
  }

  const confirmedPeople = guests.reduce((sum: number, guest: any) => {
    if (guest?.status !== 'מגיע') return sum;
    return sum + (Number(guest?.numberOfPeople ?? guest?.number_of_people ?? 1) || 1);
  }, 0);
  const seatedGuests = guests.reduce((sum: number, guest: any) => {
    const assignedTableId = String(guest?.tableId ?? guest?.table_id ?? '').trim();
    if (guest?.status !== 'מגיע' || assignedTableId.length === 0) return sum;
    return sum + (Number(guest?.numberOfPeople ?? guest?.number_of_people ?? 1) || 1);
  }, 0);
  const eventDateLabel = currentEvent?.date
    ? new Date(currentEvent.date).toLocaleDateString('he-IL', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '';

  const brideName = String(currentEvent.brideName ?? '').trim();
  const groomName = String(currentEvent.groomName ?? '').trim();
  const eventTitle =
    brideName && groomName
      ? `${brideName} & ${groomName}`
      : brideName || groomName || String(currentEvent.title ?? '').trim() || 'האירוע שלכם';

  const venueLabel = String(currentEvent.location ?? '').trim();
  const cityLabel = String(currentEvent.city ?? '').trim();
  const locationLabel = venueLabel && cityLabel ? `${venueLabel}, ${cityLabel}` : venueLabel || cityLabel;

  const guestCounts = {
    coming: guests.filter((g) => g?.status === 'מגיע').length,
    maybe: guests.filter((g) => g?.status === 'אולי מגיע').length,
    pending: guests.filter((g) => g?.status === 'ממתין').length,
    declined: guests.filter((g) => g?.status === 'לא מגיע').length,
  };

  const ActionTile = ({
    title,
    subtitle,
    iconName,
    variant = 'square',
    theme = 'light',
    onPress,
  }: {
    title: string;
    subtitle: string;
    iconName: keyof typeof Ionicons.glyphMap;
    variant?: 'square' | 'wide' | 'round';
    theme?: 'light' | 'navy';
    onPress?: () => void;
  }) => {
    const isRound = variant === 'round';
    const isNavy = theme === 'navy';
    const scale = React.useRef(new Animated.Value(1)).current;

    const springTo = (toValue: number) => {
      Animated.spring(scale, {
        toValue,
        useNativeDriver: true,
        speed: 18,
        bounciness: 6,
      }).start();
    };

    const Common = isRound ? (AnimatedPressable as any) : Pressable;

    const inner = (
      <Common
        onPress={onPress}
        accessibilityRole="button"
        onPressIn={() => (isRound ? springTo(0.97) : undefined)}
        onPressOut={() => (isRound ? springTo(1) : undefined)}
        // Hover events exist only on web; safe to pass on native.
        onHoverIn={() => (isRound ? springTo(1.03) : undefined)}
        onHoverOut={() => (isRound ? springTo(1) : undefined)}
        style={({ hovered, pressed }: any) => [
          styles.actionTile,
          variant === 'wide' && styles.actionTileWide,
          isRound && styles.actionTileRound,
          !isRound && (hovered || pressed) && styles.actionTilePressed,
          isRound && { transform: [{ scale }] },
          pressed && { opacity: 0.98 },
        ]}
      >
        {isRound ? (
          <View style={[styles.actionTileFrameRound, isNavy && styles.actionTileFrameNavy]}>
            {isNavy ? (
              <>
                {NAVY_TILE_STAR_OFFSETS.map((pos, i) => (
                  <View
                    key={i}
                    pointerEvents="none"
                    style={[styles.actionTileStarDot, { top: pos.top as any, left: pos.left as any }]}
                  />
                ))}
                <View style={styles.actionTileNavyGlow} pointerEvents="none" />
              </>
            ) : null}
            {isNavy ? (
              <View style={[styles.actionTileInner, styles.actionTileInnerNoBorder, styles.actionTileInnerRound, styles.actionTileInnerNavy]}>
                <View style={styles.actionTileTopRow}>
                  <View style={styles.actionTileIconBoxNavy}>
                    <Ionicons name={iconName} size={22} color="#FFFFFF" />
                  </View>
                  <View style={styles.actionTileDotNavy} />
                </View>
                <View style={styles.actionTileTextBlock}>
                  <Text style={styles.actionTileTitleNavy}>{rtlText(title)}</Text>
                  <Text style={styles.actionTileSubtitleNavy}>{subtitle}</Text>
                </View>
              </View>
            ) : (
              <BlurView
                intensity={24}
                tint="light"
                style={[styles.actionTileInner, styles.actionTileInnerNoBorder, styles.actionTileInnerRound]}
              >
                <View style={styles.actionTileTopRow}>
                  <View style={styles.actionTileIconBox}>
                    <Ionicons name={iconName} size={22} color={colors.text} />
                  </View>
                  <View style={styles.actionTileDot} />
                </View>
                <View style={styles.actionTileTextBlock}>
                  <Text style={styles.actionTileTitle}>{rtlText(title)}</Text>
                  <Text style={styles.actionTileSubtitle}>{subtitle}</Text>
                </View>
              </BlurView>
            )}
          </View>
        ) : (
          <BlurView intensity={24} tint="light" style={styles.actionTileInner}>
            <View style={styles.actionTileTopRow}>
              <View style={styles.actionTileIconBox}>
                <Ionicons name={iconName} size={22} color={colors.text} />
              </View>
              <View style={styles.actionTileDot} />
            </View>
            <View style={styles.actionTileTextBlock}>
              <Text style={styles.actionTileTitle}>{rtlText(title)}</Text>
              <Text style={styles.actionTileSubtitle}>{subtitle}</Text>
            </View>
          </BlurView>
        )}
      </Common>
    );

    return inner;
  };

  const notSeatedPeople = Math.max(0, confirmedPeople - seatedGuests);

  const navigateToGuests = (status?: string) => {
    router.push({
      pathname: '/(couple)/guests',
      params: {
        ...(resolvedEventId ? { eventId: resolvedEventId } : {}),
        ...(status ? { status } : {}),
      },
    });
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.contentContainer, isWeb && styles.contentContainerWeb]}
      >
        {!isWeb ? (
          <View style={[styles.scrollHeader, { paddingTop: Math.max(insets.top - 10, 4) }]}>
            <Image
              source={require('../../assets/images/logoMoon.png')}
              style={styles.scrollHeaderLogo}
              resizeMode="contain"
            />
          </View>
        ) : null}

        {currentEvent && currentEvent.isApproved === false ? (
          <View style={styles.pendingBanner}>
            <View style={styles.pendingBannerIconWrap}>
              <Ionicons name="time-outline" size={22} color="#92400E" />
            </View>
            <View style={styles.pendingBannerTextWrap}>
              <Text style={styles.pendingBannerTitle}>ברוכים הבאים למשפחת MOON! 🎉</Text>
              <Text style={styles.pendingBannerBody}>
                קיבלנו את פרטי האירוע שלך. צוות ניהול האירועים שלנו יצור איתך קשר בהקדם כדי לסייע במילוי מפת ההושבה ולהשלים את ההכנות. עד לאישור ניתן להזין עד 10 מוזמנים.
              </Text>
            </View>
          </View>
        ) : null}

        <CoupleHomeDashboardCards
          eventTitle={eventTitle}
          eventDateLabel={eventDateLabel}
          locationLabel={locationLabel}
          countdown={countdown}
          guestInviteCount={guests.length}
          guestCounts={guestCounts}
          confirmedPeople={confirmedPeople}
          seatedGuests={seatedGuests}
          notSeatedPeople={notSeatedPeople}
          tablesCount={tablesCount}
          onPressRsvp={() => navigateToGuests()}
          onPressSeating={() =>
            router.push({
              pathname: '/(couple)/BrideGroomSeating',
              params: resolvedEventId ? { eventId: resolvedEventId } : {},
            })
          }
          middleSlot={
            hasMultipleEvents ? (
              <EventSwitcher
                userId={userData?.id}
                selectedEventId={resolvedEventId}
                onSelectEventId={handleSelectEventId}
                label="אירוע פעיל"
                pillVariant="soft"
                onHasMultipleChange={setHasMultipleEvents}
              />
            ) : null
          }
        />

        <Text style={[styles.sectionTitle, styles.sectionTitleSpacious]}>פעולות מהירות</Text>
        <View style={[styles.actionsGrid, isDesktopWeb && styles.actionsGridDesktop]}>
          <View style={[styles.actionTileWrapper, isDesktopWeb && styles.actionTileWrapperWeb]}>
            <ActionTile
              title={'רשימת\nמוזמנים'}
              subtitle="נהל אישורי הגעה"
              iconName="list"
              variant="round"
              onPress={() =>
                router.push({
                  pathname: '/(couple)/guests',
                  params: resolvedEventId ? { eventId: resolvedEventId } : {},
                })
              }
            />
          </View>

          <View style={[styles.actionTileWrapper, isDesktopWeb && styles.actionTileWrapperWeb]}>
            <ActionTile
              title={'סידור\nהושבה'}
              subtitle="גרור ושחרר אורחים"
              iconName="grid"
              variant="round"
              theme="navy"
              onPress={() =>
                router.push({
                  pathname: '/(couple)/BrideGroomSeating',
                  params: resolvedEventId ? { eventId: resolvedEventId } : {},
                })
              }
            />
          </View>

          <View style={[styles.actionTileWrapper, isDesktopWeb && styles.actionTileWrapperWeb]}>
            <ActionTile
              title={'הודעות\nאוטומטיות'}
              subtitle="SMS / וואטסאפ"
              iconName="chatbubble-ellipses-outline"
              variant="round"
              theme="navy"
              onPress={() =>
                router.push({
                  pathname: '/(couple)/automatic-notifications',
                  params: {
                    ...(resolvedEventId ? { eventId: resolvedEventId } : {}),
                    returnTo: resolvedEventId ? `/(couple)?eventId=${encodeURIComponent(resolvedEventId)}` : '/(couple)',
                  },
                })
              }
            />
          </View>

          <View style={[styles.actionTileWrapper, isDesktopWeb && styles.actionTileWrapperWeb]}>
            <ActionTile
              title={'ניהול\nשולחנות'}
              subtitle="ניהול שולחנות"
              iconName="restaurant-outline"
              variant="round"
              onPress={() =>
                router.push({
                  pathname: '/(couple)/TablesList',
                  params: resolvedEventId ? { eventId: resolvedEventId } : {},
                })
              }
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const stylesVars = {
  primaryBlue: '#135bec',
  darkBlue: '#0B1C41',
  red: '#ef4444',
  amber: '#f59e0b',
};

const DNAVY = '#152949';

const NAVY_TILE_STAR_OFFSETS = [
  { top: '14%', left: '10%' },
  { top: '28%', left: '78%' },
  { top: '52%', left: '42%' },
  { top: '72%', left: '16%' },
  { top: '82%', left: '70%' },
  { top: '36%', left: '88%' },
];

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollHeader: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 0,
    marginBottom: 0,
    backgroundColor: '#FFFFFF',
  },
  scrollHeaderLogo: {
    width: 370,
    height: 76,
    marginTop: -4,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    padding: 24,
  },
  centerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },
  container: { flex: 1, backgroundColor: 'transparent' },
  contentContainer: {
    paddingHorizontal: 18,
    paddingTop: Platform.OS === 'web' ? 22 : 4,
    paddingBottom: Platform.OS === 'web' ? 56 : 130,
    gap: 16,
  },
  contentContainerWeb: {
    width: '100%',
    maxWidth: 1180,
    alignSelf: 'center',
  },

  pendingBanner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    marginBottom: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(254, 243, 199, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(217, 119, 6, 0.30)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  pendingBannerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingBannerTextWrap: {
    flex: 1,
  },
  pendingBannerTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#92400E',
    textAlign: 'right',
    marginBottom: 4,
  },
  pendingBannerBody: {
    fontSize: 12,
    lineHeight: 18,
    color: '#78350F',
    textAlign: 'right',
    fontWeight: '700',
  },
  hero: {
    alignItems: 'center',
    paddingTop: 0,
    paddingBottom: 16,
  },
  heroBanner: {
    width: '100%',
    height: 260,
    marginHorizontal: -24,
    marginTop: Platform.OS === 'web' ? -72 : -12,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.92)',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 22,
    elevation: 5,
  },
  heroBannerImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  heroBannerFrame: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
  },
  heroAvatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 2,
    borderColor: 'rgba(11, 28, 65, 0.22)',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(19, 91, 236, 0.08)',
  },
  avatarInitials: {
    fontSize: 34,
    fontWeight: '900',
    color: stylesVars.primaryBlue,
  },
  heroDate: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'center',
  },
  countdownSection: {
    width: '100%',
    marginTop: 16,
    alignItems: 'center',
    borderRadius: 28,
    paddingHorizontal: 14,
    paddingTop: 18,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(11, 28, 65, 0.08)',
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  countdownHeading: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  countdownSubtext: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  countdownWrap: {
    width: '100%',
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 6,
  },
  countdownUnit: {
    minWidth: 62,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  countdownValue: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },
  countdownLabel: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  countdownSeparator: {
    marginTop: 2,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '900',
    color: colors.gray[500],
    textAlign: 'center',
  },
  quickInfoRow: {
    marginTop: 10,
    marginBottom: 18,
    width: '100%',
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'nowrap',
    alignItems: 'stretch',
  },
  locationCard: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 26,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(11, 28, 65, 0.10)',
    backgroundColor: '#FFFFFF',
  },
  locationCardIcon: {
    width: 46,
    height: 46,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(19, 91, 236, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(19, 91, 236, 0.16)',
  },
  locationCardText: {
    flex: 1,
    minWidth: 0,
    alignItems: ALIGN_RIGHT,
  },
  locationCardTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.gray[600],
    textAlign: 'right',
  },
  locationCardValue: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  daysCard: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 26,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(11, 28, 65, 0.10)',
    backgroundColor: '#FFFFFF',
  },
  daysCardIcon: {
    width: 46,
    height: 46,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(19, 91, 236, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(19, 91, 236, 0.16)',
  },
  daysCardText: {
    flex: 1,
    minWidth: 0,
    alignItems: ALIGN_RIGHT,
  },
  daysCardTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.gray[600],
    textAlign: 'right',
  },
  daysCardValue: {
    marginTop: 4,
    fontSize: 20,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },

  statsScroll: {
    marginBottom: 18,
  },
  statsRow: {
    paddingHorizontal: 2,
    gap: 12,
    ...(Platform.OS === 'web' ? ({ flexGrow: 1 } as any) : null),
  },
  statsRowMobile: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'stretch',
  },
  statPillMobile: {
    width: '48%',
  },
  statsRowDesktop: {
    justifyContent: 'center',
  },
  statPill: {
    minWidth: Platform.OS === 'web' ? 158 : 0,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 24,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(11, 28, 65, 0.10)',
    backgroundColor: '#FFFFFF',
  },
  statIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(11, 28, 65, 0.06)',
  },
  statTextWrap: {
    flex: 1,
    minWidth: 0,
    alignItems: ALIGN_RIGHT,
  },
  statTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.gray[600],
    letterSpacing: 0.2,
    lineHeight: 14,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  statValue: {
    marginTop: 4,
    fontSize: 20,
    fontWeight: '900',
    color: colors.text,
  },
  statusSquaresRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    gap: 12,
    marginBottom: 18,
  },
  statusSquareWrapper: {
    flex: 1,
  },
  statusSquareCard: {
    minHeight: 106,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(11, 28, 65, 0.10)',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusSquareIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(11, 28, 65, 0.06)',
    marginBottom: 8,
  },
  statusSquareTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  statusSquareValue: {
    marginTop: 6,
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },

  actionsHeaderRow: {
    flexDirection: ROW_DIR,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    alignSelf: ALIGN_RIGHT,
  },
  sectionTitleSpacious: {
    marginTop: 10,
    marginBottom: 12,
  },

  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionsGridDesktop: {
    justifyContent: 'center',
  },
  actionTileWrapper: {
    width: '48%',
  },
  actionTileWrapperWeb: {
    width: 'auto',
    flexBasis: 320,
    flexGrow: 0,
    maxWidth: 340,
  },
  actionTileWrapperWide: {
    width: '100%',
  },
  actionTile: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 28,
    overflow: 'hidden',
  },
  actionTileWide: {
    aspectRatio: undefined,
    minHeight: 110,
  },
  actionTileRound: {
    borderRadius: 34,
  },
  actionTileFrameRound: {
    flex: 1,
    borderRadius: 34,
    borderWidth: 1,
    borderColor: 'rgba(11, 28, 65, 0.10)',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    // Help prevent tiny border gaps on web during transforms
    ...(Platform.OS === 'web'
      ? ({
          backfaceVisibility: 'hidden',
          willChange: 'transform',
        } as any)
      : null),
  },
  actionTileFrameNavy: {
    borderWidth: 0,
    backgroundColor: DNAVY,
    shadowColor: DNAVY,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 6,
  },
  actionTileStarDot: {
    position: 'absolute',
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.55)',
    zIndex: 1,
  },
  actionTileNavyGlow: {
    position: 'absolute',
    top: -36,
    left: -28,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(126, 168, 232, 0.18)',
    zIndex: 1,
  },
  actionTileInnerNavy: {
    backgroundColor: 'transparent',
    zIndex: 2,
  },
  actionTileIconBoxNavy: {
    width: 48,
    height: 48,
    borderRadius: 18,
    backgroundColor: 'rgba(126, 168, 232, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  actionTileDotNavy: {
    width: 8,
    height: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(126, 168, 232, 0.55)',
  },
  actionTileTitleNavy: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 26,
  },
  actionTileSubtitleNavy: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(220, 228, 245, 0.72)',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  actionTilePressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.98,
  },
  actionTileInner: {
    flex: 1,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(11, 28, 65, 0.10)',
    backgroundColor: '#FFFFFF',
    justifyContent: 'space-between',
  },
  actionTileInnerNoBorder: {
    borderWidth: 0,
  },
  actionTileInnerRound: {
    borderRadius: 34,
  },
  actionTileTopRow: {
    flexDirection: ROW_DIR,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  actionTileTextBlock: {
    alignSelf: 'stretch',
    alignItems: ALIGN_RIGHT,
  },
  actionTileIconBox: {
    width: 48,
    height: 48,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(11, 28, 65, 0.10)',
  },
  actionTileDot: {
    width: 8,
    height: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(19, 91, 236, 0.22)',
  },
  actionTileTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 26,
  },
  actionTileSubtitle: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});


