import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, G } from "react-native-svg";

import { colors } from "@/constants/colors";
import { useUserStore } from "@/store/userStore";
import { userService } from "@/lib/services/userService";
import { eventService } from "@/lib/services/eventService";
import { EVENT_BADGE_META, inferEventType, type EventType } from "@/features/events/eventsConstants";
import type { Event } from "@/types";

const ui = {
  bg: colors.gray[100],
  card: colors.white,
  text: colors.text,
  muted: colors.gray[600],
  border: "rgba(0,0,0,0.06)",
  primary: colors.primary,
  accent: colors.accent,
  gold: colors.gold,
  success: colors.success,
  danger: colors.error,
};

type MonthBar = { monthIndex: number; label: string; value: number };

function monthLabelHe(monthIndex0: number) {
  const months = ["ינו", "פבר", "מרץ", "אפר", "מאי", "יונ", "יול", "אוג", "ספט", "אוק", "נוב", "דצמ"];
  return months[monthIndex0] ?? "";
}

function buildYearBars(valuesByMonth: number[]): MonthBar[] {
  return Array.from({ length: 12 }).map((_, m) => ({ monthIndex: m, label: monthLabelHe(m), value: valuesByMonth[m] ?? 0 }));
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function formatCurrencyILS(n: number) {
  try {
    return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);
  } catch {
    return `₪${Math.round(n).toLocaleString("he-IL")}`;
  }
}

