import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRootNavigationState, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { colors } from '@/constants/colors';
import { authService } from '@/lib/services/authService';
import { eventService } from '@/lib/services/eventService';
import { guestService } from '@/lib/services/guestService';
import { useEventSelectionStore } from '@/store/eventSelectionStore';
import { useUserStore } from '@/store/userStore';
import type { Guest } from '@/types';

export default function CoupleHomeWebScreen() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const isNavigationReady = Boolean(rootNavigationState?.key);
  const { eventId: queryEventId } = useLocalSearchParams<{ eventId?: string }>();
  const { width: windowWidth } = useWindowDimensions();
  const isCompactDesktop = windowWidth < 1280;
  const isMobile = windowWidth < 600;

  const { isLoggedIn, userData, initializeAuth, login } = useUserStore();
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
      if (isNavigationReady) router.replace('/login');
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);
        let eventId = resolvedEventId;
        let event = eventId ? await eventService.getEvent(eventId) : null;

        if (!event) {
          await initializeAuth();
          const ud = useUserStore.getState().userData;
          eventId = ud?.event_id || null;
          if (!eventId && ud?.id) {
            eventId = await authService.getPrimaryEventId(ud.id);
          }
          if (eventId) {
            event = await eventService.getEvent(eventId);
          }
        }

        if (!event || !eventId) {
          setCurrentEvent(null);
          setGuests([]);
          setLoading(false);
          return;
        }

        const uid = userData?.id || useUserStore.getState().userData?.id;
        if (uid) {
          setActiveEvent(uid, eventId);
          const ud = useUserStore.getState().userData;
          if (ud && ud.event_id !== eventId) {
            login(ud.userType, { ...ud, event_id: eventId });
          }
        }

        const guestsData = await guestService.getGuests(eventId);
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
  }, [initializeAuth, isLoggedIn, isNavigationReady, resolvedEventId, router, setActiveEvent, userData?.id]);

  const stats = useMemo(() => {
    const confirmed = guests.filter((g) => g.status === 'מגיע').length;
    const maybe = guests.filter((g) => g.status === 'אולי מגיע').length;
    const declined = guests.filter((g) => g.status === 'לא מגיע').length;
    const pending = guests.filter((g) => g.status === 'ממתין').length;
    const seated = guests.filter((g) => g.status === 'מגיע' && g.tableId).length;
    const needSeat = Math.max(0, confirmed - seated);
    const responded = confirmed + maybe + declined;
    const responseRate = guests.length > 0 ? Math.round((responded / guests.length) * 100) : 0;
    const seatingRate = confirmed > 0 ? Math.round((seated / confirmed) * 100) : 0;

    return {
      confirmed,
      maybe,
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
    if (stats.maybe > 0) return `יש כרגע ${stats.maybe} אורחים במצב "אולי מגיע", כדאי לעקוב מולם לפני סגירת סידור ההושבה.`;
    if (stats.needSeat > 0) return `נותר לשבץ ${stats.needSeat} אורחים כדי להשלים את ההושבה.`;
    return 'המצב נראה מצוין. אפשר לעבור על ההודעות והשולחנות ולוודא שהכול סגור.';
  }, [stats.maybe, stats.needSeat, stats.pending]);

  const responseDistribution = useMemo(
    () =>
      [
        { label: 'מאשרים', value: stats.confirmed, tone: 'green' as const },
        { label: 'אולי מגיעים', value: stats.maybe, tone: 'purple' as const },
        { label: 'ממתינים', value: stats.pending, tone: 'gold' as const },
        { label: 'לא מגיעים', value: stats.declined, tone: 'red' as const },
      ].map((item) => ({
        ...item,
        percent: stats.total > 0 ? Math.round((item.value / stats.total) * 100) : 0,
      })),
    [stats.confirmed, stats.declined, stats.maybe, stats.pending, stats.total]
  );

  const dashboardHighlights = useMemo(
    () => [
      {
        label: 'סה״כ מוזמנים',
        value: stats.total,
        caption: stats.total > 0 ? 'נמצאים כרגע באירוע' : 'עדיין אין מוזמנים',
        tone: 'blue' as const,
      },
      {
        label: 'אחוז מענה',
        value: `${stats.responseRate}%`,
        caption: stats.total > 0 ? `${stats.confirmed + stats.maybe + stats.declined} כבר ענו` : 'ממתינים ליצירת רשימה',
        tone: 'green' as const,
      },
      {
        label: 'לשיבוץ',
        value: stats.needSeat,
        caption: stats.needSeat > 0 ? 'מאשרים שעדיין לא שויכו' : 'כל המאשרים שובצו',
        tone: 'gold' as const,
      },
    ],
    [stats.confirmed, stats.declined, stats.maybe, stats.needSeat, stats.responseRate, stats.total]
  );

  const closedGuests = useMemo(
    () => Math.max(0, stats.total - stats.pending - stats.needSeat),
    [stats.needSeat, stats.pending, stats.total]
  );

  const closedGuestsRate = useMemo(
    () => (stats.total > 0 ? Math.round((closedGuests / stats.total) * 100) : 0),
    [closedGuests, stats.total]
  );

  const readinessScore = useMemo(() => {
    if (stats.total <= 0) return 0;
    const weighted = stats.responseRate * 0.55 + stats.seatingRate * 0.3 + closedGuestsRate * 0.15;
    return clampPercent(weighted);
  }, [closedGuestsRate, stats.responseRate, stats.seatingRate, stats.total]);

  const readinessSummary = useMemo(() => {
    if (stats.total <= 0) return 'ברגע שתתווסף רשימת מוזמנים, המד יתחיל להציג מוכנות בזמן אמת.';
    if (readinessScore >= 85) return 'האירוע נראה בשל. נשאר רק ללטש את הקצוות האחרונים.';
    if (readinessScore >= 65) return 'התמונה טובה, אבל כדאי לסגור מענה והושבה כדי להגיע לשליטה מלאה.';
    return 'כדאי להתמקד קודם באישורי הגעה ובהשלמת שיבוץ כדי לייצב את תמונת המצב.';
  }, [readinessScore, stats.total]);

  const eventGaugeItems = useMemo(
    () => [
      {
        key: 'responses',
        label: 'אישורי הגעה',
        value: stats.confirmed + stats.maybe + stats.declined,
        total: stats.total,
        badge: `${stats.responseRate}%`,
        hint: stats.total > 0 ? `${stats.pending} עדיין ממתינים למענה` : 'עדיין אין מוזמנים באירוע',
        icon: 'mail-open-outline' as const,
        accent: stylesVars.accentBlue,
        tint: 'rgba(59,130,246,0.14)',
      },
      {
        key: 'seating',
        label: 'שיבוץ מאשרים',
        value: stats.seated,
        total: stats.confirmed,
        badge: `${stats.seatingRate}%`,
        hint: stats.confirmed > 0 ? `${stats.needSeat} מאשרים עדיין ללא שולחן` : 'השיבוץ יתחיל אחרי קבלת אישורים',
        icon: 'grid-outline' as const,
        accent: stylesVars.accentPurple,
        tint: 'rgba(139,92,246,0.14)',
      },
      {
        key: 'closure',
        label: 'אורחים סגורים',
        value: closedGuests,
        total: stats.total,
        badge: `${closedGuestsRate}%`,
        hint: stats.total > 0 ? `${stats.pending + stats.needSeat} עדיין דורשים טיפול` : 'המד יתעדכן כשהרשימה תהיה פעילה',
        icon: 'checkmark-done-outline' as const,
        accent: stylesVars.accentGreen,
        tint: 'rgba(16,185,129,0.14)',
      },
    ],
    [
      closedGuests,
      closedGuestsRate,
      stats.confirmed,
      stats.declined,
      stats.maybe,
      stats.needSeat,
      stats.pending,
      stats.responseRate,
      stats.seated,
      stats.seatingRate,
      stats.total,
    ]
  );

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

  const contentPaddingH = windowWidth >= 1024 ? 24 : 18;

  return (
    <View style={styles.page}>
      <View
        style={[
          styles.container,
          {
            paddingHorizontal: contentPaddingH,
          },
        ]}
      >
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

        <View style={[styles.heroSection, isCompactDesktop ? styles.heroSectionStack : null]}>
          <Surface style={[styles.heroMainCard, isMobile ? styles.cardPadMobile : null]} hoverStyle={styles.surfaceHoverSoft}>
            <View pointerEvents="none" style={styles.heroMainGlowTop} />
            <View pointerEvents="none" style={styles.heroMainGlowBottom} />
            <View style={styles.heroTopBar}>
            <View style={styles.heroEyebrow}>
              <View style={styles.heroEyebrowIcon}>
                <Ionicons name="sparkles-outline" size={16} color={stylesVars.accentBlue} />
              </View>
              <Text style={styles.heroEyebrowText}>לוח הבקרה של האירוע</Text>
            </View>
              <View style={styles.heroStatusPill}>
                <View style={styles.heroStatusDot} />
                <Text style={styles.heroStatusText}>{daysLabel}</Text>
              </View>
            </View>

            <Text style={[styles.heroTitle, isMobile ? styles.heroTitleMobile : null]}>{coupleOrTitle || 'האירוע שלכם'}</Text>
            <Text style={styles.heroSubtitle}>
              דשבורד נקי ומדויק לניהול האירוע: אישורי הגעה, הושבה, תמונת מצב ולחץ תפעולי במקום אחד.
            </Text>

            <View style={styles.heroPrimaryFactsRow}>
              <QuickFactChip icon="calendar-outline" tone="blue" label="תאריך" value={formatDateOnly(currentEvent.date)} />
              <QuickFactChip icon="location-outline" tone="purple" label="מיקום" value={eventLocation} />
            </View>

            <View style={[styles.heroMetricsRow, isMobile ? styles.heroMetricsRowMobile : null]}>
              {dashboardHighlights.map((item) => {
                const tone = toneColors(item.tone);
                return (
                  <View
                    key={item.label}
                    style={[
                      styles.heroMetricCard,
                      {
                        backgroundColor: withAlpha(tone.main, 0.16),
                        borderColor: withAlpha(tone.main, 0.26),
                      },
                    ]}
                  >
                    <View pointerEvents="none" style={[styles.heroMetricGlow, { backgroundColor: withAlpha(tone.main, 0.18) }]} />
                    <View style={[styles.heroMetricBadge, { backgroundColor: withAlpha(tone.main, 0.12) }]}>
                      <Ionicons name={heroMetricIcon(item.tone)} size={14} color={tone.main} />
                    </View>
                    <Text style={styles.heroMetricValue}>{item.value}</Text>
                    <Text style={styles.heroMetricLabel}>{item.label}</Text>
                    <Text style={styles.heroMetricCaption}>{item.caption}</Text>
                  </View>
                );
              })}
            </View>

            <View style={[styles.heroCountdownCard, isMobile ? styles.heroCountdownCardMobile : null]}>
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

              <View style={[styles.heroCountdownGrid, isMobile ? styles.heroCountdownGridMobile : null]}>
                {[
                  { key: 'days', label: 'ימים', value: countdown?.days ?? 0 },
                  { key: 'hours', label: 'שעות', value: countdown?.hours ?? 0 },
                  { key: 'minutes', label: 'דקות', value: countdown?.minutes ?? 0 },
                  { key: 'seconds', label: 'שניות', value: countdown?.seconds ?? 0 },
                ].map((unit, index, arr) => (
                  <React.Fragment key={unit.key}>
                    <CountdownUnit label={unit.label} value={unit.value} compact={isMobile} />
                    {index < arr.length - 1 ? (
                      <Text style={[styles.countdownSeparator, isMobile ? styles.countdownSeparatorMobile : null]}>:</Text>
                    ) : null}
                  </React.Fragment>
                ))}
              </View>
            </View>
          </Surface>

          <Surface style={[styles.heroSideCard, isMobile ? styles.cardPadMobile : null]} hoverStyle={styles.surfaceHoverSoft}>
            <View pointerEvents="none" style={styles.heroSideGlow} />
            <View style={styles.sideCardHeaderRow}>
              <View style={styles.sideCardHeader}>
                <Text style={styles.sideCardTitle}>תמונת מצב מהירה</Text>
                <Text style={styles.sideCardCaption}>כל המדדים הקריטיים של האירוע במבט אחד</Text>
              </View>
              <View style={styles.sideCardRateBadge}>
                <Text style={styles.sideCardRateValue}>{stats.responseRate}%</Text>
                <Text style={styles.sideCardRateLabel}>מענה</Text>
              </View>
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
              <MiniStat label="אולי מגיעים" value={stats.maybe} tone="purple" />
              <MiniStat label="ממתינים" value={stats.pending} tone="gold" />
              <MiniStat label="לא מגיעים" value={stats.declined} tone="red" />
              <MiniStat label="לשיבוץ" value={stats.needSeat} tone="purple" />
            </View>
          </Surface>
        </View>

        <View style={styles.analyticsSection}>
          <View style={[styles.analyticsGrid, isCompactDesktop ? styles.analyticsGridStack : null]}>
            <Surface style={[styles.analyticsMainCard, isMobile ? styles.cardPadMobile : null]} hoverStyle={styles.surfaceHoverSoft}>
              <View style={styles.analyticsCardHeader}>
                <View style={styles.analyticsCardIcon}>
                  <Ionicons name="pulse-outline" size={18} color={stylesVars.accentGreen} />
                </View>
                <View style={styles.analyticsCardHeaderText}>
                  <Text style={styles.analyticsCardTitle}>מד מוכנות האירוע</Text>
                  <Text style={styles.analyticsCardSubtitle}>תמונת מצב חיה שמשלבת מענה, הושבה וסגירת משימות במקום בלוק טקסט סטטי.</Text>
                </View>
              </View>

              <View style={[styles.readinessHero, isMobile ? styles.readinessHeroMobile : null]}>
                <View style={styles.readinessHeroGaugeWrap}>
                  <GaugeMeter value={readinessScore} total={100} color={stylesVars.accentBlue} trackColor={'rgba(59,130,246,0.14)'} />
                </View>
                <View style={styles.readinessHeroContent}>
                  <View style={styles.readinessHeroBadge}>
                    <Text style={styles.readinessHeroBadgeText}>{readinessScore}% מוכנות</Text>
                  </View>
                  <Text style={styles.readinessHeroTitle}>כמה האירוע סגור כרגע?</Text>
                  <Text style={styles.readinessHeroCaption}>{readinessSummary}</Text>
                </View>
              </View>

              <View style={[styles.gaugeStatsList, isMobile ? styles.gaugeStatsListMobile : null]}>
                {eventGaugeItems.map((item) => (
                  <View key={item.key} style={[styles.gaugeStatCard, { borderColor: item.tint }]}>
                    <View style={styles.gaugeStatTop}>
                      <View style={[styles.gaugeStatBadge, { backgroundColor: item.tint }]}>
                        <Text style={[styles.gaugeStatBadgeText, { color: item.accent }]}>{item.badge}</Text>
                      </View>
                      <View style={[styles.gaugeStatIconCircle, { backgroundColor: item.tint }]}>
                        <Ionicons name={item.icon} size={18} color={item.accent} />
                      </View>
                    </View>

                    <View style={styles.gaugeStatBody}>
                      <View style={styles.gaugeStatMeterWrap}>
                        <GaugeMeter value={item.value} total={item.total} color={item.accent} trackColor={item.tint} />
                      </View>
                      <Text style={styles.gaugeStatLabel}>{item.label}</Text>
                      <View style={styles.gaugeStatBottom}>
                        <Text style={styles.gaugeStatValue}>{item.value}</Text>
                        <Text style={styles.gaugeStatOutOf}>{`מתוך ${item.total}`}</Text>
                      </View>
                      <Text style={styles.gaugeStatHint}>{item.hint}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </Surface>

            <View style={[styles.analyticsSideColumn, isMobile ? styles.analyticsSideColumnMobile : null]}>
              <Surface style={[styles.analyticsInsightCard, isMobile ? styles.cardPadMobile : null]} hoverStyle={styles.surfaceHoverSoft}>
                <View style={styles.analyticsCardHeader}>
                  <View style={styles.analyticsCardIcon}>
                    <Ionicons name="sparkles-outline" size={18} color={stylesVars.accentPurple} />
                  </View>
                  <View style={styles.analyticsCardHeaderText}>
                    <Text style={styles.analyticsCardTitle}>מוקדי טיפול</Text>
                    <Text style={styles.analyticsCardSubtitle}>הנקודות שעדיין דורשות מענה או סגירה לפני האירוע.</Text>
                  </View>
                </View>

                <View style={styles.analyticsMiniGrid}>
                  <MiniStat label="ממתינים" value={stats.pending} tone="gold" compact />
                  <MiniStat label="אולי מגיעים" value={stats.maybe} tone="purple" compact />
                  <MiniStat label="לשיבוץ" value={stats.needSeat} tone="purple" compact />
                  <MiniStat label="דורשים טיפול" value={stats.pending + stats.needSeat} tone="red" compact />
                </View>
              </Surface>

              <Surface style={[styles.analyticsInsightCard, isMobile ? styles.cardPadMobile : null]} hoverStyle={styles.surfaceHoverSoft}>
                <View style={styles.analyticsCardHeader}>
                  <View style={styles.analyticsCardIcon}>
                    <Ionicons name="bar-chart-outline" size={18} color={stylesVars.accentBlue} />
                  </View>
                  <View style={styles.analyticsCardHeaderText}>
                    <Text style={styles.analyticsCardTitle}>חלוקת סטטוסים של המוזמנים</Text>
                    <Text style={styles.analyticsCardSubtitle}>גרף שממחיש איך רשימת האורחים מתפלגת כרגע לפי מצב הגעה.</Text>
                  </View>
                </View>

                <View style={styles.analyticsBars}>
                  {responseDistribution.map((item) => {
                    const tone = toneColors(item.tone);
                    return (
                      <View key={item.label} style={styles.analyticsBarRow}>
                        <View style={styles.analyticsBarRowHeader}>
                          <View style={styles.analyticsBarLabelWrap}>
                            <View style={[styles.analyticsBarDot, { backgroundColor: tone.main }]} />
                            <Text style={styles.analyticsBarLabel}>{item.label}</Text>
                          </View>
                          <Text style={styles.analyticsBarValue}>
                            {item.value} אורחים
                          </Text>
                        </View>
                        <View style={styles.analyticsTrack}>
                          <View
                            style={[
                              styles.analyticsFill,
                              {
                                width: `${item.value > 0 ? Math.max(item.percent, 8) : 0}%`,
                                backgroundColor: tone.main,
                                minWidth: item.value > 0 ? 44 : 0,
                              },
                            ]}
                          >
                            {item.value > 0 ? <Text style={styles.analyticsBarPercent}>{item.percent}%</Text> : null}
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </Surface>
            </View>
          </View>
        </View>

        <View style={{ height: 24 }} />
      </View>
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
      <View pointerEvents="none" style={[styles.factChipGlow, { backgroundColor: withAlpha(colorsByTone.main, 0.12) }]} />
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

function heroMetricIcon(tone: 'blue' | 'green' | 'gold') {
  if (tone === 'green') return 'sparkles-outline';
  if (tone === 'gold') return 'grid-outline';
  return 'people-outline';
}

function CountdownUnit({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: number;
  compact?: boolean;
}) {
  return (
    <View style={[styles.countdownUnit, compact ? styles.countdownUnitMobile : null]}>
      <Text style={[styles.countdownValue, compact ? styles.countdownValueMobile : null]}>
        {String(value).padStart(2, '0')}
      </Text>
      <Text style={styles.countdownLabel}>{label}</Text>
    </View>
  );
}

function GaugeMeter({
  value,
  total,
  color,
  trackColor,
}: {
  value: number;
  total: number;
  color: string;
  trackColor: string;
}) {
  const safeTotal = Math.max(0, Number(total) || 0);
  const safeValue = Math.max(0, Math.min(Number(value) || 0, safeTotal || Number(value) || 0));
  const progress = safeTotal > 0 ? Math.max(0, Math.min(1, safeValue / safeTotal)) : 0;
  const width = 132;
  const height = 84;
  const cx = width / 2;
  const cy = height - 8;
  const radius = 46;
  const arcLength = Math.PI * radius;
  const pointerRadius = radius - 6;
  const angle = Math.PI - progress * Math.PI;
  const pointerX = cx + pointerRadius * Math.cos(angle);
  const pointerY = cy - pointerRadius * Math.sin(angle);
  const arcPath = `M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`;

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Path d={arcPath} stroke={trackColor} strokeWidth={12} fill="none" strokeLinecap="round" />
      <Path
        d={arcPath}
        stroke={color}
        strokeWidth={12}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${Math.max(progress > 0 ? 3 : 0, progress * arcLength)} ${arcLength}`}
      />
      <Line x1={cx} y1={cy} x2={pointerX} y2={pointerY} stroke={'rgba(15,23,42,0.78)'} strokeWidth={3} strokeLinecap="round" />
      <Circle cx={cx} cy={cy} r={9} fill="#FFFFFF" stroke={'rgba(15,23,42,0.78)'} strokeWidth={3} />
    </Svg>
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
  compact = false,
}: {
  label: string;
  value: string | number;
  tone: 'blue' | 'green' | 'gold' | 'red' | 'purple';
  compact?: boolean;
}) {
  const colorsByTone = toneColors(tone);

  return (
    <View
      style={[
        styles.miniStatCard,
        compact ? styles.miniStatCardCompact : styles.miniStatCardRegular,
        {
          backgroundColor: withAlpha(colorsByTone.main, compact ? 0.07 : 0.09),
          borderColor: withAlpha(colorsByTone.main, compact ? 0.18 : 0.22),
        },
      ]}
    >
      <View pointerEvents="none" style={[styles.miniStatGlow, { backgroundColor: withAlpha(colorsByTone.main, 0.12) }]} />

      <View style={[styles.miniStatToneBadge, { backgroundColor: withAlpha(colorsByTone.main, 0.12) }]}>
        <View style={[styles.miniStatDot, { backgroundColor: colorsByTone.main }]} />
        <Text style={styles.miniStatLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>

      <Text style={[styles.miniStatValue, compact ? styles.miniStatValueCompact : null, { color: colorsByTone.main }]}>
        {value}
      </Text>
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
  softDecor,
  style,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle: string;
  caption: string;
  badge?: string;
  primary?: boolean;
  softDecor?: boolean;
  style?: any;
  onPress: () => void;
}) {
  const [isHover, setIsHover] = useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onHoverIn={Platform.OS === 'web' ? () => setIsHover(true) : undefined}
      onHoverOut={Platform.OS === 'web' ? () => setIsHover(false) : undefined}
      style={({ hovered, pressed }: any) => [
        styles.actionCard,
        primary ? styles.actionCardPrimary : null,
        style,
        Platform.OS === 'web' && hovered ? (primary ? styles.actionCardPrimaryHover : styles.actionCardHover) : null,
        pressed ? styles.pressableDown : null,
      ]}
    >
      {primary ? (
        <>
          <View style={styles.actionCardGlowPrimaryTop} />
          <View style={styles.actionCardGlowPrimaryBottom} />
        </>
      ) : softDecor ? (
        <>
          <View style={styles.actionCardGlowSoftTop} />
          <View style={styles.actionCardGlowSoftBottom} />
        </>
      ) : null}

      {Platform.OS === 'web' ? (
        <View
          pointerEvents="none"
          style={[
            styles.actionCardSheen,
            primary ? styles.actionCardSheenPrimary : styles.actionCardSheenSoft,
            isHover ? styles.actionCardSheenOn : null,
          ]}
        />
      ) : null}

      <View style={styles.actionCardHeader}>
        <View
          style={[
            styles.actionCardIcon,
            primary ? styles.actionCardIconPrimary : null,
            Platform.OS === 'web' && isHover ? styles.actionCardIconHover : null,
          ]}
        >
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
    backgroundColor: 'transparent',
    direction: 'rtl',
  },
  container: {
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 32,
    width: '100%',
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
  pendingBanner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    marginBottom: 18,
    borderRadius: 20,
    backgroundColor: 'rgba(254, 243, 199, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(217, 119, 6, 0.30)',
  },
  pendingBannerIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingBannerTextWrap: {
    flex: 1,
  },
  pendingBannerTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#92400E',
    textAlign: 'right',
    marginBottom: 4,
  },
  pendingBannerBody: {
    fontSize: 13,
    lineHeight: 20,
    color: '#78350F',
    textAlign: 'right',
    fontWeight: '700',
  },
  heroSection: {
    flexDirection: 'row',
    gap: 18,
    alignItems: 'stretch',
    marginBottom: 24,
  },
  heroSectionStack: {
    flexDirection: 'column',
  },
  cardPadMobile: {
    padding: 16,
    borderRadius: 22,
  },
  heroTitleMobile: {
    fontSize: 24,
    lineHeight: 30,
    marginTop: 14,
  },
  heroMetricsRowMobile: {
    flexWrap: 'wrap',
  },
  heroCountdownCardMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 14,
    padding: 14,
  },
  heroCountdownGridMobile: {
    gap: 6,
    justifyContent: 'space-between',
  },
  readinessHeroMobile: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  gaugeStatsListMobile: {
    flexDirection: 'column',
  },
  analyticsSideColumnMobile: {
    minWidth: 0,
  },
  heroMainCard: {
    flex: 1.35,
    padding: 28,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: 'rgba(255,255,255,0.98)',
    overflow: 'hidden',
    position: 'relative',
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage:
            'linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(247,250,255,0.98) 62%, rgba(242,247,255,0.98) 100%)',
          boxShadow: '0 18px 44px rgba(13,28,43,0.08)',
        } as any)
      : null),
  },
  heroSideCard: {
    flex: 0.95,
    padding: 24,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: 'rgba(255,255,255,0.96)',
    overflow: 'hidden',
    position: 'relative',
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 18px 52px rgba(13,28,43,0.08)',
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
  heroMainGlowTop: {
    position: 'absolute',
    top: -120,
    right: -80,
    width: 260,
    height: 260,
    borderRadius: 999,
    backgroundColor: 'rgba(59,130,246,0.10)',
  },
  heroMainGlowBottom: {
    position: 'absolute',
    bottom: -140,
    left: -100,
    width: 280,
    height: 280,
    borderRadius: 999,
    backgroundColor: 'rgba(240,203,70,0.10)',
  },
  heroTopBar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  heroEyebrow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(59,130,246,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.14)',
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
  heroStatusPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.16)',
  },
  heroStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#4ADE80',
  },
  heroStatusText: {
    fontSize: 12,
    fontWeight: '900',
    color: stylesVars.primary,
    textAlign: 'right',
  },
  heroTitle: {
    marginTop: 18,
    fontSize: 34,
    fontWeight: '900',
    color: stylesVars.primary,
    textAlign: 'right',
    lineHeight: 42,
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
  heroPrimaryFactsRow: {
    marginTop: 16,
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 12,
  },
  heroMetricsRow: {
    marginTop: 18,
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 12,
  },
  heroMetricCard: {
    flexGrow: 1,
    flexBasis: 170,
    minWidth: 160,
    minHeight: 112,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  heroMetricGlow: {
    position: 'absolute',
    top: -30,
    left: -10,
    width: 90,
    height: 90,
    borderRadius: 999,
  },
  heroMetricBadge: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroMetricValue: {
    marginTop: 16,
    fontSize: 28,
    fontWeight: '900',
    color: stylesVars.primary,
    textAlign: 'right',
    lineHeight: 30,
    width: '100%',
  },
  heroMetricLabel: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '900',
    color: stylesVars.primary,
    textAlign: 'right',
    width: '100%',
  },
  heroMetricCaption: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
    lineHeight: 18,
    width: '100%',
  },
  factChip: {
    minWidth: 210,
    flexGrow: 1,
    flexBasis: 220,
    minHeight: 72,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  factChipGlow: {
    position: 'absolute',
    top: -24,
    left: -8,
    width: 78,
    height: 78,
    borderRadius: 999,
  },
  factChipIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 16,
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
    fontSize: 16,
    fontWeight: '900',
    color: stylesVars.primary,
    textAlign: 'right',
    lineHeight: 22,
  },
  heroCountdownCard: {
    marginTop: 22,
    padding: 18,
    borderRadius: 24,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(15,69,230,0.20)',
    backgroundColor: 'rgba(248,250,252,0.92)',
    overflow: 'hidden',
    position: 'relative',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroCountdownHeader: {
    flexDirection: 'row',
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
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
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
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
    marginTop: 0,
    flexDirection: 'row-reverse',
    flexWrap: 'nowrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  countdownUnit: {
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  countdownUnitMobile: {
    minWidth: 0,
    flex: 1,
  },
  countdownValue: {
    fontSize: 40,
    fontWeight: '900',
    color: stylesVars.primary,
    textAlign: 'center',
    lineHeight: 44,
  },
  countdownValueMobile: {
    fontSize: 28,
    lineHeight: 32,
  },
  countdownLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'center',
  },
  countdownSeparator: {
    fontSize: 34,
    lineHeight: 44,
    fontWeight: '700',
    color: 'rgba(15,69,230,0.40)',
    textAlign: 'center',
    marginTop: 2,
  },
  countdownSeparatorMobile: {
    fontSize: 22,
    lineHeight: 32,
  },
  heroSideGlow: {
    position: 'absolute',
    top: -70,
    left: -40,
    width: 180,
    height: 180,
    borderRadius: 999,
    backgroundColor: 'rgba(59,130,246,0.04)',
  },
  sideCardHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 18,
  },
  sideCardHeader: {
    flex: 1,
    minWidth: 0,
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
  sideCardRateBadge: {
    minWidth: 86,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: 'rgba(59,130,246,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.16)',
    alignItems: 'center',
  },
  sideCardRateValue: {
    fontSize: 20,
    fontWeight: '900',
    color: stylesVars.accentBlue,
    textAlign: 'center',
  },
  sideCardRateLabel: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'center',
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
    gap: 12,
  },
  miniStatCard: {
    flexGrow: 1,
    minWidth: 0,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    overflow: 'hidden',
    position: 'relative',
  },
  miniStatCardRegular: {
    flexBasis: 180,
    minHeight: 104,
  },
  miniStatCardCompact: {
    flexBasis: 138,
    minHeight: 90,
  },
  miniStatGlow: {
    position: 'absolute',
    top: -28,
    left: -14,
    width: 86,
    height: 86,
    borderRadius: 999,
  },
  miniStatToneBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 999,
    maxWidth: '100%',
  },
  miniStatDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  miniStatValue: {
    marginTop: 16,
    fontSize: 34,
    fontWeight: '900',
    color: stylesVars.primary,
    textAlign: 'right',
    lineHeight: 38,
  },
  miniStatValueCompact: {
    fontSize: 30,
    lineHeight: 34,
  },
  miniStatLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.gray[700],
    textAlign: 'right',
    flexShrink: 1,
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
  analyticsSection: {
    gap: 14,
  },
  analyticsGrid: {
    flexDirection: 'row-reverse',
    alignItems: 'stretch',
    gap: 16,
  },
  analyticsGridStack: {
    flexDirection: 'column',
  },
  analyticsMainCard: {
    flex: 1.2,
    minWidth: 0,
    padding: 22,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: 'rgba(255,255,255,0.96)',
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 18px 48px rgba(13,28,43,0.08)',
        } as any)
      : null),
  },
  analyticsSideColumn: {
    flex: 0.9,
    minWidth: 320,
    gap: 16,
  },
  analyticsInsightCard: {
    padding: 20,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: 'rgba(255,255,255,0.96)',
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 18px 48px rgba(13,28,43,0.08)',
        } as any)
      : null),
  },
  analyticsCardHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  analyticsCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(59,130,246,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  analyticsCardHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  analyticsCardTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: stylesVars.primary,
    textAlign: 'right',
  },
  analyticsCardSubtitle: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
    lineHeight: 18,
  },
  analyticsBars: {
    gap: 16,
  },
  analyticsBarRow: {
    gap: 8,
  },
  analyticsBarRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'nowrap',
  },
  analyticsBarLabelWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  analyticsBarDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  analyticsBarLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: stylesVars.primary,
    textAlign: 'right',
  },
  analyticsBarValue: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[600],
    textAlign: 'left',
  },
  analyticsTrack: {
    height: 20,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.08)',
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
  },
  analyticsFill: {
    height: '100%',
    borderRadius: 999,
    minHeight: 20,
    paddingHorizontal: 8,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  analyticsBarPercent: {
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 14,
    color: colors.white,
    textAlign: 'right',
  },
  analyticsMiniGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  readinessHero: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.12)',
    backgroundColor: 'rgba(243,247,255,0.92)',
    marginBottom: 14,
  },
  readinessHeroGaugeWrap: {
    width: 132,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readinessHeroContent: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  readinessHeroBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(59,130,246,0.12)',
  },
  readinessHeroBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: stylesVars.accentBlue,
    textAlign: 'center',
  },
  readinessHeroTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: stylesVars.primary,
    textAlign: 'right',
  },
  readinessHeroCaption: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
    textAlign: 'right',
    lineHeight: 19,
  },
  gaugeStatsList: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
  },
  gaugeStatCard: {
    flex: 1,
    minWidth: 0,
    padding: 16,
    borderRadius: 22,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.98)',
  },
  gaugeStatTop: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  gaugeStatIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gaugeStatBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gaugeStatBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  gaugeStatBody: {
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    gap: 8,
  },
  gaugeStatMeterWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  gaugeStatLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: stylesVars.primary,
    textAlign: 'right',
  },
  gaugeStatBottom: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
  },
  gaugeStatValue: {
    fontSize: 30,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'right',
  },
  gaugeStatOutOf: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gray[500],
    textAlign: 'left',
  },
  gaugeStatHint: {
    width: '100%',
    fontSize: 11,
    fontWeight: '700',
    color: colors.gray[500],
    textAlign: 'right',
    lineHeight: 18,
  },
  actionsShell: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 16,
    alignItems: 'flex-start',
  },
  actionCardWidthQuarter: {
    width: '23.8%',
  },
  actionCardWidthHalf: {
    width: '48.8%',
  },
  actionCardWidthFull: {
    width: '100%',
  },
  actionCard: {
    flexGrow: 0,
    flexShrink: 0,
    height: 260,
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
          transitionProperty: 'transform, box-shadow, border-color',
          transitionDuration: '180ms',
          transitionTimingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
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
  actionCardGlowSoftTop: {
    position: 'absolute',
    top: -36,
    right: -28,
    width: 144,
    height: 144,
    borderRadius: 999,
    backgroundColor: 'rgba(13,28,43,0.035)',
  },
  actionCardGlowSoftBottom: {
    position: 'absolute',
    bottom: -42,
    left: -28,
    width: 164,
    height: 164,
    borderRadius: 999,
    backgroundColor: 'rgba(59,130,246,0.045)',
  },
  actionCardSheen: {
    position: 'absolute',
    top: -60,
    left: -160,
    width: 240,
    height: 520,
    opacity: 0,
    transform: [{ rotate: '18deg' }, { translateX: -40 }],
    ...(Platform.OS === 'web'
      ? ({
          transitionProperty: 'opacity, transform',
          transitionDuration: '280ms',
          transitionTimingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        } as any)
      : null),
  },
  actionCardSheenPrimary: {
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage:
            'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.14) 45%, rgba(255,255,255,0) 100%)',
        } as any)
      : null),
  },
  actionCardSheenSoft: {
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage:
            'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(59,130,246,0.10) 45%, rgba(255,255,255,0) 100%)',
        } as any)
      : null),
  },
  actionCardSheenOn: {
    opacity: 1,
    transform: [{ rotate: '18deg' }, { translateX: 520 }],
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
    ...(Platform.OS === 'web'
      ? ({
          transitionProperty: 'transform, background-color, border-color',
          transitionDuration: '180ms',
          transitionTimingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        } as any)
      : null),
  },
  actionCardIconPrimary: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  actionCardIconHover: {
    transform: [{ rotate: '-6deg' }, { scale: 1.03 }],
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
    flex: 1,
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
