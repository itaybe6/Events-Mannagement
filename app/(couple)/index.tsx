import React, { useEffect, useMemo, useState } from 'react';
import { Animated, ScrollView, View, Text, StyleSheet, Platform, Pressable, Image, I18nManager, useWindowDimensions } from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useUserStore } from '@/store/userStore';
import { useEventSelectionStore } from '@/store/eventSelectionStore';
import { colors } from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { eventService } from '@/lib/services/eventService';
import { guestService } from '@/lib/services/guestService';
import { BlurView } from 'expo-blur';
import { EventSwitcher } from '@/components/EventSwitcher';
import { ALIGN_RIGHT, ROW_DIR, rtlText } from '@/lib/rtl';

export default function HomeScreen() {
  const { isLoggedIn, userData, initializeAuth } = useUserStore();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const { eventId: queryEventId } = useLocalSearchParams<{ eventId?: string }>();
  const activeUserId = useEventSelectionStore((s) => s.activeUserId);
  const activeEventId = useEventSelectionStore((s) => s.activeEventId);
  const setActiveEvent = useEventSelectionStore((s) => s.setActiveEvent);
  const [currentEvent, setCurrentEvent] = useState<any>(null);
  const [guests, setGuests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());
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
          setLoading(false);
          return;
        }

        if (userData?.id) setActiveEvent(userData.id, eventId);

        const event = await eventService.getEvent(eventId);
        if (event) {
          setCurrentEvent(event);
          const guestsData = await guestService.getGuests(event.id);
          setGuests(guestsData);
        } else {
          setCurrentEvent(null);
          setGuests([]);
        }
      } catch (error) {
        setCurrentEvent(null);
        setGuests([]);
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
              const guestsData = await guestService.getGuests(event.id);
              setGuests(guestsData);
            } else {
              setGuests([]);
            }
          } catch (error) {
            setGuests([]);
          }
        };
        reloadData();
      }
    }, [isLoggedIn, resolvedEventId])
  );

  useEffect(() => {
    // Keep "days left" accurate without heavy countdown UI
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const daysToWedding = useMemo(() => {
    const target = currentEvent?.date ? new Date(currentEvent.date).getTime() : NaN;
    const diffMs = target - now.getTime();
    if (!Number.isFinite(diffMs)) return null;
    const msPerDay = 1000 * 60 * 60 * 24;
    return Math.max(0, Math.ceil(diffMs / msPerDay));
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

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('he-IL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const confirmedGuests = guests.filter(guest => guest.status === 'מגיע').length;
  const pendingGuests = guests.filter(guest => guest.status === 'ממתין').length;
  const totalGuests = guests.length;
  const seatedGuests = guests.filter(guest => guest.status === 'מגיע' && guest.table_id).length;

  const getInitials = (name?: string) => {
    if (!name) return '';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';
    const first = parts[0][0] ?? '';
    const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
    return (first + last).toUpperCase();
  };

  const StatPill = ({
    title,
    value,
    iconName,
    tintColor,
    iconBg,
  }: {
    title: string;
    value: string | number;
    iconName: keyof typeof Ionicons.glyphMap;
    tintColor: string;
    iconBg: string;
  }) => (
    <BlurView intensity={28} tint={Platform.OS === 'web' ? 'light' : 'light'} style={styles.statPill}>
      <View style={[styles.statIconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={iconName} size={18} color={tintColor} />
      </View>
      <View style={styles.statTextWrap}>
        <Text style={styles.statTitle}>{title}</Text>
        <Text style={styles.statValue}>{value}</Text>
      </View>
    </BlurView>
  );

  const ActionTile = ({
    title,
    subtitle,
    iconName,
    variant = 'square',
    onPress,
  }: {
    title: string;
    subtitle: string;
    iconName: keyof typeof Ionicons.glyphMap;
    variant?: 'square' | 'wide' | 'round';
    onPress?: () => void;
  }) => {
    const isRound = variant === 'round';
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
          <View style={styles.actionTileFrameRound}>
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

  return (
    <View style={styles.screen}>
      <View pointerEvents="none" style={styles.bgBlobs}>
        <View style={styles.blobTopRight} />
        <View style={styles.blobBottomLeft} />
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.contentContainer, isWeb && styles.contentContainerWeb]}
      >
        <View style={styles.rtlDebugBanner}>
          <Text style={styles.rtlDebugText}>RTL: {String(I18nManager.isRTL)}</Text>
        </View>

        <View style={styles.hero}>
          {currentEvent?.invitationImageUrl ? (
            <View style={styles.heroBanner}>
              <Image source={{ uri: currentEvent.invitationImageUrl }} style={styles.heroBannerImage} resizeMode="cover" />
              <View style={styles.heroBannerFrame} />
            </View>
          ) : (
            <View style={styles.heroAvatar}>
              {userData?.avatar_url ? (
                <Image source={{ uri: userData.avatar_url }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarFallback}>
                  {getInitials(userData?.name) ? (
                    <Text style={styles.avatarInitials}>{getInitials(userData?.name)}</Text>
                  ) : (
                    <Ionicons name="person" size={28} color={stylesVars.primaryBlue} />
                  )}
                </View>
              )}
            </View>
          )}
          <Text style={styles.heroDate}>{formatDate(currentEvent.date)}</Text>

          <View style={{ width: '100%', marginTop: 12 }}>
            <EventSwitcher
              userId={userData?.id}
              selectedEventId={resolvedEventId}
              onSelectEventId={handleSelectEventId}
              label="אירוע פעיל"
            />
          </View>
        </View>

        <View style={styles.quickInfoRow}>
          <BlurView intensity={26} tint="light" style={styles.locationCard}>
            <View style={styles.locationCardIcon}>
              <Ionicons name="location" size={18} color={stylesVars.primaryBlue} />
            </View>
            <View style={styles.locationCardText}>
              <Text style={styles.locationCardTitle}>מיקום</Text>
              <Text style={styles.locationCardValue} numberOfLines={1}>
                {String(currentEvent.location || '').trim() || '—'}
              </Text>
            </View>
          </BlurView>

          <BlurView intensity={26} tint="light" style={styles.daysCard}>
            <View style={styles.daysCardIcon}>
              <Ionicons name="calendar-outline" size={18} color={stylesVars.primaryBlue} />
            </View>
            <View style={styles.daysCardText}>
              <Text style={styles.daysCardTitle}>כמה ימים לאירוע</Text>
              <Text style={styles.daysCardValue}>
                {daysToWedding === null ? '—' : daysToWedding === 0 ? 'היום' : `${daysToWedding} ימים`}
              </Text>
            </View>
          </BlurView>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.statsRow, isDesktopWeb && styles.statsRowDesktop]}
          style={styles.statsScroll}
        >
          <StatPill
            title="אורחים מאושרים"
            value={`${confirmedGuests}/${totalGuests}`}
            iconName="people"
            tintColor={stylesVars.primaryBlue}
            iconBg="rgba(19, 91, 236, 0.12)"
          />
          <StatPill
            title="אורחים שצריך להושיב"
            value={Math.max(0, confirmedGuests - seatedGuests)}
            iconName="alert-circle"
            tintColor={stylesVars.red}
            iconBg="rgba(239, 68, 68, 0.10)"
          />
          <StatPill
            title="אורחים בהמתנה"
            value={pendingGuests}
            iconName="time-outline"
            tintColor={stylesVars.amber}
            iconBg="rgba(245, 158, 11, 0.12)"
          />
        </ScrollView>

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
              onPress={() =>
                router.push({
                  pathname: '/(couple)/automatic-notifications',
                  params: resolvedEventId ? { eventId: resolvedEventId } : {},
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f6f6f8',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f6f6f8',
    padding: 24,
  },
  centerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },
  bgBlobs: {
    ...StyleSheet.absoluteFillObject,
    opacity: Platform.OS === 'web' ? 0.6 : 0.5,
  },
  blobTopRight: {
    position: 'absolute',
    top: -80,
    right: -90,
    width: 520,
    height: 520,
    borderRadius: 520,
    backgroundColor: 'rgba(19, 91, 236, 0.14)',
    transform: [{ scaleX: 1.05 }],
  },
  blobBottomLeft: {
    position: 'absolute',
    bottom: -90,
    left: -140,
    width: 420,
    height: 420,
    borderRadius: 420,
    backgroundColor: 'rgba(99, 102, 241, 0.10)',
  },
  container: { flex: 1, backgroundColor: 'transparent' },
  contentContainer: {
    paddingHorizontal: 24,
    // Mobile uses AppHeader (transparent ~76px). Web layout doesn't.
    paddingTop: Platform.OS === 'web' ? 22 : 18 + 76,
    paddingBottom: Platform.OS === 'web' ? 56 : 130,
  },
  contentContainerWeb: {
    width: '100%',
    maxWidth: 1180,
    alignSelf: 'center',
  },
  rtlDebugBanner: {
    alignSelf: 'center',
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(11, 28, 65, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(11, 28, 65, 0.12)',
  },
  rtlDebugText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
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
    marginTop: -108,
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
    borderWidth: 1,
    borderColor: 'rgba(11, 28, 65, 0.35)',
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
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 20,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(11, 28, 65, 0.18)',
    backgroundColor: Platform.OS === 'web' ? 'rgba(255,255,255,0.35)' : 'transparent',
  },
  locationCardIcon: {
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(19, 91, 236, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(19, 91, 236, 0.18)',
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
    marginTop: 2,
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  daysCard: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 20,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(11, 28, 65, 0.18)',
    backgroundColor: Platform.OS === 'web' ? 'rgba(255,255,255,0.35)' : 'transparent',
  },
  daysCardIcon: {
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(19, 91, 236, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(19, 91, 236, 0.18)',
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
    marginTop: 2,
    fontSize: 18,
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
  statsRowDesktop: {
    justifyContent: 'center',
  },
  statPill: {
    minWidth: 170,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    flexDirection: ROW_DIR,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(11, 28, 65, 0.14)',
    backgroundColor: Platform.OS === 'web' ? 'rgba(255,255,255,0.35)' : 'transparent',
  },
  statIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statTextWrap: {
    alignItems: ALIGN_RIGHT,
  },
  statTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.gray[600],
    letterSpacing: 1.0,
  },
  statValue: {
    marginTop: 2,
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
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
    borderColor: 'rgba(11, 28, 65, 0.22)',
    overflow: 'hidden',
    // Help prevent tiny border gaps on web during transforms
    ...(Platform.OS === 'web'
      ? ({
          backfaceVisibility: 'hidden',
          willChange: 'transform',
        } as any)
      : null),
  },
  actionTilePressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.98,
  },
  actionTileInner: {
    flex: 1,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(11, 28, 65, 0.14)',
    backgroundColor: Platform.OS === 'web' ? 'rgba(255,255,255,0.55)' : 'transparent',
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
    backgroundColor: 'rgba(255,255,255,0.70)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(11, 28, 65, 0.14)',
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