function formatDateHeShort(d: Date) {
  try {
    return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit" });
  } catch {
    return d.toDateString();
  }
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function k(n: number) {
  const x = Number(n) || 0;
  if (x >= 1000) return `${Math.round(x / 100) / 10}k`;
  return `${x}`;
}

function rgbaFromHex(hex: string, alpha: number) {
  const h = String(hex || "").replace("#", "").trim();
  if (h.length !== 6) return `rgba(6,23,62,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function KpiCard({
  title,
  value,
  subtitle,
  icon,
  tone,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone?: "default" | "accent" | "gold" | "success" | "danger" | "dark";
}) {
  const isDark = tone === "dark";
  const iconBg =
    tone === "accent"
      ? "rgba(240,203,70,0.20)"
      : tone === "gold"
        ? "rgba(204,160,0,0.14)"
        : tone === "success"
          ? "rgba(76,175,80,0.16)"
          : tone === "danger"
            ? "rgba(244,67,54,0.12)"
            : "rgba(6,23,62,0.06)";
  const iconFg =
    tone === "accent"
      ? ui.gold
      : tone === "gold"
        ? ui.gold
        : tone === "success"
          ? ui.success
          : tone === "danger"
            ? ui.danger
            : ui.primary;

  return (
    <View style={[styles.kpiCard, isDark && styles.kpiCardDark]}>
      <View style={styles.kpiHeader}>
        <View style={[styles.kpiIconBox, { backgroundColor: isDark ? "rgba(255,255,255,0.10)" : iconBg }]}>
          <Ionicons name={icon} size={18} color={isDark ? "rgba(255,255,255,0.92)" : iconFg} />
        </View>
      </View>
      <Text style={[styles.kpiTitle, isDark && styles.kpiTitleDark]} numberOfLines={1}>
        {title}
      </Text>
      <Text style={[styles.kpiValue, isDark && styles.kpiValueDark]} numberOfLines={1}>
        {value}
      </Text>
      {subtitle ? (
        <Text style={[styles.kpiSubtitle, isDark && styles.kpiSubtitleDark]} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

function DonutChart({
  size,
  data,
  colors: palette,
}: {
  size: number;
  data: Array<{ label: string; value: number }>;
  colors: string[];
}) {
  const strokeWidth = Math.max(10, Math.round(size * 0.10));
  const r = Math.max(1, (size - strokeWidth) / 2);
  const cx = size / 2;
  const cy = size / 2;
  const c = 2 * Math.PI * r;
  const total = Math.max(1, data.reduce((s, d) => s + (Number(d.value) || 0), 0));

  let acc = 0;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <G rotation={-90} origin={`${cx}, ${cy}`}>
        <Circle cx={cx} cy={cy} r={r} stroke={"rgba(6,23,62,0.06)"} strokeWidth={strokeWidth} fill="transparent" />
        {data.map((d, i) => {
          const v = Math.max(0, Number(d.value) || 0);
          const len = (v / total) * c;
          const offset = acc;
          acc += len;
          const stroke = palette[i % palette.length] ?? ui.primary;
          return (
            <Circle
              key={`${d.label}-${i}`}
              cx={cx}
              cy={cy}
              r={r}
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              fill="transparent"
              strokeDasharray={`${len} ${c}`}
              strokeDashoffset={-offset}
            />
          );
        })}
      </G>
    </Svg>
  );
}

export default function AdminProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { userData, logout } = useUserStore();

  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [bars12, setBars12] = useState<MonthBar[]>([]);
  const [yearTotalEvents, setYearTotalEvents] = useState<number>(0);
  const [yearTotalGuests, setYearTotalGuests] = useState<number>(0);
  const [yearTotalBudget, setYearTotalBudget] = useState<number>(0);

  const [events, setEvents] = useState<Event[]>([]);
  const [clientsCount, setClientsCount] = useState<number>(0);

  const avatarUri = useMemo(() => {
    const direct = String(userData?.avatar_url ?? "").trim();
    if (direct) return direct;
    const seed = encodeURIComponent(userData?.email ?? "admin");
    return `https://i.pravatar.cc/256?u=${seed}`;
  }, [userData?.avatar_url, userData?.email]);

  const canPrevYear = useMemo(() => {
    if (availableYears.length === 0) return true;
    const min = Math.min(...availableYears);
    return selectedYear > min;
  }, [availableYears, selectedYear]);

  const canNextYear = useMemo(() => {
    if (availableYears.length === 0) return true;
    const max = Math.max(...availableYears);
    return selectedYear < max;
  }, [availableYears, selectedYear]);

  const performLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
      router.replace("/login");
    } catch (e) {
      Alert.alert("שגיאה", "לא ניתן להתנתק כרגע, נסה שוב.");
    } finally {
      setLoggingOut(false);
    }
  };

  const askLogout = () => {
    Alert.alert("התנתקות", "בטוח שברצונך להתנתק?", [
      { text: "ביטול", style: "cancel" },
      { text: "התנתק", style: "destructive", onPress: () => void performLogout() },
    ]);
  };

  const loadDashboard = async () => {
    if (!userData?.id) return;
    setLoading(true);
    try {
      const [clients, evs] = await Promise.all([userService.getClients(), eventService.getEvents()]);
      const allEvents = Array.isArray(evs) ? (evs as Event[]) : [];
      setEvents(allEvents);
      setClientsCount(Array.isArray(clients) ? clients.length : 0);

      // Years + monthly bars
      const years = new Set<number>();
      years.add(new Date().getFullYear());
      allEvents.forEach((e) => {
        const d = new Date((e as any).date);
        if (!Number.isFinite(d.getTime())) return;
        years.add(d.getFullYear());
      });
      const yearsSorted = Array.from(years).sort((a, b) => b - a);
      setAvailableYears(yearsSorted);

      const yearToUse = yearsSorted.includes(selectedYear) ? selectedYear : yearsSorted[0] ?? selectedYear;
      if (yearToUse !== selectedYear) setSelectedYear(yearToUse);

      const inYear = allEvents.filter((e) => {
        const d = new Date((e as any).date);
        return Number.isFinite(d.getTime()) && d.getFullYear() === yearToUse;
      });

      const eventsByMonth = Array(12).fill(0);
      inYear.forEach((e) => {
        const d = new Date((e as any).date);
        if (!Number.isFinite(d.getTime())) return;
        eventsByMonth[d.getMonth()] += 1;
      });
      const bars = buildYearBars(eventsByMonth);
      setBars12(bars);

      const totalEvents = bars.reduce((sum, b) => sum + b.value, 0);
      const totalGuests = inYear.reduce((sum, e) => sum + (Number((e as any).guests) || 0), 0);
      const totalBudget = inYear.reduce((sum, e) => sum + (Number((e as any).budget) || 0), 0);
      setYearTotalEvents(totalEvents);
      setYearTotalGuests(totalGuests);
      setYearTotalBudget(totalBudget);
    } catch (e) {
      console.error("Admin dashboard load error:", e);
      setAvailableYears([]);
      setBars12([]);
      setYearTotalEvents(0);
      setYearTotalGuests(0);
      setYearTotalBudget(0);
      setEvents([]);
      setClientsCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!userData?.id) return;
    void loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userData?.id, selectedYear]);

  const now = new Date();
  const today0 = startOfDay(now);

  const computed = useMemo(() => {
    const all = events;
    const activeEvents = all.filter((e) => new Date((e as any).date).getTime() >= today0.getTime());
    const completedEvents = all.filter((e) => new Date((e as any).date).getTime() < today0.getTime());

    const in7 = activeEvents.filter((e) => {
      const d = new Date((e as any).date);
      const diffDays = Math.ceil((d.getTime() - today0.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 7;
    });

    const nextActiveSorted = [...activeEvents].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const topActive = nextActiveSorted.slice(0, 6);

    const typesCount = new Map<string, number>();
    all.forEach((e) => {
      const t = inferEventType(String(e.title || "")) || "אחר";
      typesCount.set(t, (typesCount.get(t) || 0) + 1);
    });

    const byType = Array.from(typesCount.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    return {
      totalEvents: all.length,
      activeEventsCount: activeEvents.length,
      completedEventsCount: completedEvents.length,
      upcoming7DaysCount: in7.length,
      topActive,
      byType,
    };
  }, [events, today0]);

  const donutData = useMemo(() => {
    const main = computed.byType.filter((x) => x.count > 0).slice(0, 5);
    const total = computed.totalEvents;
    const rest = total - main.reduce((s, x) => s + x.count, 0);
    const data = [
      ...main.map((x) => ({ label: x.type, value: x.count })),
      ...(rest > 0 ? [{ label: "אחר", value: rest }] : []),
    ];
    return data.filter((d) => d.value > 0);
  }, [computed.byType, computed.totalEvents]);

  const donutSize = Math.max(168, Math.min(220, Math.floor(width * 0.52)));
  const donutPalette = ["#06173e", "#CCA000", "#F0CB46", "#003566", "#4CAF50", "#6C757D"];

  // Bottom padding for content above tab bar
  const TAB_BAR_HEIGHT = 65;
  const TAB_BAR_BOTTOM_GAP = Platform.OS === "ios" ? 30 : 20;
  const contentBottomPadding = TAB_BAR_HEIGHT + TAB_BAR_BOTTOM_GAP + 20;

  if (!userData) {
    return (
      <View style={[styles.center, { backgroundColor: ui.bg }]}>
        <ActivityIndicator size="large" color={ui.primary} />
      </View>
    );
  }

  const maxBar = Math.max(1, ...bars12.map((b) => b.value));
  const isCurrentYear = selectedYear === now.getFullYear();

  return (
    <View style={styles.root}>
      <View style={styles.bg} pointerEvents="none">
        <View style={styles.bgBlobA} />
        <View style={styles.bgBlobB} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: contentBottomPadding + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* HERO */}
        <View style={styles.heroCard}>
          <LinearGradient colors={[ui.primary, ui.gold, ui.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.heroTopLine} />
          <View style={styles.heroDecor1} pointerEvents="none" />
          <View style={styles.heroDecor2} pointerEvents="none" />

          <View style={styles.heroEditSlot} pointerEvents="box-none">
            <Pressable
              onPress={() => router.push("/profile-editor")}
              style={({ pressed }) => [styles.heroEditBtn, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
              accessibilityLabel="עריכת פרופיל"
            >
              <LinearGradient
                pointerEvents="none"
                colors={["rgba(255,255,255,0.98)", "rgba(240,203,70,0.22)", "rgba(6,23,62,0.06)"]}
                locations={[0, 0.55, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroEditBtnBg}
              />
              <Ionicons name="create-outline" size={20} color={ui.primary} />
            </Pressable>
          </View>

          <View style={styles.heroIdentity}>
            <View style={styles.avatarRing}>
              <Image source={{ uri: avatarUri }} style={styles.avatar} contentFit="cover" />
            </View>

            <View style={styles.heroTextCol}>
              <View style={styles.heroTitleRow}>
                <Text style={styles.heroName} numberOfLines={1}>
                  {String(userData.name || "מנהל")}
                </Text>
                <View style={styles.rolePill}>
                  <Ionicons name="shield-checkmark" size={14} color={ui.gold} />
                  <Text style={styles.rolePillText}>מנהל מערכת</Text>
                </View>
              </View>
              <Text style={styles.heroEmail} numberOfLines={1}>
                {String(userData.email || "")}
              </Text>
            </View>
          </View>
        </View>

        {/* KPI GRID */}
        <View style={styles.kpisGrid}>
          <KpiCard title="אירועים פעילים" value={loading ? "..." : String(computed.activeEventsCount)} subtitle="מהיום והלאה" icon="calendar-outline" tone="accent" />
          <KpiCard title="אירועים שהסתיימו" value={loading ? "..." : String(computed.completedEventsCount)} subtitle="עד אתמול" icon="checkmark-done-outline" tone="default" />
          <KpiCard title="בשבוע הקרוב" value={loading ? "..." : String(computed.upcoming7DaysCount)} subtitle="7 ימים קדימה" icon="time-outline" tone="gold" />
          <KpiCard title="לקוחות פעילים" value={loading ? "..." : String(clientsCount)} subtitle="בעלי אירוע" icon="people-outline" tone="dark" />
        </View>

        {/* EVENT TYPE BREAKDOWN */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.cardTitle}>חלוקה לפי סוג אירוע</Text>
            </View>
            <LinearGradient
              colors={["rgba(240,203,70,0.26)", "rgba(6,23,62,0.06)"]}
              start={{ x: 1, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.totalPill}
            >
              <Ionicons name="pie-chart-outline" size={14} color={ui.primary} />
              {computed.totalEvents ? (
                <View style={styles.totalPillTextRow}>
                  <Text style={styles.totalPillNumber}>{computed.totalEvents}</Text>
                  <Text style={styles.totalPillLabel}>סה״כ</Text>
                </View>
              ) : (
                <Text style={styles.totalPillEmpty}>אין נתונים</Text>
              )}
            </LinearGradient>
          </View>

          {computed.totalEvents === 0 ? (
            <View style={styles.loadingBox}>
              <Text style={styles.emptyText}>אין עדיין אירועים להצגה.</Text>
            </View>
          ) : (
            <View style={styles.typeWrap}>
              <View style={styles.typeTop}>
                <View style={styles.typeChartCard}>
                  <DonutChart size={donutSize} data={donutData} colors={["#06173e", "#CCA000", "#F0CB46", "#003566", "#4CAF50", "#6C757D"]} />
                  <View style={styles.donutCenter}>
                    <Text style={styles.donutCenterBig}>{computed.totalEvents}</Text>
                    <Text style={styles.donutCenterSmall}>אירועים</Text>
                  </View>
                </View>
              </View>

              <View style={styles.typeList}>
                {computed.byType.slice(0, 6).map((row) => {
                  const idx = Math.max(0, computed.byType.findIndex((x) => x.type === row.type));
                  const type = row.type as EventType;
                  const meta = EVENT_BADGE_META[type];
                  const iconColor = donutPalette[(idx >= 0 ? idx : 0) % donutPalette.length] ?? ui.primary;
                  return (
                    <View key={row.type} style={styles.typeItem}>
                      <View style={styles.typeItemTop}>
                        <Text style={styles.typeItemCount}>{row.count}</Text>
                        <View style={styles.typeItemRight}>
                          <View
                            style={[
                              styles.typeIconPill,
                              {
                                backgroundColor: rgbaFromHex(iconColor, 0.14),
                                borderColor: rgbaFromHex(iconColor, 0.32),
                              },
                            ]}
                          >
                            <Ionicons name={meta?.icon ?? "sparkles"} size={16} color={iconColor} />
                          </View>
                          <Text style={styles.typeItemLabel} numberOfLines={1}>
                            {row.type}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })}

                {/* הוסר: ערים מובילות / לקוחות מובילים */}
              </View>
            </View>
          )}
        </View>

        {/* MONTHLY PERFORMANCE */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.cardTitle}>ביצועים חודשיים</Text>
              <Text style={styles.cardSubtitle}>{`מס׳ אירועים לפי חודש · ${selectedYear}`}</Text>
            </View>

            <View style={styles.yearControls}>
              <Pressable
                onPress={() => setSelectedYear((y) => y - 1)}
                disabled={!canPrevYear}
                style={({ pressed }) => [styles.yearBtn, pressed && canPrevYear && styles.yearBtnPressed, !canPrevYear && { opacity: 0.4 }]}
                accessibilityRole="button"
                accessibilityLabel="שנה קודמת"
              >
                <Ionicons name="chevron-forward" size={18} color={ui.text} />
              </Pressable>

              <View style={styles.yearPill}>
                <Ionicons name="calendar-outline" size={14} color={ui.text} />
                <Text style={styles.yearPillText}>{selectedYear}</Text>
                <View style={styles.dot} />
                <Text style={styles.yearPillText}>{`סה״כ ${yearTotalEvents}`}</Text>
              </View>

              <Pressable
                onPress={() => setSelectedYear((y) => y + 1)}
                disabled={!canNextYear}
                style={({ pressed }) => [styles.yearBtn, pressed && canNextYear && styles.yearBtnPressed, !canNextYear && { opacity: 0.4 }]}
                accessibilityRole="button"
                accessibilityLabel="שנה הבאה"
              >
                <Ionicons name="chevron-back" size={18} color={ui.text} />
              </Pressable>
            </View>
          </View>

          <View style={styles.yearSummaryRow}>
            <View style={styles.yearSummaryPill}>
              <Ionicons name="people-outline" size={16} color={ui.primary} />
              <Text style={styles.yearSummaryText}>{`${yearTotalGuests.toLocaleString("he-IL")} מוזמנים`}</Text>
            </View>
            <View style={styles.yearSummaryPill}>
              <Ionicons name="cash-outline" size={16} color={ui.primary} />
              <Text style={styles.yearSummaryText}>{formatCurrencyILS(yearTotalBudget)}</Text>
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chartRow}>
            {bars12.map((b) => {
              const isCurrentMonth = isCurrentYear && b.monthIndex === now.getMonth();
              const pct = b.value === 0 ? 0 : Math.max(0.08, b.value / maxBar);
              const fillColors = isCurrentMonth ? [ui.primary, ui.gold] : ["rgba(6,23,62,0.22)", "rgba(204,160,0,0.14)"];
              return (
                <View key={`${selectedYear}-${b.monthIndex}`} style={styles.barCol}>
                  <Text style={[styles.barValue, isCurrentMonth && styles.barValueHot]}>{b.value}</Text>
                  <View style={styles.barTrack}>
                    <LinearGradient colors={fillColors} start={{ x: 0.5, y: 1 }} end={{ x: 0.5, y: 0 }} style={[styles.barFill, { height: `${Math.round(pct * 100)}%` } as any]} />
                  </View>
                  <Text style={[styles.barLabel, isCurrentMonth && styles.barLabelHot]}>{b.label}</Text>
                </View>
              );
            })}
          </ScrollView>
        </View>

        {/* ACTIVE EVENTS LIST */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.cardTitle}>אירועים פעילים</Text>
              <Text style={styles.cardSubtitle}>לחץ על כרטיס כדי לפתוח פרטי אירוע</Text>
            </View>
            <Pressable
              onPress={() => router.push("/(admin)/admin-events")}
              style={({ pressed }) => [styles.linkPill, pressed && { opacity: 0.92 }]}
              accessibilityRole="button"
              accessibilityLabel="לכל האירועים"
            >
              <Text style={styles.linkPillText}>כל האירועים</Text>
              <Ionicons name="chevron-back" size={16} color={ui.primary} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={ui.primary} />
            </View>
          ) : computed.topActive.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={34} color={colors.gray[500]} />
              <Text style={styles.emptyTitle}>לא נמצאו אירועים עתידיים</Text>
              <Text style={styles.emptyText}>צור אירוע חדש כדי להתחיל.</Text>
              <Pressable
                onPress={() => router.push("/(admin)/admin-events-create")}
                style={({ pressed }) => [styles.inlineCta, pressed && { opacity: 0.92 }]}
                accessibilityRole="button"
                accessibilityLabel="יצירת אירוע חדש"
              >
                <Ionicons name="add" size={18} color={colors.white} />
                <Text style={styles.inlineCtaText}>יצירת אירוע</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {computed.topActive.map((e) => {
                const date = new Date((e as any).date);
                const type = (inferEventType(String(e.title || "")) || "חתונה") as EventType;
                const badge = EVENT_BADGE_META[type];
                const owner = String((e as any).userName || "").trim();
                const ownerAvatar = String((e as any).userAvatarUrl || "").trim();
                return (
                  <Pressable
                    key={String(e.id)}
                    onPress={() => router.push({ pathname: "/(admin)/admin-event-details", params: { id: String(e.id) } })}
                    style={({ pressed }) => [styles.eventCard, pressed && { opacity: 0.96, transform: [{ scale: 0.995 }] }]}
                    accessibilityRole="button"
                    accessibilityLabel={`פתח אירוע ${String(e.title || "")}`}
                  >
                    <View style={styles.eventTop}>
                      <View style={styles.eventLeft}>
                        <View style={[styles.typePill, { borderColor: badge?.tint ?? "rgba(0,0,0,0.08)" }]}>
                          <Ionicons name={badge?.icon ?? "sparkles"} size={14} color={colors.white} />
                          <Text style={styles.typePillText}>{type}</Text>
                        </View>
                        <Text style={styles.eventDate}>{formatDateHeShort(date)}</Text>
                      </View>

                      <View style={styles.eventRight}>
                        <Text style={styles.eventTitle} numberOfLines={2}>
                          {String(e.title || "")}
                        </Text>
                        <View style={styles.eventMetaRow}>
                          <Text style={styles.eventMeta} numberOfLines={1}>
                            {String((e as any).location || "")}
                            {String((e as any).city || "").trim() ? `, ${(e as any).city}` : ""}
                          </Text>
                          {owner ? (
                            <View style={styles.ownerPill}>
                              <View style={styles.ownerAvatarWrap}>
                                {ownerAvatar ? (
                                  <Image source={{ uri: ownerAvatar }} style={styles.ownerAvatarImg} contentFit="cover" />
                                ) : (
                                  <Ionicons name="person" size={14} color={colors.white} />
                                )}
                              </View>
                              <Text style={styles.ownerName} numberOfLines={1}>
                                {owner}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    </View>
                    <View style={styles.eventChevron}>
                      <Ionicons name="chevron-back" size={18} color={"rgba(6,23,62,0.55)"} />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* כפתור התנתק בתחתית העמוד */}
        <View style={[styles.footerSection, { marginBottom: insets.bottom + 12 }]}>
          <View style={styles.footerPanel}>
            <Pressable
              onPress={askLogout}
              disabled={loggingOut}
              style={({ pressed }) => [
                styles.footerDangerBtn,
                (pressed || loggingOut) && styles.footerBtnPressed,
                loggingOut && { opacity: 0.7 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="התנתקות"
            >
              {loggingOut ? (
                <LinearGradient
                  colors={["#e53935", "#c62828", "#b71c1c"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.footerDangerGradient}
                >
                  <ActivityIndicator size="small" color="#FFFFFF" />
                </LinearGradient>
              ) : (
                <LinearGradient
                  colors={["#e53935", "#c62828", "#b71c1c"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.footerDangerGradient}
                >
                  <Ionicons name="log-out-outline" size={24} color="#FFFFFF" />
                  <Text style={styles.footerDangerText}>התנתק</Text>
                </LinearGradient>
              )}
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ui.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: ui.bg },
  bgBlobA: {
    position: "absolute",
    width: 520,
    height: 520,
    borderRadius: 260,
    backgroundColor: ui.primary,
    opacity: 0.06,
    top: -220,
    right: -160,
  },
  bgBlobB: {
    position: "absolute",
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: ui.gold,
    opacity: 0.08,
    top: 120,
    left: -180,
  },

  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 14, gap: 14 },

  card: {
    backgroundColor: ui.card,
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: ui.border,
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },

  heroCard: {
    backgroundColor: ui.card,
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: ui.border,
    overflow: "hidden",
    position: "relative",
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },
  heroTopLine: { position: "absolute", top: 0, left: 0, right: 0, height: 4 },
  heroDecor1: {
    position: "absolute",
    top: -80,
    right: -90,
    width: 260,
    height: 260,
    borderRadius: 999,
    backgroundColor: "rgba(204,160,0,0.10)",
  },
  heroDecor2: {
    position: "absolute",
    bottom: -110,
    left: -110,
    width: 320,
    height: 320,
    borderRadius: 999,
    backgroundColor: "rgba(6,23,62,0.05)",
  },
  heroIdentity: { flex: 1, flexDirection: "row-reverse", alignItems: "center", gap: 14, minWidth: 0 },
  heroEditSlot: {
    position: "absolute",
    left: 14,
    top: 0,
    bottom: 0,
    zIndex: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarRing: {
    width: 78,
    height: 78,
    borderRadius: 999,
    padding: 3,
    backgroundColor: "rgba(0,0,0,0.03)",
    borderWidth: 1,
    borderColor: ui.border,
  },
  avatar: { width: "100%", height: "100%", borderRadius: 999 },
  heroTextCol: { flex: 1, minWidth: 0, alignItems: "flex-end", gap: 4 },
  heroTitleRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" },
  heroName: { fontSize: 20, fontWeight: "900", color: ui.primary, textAlign: "right" },
  rolePill: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(204,160,0,0.10)",
    borderWidth: 1,
    borderColor: "rgba(204,160,0,0.18)",
  },
  rolePillText: { fontSize: 12, fontWeight: "900", color: "rgba(161,98,7,0.98)", textAlign: "right" },
  heroEmail: { fontSize: 13, fontWeight: "800", color: ui.muted, textAlign: "right" },
  heroEditBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: ui.border,
    overflow: "hidden",
    shadowColor: ui.primary,
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  heroEditBtnBg: {
    ...StyleSheet.absoluteFillObject,
  },

  kpisGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 12 },
  kpiCard: {
    flexGrow: 1,
    flexBasis: 160,
    minWidth: 150,
    borderRadius: 22,
    padding: 14,
    backgroundColor: ui.card,
    borderWidth: 1,
    borderColor: ui.border,
  },
  kpiCardDark: {
    backgroundColor: ui.primary,
    borderColor: "rgba(255,255,255,0.10)",
  },
  kpiHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  kpiIconBox: { width: 38, height: 38, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  kpiTitle: { marginTop: 10, fontSize: 12, fontWeight: "900", color: ui.muted, textAlign: "right" },
  kpiTitleDark: { color: "rgba(203,213,225,0.88)" },
  kpiValue: { marginTop: 6, fontSize: 24, fontWeight: "900", color: ui.primary, textAlign: "right" },
  kpiValueDark: { color: colors.white },
  kpiSubtitle: { marginTop: 6, fontSize: 11, fontWeight: "800", color: "rgba(100,116,139,0.95)", textAlign: "right" },
  kpiSubtitleDark: { color: "rgba(203,213,225,0.82)" },

  cardHeaderRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: "900", color: ui.primary, textAlign: "right" },
  cardSubtitle: { marginTop: 4, fontSize: 12, fontWeight: "700", color: ui.muted, textAlign: "right" },
  pill: {
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(6,23,62,0.05)",
    borderWidth: 1,
    borderColor: ui.border,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  pillText: { fontSize: 12, fontWeight: "900", color: ui.primary },
  totalPill: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(204,160,0,0.22)",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    shadowColor: ui.primary,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  totalPillTextRow: { flexDirection: "row-reverse", alignItems: "baseline", gap: 6 },
  totalPillNumber: { fontSize: 14, fontWeight: "900", color: ui.primary },
  totalPillLabel: { fontSize: 11, fontWeight: "900", color: "rgba(6,23,62,0.72)" },
  totalPillEmpty: { fontSize: 12, fontWeight: "900", color: "rgba(6,23,62,0.72)" },

  loadingBox: { height: 140, alignItems: "center", justifyContent: "center" },

  emptyState: { alignItems: "center", gap: 8, paddingVertical: 10 },
  emptyTitle: { fontSize: 15, fontWeight: "900", color: ui.primary, textAlign: "center", marginTop: 4 },
  emptyText: { fontSize: 12, fontWeight: "700", color: ui.muted, textAlign: "center", lineHeight: 18, maxWidth: 320 },
  inlineCta: {
    marginTop: 8,
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: ui.primary,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  inlineCtaText: { fontSize: 13, fontWeight: "900", color: colors.white },

  typeWrap: { gap: 14 },
  typeTop: { alignItems: "center" },
  typeChartCard: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 22,
    padding: 14,
    backgroundColor: "rgba(6,23,62,0.03)",
    borderWidth: 1,
    borderColor: ui.border,
    alignItems: "center",
    justifyContent: "center",
  },
  donutCenter: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  donutCenterBig: { fontSize: 28, fontWeight: "900", color: ui.primary },
  donutCenterSmall: { marginTop: 4, fontSize: 12, fontWeight: "800", color: ui.muted },

  typeList: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 10,
  },
  typeItem: {
    flexGrow: 1,
    flexBasis: "48%",
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: ui.border,
    padding: 12,
    gap: 10,
  },
  typeItemTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 12 },
  typeItemRight: { flexDirection: "row-reverse", alignItems: "center", gap: 10, flex: 1, minWidth: 0, justifyContent: "flex-start" },
  typeIconPill: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  typeItemLabel: { fontSize: 13, fontWeight: "900", color: ui.primary, textAlign: "right", flex: 1, minWidth: 0 },
  typeItemCount: { fontSize: 12, fontWeight: "900", color: ui.muted, width: 44, textAlign: "left" },

  miniList: { marginTop: 4, gap: 8 },
  miniTitle: { fontSize: 12, fontWeight: "900", color: ui.muted, textAlign: "right" },
  miniRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 10 },
  miniLabel: { fontSize: 12, fontWeight: "800", color: ui.primary, textAlign: "right", flex: 1, minWidth: 0 },
  miniCount: { fontSize: 12, fontWeight: "900", color: ui.muted, width: 34, textAlign: "left" },

  yearControls: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  yearBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(6,23,62,0.04)",
    borderWidth: 1,
    borderColor: ui.border,
  },
  yearBtnPressed: { opacity: 0.92, transform: [{ scale: 0.98 }] },
  yearPill: {
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(6,23,62,0.04)",
    borderWidth: 1,
    borderColor: ui.border,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  yearPillText: { fontSize: 12, fontWeight: "900", color: ui.primary },
  dot: { width: 4, height: 4, borderRadius: 99, backgroundColor: "rgba(0,0,0,0.25)" },

  yearSummaryRow: { flexDirection: "row-reverse", gap: 10, marginBottom: 10, flexWrap: "wrap" },
  yearSummaryPill: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(6,23,62,0.04)",
    borderWidth: 1,
    borderColor: ui.border,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  yearSummaryText: { fontSize: 12, fontWeight: "900", color: ui.primary },

  chartRow: { paddingTop: 8, paddingBottom: 4, paddingHorizontal: 2, gap: 12 },
  barCol: { width: 44, alignItems: "center", gap: 8 },
  barValue: { fontSize: 12, fontWeight: "900", color: ui.muted },
  barValueHot: { color: ui.primary },
  barTrack: { width: 20, height: 110, borderRadius: 999, overflow: "hidden", backgroundColor: "rgba(6,23,62,0.05)", justifyContent: "flex-end" },
  barFill: { width: "100%", borderRadius: 999 },
  barLabel: { fontSize: 12, fontWeight: "800", color: ui.muted },
  barLabelHot: { color: ui.primary },

  linkPill: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(6,23,62,0.04)",
    borderWidth: 1,
    borderColor: ui.border,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  linkPillText: { fontSize: 12, fontWeight: "900", color: ui.primary },

  eventCard: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: ui.border,
    padding: 14,
    gap: 12,
  },
  eventTop: { flexDirection: "row-reverse", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  eventRight: { flex: 1, minWidth: 0, alignItems: "flex-end", gap: 6 },
  eventTitle: { fontSize: 15, fontWeight: "900", color: ui.primary, textAlign: "right", lineHeight: 20 },
  eventMeta: { fontSize: 12, fontWeight: "700", color: ui.muted, textAlign: "right" },
  eventMetaRow: { width: "100%", flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 10 },
  ownerPill: { flexDirection: "row-reverse", alignItems: "center", gap: 8, maxWidth: 190 },
  ownerAvatarWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    overflow: "hidden",
    backgroundColor: ui.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.65)",
  },
  ownerAvatarImg: { width: "100%", height: "100%" },
  ownerName: { fontSize: 12, fontWeight: "900", color: ui.primary, textAlign: "right" },
  eventLeft: { alignItems: "flex-start", gap: 8 },
  eventDate: { fontSize: 12, fontWeight: "900", color: ui.muted, textAlign: "left" },
  typePill: {
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: ui.primary,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
  },
  typePillText: { fontSize: 12, fontWeight: "900", color: colors.white },

  eventChevron: { position: "absolute", left: 12, top: 12 },

  footerSection: {
    marginTop: 24,
    paddingHorizontal: 0,
  },
  footerPanel: {
    width: "100%",
    backgroundColor: ui.card,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: ui.border,
    shadowColor: colors.black,
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  footerDangerBtn: {
    width: "100%",
    minHeight: 62,
    height: 62,
    borderRadius: 22,
    overflow: "hidden",
    shadowColor: "#c62828",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  footerDangerGradient: {
    flex: 1,
    width: "100%",
    minHeight: 62,
    borderRadius: 22,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  footerDangerText: {
    fontSize: 18,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  footerBtnPressed: { opacity: 0.88 },
});
