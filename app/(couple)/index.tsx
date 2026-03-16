import React, { useEffect, useMemo, useState } from 'react';
import { Animated, ScrollView, View, Text, StyleSheet, Platform, Pressable, Image, I18nManager, useWindowDimensions } from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useUserStore } from '@/store/userStore';
import { useEventSelectionStore } from '@/store/eventSelectionStore';
import { colors } from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { eventService } from '@/lib/services/eventService';
import { guestService } from '@/lib/services/guestService';
import { BlurView } from 'expo-blur';
import { EventSwitcher } from '@/components/EventSwitcher';
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
  const isWeb = Platform.OS === 'web';
  const isDesktopWeb = isWeb && windowWidth >= 1024;
  const AnimatedPressable = useMemo(() => Animated.createAnimatedComponent(Pressable), []);
  const scrollY = React.useRef(new Animated.Value(0)).current;
  const mobileGradientOpacity = scrollY.interpolate({
    inputRange: [0, 160],
    outputRange: [1, 0.18],
    extrapolate: 'clamp',
  });

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

  const eventTypeLabel = useMemo(() => {
    const raw = String(currentEvent?.title ?? '').trim();
    if (!raw) return 'אירוע';
    const parts = raw.split(/(?:\s*[–—-]\s*)/g).map((p) => p.trim()).filter(Boolean);
    return parts[0] || raw;
  }, [currentEvent?.title]);

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
  const maybePeople = guests.reduce((sum: number, guest: any) => {
    if (guest?.status !== 'אולי מגיע') return sum;
    return sum + (Number(guest?.numberOfPeople ?? guest?.number_of_people ?? 1) || 1);
  }, 0);
  const declinedPeople = guests.reduce((sum: number, guest: any) => {
    if (guest?.status !== 'לא מגיע') return sum;
    return sum + (Number(guest?.numberOfPeople ?? guest?.number_of_people ?? 1) || 1);
  }, 0);
  const pendingPeople = guests.reduce((sum: number, guest: any) => {
    if (guest?.status !== 'ממתין') return sum;
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
    <View style={styles.statPill}>
      <View style={[styles.statIconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={iconName} size={18} color={tintColor} />
      </View>
      <View style={styles.statTextWrap}>
        <Text
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
          style={styles.statTitle}
        >
          {title}
        </Text>
        <Text style={styles.statValue}>{value}</Text>
      </View>
    </View>
  );

  const StatusSquareCard = ({
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
    <View style={styles.statusSquareCard}>
      <View style={[styles.statusSquareIconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={iconName} size={18} color={tintColor} />
      </View>
      <Text style={styles.statusSquareTitle}>{title}</Text>
      <Text style={styles.statusSquareValue}>{value}</Text>
    </View>
  );

  const CountdownUnit = ({ label, value }: { label: string; value: number }) => (
    <View style={styles.countdownUnit}>
      <Text style={styles.countdownValue}>{String(value).padStart(2, '0')}</Text>
      <Text style={styles.countdownLabel}>{label}</Text>
    </View>
  );

  const CountdownSeparator = () => <Text style={styles.countdownSeparator}>:</Text>;

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

  const notSeatedPeople = Math.max(0, confirmedPeople - seatedGuests);

  const statusStatsContent = (
    <>
      <View style={styles.statusSquareWrapper}>
        <StatusSquareCard
          title="אולי מגיע"
          value={maybePeople}
          iconName="help-circle"
          tintColor={stylesVars.primaryBlue}
          iconBg="rgba(19, 91, 236, 0.10)"
        />
      </View>
      <View style={styles.statusSquareWrapper}>
        <StatusSquareCard
          title="ממתין"
          value={pendingPeople}
          iconName="time"
          tintColor={stylesVars.amber}
          iconBg="rgba(245, 158, 11, 0.12)"
        />
      </View>
      <View style={styles.statusSquareWrapper}>
        <StatusSquareCard
          title="לא מגיע"
          value={declinedPeople}
          iconName="close-circle"
          tintColor={stylesVars.red}
          iconBg="rgba(239, 68, 68, 0.10)"
        />
      </View>
      <View style={styles.statusSquareWrapper}>
        <StatusSquareCard
          title="מגיע"
          value={confirmedPeople}
          iconName="checkmark-circle"
          tintColor="#16A34A"
          iconBg="rgba(22, 163, 74, 0.10)"
        />
      </View>
    </>
  );

  return (
    <View style={styles.screen}>
      {!isWeb ? (
        <>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.mobileTopGradient,
              {
                height: insets.top + 230,
                opacity: mobileGradientOpacity,
              },
            ]}
          >
            <LinearGradient
              colors={['#F7FAFF', '#E8F1FF', '#F2E0BA']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>

          <Animated.View
            pointerEvents="none"
            style={[
              styles.mobileHeader,
              {
                height: insets.top + 72,
                paddingTop: insets.top + 2,
              },
            ]}
          >
            <View style={styles.mobileHeaderBg} />
            <Image
              source={require('../../assets/images/logoMoon.png')}
              style={styles.mobileHeaderLogo}
              resizeMode="contain"
            />
          </Animated.View>
        </>
      ) : null}

      <LinearGradient
        pointerEvents="none"
        colors={['#F7FAFF', '#E8F1FF', '#F2E0BA']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.bg}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0.68)', 'rgba(255,255,255,0)']}
        start={{ x: 0.05, y: 0 }}
        end={{ x: 0.75, y: 0.55 }}
        style={styles.bgHighlight}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(232,196,122,0.58)', 'rgba(244,224,186,0.22)', 'rgba(244,224,186,0)']}
        start={{ x: 1, y: 0.95 }}
        end={{ x: 0.18, y: 0.22 }}
        style={styles.bgWarmGlow}
      />

      <Animated.ScrollView
        style={styles.container}
        contentContainerStyle={[styles.contentContainer, isWeb && styles.contentContainerWeb]}
        onScroll={
          !isWeb
            ? Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
                useNativeDriver: false,
              })
            : undefined
        }
        scrollEventThrottle={16}
      >
        {!isWeb ? <View style={{ height: insets.top + 74 }} /> : null}

        <View style={styles.rtlDebugBanner}>
          <Text style={styles.rtlDebugText}>RTL: {String(I18nManager.isRTL)}</Text>
        </View>

        <View style={styles.hero}>
          {currentEvent?.invitationImageUrl ? (
            <View style={styles.heroBanner}>
              <Image source={{ uri: currentEvent.invitationImageUrl }} style={styles.heroBannerImage} resizeMode="cover" />
              <LinearGradient
                colors={['rgba(255,255,255,0.96)', 'rgba(255,255,255,0.86)', 'rgba(255,255,255,0)']}
                start={{ x: 0.5, y: 1 }}
                end={{ x: 0.5, y: 0 }}
                style={styles.heroBannerTitleOverlay}
              >
                <View style={styles.heroBannerMetaRow}>
                  <View style={styles.heroBannerTypePill}>
                    <Text style={styles.heroBannerTypeText} numberOfLines={1}>
                      {String(currentEvent.title || '').trim() || eventTypeLabel}
                    </Text>
                  </View>

                  <View style={styles.heroBannerDetailsRow}>
                    {String(currentEvent.location || '').trim() ? (
                      <View style={styles.heroBannerVenuePill}>
                        <Text style={styles.heroBannerVenueText} numberOfLines={1}>
                          {String(currentEvent.location || '').trim()}
                        </Text>
                      </View>
                    ) : null}

                    {String(currentEvent.city || '').trim() ? (
                      <View style={styles.heroBannerCityPill}>
                        <Text style={styles.heroBannerCityText} numberOfLines={1}>
                          {String(currentEvent.city || '').trim()}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </LinearGradient>
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
          <LinearGradient
            colors={['rgba(255,255,255,0.98)', 'rgba(248,251,255,0.98)', 'rgba(255,248,232,0.96)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.countdownSection}
          >
            <Text style={styles.countdownHeading}>הספירה לאחור החלה</Text>
            <Text style={styles.countdownSubtext}>{eventDateLabel || '--:--'}</Text>
            {countdown ? (
              <View style={styles.countdownWrap}>
                <CountdownUnit label="ימים" value={countdown.days} />
                <CountdownSeparator />
                <CountdownUnit label="שעות" value={countdown.hours} />
                <CountdownSeparator />
                <CountdownUnit label="דקות" value={countdown.minutes} />
                <CountdownSeparator />
                <CountdownUnit label="שניות" value={countdown.seconds} />
              </View>
            ) : (
              <Text style={styles.heroDate}>--:--</Text>
            )}
          </LinearGradient>

          <View style={{ width: '100%', marginTop: hasMultipleEvents ? 12 : 0 }}>
            <EventSwitcher
              userId={userData?.id}
              selectedEventId={resolvedEventId}
              onSelectEventId={handleSelectEventId}
              label="אירוע פעיל"
              pillVariant="soft"
              onHasMultipleChange={setHasMultipleEvents}
            />
          </View>
        </View>

        <Text style={[styles.sectionTitle, styles.sectionTitleSpacious]}>סטטוס הגעה</Text>
        <View style={styles.statusSquaresRow}>
          {statusStatsContent}
        </View>

        <Text style={styles.sectionTitle}>תמונת מצב</Text>
        <View style={styles.quickInfoRow}>
          <View style={styles.locationCard}>
            <View style={styles.locationCardIcon}>
              <Ionicons name="location" size={18} color={stylesVars.primaryBlue} />
            </View>
            <View style={styles.locationCardText}>
              <Text style={styles.locationCardTitle}>מיקום</Text>
              <Text style={styles.locationCardValue} numberOfLines={1}>
                {String(currentEvent.location || '').trim() || '—'}
              </Text>
            </View>
          </View>
          <View style={styles.daysCard}>
            <View
              style={[
                styles.daysCardIcon,
                { backgroundColor: 'rgba(239, 68, 68, 0.10)', borderColor: 'rgba(239, 68, 68, 0.16)' },
              ]}
            >
              <Ionicons name="alert-circle" size={18} color={stylesVars.red} />
            </View>
            <View style={styles.daysCardText}>
              <Text style={styles.daysCardTitle}>לא הושבו</Text>
              <Text style={styles.daysCardValue}>{notSeatedPeople}</Text>
            </View>
          </View>
        </View>

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
      </Animated.ScrollView>
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
    backgroundColor: '#E8F1FF',
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
  },
  bgHighlight: {
    ...StyleSheet.absoluteFillObject,
  },
  bgWarmGlow: {
    ...StyleSheet.absoluteFillObject,
  },
  mobileTopGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 0,
  },
  mobileHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 5,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  mobileHeaderBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(11, 28, 65, 0.06)',
  },
  mobileHeaderLogo: {
    width: 310,
    height: 68,
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
  container: { flex: 1, backgroundColor: 'transparent' },
  contentContainer: {
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'web' ? 22 : 18,
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
    marginTop: Platform.OS === 'web' ? -108 : -44,
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
  heroBannerTitleOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '52%',
    paddingHorizontal: 22,
    paddingBottom: 18,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  heroBannerMetaRow: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 8,
    maxWidth: '92%',
  },
  heroBannerDetailsRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: 8,
  },
  heroBannerTypePill: {
    maxWidth: '100%',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.oxfordBlue,
    alignSelf: 'flex-end',
    shadowColor: colors.black,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  heroBannerTypeText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    color: colors.white,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  heroBannerVenuePill: {
    maxWidth: '88%',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.gold,
    alignSelf: 'flex-end',
  },
  heroBannerVenueText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    color: colors.white,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  heroBannerCityPill: {
    maxWidth: '88%',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(0,29,61,0.10)',
    alignSelf: 'flex-end',
  },
  heroBannerCityText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    color: colors.oxfordBlue,
    textAlign: 'right',
    writingDirection: 'rtl',
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


