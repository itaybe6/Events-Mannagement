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
  const isCompactDesktop = windowWidth < 1280;

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

        const [event, guestsData] = await Promise.all([eventService.getEvent(eventId), guestService.getGuests(eventId)]);

        setCurrentEvent(event);
        setGuests(guestsData as Guest[]);
      } catch (e) {
        setCurrentEvent(null);
        setGuests([]);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [initializeAuth, isLoggedIn, resolvedEventId, router, setActiveEvent, userData?.id]);

  const stats = useMemo(() => {
    const confirmed = guests.filter((g) => g.status === 'מגיע').length;
    const declined = guests.filter((g) => g.status === 'לא מגיע').length;
    const pending = guests.filter((g) => g.status === 'ממתין').length;
    const seated = guests.filter((g) => g.status === 'מגיע' && g.tableId).length;
    const needSeat = Math.max(0, confirmed - seated);
    const responded = confirmed + declined;
    const responseRate = guests.length > 0 ? Math.round((responded / guests.length) * 100) : 0;
    const seatingRate = confirmed > 0 ? Math.round((seated / confirmed) * 100) : 0;

    return {
      confirmed,
      declined,
      pending,
      seated,
      needSeat,
      total: guests.length,
      responseRate,
      seatingRate,
    };
  }, [guests]);

  const formatDateOnly = (date: Date) =>
    new Date(date).toLocaleDateString('he-IL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1_000);
    return () => clearInterval(t);
  }, []);

  const countdown = useMemo(() => getCountdownParts(currentEvent?.date, now), [currentEvent?.date, now]);

  const coupleOrTitle = useMemo(() => {
    const groom = String(currentEvent?.groomName || '').trim();
    const bride = String(currentEvent?.brideName || '').trim();
    if (groom && bride) return `${groom} & ${bride}`;
    if (groom) return groom;
    if (bride) return bride;
    return String(currentEvent?.title || '').trim();
  }, [currentEvent?.brideName, currentEvent?.groomName, currentEvent?.title]);

  const eventLocation = useMemo(
    () =>
      [String(currentEvent?.location || '').trim(), String(currentEvent?.city || '').trim()]
        .filter(Boolean)
        .join(' · ') || 'מיקום טרם הוגדר',
    [currentEvent?.city, currentEvent?.location]
  );

  const daysLabel =
    countdown === null
      ? '—'
      : countdown.totalMs <= 0
        ? 'היום הגדול'
        : countdown.days === 0
          ? 'פחות מ-24 שעות'
          : `${countdown.days} ימים נשארו`;

  const priorityMessage = useMemo(() => {
    if (stats.pending > 0) return `מחכים ל-${stats.pending} תשובות נוספות כדי לסגור תמונת מצב מלאה.`;
    if (stats.needSeat > 0) return `נותר לשבץ ${stats.needSeat} אורחים כדי להשלים את ההושבה.`;
    return 'המצב נראה מצוין. אפשר לעבור על ההודעות והשולחנות ולוודא שהכול סגור.';
  }, [stats.needSeat, stats.pending]);

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
        <View style={[styles.heroSection, isCompactDesktop ? styles.heroSectionStack : null]}>
          <Surface style={styles.heroMainCard} hoverStyle={styles.surfaceHoverSoft}>
            <View style={styles.heroEyebrow}>
              <View style={styles.heroEyebrowIcon}>
                <Ionicons name="sparkles-outline" size={16} color={stylesVars.accentBlue} />
              </View>
              <Text style={styles.heroEyebrowText}>לוח הבקרה של האירוע</Text>
            </View>

            <Text style={styles.heroTitle}>{coupleOrTitle || 'האירוע שלכם'}</Text>
            <Text style={styles.heroSubtitle}>
              כל מה שחשוב במקום אחד: אישורי הגעה, הושבה, שולחנות והודעות. פחות עומס בעיניים, יותר פוקוס על מה שדורש טיפול.
            </Text>

            <View style={styles.heroFactsRow}>
              <QuickFactChip icon="calendar-outline" tone="blue" label="תאריך" value={formatDateOnly(currentEvent.date)} />
              <QuickFactChip icon="location-outline" tone="purple" label="מיקום" value={eventLocation} />
              <QuickFactChip icon="time-outline" tone="gold" label="ספירה לאחור" value={daysLabel} />
            </View>

            <View style={styles.heroCountdownCard}>
              <View style={styles.heroCountdownHeader}>
                <View style={styles.heroCountdownIcon}>
                  <Ionicons name="timer-outline" size={18} color={stylesVars.accentBlue} />
                </View>
                <View style={styles.heroCountdownHeaderText}>
                  <Text style={styles.heroCountdownTitle}>הספירה לאחור לאירוע</Text>
                  <Text style={styles.heroCountdownSubtitle}>
                    {countdown && countdown.totalMs <= 0
                      ? 'היום הגדול כבר כאן'
                      : 'הטיימר מתעדכן אוטומטית לפי תאריך האירוע'}
                  </Text>
                </View>
              </View>

              <View style={styles.heroCountdownGrid}>
                <CountdownUnit label="ימים" value={countdown?.days ?? 0} />
                <CountdownUnit label="שעות" value={countdown?.hours ?? 0} pad />
                <CountdownUnit label="דקות" value={countdown?.minutes ?? 0} pad />
                <CountdownUnit label="שניות" value={countdown?.seconds ?? 0} pad />
              </View>
            </View>
          </Surface>

          <Surface style={styles.heroSideCard} hoverStyle={styles.surfaceHoverSoft}>
            <View style={styles.sideCardHeader}>
              <Text style={styles.sideCardTitle}>תמונת מצב מהירה</Text>
              <Text style={styles.sideCardCaption}>כל הנתונים המרכזיים של האירוע במקום אחד</Text>
            </View>

            <ProgressMeter
              label="אישורי הגעה"
              value={stats.responseRate}
              caption={`${stats.confirmed + stats.declined} מתוך ${stats.total} השיבו`}
              tone="blue"
            />

            <ProgressMeter
              label="שיבוץ לשולחנות"
              value={stats.seatingRate}
              caption={stats.confirmed > 0 ? `${stats.seated} מתוך ${stats.confirmed} מאשרים שובצו` : 'עדיין אין אורחים מאושרים'}
              tone="green"
            />

            <View style={styles.focusBox}>
              <View style={styles.focusBoxIcon}>
                <Ionicons
                  name={stats.pending > 0 ? 'notifications-outline' : stats.needSeat > 0 ? 'grid-outline' : 'checkmark-done-outline'}
                  size={18}
                  color={stylesVars.primary}
                />
              </View>
              <Text style={styles.focusBoxText}>{priorityMessage}</Text>
            </View>

            <View style={styles.sideStatsGrid}>
              <MiniStat label="סה״כ מוזמנים" value={stats.total} tone="blue" />
              <MiniStat label="מאשרים" value={stats.confirmed} tone="green" />
              <MiniStat label="ממתינים" value={stats.pending} tone="gold" />
              <MiniStat label="לא מגיעים" value={stats.declined} tone="red" />
              <MiniStat label="שובצו" value={stats.seated} tone="blue" />
              <MiniStat label="לשיבוץ" value={stats.needSeat} tone="purple" />
            </View>
          </Surface>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>פעולות מרכזיות</Text>
            <Text style={styles.sectionSubtitle}>כלי העבודה החשובים מסודרים לפי עדיפות</Text>
          </View>
        </View>

        <View style={[styles.actionsShell, isCompactDesktop ? styles.actionsShellStack : null]}>
          <ActionCard
            icon="grid-outline"
            title="סידור הושבה"
            subtitle={stats.needSeat > 0 ? `נשארו ${stats.needSeat} אורחים לשבץ` : 'כל המאשרים שובצו או כמעט שובצו'}
            caption="כניסה מהירה למפת הישיבה ולחלוקת האורחים בין השולחנות."
            badge={stats.needSeat > 0 ? 'עדיפות גבוהה' : 'מוכן'}
            primary
            onPress={() =>
              router.push({
                pathname: '/(couple)/BrideGroomSeating',
                params: resolvedEventId ? { eventId: resolvedEventId } : {},
              })
            }
          />

          <View style={styles.secondaryActionsGrid}>
            <ActionCard
              icon="people-outline"
              title="רשימת מוזמנים"
              subtitle={stats.pending > 0 ? `${stats.pending} תשובות בהמתנה` : 'כל האישורים מעודכנים'}
              caption="ניהול אורחים, סטטוסים, מתנות ושיוך לקטגוריות."
              badge={stats.pending > 0 ? 'דורש מעקב' : undefined}
              onPress={() =>
                router.push({
                  pathname: '/(couple)/guests',
                  params: resolvedEventId ? { eventId: resolvedEventId } : {},
                })
              }
            />

            <ActionCard
              icon="restaurant-outline"
              title="ניהול שולחנות"
              subtitle="עריכה, קיבולת וסדר ישיבה"
              caption="עדכון כמות מקומות, שמות שולחנות ומעקב תפוסה."
              onPress={() =>
                router.push({
                  pathname: '/(couple)/TablesList',
                  params: resolvedEventId ? { eventId: resolvedEventId } : {},
                })
              }
            />

            <ActionCard
              icon="chatbubble-ellipses-outline"
              title="הודעות אוטומטיות"
              subtitle="תזכורות ועדכונים לאורחים"
              caption="עריכה והפעלה של הודעות וואטסאפ ותזכורות לפני האירוע."
              onPress={() =>
                router.push({
                  pathname: '/(couple)/automatic-notifications',
                  params: resolvedEventId ? { eventId: resolvedEventId } : {},
                })
              }
            />
          </View>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
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

