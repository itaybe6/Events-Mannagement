import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '@/constants/colors';
import { eventService } from '@/lib/services/eventService';
import { guestService } from '@/lib/services/guestService';
import { useEventSelectionStore } from '@/store/eventSelectionStore';
import { useUserStore } from '@/store/userStore';
import type { Guest, GuestCategory } from '@/types';

type DashboardCategory = Pick<GuestCategory, 'id' | 'name' | 'side'>;

export default function CoupleHomeWebScreen() {
  const router = useRouter();
  const { eventId: queryEventId } = useLocalSearchParams<{ eventId?: string }>();

  const { isLoggedIn, userData, initializeAuth } = useUserStore();
  const activeUserId = useEventSelectionStore((s) => s.activeUserId);
  const activeEventId = useEventSelectionStore((s) => s.activeEventId);
  const setActiveEvent = useEventSelectionStore((s) => s.setActiveEvent);

  const [currentEvent, setCurrentEvent] = useState<any>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [categories, setCategories] = useState<DashboardCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [guestQuery, setGuestQuery] = useState('');
  const [now, setNow] = useState(() => new Date());

  const resolvedEventId =
    String(
      queryEventId ||
        (userData?.id && activeUserId === userData.id ? activeEventId : null) ||
        userData?.event_id ||
        ''
    ).trim() || null;

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
          setCategories([]);
          setLoading(false);
          return;
        }

        if (userData?.id) setActiveEvent(userData.id, eventId);

        const [event, guestsData, categoriesData] = await Promise.all([
          eventService.getEvent(eventId),
          guestService.getGuests(eventId),
          guestService.getGuestCategories(eventId),
        ]);

        setCurrentEvent(event);
        setGuests(guestsData as any);
        setCategories((categoriesData || []) as any);
      } catch (e) {
        setCurrentEvent(null);
        setGuests([]);
        setCategories([]);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isLoggedIn, router, userData?.id, resolvedEventId, initializeAuth, setActiveEvent]);

  const categoryById = useMemo(() => {
    const m = new Map<string, DashboardCategory>();
    for (const c of categories) m.set(String(c.id), c);
    return m;
  }, [categories]);

  const stats = useMemo(() => {
    const confirmed = guests.filter((g) => g.status === 'מגיע').length;
    const declined = guests.filter((g) => g.status === 'לא מגיע').length;
    const pending = guests.filter((g) => g.status === 'ממתין').length;
    const giftsSum = guests.reduce((sum, g) => sum + Number(g?.gift ?? 0), 0);
    const giftsCount = guests.filter((g) => Number(g?.gift ?? 0) > 0).length;
    const seated = guests.filter((g) => g.status === 'מגיע' && g.tableId).length;
    const needSeat = Math.max(0, confirmed - seated);
    return { confirmed, declined, pending, giftsSum, giftsCount, seated, needSeat, total: guests.length };
  }, [guests]);

  const formatDateOnly = (date: Date) =>
    new Date(date).toLocaleDateString('he-IL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

  useEffect(() => {
    // Update occasionally so "days left" stays correct without a full countdown UI
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

  const coupleOrTitle = useMemo(() => {
    const groom = String(currentEvent?.groomName || '').trim();
    const bride = String(currentEvent?.brideName || '').trim();
    if (groom && bride) return `${groom} & ${bride}`;
    if (groom) return groom;
    if (bride) return bride;
    return String(currentEvent?.title || '').trim();
  }, [currentEvent?.brideName, currentEvent?.groomName, currentEvent?.title]);

  const filteredGuests = useMemo(() => {
    const q = guestQuery.trim().toLowerCase();
    if (!q) return guests;
    return guests.filter((g) => {
      const name = String(g.name || '').toLowerCase();
      const phone = String(g.phone || '').replace(/\s+/g, '');
      const qPhone = q.replace(/\s+/g, '');
      return name.includes(q) || (qPhone && phone.includes(qPhone));
    });
  }, [guests, guestQuery]);

  const guestsPreview = useMemo(() => filteredGuests.slice(0, 3), [filteredGuests]);

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

  return (
    <View style={styles.page}>
      <View pointerEvents="none" style={styles.bgShapes}>
        <View style={styles.shapeTopRight} />
        <View style={styles.shapeBottomLeft} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Event details row (replaces the old top image/hero) */}
        <View style={styles.eventInfoRow}>
          <InfoCard icon="heart" tone="purple" label="זוג / אירוע" value={coupleOrTitle || '—'} />
          <InfoCard icon="calendar-outline" tone="blue" label="תאריך החתונה" value={formatDateOnly(currentEvent.date)} />
          <InfoCard
            icon="location"
            tone="red"
            label="מיקום החתונה"
            value={[String(currentEvent.location || '').trim(), String(currentEvent.city || '').trim()].filter(Boolean).join(' · ') || '—'}
          />
          <InfoCard
            icon="time-outline"
            tone="green"
            label="עד האירוע"
            value={daysToWedding === null ? '—' : daysToWedding === 0 ? 'היום' : `${daysToWedding} ימים`}
          />
        </View>

        {/* Stats cards */}
        <View style={styles.statsGrid}>
          <StatCard
            icon="checkmark-circle"
            iconBg="rgba(16,185,129,0.10)"
            iconColor={stylesVars.accentGreen}
            title="מאשרים"
            value={stats.confirmed}
            hint={stats.total ? `${Math.round((stats.confirmed / stats.total) * 100)}%` : undefined}
          />
          <StatCard
            icon="close-circle"
            iconBg="rgba(239,68,68,0.10)"
            iconColor={stylesVars.accentRed}
            title="לא מגיעים"
            value={stats.declined}
          />
          <StatCard
            icon="hourglass-outline"
            iconBg="rgba(245,158,11,0.12)"
            iconColor={stylesVars.accentYellow}
            title="ממתינים"
            value={stats.pending}
            hint={stats.pending > 0 ? 'דחוף' : undefined}
          />
          <StatCard
            icon="gift"
            iconBg="rgba(139,92,246,0.10)"
            iconColor={stylesVars.accentPurple}
            title="מתנות שהתקבלו"
            value={`₪${formatCurrency(stats.giftsSum)}`}
            hint={stats.giftsCount ? `${stats.giftsCount} מתנות` : undefined}
          />
        </View>

        {/* Mini windows (bottom) */}
        <View style={styles.miniGrid}>
          <HoverableSurface style={styles.miniCard} hoverStyle={styles.miniCardHover}>
            <View style={styles.miniHeader}>
              <Text style={styles.miniTitle} numberOfLines={1}>
                <Ionicons name="list" size={16} color={stylesVars.accentBlue} /> {'  '}רשימת מוזמנים
              </Text>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/(couple)/guests',
                    params: resolvedEventId ? { eventId: resolvedEventId } : {},
                  })
                }
                style={({ hovered, pressed }: any) => [
                  styles.miniLinkBtn,
                  Platform.OS === 'web' && hovered ? styles.miniLinkBtnHover : null,
                  pressed ? styles.btnPressed : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel="ניהול מוזמנים"
              >
                <Text style={styles.miniLinkBtnText}>ניהול</Text>
              </Pressable>
            </View>

            <View style={styles.miniBody}>
              <View style={styles.searchWrap}>
                <Ionicons name="search" size={18} color={colors.gray[400]} style={styles.searchIcon} />
                <TextInput
                  value={guestQuery}
                  onChangeText={setGuestQuery}
                  placeholder="חיפוש אורח..."
                  placeholderTextColor={colors.gray[400]}
                  style={styles.searchInput}
                />
              </View>

              <View style={styles.guestList}>
                {guestsPreview.length === 0 ? (
                  <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: colors.gray[500], textAlign: 'center' }}>
                      אין אורחים להצגה
                    </Text>
                  </View>
                ) : (
                  guestsPreview.map((g) => (
                    <GuestRow key={g.id} guest={g} category={categoryById.get(String(g.category_id || '')) || null} />
                  ))
                )}
              </View>

              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/(couple)/guests',
                    params: resolvedEventId ? { eventId: resolvedEventId } : {},
                  })
                }
                style={({ hovered, pressed }: any) => [
                  styles.miniCtaRow,
                  Platform.OS === 'web' && hovered ? styles.miniCtaRowHover : null,
                  pressed ? styles.btnPressed : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel="מעבר לניהול מוזמנים"
              >
                <Ionicons name="arrow-back" size={16} color={colors.gray[500]} />
                <Text style={styles.miniCtaText}>נהל מוזמנים</Text>
              </Pressable>
            </View>
          </HoverableSurface>

          <Pressable
            onPress={() =>
              router.push({
                pathname: '/(couple)/BrideGroomSeating',
                params: resolvedEventId ? { eventId: resolvedEventId } : {},
              })
            }
            style={({ hovered, pressed }: any) => [
              styles.miniCard,
              styles.miniCardPressable,
              Platform.OS === 'web' && hovered ? styles.miniCardHover : null,
              pressed ? styles.btnPressed : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel="פתח מפת הושבה"
          >
            <View pointerEvents="none" style={styles.dotPattern} />
            <View pointerEvents="none" style={styles.seatingGlowMini} />

            <View style={styles.miniHeader}>
              <Text style={styles.miniTitle} numberOfLines={1}>
                <Ionicons name="grid" size={16} color={stylesVars.accentPurple} /> {'  '}מפת הושבה
              </Text>
              <View style={styles.miniBadge}>
                <Ionicons name="alert-circle" size={14} color={stylesVars.accentBlue} />
                <Text style={styles.miniBadgeText}>{stats.needSeat} להושבה</Text>
              </View>
            </View>

            <View style={[styles.miniBody, styles.miniBodyCenter]}>
              <View style={styles.seatingIconBoxMini}>
                <Ionicons name="restaurant" size={28} color={stylesVars.accentBlue} />
              </View>
              <Text style={styles.seatingTitleMini}>ניהול סידורי הושבה</Text>
              <Text style={styles.seatingSubtitleMini} numberOfLines={3}>
                גררו שולחנות, מקמו אורחים, וקבלו תמונת מצב מלאה — הכל במקום אחד.
              </Text>

              <View style={styles.seatingCtaMini}>
                <Ionicons name="open-outline" size={16} color={colors.white} />
                <Text style={styles.seatingCtaTextMini}>פתח מפה</Text>
              </View>
            </View>
          </Pressable>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

function formatCurrency(value: number) {
  const n = Number(value || 0);
  // he-IL formatting tends to add commas as thousands separators
  return n.toLocaleString('he-IL');
}

function StatCard({
  icon,
  iconBg,
  iconColor,
  title,
  value,
  hint,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconBg: string;
  iconColor: string;
  title: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <HoverableSurface style={styles.statCard} hoverStyle={styles.cardHover}>
      <View style={styles.statCardTop}>
        <View style={[styles.statIconBox, { backgroundColor: iconBg }]}>
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
        {hint ? (
          <View style={styles.statHintPill}>
            <Text style={styles.statHintText}>{hint}</Text>
          </View>
        ) : (
          <View />
        )}
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{title}</Text>
    </HoverableSurface>
  );
}

function HoverableSurface({
  style,
  hoverStyle,
  children,
}: {
  style: any;
  hoverStyle: any;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const webHandlers =
    Platform.OS === 'web'
      ? ({
          // @ts-expect-error - RN web mouse events
          onMouseEnter: () => setHovered(true),
          // @ts-expect-error - RN web mouse events
          onMouseLeave: () => setHovered(false),
        } as any)
      : null;

  return (
    <View {...(webHandlers as any)} style={[style, hovered ? hoverStyle : null]}>
      {children}
    </View>
  );
}

function InfoCard({
  icon,
  tone,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tone: 'blue' | 'green' | 'red' | 'purple';
  label: string;
  value: string;
}) {
  const tones = {
    blue: { main: stylesVars.accentBlue, soft: 'rgba(59,130,246,0.10)' },
    green: { main: stylesVars.accentGreen, soft: 'rgba(16,185,129,0.10)' },
    red: { main: stylesVars.accentRed, soft: 'rgba(239,68,68,0.10)' },
    purple: { main: stylesVars.accentPurple, soft: 'rgba(139,92,246,0.10)' },
  } as const;

  const c = tones[tone];
  return (
    <HoverableSurface style={styles.infoCard} hoverStyle={styles.cardHover}>
      <View style={styles.infoCardTop}>
        <View style={[styles.infoIconBox, { backgroundColor: c.soft }]}>
          <Ionicons name={icon} size={18} color={c.main} />
        </View>
        <Text style={styles.infoLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={styles.infoValue} numberOfLines={2}>
        {value}
      </Text>
    </HoverableSurface>
  );
}

function GuestRow({ guest, category }: { guest: Guest; category: DashboardCategory | null }) {
  const initials = String(guest.name || '')
    .trim()
    .split(/\s+/g)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('');

  const statusColor =
    guest.status === 'מגיע'
      ? stylesVars.accentGreen
      : guest.status === 'לא מגיע'
        ? stylesVars.accentRed
        : stylesVars.accentYellow;

  const categoryLabel = category?.name ? category.name : 'קטגוריה';
  const sideLabel = category?.side === 'bride' ? 'צד כלה' : category?.side === 'groom' ? 'צד חתן' : '';
  const meta = [sideLabel, categoryLabel].filter(Boolean).join(' • ');

  return (
    <View style={styles.guestRow}>
      <View style={styles.guestRowLeft}>
        <View style={styles.guestAvatar}>
          <Text style={styles.guestAvatarText}>{initials || 'א'}</Text>
        </View>
        <View style={styles.guestText}>
          <Text style={styles.guestName} numberOfLines={1}>
            {guest.name}
          </Text>
          <Text style={styles.guestMeta} numberOfLines={1}>
            {meta}
          </Text>
        </View>
      </View>
      <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
    </View>
  );
}

const stylesVars = {
  bgLight: '#f6f7f8',
  primary: '#0d1c2b',
  accentBlue: '#3B82F6',
  accentGreen: '#10B981',
  accentRed: '#EF4444',
  accentYellow: '#F59E0B',
  accentPurple: '#8B5CF6',
};

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: stylesVars.bgLight,
    // @ts-expect-error - react-native-web supports direction
    direction: 'rtl',
  },
  scroll: { flex: 1, backgroundColor: 'transparent' },
  container: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 28,
    width: '100%',
    maxWidth: 1240,
    alignSelf: 'center',
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  centerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },

  bgShapes: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'none',
  },
  shapeTopRight: {
    position: 'absolute',
    top: -90,
    right: -80,
    width: 640,
    height: 640,
    borderRadius: 9999,
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage:
            'radial-gradient(circle, rgba(59,130,246,0.10) 0%, rgba(255,255,255,0) 70%)',
        } as any)
      : { backgroundColor: 'rgba(59,130,246,0.10)' }),
  },
  shapeBottomLeft: {
    position: 'absolute',
    bottom: -50,
    left: -120,
    width: 820,
    height: 820,
    borderRadius: 9999,
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage:
            'radial-gradient(circle, rgba(139,92,246,0.07) 0%, rgba(255,255,255,0) 70%)',
        } as any)
      : { backgroundColor: 'rgba(139,92,246,0.07)' }),
  },

  topBarRight: {
    minWidth: 320,
    alignItems: 'flex-start',
  },
  topBarActions: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  topBarBtn: {
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.80)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  topBarBtnHover: {
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  topBarBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: stylesVars.primary,
    textAlign: 'right',
  },
  btnPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  cardHover: {
    borderColor: 'rgba(59,130,246,0.22)',
    ...(Platform.OS === 'web'
      ? ({
          transform: [{ translateY: -1 }],
          boxShadow: '0 0 0 1px rgba(59,130,246,0.08), 0 14px 34px rgba(13,28,43,0.08)',
        } as any)
      : null),
  },

  eventInfoRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
    alignItems: 'stretch',
    marginBottom: 12,
  },
  infoCard: {
    flexGrow: 1,
    flexBasis: 220,
    minWidth: 220,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.70)',
    backgroundColor: 'rgba(255,255,255,0.68)',
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          boxShadow: '0 2px 16px rgba(13,28,43,0.04)',
        } as any)
      : null),
  },
  infoCardTop: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  infoIconBox: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: '900',
    color: colors.gray[600],
    textAlign: 'right',
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '900',
    color: stylesVars.primary,
    textAlign: 'right',
    lineHeight: 22,
  },

  statsGrid: {
    marginTop: 12,
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  statCard: {
    flexGrow: 1,
    flexBasis: 220,
    minWidth: 200,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.70)',
    backgroundColor: 'rgba(255,255,255,0.68)',
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          boxShadow: '0 4px 20px rgba(13,28,43,0.04)',
        } as any)
      : null),
  },
  statCardTop: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statHintPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.80)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.05)',
  },
  statHintText: { fontSize: 10, fontWeight: '900', color: colors.gray[600], textAlign: 'right' },
  statValue: { fontSize: 26, fontWeight: '900', color: stylesVars.primary, textAlign: 'right' },
  statLabel: { marginTop: 3, fontSize: 11, fontWeight: '800', color: colors.gray[600], textAlign: 'right' },

  miniGrid: {
    marginTop: 14,
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'stretch',
    justifyContent: 'space-between',
  },
  miniCard: {
    flexGrow: 1,
    flexBasis: 380,
    minWidth: 320,
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.70)',
    backgroundColor: 'rgba(255,255,255,0.68)',
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          boxShadow: '0 2px 16px rgba(13,28,43,0.04)',
          direction: 'rtl',
        } as any)
      : null),
  },
  miniCardPressable: {
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  miniCardHover: {
    borderColor: 'rgba(59,130,246,0.20)',
    // @ts-expect-error - react-native-web supports boxShadow
    boxShadow: '0 0 14px rgba(59,130,246,0.10), 0 6px 24px rgba(13,28,43,0.05)',
  },
  miniHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  miniTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: '900',
    color: stylesVars.primary,
    textAlign: 'right',
  },
  miniLinkBtn: {
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.16)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniLinkBtnHover: { backgroundColor: 'rgba(59,130,246,0.05)' },
  miniLinkBtnText: { fontSize: 11, fontWeight: '900', color: stylesVars.accentBlue, textAlign: 'right' },
  miniBody: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.05)',
    backgroundColor: 'rgba(255,255,255,0.50)',
    padding: 10,
    height: 200,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  miniBodyCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  miniBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(59,130,246,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.14)',
  },
  miniBadgeText: { fontSize: 10, fontWeight: '900', color: stylesVars.accentBlue, textAlign: 'right' },
  searchWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.90)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.05)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8,
  },
  searchIcon: { marginTop: 1 },
  searchInput: {
    flex: 1,
    height: 30,
    fontSize: 12,
    fontWeight: '800',
    color: stylesVars.primary,
    textAlign: 'right',
    paddingVertical: 0,
  },
  guestList: {
    marginTop: 8,
    gap: 6,
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === 'web'
      ? ({
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          paddingRight: 2,
          scrollbarWidth: 'thin',
        } as any)
      : null),
  },
  guestRow: {
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255,255,255,0.60)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ direction: 'rtl' } as any) : null),
  },
  guestRowLeft: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  guestAvatar: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: 'rgba(13,28,43,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  guestAvatarText: { fontSize: 11, fontWeight: '900', color: stylesVars.primary, textAlign: 'center' },
  guestText: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
  guestName: { fontSize: 12, fontWeight: '900', color: stylesVars.primary, textAlign: 'right' },
  guestMeta: { marginTop: 1, fontSize: 10, fontWeight: '800', color: colors.gray[600], textAlign: 'right' },
  statusDot: { width: 8, height: 8, borderRadius: 999 },

  miniCtaRow: {
    marginTop: 8,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: 'rgba(255,255,255,0.75)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  miniCtaRowHover: { backgroundColor: 'rgba(255,255,255,0.92)' },
  miniCtaText: { fontSize: 11, fontWeight: '900', color: colors.gray[700], textAlign: 'right' },
  dotPattern: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.35,
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage: 'radial-gradient(#cbd5e1 1.5px, transparent 1.5px)',
          backgroundSize: '24px 24px',
        } as any)
      : null),
  },
  seatingGlowMini: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 180,
    height: 180,
    borderRadius: 9999,
    transform: [{ translateX: -90 }, { translateY: -90 }],
    backgroundColor: 'rgba(59,130,246,0.05)',
    ...(Platform.OS === 'web' ? ({ filter: 'blur(32px)' } as any) : null),
  },
  seatingIconBoxMini: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    // @ts-expect-error - react-native-web supports boxShadow
    boxShadow: '0 8px 20px rgba(15,23,42,0.08)',
  },
  seatingTitleMini: { fontSize: 16, fontWeight: '900', color: stylesVars.primary, textAlign: 'center' },
  seatingSubtitleMini: {
    maxWidth: 420,
    fontSize: 11,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'center',
    lineHeight: 16,
  },
  seatingCtaMini: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: stylesVars.primary,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    // @ts-expect-error - react-native-web supports boxShadow
    boxShadow: '0 8px 18px rgba(13,28,43,0.14)',
  },
  seatingCtaTextMini: { fontSize: 12, fontWeight: '900', color: colors.white, textAlign: 'right' },

});

