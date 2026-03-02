import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '@/constants/colors';
import { eventService } from '@/lib/services/eventService';
import { guestService } from '@/lib/services/guestService';
import { useEventSelectionStore } from '@/store/eventSelectionStore';
import { useUserStore } from '@/store/userStore';
import type { Guest } from '@/types';

export default function CoupleHomeWebScreen() {
  const router = useRouter();
  const { eventId: queryEventId } = useLocalSearchParams<{ eventId?: string }>();
  const { width: windowWidth } = useWindowDimensions();

  const { isLoggedIn, userData, initializeAuth } = useUserStore();
  const activeUserId = useEventSelectionStore((s) => s.activeUserId);
  const activeEventId = useEventSelectionStore((s) => s.activeEventId);
  const setActiveEvent = useEventSelectionStore((s) => s.setActiveEvent);

  const [currentEvent, setCurrentEvent] = useState<any>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
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
          setLoading(false);
          return;
        }

        if (userData?.id) setActiveEvent(userData.id, eventId);

        const [event, guestsData] = await Promise.all([
          eventService.getEvent(eventId),
          guestService.getGuests(eventId),
        ]);

        setCurrentEvent(event);
        setGuests(guestsData as any);
      } catch (e) {
        setCurrentEvent(null);
        setGuests([]);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isLoggedIn, router, userData?.id, resolvedEventId, initializeAuth, setActiveEvent]);

  const stats = useMemo(() => {
    const confirmed = guests.filter((g) => g.status === 'מגיע').length;
    const declined = guests.filter((g) => g.status === 'לא מגיע').length;
    const pending = guests.filter((g) => g.status === 'ממתין').length;
    const seated = guests.filter((g) => g.status === 'מגיע' && g.tableId).length;
    const needSeat = Math.max(0, confirmed - seated);
    return { confirmed, declined, pending, seated, needSeat, total: guests.length };
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

  const contentMaxWidth =
    windowWidth >= 1800 ? 1560 : windowWidth >= 1500 ? 1400 : windowWidth >= 1280 ? 1240 : undefined;
  const contentPaddingH = windowWidth >= 1024 ? 24 : 18;

  return (
    <View style={styles.page}>
      <View pointerEvents="none" style={styles.bgShapes}>
        <View style={styles.shapeTopRight} />
        <View style={styles.shapeBottomLeft} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.container,
          {
            paddingHorizontal: contentPaddingH,
            ...(contentMaxWidth ? { maxWidth: contentMaxWidth } : null),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
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
            iconColor={stylesVars.accentGreen}
            tone="success"
            title="מאשרים"
            value={stats.confirmed}
          />
          <StatCard
            icon="close-circle"
            iconColor={stylesVars.accentRed}
            tone="danger"
            title="לא מגיעים"
            value={stats.declined}
          />
          <StatCard
            icon="hourglass-outline"
            iconColor={stylesVars.accentYellow}
            tone="warning"
            title="ממתינים"
            value={stats.pending}
            badge={stats.pending > 0 ? 'דחוף' : undefined}
          />
        </View>

        {/* Mini windows (bottom) */}
        <View style={styles.bigActionsRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="מוזמנים"
            onPress={() =>
              router.push({
                pathname: '/(couple)/guests',
                params: resolvedEventId ? { eventId: resolvedEventId } : {},
              })
            }
            style={({ hovered, pressed }: any) => [
              styles.bigActionSecondary,
              Platform.OS === 'web' && hovered ? styles.bigActionSecondaryHover : null,
              pressed ? { opacity: 0.94 } : null,
            ]}
          >
            <View style={styles.bigActionIconWrapSecondary}>
              <Ionicons name="people-outline" size={26} color={stylesVars.accentBlue} />
            </View>
            <Text style={styles.bigActionTitleSecondary}>מוזמנים</Text>
            <Text style={styles.bigActionSubtitleSecondary}>ניהול אורחים, סטטוסים ומתנות</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="הודעות אוטומטיות"
            onPress={() =>
              router.push({
                pathname: '/(couple)/automatic-notifications',
                params: resolvedEventId ? { eventId: resolvedEventId } : {},
              })
            }
            style={({ hovered, pressed }: any) => [
              styles.bigActionSecondary,
              Platform.OS === 'web' && hovered ? styles.bigActionSecondaryHover : null,
              pressed ? { opacity: 0.94 } : null,
            ]}
          >
            <View style={styles.bigActionIconWrapSecondary}>
              <Ionicons name="chatbubble-ellipses-outline" size={26} color={stylesVars.primary} />
            </View>
            <Text style={styles.bigActionTitleSecondary}>הודעות אוטומטיות</Text>
            <Text style={styles.bigActionSubtitleSecondary}>עריכה והפעלה של תזכורות והודעות וואטסאפ</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="סידור שולחנות"
            onPress={() =>
              router.push({
                pathname: '/(couple)/TablesList',
                params: resolvedEventId ? { eventId: resolvedEventId } : {},
              })
            }
            style={({ hovered, pressed }: any) => [
              styles.bigActionSecondary,
              Platform.OS === 'web' && hovered ? styles.bigActionSecondaryHover : null,
              pressed ? { opacity: 0.94 } : null,
            ]}
          >
            <View style={styles.bigActionIconWrapSecondary}>
              <Ionicons name="restaurant-outline" size={26} color={stylesVars.accentPurple} />
            </View>
            <Text style={styles.bigActionTitleSecondary}>סידור שולחנות</Text>
            <Text style={styles.bigActionSubtitleSecondary}>ניהול שולחנות והושבה</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="מפת הושבה"
            onPress={() =>
              router.push({
                pathname: '/(couple)/BrideGroomSeating',
                params: resolvedEventId ? { eventId: resolvedEventId } : {},
              })
            }
            style={({ hovered, pressed }: any) => [
              styles.bigActionPrimary,
              Platform.OS === 'web' && hovered ? styles.bigActionPrimaryHover : null,
              pressed ? { opacity: 0.94 } : null,
            ]}
          >
            <View style={styles.bigActionBgBlob1} />
            <View style={styles.bigActionBgBlob2} />
            <View style={styles.bigActionIconWrapPrimary}>
              <Ionicons name="grid-outline" size={26} color={colors.white} />
            </View>
            <Text style={styles.bigActionTitlePrimary}>מפת הושבה</Text>
            <Text style={styles.bigActionSubtitlePrimary}>שיבוץ אורחים בשולחנות</Text>
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

function withAlpha(hex: string, alpha: number) {
  const h = String(hex || '').trim().replace('#', '');
  const a = Math.max(0, Math.min(1, alpha));
  if (h.length !== 6) return `rgba(0,0,0,${a})`;
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function StatCard({
  icon,
  iconColor,
  tone,
  title,
  value,
  badge,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  tone: 'success' | 'danger' | 'warning';
  title: string;
  value: string | number;
  badge?: string;
}) {
  const tones = {
    success: { bg: 'rgba(16,185,129,0.10)' },
    danger: { bg: 'rgba(239,68,68,0.08)' },
    warning: { bg: 'rgba(245,158,11,0.10)' },
  } as const;

  return (
    <HoverableSurface
      style={[
        styles.statCardLikeImage,
        { backgroundColor: tones[tone].bg, borderColor: withAlpha(iconColor, 0.30) },
      ]}
      hoverStyle={styles.statCardLikeImageHover}
    >
      {badge ? (
        <View style={[styles.statBadge, { backgroundColor: withAlpha(iconColor, 0.10), borderColor: withAlpha(iconColor, 0.20) }]}>
          <Text style={[styles.statBadgeText, { color: iconColor }]}>{badge}</Text>
        </View>
      ) : null}

      <View style={[styles.statIconCircle, { borderColor: withAlpha(iconColor, 0.18) }]}>
        <Ionicons name={icon} size={22} color={iconColor} />
      </View>

      <Text style={styles.statBigValue}>{value}</Text>
      <Text style={styles.statBigLabel}>{title}</Text>
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
          onMouseEnter: () => setHovered(true),
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
    justifyContent: 'flex-start',
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
    justifyContent: 'flex-start',
  },
  // Stat cards styled like the reference screenshot (pastel bg, top badges, centered icon + value)
  statCardLikeImage: {
    flexGrow: 1,
    flexBasis: 300,
    minWidth: 260,
    minHeight: 150,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 10px 26px rgba(13,28,43,0.08)',
        } as any)
      : null),
    ...(Platform.OS === 'web' ? ({ cursor: 'default' } as any) : null),
  },
  statCardLikeImageHover: {
    ...(Platform.OS === 'web'
      ? ({
          transform: [{ translateY: -1 }],
          boxShadow: '0 14px 34px rgba(13,28,43,0.10)',
        } as any)
      : null),
  },
  statBadge: {
    position: 'absolute',
    top: 10,
    right: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  statBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
  },
  statIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 10px 20px rgba(13,28,43,0.10)',
        } as any)
      : null),
  },
  statBigValue: {
    marginTop: 12,
    fontSize: 34,
    fontWeight: '900',
    color: stylesVars.primary,
    textAlign: 'center',
  },
  statBigLabel: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '800',
    color: colors.gray[700],
    textAlign: 'center',
  },

  bigActionsRow: { marginTop: 14, flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  bigActionSecondary: {
    flexGrow: 1,
    flexBasis: 300,
    minHeight: 150,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 2,
    borderColor: 'rgba(6,23,62,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    gap: 7,
    overflow: 'hidden',
    shadowColor: '#0b1c41',
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  bigActionSecondaryHover: { borderColor: 'rgba(6,23,62,0.20)', backgroundColor: 'rgba(6,23,62,0.04)' },
  bigActionIconWrapSecondary: {
    width: 48,
    height: 48,
    borderRadius: 999,
    backgroundColor: 'rgba(6,23,62,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigActionTitleSecondary: { fontSize: 16, fontWeight: '900', color: stylesVars.primary, textAlign: 'center' },
  bigActionSubtitleSecondary: { fontSize: 12, fontWeight: '700', color: colors.gray[600], textAlign: 'center' },

  bigActionPrimary: {
    flexGrow: 1,
    flexBasis: 300,
    minHeight: 150,
    borderRadius: 24,
    backgroundColor: stylesVars.primary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    gap: 7,
    overflow: 'hidden',
    shadowColor: '#0b1c41',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  bigActionPrimaryHover: { opacity: 0.96 },
  bigActionBgBlob1: {
    position: 'absolute',
    top: -22,
    right: -22,
    width: 104,
    height: 104,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  bigActionBgBlob2: {
    position: 'absolute',
    bottom: -20,
    left: -20,
    width: 86,
    height: 86,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  bigActionIconWrapPrimary: {
    width: 48,
    height: 48,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigActionTitlePrimary: { fontSize: 16, fontWeight: '900', color: colors.white, textAlign: 'center' },
  bigActionSubtitlePrimary: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.70)', textAlign: 'center' },

});