function toneColors(tone: 'blue' | 'green' | 'gold' | 'purple' | 'red') {
  const map = {
    blue: { main: stylesVars.accentBlue, soft: 'rgba(59,130,246,0.10)', border: 'rgba(59,130,246,0.18)' },
    green: { main: stylesVars.accentGreen, soft: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.18)' },
    gold: { main: stylesVars.accentYellow, soft: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.20)' },
    purple: { main: stylesVars.accentPurple, soft: 'rgba(139,92,246,0.10)', border: 'rgba(139,92,246,0.18)' },
    red: { main: stylesVars.accentRed, soft: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.18)' },
  } as const;

  return map[tone];
}

function Surface({
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

function QuickFactChip({
  icon,
  tone,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tone: 'blue' | 'purple' | 'gold';
  label: string;
  value: string;
}) {
  const colorsByTone = toneColors(tone);

  return (
    <View style={[styles.factChip, { backgroundColor: colorsByTone.soft, borderColor: colorsByTone.border }]}>
      <View style={[styles.factChipIconWrap, { backgroundColor: withAlpha(colorsByTone.main, 0.12) }]}>
        <Ionicons name={icon} size={18} color={colorsByTone.main} />
      </View>
      <View style={styles.factChipContent}>
        <Text style={styles.factChipLabel}>{label}</Text>
        <Text style={styles.factChipValue} numberOfLines={2}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function CountdownUnit({
  label,
  value,
  pad = false,
}: {
  label: string;
  value: number;
  pad?: boolean;
}) {
  return (
    <View style={styles.countdownUnit}>
      <Text style={styles.countdownValue}>{pad ? String(value).padStart(2, '0') : String(value)}</Text>
      <Text style={styles.countdownLabel}>{label}</Text>
    </View>
  );
}

function getCountdownParts(targetDate: unknown, now: Date) {
  const target = targetDate ? new Date(targetDate as any).getTime() : NaN;
  const diffMs = target - now.getTime();
  if (!Number.isFinite(diffMs)) return null;

  const totalMs = Math.max(0, diffMs);
  const totalSeconds = Math.floor(totalMs / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  return {
    totalMs,
    days,
    hours,
    minutes,
    seconds,
  };
}

function ProgressMeter({
  label,
  value,
  caption,
  tone,
}: {
  label: string;
  value: number;
  caption: string;
  tone: 'blue' | 'green';
}) {
  const resolvedValue = clampPercent(value);
  const colorsByTone = toneColors(tone);

  return (
    <View style={styles.progressBlock}>
      <View style={styles.progressBlockHeader}>
        <Text style={styles.progressLabel}>{label}</Text>
        <Text style={[styles.progressValue, { color: colorsByTone.main }]}>{resolvedValue}%</Text>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${resolvedValue}%`, backgroundColor: colorsByTone.main }]} />
      </View>

      <Text style={styles.progressCaption} numberOfLines={2}>
        {caption}
      </Text>
    </View>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: 'blue' | 'green' | 'gold' | 'red' | 'purple';
}) {
  const colorsByTone = toneColors(tone);

  return (
    <View style={[styles.miniStatCard, { backgroundColor: colorsByTone.soft, borderColor: colorsByTone.border }]}>
      <Text style={styles.miniStatValue}>{value}</Text>
      <Text style={styles.miniStatLabel}>{label}</Text>
    </View>
  );
}

function ActionCard({
  icon,
  title,
  subtitle,
  caption,
  badge,
  primary,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle: string;
  caption: string;
  badge?: string;
  primary?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ hovered, pressed }: any) => [
        styles.actionCard,
        primary ? styles.actionCardPrimary : null,
        Platform.OS === 'web' && hovered ? (primary ? styles.actionCardPrimaryHover : styles.actionCardHover) : null,
        pressed ? styles.pressableDown : null,
      ]}
    >
      {primary ? (
        <>
          <View style={styles.actionCardGlowPrimaryTop} />
          <View style={styles.actionCardGlowPrimaryBottom} />
        </>
      ) : null}

      <View style={styles.actionCardHeader}>
        <View style={[styles.actionCardIcon, primary ? styles.actionCardIconPrimary : null]}>
          <Ionicons name={icon} size={22} color={primary ? colors.white : stylesVars.primary} />
        </View>
        {badge ? (
          <View style={[styles.actionBadge, primary ? styles.actionBadgePrimary : null]}>
            <Text style={[styles.actionBadgeText, primary ? styles.actionBadgeTextPrimary : null]}>{badge}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.actionCardContent}>
        <Text style={[styles.actionCardTitle, primary ? styles.actionCardTitlePrimary : null]}>{title}</Text>
        <Text style={[styles.actionCardSubtitle, primary ? styles.actionCardSubtitlePrimary : null]}>{subtitle}</Text>
        <Text style={[styles.actionCardCaption, primary ? styles.actionCardCaptionPrimary : null]}>{caption}</Text>
      </View>

      <View style={styles.actionCardFooter}>
        <Text style={[styles.actionCardLink, primary ? styles.actionCardLinkPrimary : null]}>כניסה למסך</Text>
        <Ionicons name="arrow-back-outline" size={18} color={primary ? colors.white : stylesVars.primary} />
      </View>
    </Pressable>
  );
}

const stylesVars = {
  bgLight: '#f4f7fb',
  surface: 'rgba(255,255,255,0.82)',
  surfaceStrong: '#ffffff',
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
    paddingTop: 22,
    paddingBottom: 32,
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
    top: -110,
    right: -80,
    width: 660,
    height: 660,
    borderRadius: 9999,
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage: 'radial-gradient(circle, rgba(59,130,246,0.12) 0%, rgba(255,255,255,0) 70%)',
        } as any)
      : { backgroundColor: 'rgba(59,130,246,0.12)' }),
  },
  shapeBottomLeft: {
    position: 'absolute',
    bottom: -80,
    left: -120,
    width: 880,
    height: 880,
    borderRadius: 9999,
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage: 'radial-gradient(circle, rgba(139,92,246,0.09) 0%, rgba(255,255,255,0) 72%)',
        } as any)
      : { backgroundColor: 'rgba(139,92,246,0.09)' }),
  },
  heroSection: {
    flexDirection: 'row-reverse',
    gap: 18,
    alignItems: 'stretch',
    marginBottom: 24,
  },
  heroSectionStack: {
    flexDirection: 'column',
  },
  heroMainCard: {
    flex: 1.35,
    padding: 28,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
    backgroundColor: stylesVars.surface,
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          boxShadow: '0 22px 60px rgba(13,28,43,0.08)',
        } as any)
      : null),
  },
  heroSideCard: {
    flex: 0.95,
    padding: 24,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
    backgroundColor: stylesVars.surfaceStrong,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 18px 48px rgba(13,28,43,0.08)',
        } as any)
      : null),
  },
  surfaceHoverSoft: {
    borderColor: 'rgba(59,130,246,0.18)',
    ...(Platform.OS === 'web'
      ? ({
          transform: [{ translateY: -1 }],
          boxShadow: '0 22px 64px rgba(13,28,43,0.10)',
        } as any)
      : null),
  },
  heroEyebrow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(59,130,246,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.16)',
  },
  heroEyebrowIcon: {
    width: 24,
    height: 24,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  heroEyebrowText: {
    fontSize: 12,
    fontWeight: '900',
    color: stylesVars.accentBlue,
    textAlign: 'right',
  },
  heroTitle: {
    marginTop: 18,
    fontSize: 38,
    fontWeight: '900',
    color: stylesVars.primary,
    textAlign: 'right',
    lineHeight: 46,
  },
  heroSubtitle: {
    marginTop: 10,
    maxWidth: 720,
    fontSize: 15,
    fontWeight: '600',
    color: colors.gray[700],
    textAlign: 'right',
    lineHeight: 24,
  },
  heroFactsRow: {
    marginTop: 22,
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 12,
  },
  factChip: {
    minWidth: 210,
    flexGrow: 1,
    flexBasis: 220,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  factChipIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  factChipContent: {
    flex: 1,
    minWidth: 0,
  },
  factChipLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.gray[600],
    textAlign: 'right',
  },
  factChipValue: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: '900',
    color: stylesVars.primary,
    textAlign: 'right',
    lineHeight: 22,
  },
  heroCountdownCard: {
    marginTop: 22,
    padding: 18,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.14)',
    backgroundColor: 'rgba(255,255,255,0.78)',
  },
  heroCountdownHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  heroCountdownIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(59,130,246,0.10)',
  },
  heroCountdownHeaderText: {
    flex: 1,
    minWidth: 180,
  },
  heroCountdownTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: stylesVars.primary,
    textAlign: 'right',
  },
  heroCountdownSubtitle: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
  },
  heroCountdownGrid: {
    marginTop: 16,
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 12,
  },
  countdownUnit: {
    flexGrow: 1,
    flexBasis: 120,
    minWidth: 110,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(248,250,252,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(13,28,43,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownValue: {
    fontSize: 28,
    fontWeight: '900',
    color: stylesVars.primary,
    textAlign: 'center',
  },
  countdownLabel: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'center',
  },
  sideCardHeader: {
    marginBottom: 18,
  },
  sideCardTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: stylesVars.primary,
    textAlign: 'right',
  },
  sideCardCaption: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
  },
  progressBlock: {
    marginBottom: 16,
  },
  progressBlockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: stylesVars.primary,
    textAlign: 'right',
  },
  progressValue: {
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'left',
  },
  progressTrack: {
    marginTop: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(13,28,43,0.08)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  progressCaption: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
    lineHeight: 18,
  },
  focusBox: {
    marginTop: 4,
    marginBottom: 18,
    padding: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(13,28,43,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(13,28,43,0.08)',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: 10,
  },
  focusBoxIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusBoxText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    color: stylesVars.primary,
    textAlign: 'right',
    lineHeight: 21,
  },
  sideStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  miniStatCard: {
    flexGrow: 1,
    flexBasis: 140,
    minWidth: 120,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniStatValue: {
    fontSize: 24,
    fontWeight: '900',
    color: stylesVars.primary,
    textAlign: 'center',
  },
  miniStatLabel: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '900',
    color: colors.gray[700],
    textAlign: 'center',
  },
  sectionHeader: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: stylesVars.primary,
    textAlign: 'right',
  },
  sectionSubtitle: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
  },
  actionsShell: {
    flexDirection: 'row-reverse',
    gap: 16,
    // Prevent the primary action from stretching to the full height of the secondary grid
    // on laptop-sized widths where the right column wraps to multiple rows.
    alignItems: 'flex-start',
  },
  actionsShellStack: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  secondaryActionsGrid: {
    flex: 1,
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 14,
    alignContent: 'flex-start',
  },
  actionCard: {
    flexGrow: 1,
    flexBasis: 250,
    minHeight: 200,
    padding: 20,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(13,28,43,0.08)',
    backgroundColor: 'rgba(255,255,255,0.94)',
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? ({
          cursor: 'pointer',
          boxShadow: '0 18px 42px rgba(13,28,43,0.07)',
        } as any)
      : null),
  },
  actionCardHover: {
    borderColor: 'rgba(59,130,246,0.18)',
    ...(Platform.OS === 'web'
      ? ({
          transform: [{ translateY: -2 }],
          boxShadow: '0 22px 52px rgba(13,28,43,0.10)',
        } as any)
      : null),
  },
  actionCardPrimary: {
    flex: 1.05,
    minHeight: 250,
    backgroundColor: stylesVars.primary,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  actionCardPrimaryHover: {
    ...(Platform.OS === 'web'
      ? ({
          transform: [{ translateY: -2 }],
          boxShadow: '0 24px 60px rgba(13,28,43,0.18)',
        } as any)
      : null),
  },
  actionCardGlowPrimaryTop: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 170,
    height: 170,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  actionCardGlowPrimaryBottom: {
    position: 'absolute',
    bottom: -50,
    left: -40,
    width: 200,
    height: 200,
    borderRadius: 999,
    backgroundColor: 'rgba(59,130,246,0.18)',
  },
  actionCardHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  actionCardIcon: {
    width: 50,
    height: 50,
    borderRadius: 18,
    backgroundColor: 'rgba(13,28,43,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCardIconPrimary: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  actionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(59,130,246,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.18)',
  },
  actionBadgePrimary: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.16)',
  },
  actionBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: stylesVars.accentBlue,
    textAlign: 'center',
  },
  actionBadgeTextPrimary: {
    color: colors.white,
  },
  actionCardContent: {
    marginTop: 26,
    gap: 8,
  },
  actionCardTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: stylesVars.primary,
    textAlign: 'right',
  },
  actionCardTitlePrimary: {
    color: colors.white,
  },
  actionCardSubtitle: {
    fontSize: 15,
    fontWeight: '900',
    color: stylesVars.primary,
    textAlign: 'right',
    lineHeight: 24,
  },
  actionCardSubtitlePrimary: {
    color: colors.white,
  },
  actionCardCaption: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
    lineHeight: 21,
  },
  actionCardCaptionPrimary: {
    color: 'rgba(255,255,255,0.74)',
  },
  actionCardFooter: {
    marginTop: 'auto',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingTop: 18,
  },
  actionCardLink: {
    fontSize: 13,
    fontWeight: '900',
    color: stylesVars.primary,
    textAlign: 'right',
  },
  actionCardLinkPrimary: {
    color: colors.white,
  },
  pressableDown: {
    opacity: 0.94,
    transform: [{ scale: 0.995 }],
  },
});
