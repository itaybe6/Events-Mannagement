import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, SafeAreaView, TouchableOpacity, Platform, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { eventService } from '@/lib/services/eventService';
import { guestService } from '@/lib/services/guestService';
import { Ionicons } from '@expo/vector-icons';
import { Event, Guest } from '@/types';
import { supabase } from '@/lib/supabase';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';

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
  const [loading, setLoading] = useState(true);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  // Tabs header height (see `app/(admin)/_layout.tsx` headerStyle.height)
  const headerHeight = 76;

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const eventData = await eventService.getEvent(id as string);
      setEvent(eventData);
      const guestsData = await guestService.getGuests(id as string);
      setGuests(guestsData);
      
      // שליפת שם המשתמש
      if (eventData?.user_id) {
        const { data: userData, error } = await supabase
          .from('users')
          .select('name, avatar_url')
          .eq('id', eventData.user_id)
          .single();
        
        if (!error && userData) {
          setUserName(userData.name || '');
          setUserAvatarUrl(userData.avatar_url || '');
        }
      }
      
      setLoading(false);
    };
    load();
  }, [id]);

  if (loading || !event) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.gray[100], justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
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

  // Color system inspired by the provided HTML mock (kept local to this screen)
  // IMPORTANT: do not use a hook here, because this screen has an early return during loading
  // (changing hook order between renders breaks the Rules of Hooks).
  const ui = {
    bg: '#f6f6f8',
    text: '#0d111c',
    muted: '#5d6b88',
    primary: '#0f45e6',
    glassBorder: 'rgba(255,255,255,0.55)',
    glassFill: 'rgba(255,255,255,0.65)',
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

  const Actions = ({ variant }: { variant: 'floating' | 'inline' }) => {
    const wrapStyle = variant === 'floating' ? styles.bottomWrap : styles.bottomInlineWrap;
    const gradientStyle = variant === 'floating' ? styles.bottomGradient : styles.bottomInlineGradient;
    // Tab-bar/menu overlap compensation (native). Adjust if your bottom menu height differs.
    const tabBarOffset = variant === 'floating' ? (Platform.OS === 'ios' ? 86 : 76) : 0;

    return (
      <View
        style={[
          wrapStyle,
          variant === 'floating'
            ? {
                bottom: tabBarOffset,
                paddingBottom: 16 + insets.bottom,
              }
            : null,
        ]}
        pointerEvents={variant === 'floating' ? 'box-none' : 'auto'}
      >
        <LinearGradient
          colors={[ui.bg, 'rgba(246,246,248,0.92)', 'rgba(246,246,248,0)']}
          start={{ x: 0.5, y: 1 }}
          end={{ x: 0.5, y: 0 }}
          style={gradientStyle}
          pointerEvents="none"
        />

        {/* Segmented action pill (match screenshot): Map + Scan */}
        <View style={styles.segmentPill}>
          <TouchableOpacity
            style={styles.segmentMap}
            activeOpacity={0.9}
            onPress={handleSeatingMap}
            accessibilityRole="button"
            accessibilityLabel="מפת הושבה"
          >
            <View style={styles.segmentMapIconCircle}>
              <Ionicons name="grid-outline" size={20} color={ui.text} />
            </View>
            <Text style={[styles.segmentMapText, { color: ui.text }]}>מפת הושבה</Text>
          </TouchableOpacity>

          <View style={styles.segmentDivider} />

          <TouchableOpacity
            style={styles.segmentScan}
            activeOpacity={0.92}
            // IMPORTANT: Keep admin tab bar by staying inside /(admin) group
            onPress={() => router.push(`/(admin)/seating-templates?eventId=${event.id}`)}
            accessibilityRole="button"
            accessibilityLabel="עריכת סקיצה"
          >
            <Ionicons name="library-outline" size={20} color="#fff" />
            <Text style={styles.segmentScanText}>עריכת סקיצה</Text>
          </TouchableOpacity>
        </View>
      </View>
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
                    <View style={styles.heroAvatarRing}>
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
                    </View>
                  </View>

                  <View style={styles.heroTitleWrap}>
                    <Text style={[styles.heroTitleType, { color: ui.text }]}>{getEventTypeLabel()}</Text>
                    {userName ? <Text style={[styles.heroTitleOwner, { color: ui.primary }]}>{`של ${userName}`}</Text> : null}
                  </View>

                  <View style={styles.heroMetaRow}>
                    <Ionicons name="calendar-outline" size={18} color={ui.muted} />
                    <Text style={[styles.heroMetaText, { color: ui.muted }]}>
                      {`${weekday}, ${day} | ${String(event.location ?? '')}`}
                    </Text>
                  </View>
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

          {/* Actions are part of the sheet (not floating) */}
          <Actions variant="inline" />
        </View>
      </ScrollView>
      </SafeAreaView>
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
    marginTop: 18, // push down so it doesn't overlap/cut the hero card
    marginHorizontal: -24, // extend to screen edges (counteracts content padding)
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 24,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderTopLeftRadius: 34,
    borderTopRightRadius: 34,
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
    justifyContent: 'flex-start',
    marginBottom: 8,
  },
  heroAvatarRing: {
    width: 54,
    height: 54,
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
    fontSize: 16,
    fontWeight: '900',
    color: '#0d111c',
  },

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
  },

  tileDarkOuter: {
    flex: 0.9,
    minWidth: 140,
  },
  tileDark: {
    height: 110,
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
    flex: 1.1,
    height: 110,
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

  bottomWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    bottom: 0,
    paddingBottom: 16,
    paddingTop: 22,
    alignItems: 'center',
    gap: 10,
  },
  bottomGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 160,
  },
  bottomInlineWrap: {
    marginTop: 10,
    paddingTop: 14,
    paddingBottom: 16,
    alignItems: 'center',
    gap: 10,
  },
  bottomInlineGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 90,
  },

  // Segmented action pill (map + scan)
  segmentPill: {
    width: '100%',
    maxWidth: 560,
    height: 84,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.65)',
    shadowColor: colors.black,
    shadowOpacity: 0.10,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 6,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 10,
    overflow: 'hidden',
  },
  segmentMap: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 12,
    borderRadius: 999,
  },
  segmentMapIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.black,
    shadowOpacity: 0.10,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  segmentMapText: {
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'right',
  },
  segmentDivider: {
    width: 1,
    height: 46,
    backgroundColor: 'rgba(17,24,39,0.10)',
  },
  segmentScan: {
    height: 60,
    minWidth: 180,
    borderRadius: 999,
    backgroundColor: 'rgba(15,69,230,0.92)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 20,
    shadowColor: '#0f45e6',
    shadowOpacity: 0.28,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 7,
  },
  segmentScanText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'right',
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