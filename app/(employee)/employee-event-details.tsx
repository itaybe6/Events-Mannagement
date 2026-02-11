import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "@/constants/colors";
import { supabase } from "@/lib/supabase";
import { guestService } from "@/lib/services/guestService";
import { Event, Guest } from "@/types";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Svg, { Circle } from "react-native-svg";
import { Image } from "expo-image";
import BackSwipe from "@/components/BackSwipe";

const HERO_IMAGES = {
  baby: require("../../assets/images/baby.jpg"),
  barMitzvah: require("../../assets/images/Bar Mitzvah.jpg"),
  wedding: require("../../assets/images/wedding.jpg"),
} as const;

export default function EmployeeEventDetailsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const eventId = useMemo(
    () => (typeof id === "string" ? id : Array.isArray(id) ? id[0] : ""),
    [id]
  );

  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<Event | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [userAvatarUrl, setUserAvatarUrl] = useState<string>("");
  const [totalSeats, setTotalSeats] = useState<number>(0);
  const [tables, setTables] = useState<Array<{ id: string; capacity: number; shape: string | null }>>([]);

  const load = async () => {
    if (!eventId) {
      setEvent(null);
      setGuests([]);
      setUserAvatarUrl("");
      setTotalSeats(0);
      setTables([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [{ data: evRow, error: evError }, gs, tablesRes] = await Promise.all([
        supabase
          .from("events")
          .select(
            "id,title,date,location,city,story,guests_count,budget,groom_name,bride_name,rsvp_link,user_id,user:users(name, avatar_url)"
          )
          .eq("id", eventId)
          .maybeSingle(),
        guestService.getGuests(eventId),
        supabase.from("tables").select("id,capacity,shape").eq("event_id", eventId),
      ]);

      if (evError) throw evError;
      if (tablesRes.error) throw tablesRes.error;

      const ev: Event | null = evRow
        ? {
            id: (evRow as any).id,
            title: (evRow as any).title,
            date: new Date((evRow as any).date),
            location: String((evRow as any).location ?? ""),
            city: String((evRow as any).city ?? ""),
            image: "",
            story: String((evRow as any).story ?? ""),
            guests: Number((evRow as any).guests_count ?? 0) || 0,
            budget: Number((evRow as any).budget ?? 0) || 0,
            groomName: (evRow as any).groom_name ?? undefined,
            brideName: (evRow as any).bride_name ?? undefined,
            rsvpLink: (evRow as any).rsvp_link ?? undefined,
            tasks: [],
            user_id: (evRow as any).user_id ?? undefined,
            userName: (evRow as any).user?.name ?? undefined,
          }
        : null;

      setEvent(ev);
      setGuests(Array.isArray(gs) ? gs : []);
      setUserAvatarUrl(String((evRow as any)?.user?.avatar_url ?? ""));
      const nextTables = Array.isArray(tablesRes.data) ? (tablesRes.data as any[]) : [];
      setTables(
        nextTables.map((t) => ({
          id: String(t.id),
          capacity: Number(t.capacity) || 0,
          shape: (t.shape ?? null) as any,
        }))
      );
      setTotalSeats(
        nextTables.reduce((sum, t) => sum + (Number(t?.capacity) || 0), 0)
      );
    } catch (e) {
      console.error("Employee event details load error:", e);
      Alert.alert("שגיאה", "לא ניתן לטעון את האירוע");
      setEvent(null);
      setGuests([]);
      setUserAvatarUrl("");
      setTotalSeats(0);
      setTables([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const counts = useMemo(() => {
    const coming = guests.filter((g) => g.status === "מגיע").length;
    const pending = guests.filter((g) => g.status === "ממתין").length;
    const notComing = guests.filter((g) => g.status === "לא מגיע").length;
    return { coming, pending, notComing, total: guests.length };
  }, [guests]);

  const seatedCount = guests.filter((g) => Boolean(g.tableId)).length;
  const seatedPercent = counts.total ? Math.round((seatedCount / counts.total) * 100) : 0;
  const checkedInCount = guests.filter((g) => Boolean(g.checkedIn)).length;
  const checkedInConfirmedCount = guests.filter(
    (g) => g.status === "מגיע" && Boolean(g.checkedIn)
  ).length;
  const notConfirmedTotal = counts.pending + counts.notComing;
  const checkedInNotConfirmedCount = guests.filter(
    (g) => g.status !== "מגיע" && Boolean(g.checkedIn)
  ).length;

  const sumPeople = (rows: Array<{ numberOfPeople?: number }>) =>
    rows.reduce((sum, r) => sum + (Number(r.numberOfPeople) || 1), 0);

  const arrivedPeople = sumPeople(guests.filter((g) => Boolean(g.checkedIn)));
  const seatedArrivedPeople = sumPeople(
    guests.filter((g) => Boolean(g.checkedIn) && Boolean(g.tableId))
  );
  const arrivedNotSeatedPeople = Math.max(0, arrivedPeople - seatedArrivedPeople);
  const freeSeats = Math.max(0, (Number(totalSeats) || 0) - seatedArrivedPeople);

  const invitedPeople = sumPeople(guests);
  const confirmedPeople = sumPeople(guests.filter((g) => g.status === "מגיע"));
  const pendingPeople = sumPeople(guests.filter((g) => g.status === "ממתין"));
  const declinedPeople = sumPeople(guests.filter((g) => g.status === "לא מגיע"));

  const assignedPeopleByTableId = useMemo(() => {
    const m = new Map<string, number>();
    guests.forEach((g) => {
      const tid = g.tableId;
      if (!tid) return;
      const prev = m.get(tid) || 0;
      m.set(tid, prev + (Number(g.numberOfPeople) || 1));
    });
    return m;
  }, [guests]);

  const tableStats = useMemo(() => {
    const regular = tables.filter((t) => t.shape !== "reserve");
    const reserve = tables.filter((t) => t.shape === "reserve");

    const isFull = (t: { id: string; capacity: number }) =>
      (assignedPeopleByTableId.get(t.id) || 0) >= (Number(t.capacity) || 0);
    const isOpened = (t: { id: string }) => (assignedPeopleByTableId.get(t.id) || 0) > 0;

    const totalRegular = regular.length;
    const fullRegular = regular.filter(isFull).length;
    const notFullRegular = Math.max(0, totalRegular - fullRegular);

    const totalReserve = reserve.length;
    const openedReserve = reserve.filter(isOpened).length;

    return { totalRegular, fullRegular, notFullRegular, totalReserve, openedReserve };
  }, [assignedPeopleByTableId, tables]);

  // Keep content above the custom tab bar
  const TAB_BAR_HEIGHT = 65;
  const TAB_BAR_BOTTOM_GAP = Platform.OS === "ios" ? 30 : 20;
  const bottomReserve = TAB_BAR_HEIGHT + TAB_BAR_BOTTOM_GAP + 18;

  if (loading) {
    return (
      <BackSwipe fallbackHref="/(employee)/employee-events">
        <SafeAreaView style={[styles.center, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>טוען...</Text>
        </SafeAreaView>
      </BackSwipe>
    );
  }

  if (!eventId || !event) {
    return (
      <BackSwipe fallbackHref="/(employee)/employee-events">
        <SafeAreaView style={[styles.center, { paddingTop: insets.top, paddingHorizontal: 20 }]}>
          <Text style={styles.errorTitle}>האירוע לא נמצא</Text>
          <TouchableOpacity
            onPress={() => router.replace("/(employee)/employee-events")}
            style={styles.backBtn}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="חזרה לרשימת אירועים"
          >
            <Text style={styles.backBtnText}>חזרה</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </BackSwipe>
    );
  }

  // Color system aligned with admin screen
  const ui = {
    bg: "#F3F4F6",
    text: "#0d111c",
    muted: "#5d6b88",
    primary: "#0f45e6",
    glassBorder: "rgba(17, 24, 39, 0.08)",
    glassFill: "#FFFFFF",
  } as const;

  const getHeroImageSource = () => {
    const title = String(event?.title ?? "").toLowerCase();
    const hasBarMitzvah =
      title.includes("בר מצו") || title.includes("בר-מצו") || title.includes("bar mitz");
    const hasBaby =
      title.includes("ברית") ||
      title.includes("בריתה") ||
      title.includes("תינוק") ||
      title.includes("תינוקת") ||
      title.includes("baby") ||
      title.includes("בייבי");

    if (hasBarMitzvah) return HERO_IMAGES.barMitzvah;
    if (hasBaby) return HERO_IMAGES.baby;
    return HERO_IMAGES.wedding;
  };

  const getInitials = (name?: string) => {
    const n = String(name ?? "").trim();
    if (!n) return "";
    const parts = n.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] ?? "";
    const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
    return (first + last).toUpperCase();
  };

  const getEventTypeLabel = () => {
    const raw = String(event?.title ?? "").trim();
    if (!raw) return "אירוע";
    const parts = raw
      .split(/(?:\s*[–—-]\s*)/g)
      .map((p) => p.trim())
      .filter(Boolean);
    return parts[0] || raw;
  };

  const isWeddingEvent = () => {
    const label = getEventTypeLabel();
    return label === "חתונה" || String(event?.title ?? "").includes("חתונה");
  };

  const groomLabel = () => (event?.groomName || "").trim() || "לא הוזן";
  const brideLabel = () => (event?.brideName || "").trim() || "לא הוזן";

  const ProgressRing = ({
    size,
    strokeWidth,
    progress,
    color,
    centerText,
    label,
    valueFontSize,
  }: {
    size: number;
    strokeWidth: number;
    progress: number; // 0..1
    color: string;
    centerText: string;
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
              stroke={"rgba(17, 24, 39, 0.08)"}
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
            <Text style={[styles.ringValue, { fontSize: valueFontSize, color: ui.text }]}>{centerText}</Text>
          </View>
        </View>
        <Text style={[styles.ringLabel, { color: "rgba(17, 24, 39, 0.55)" }]}>{label}</Text>
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
    return (
      <View style={[styles.glassOuter, { borderColor: ui.glassBorder }, style]}>
        <BlurView intensity={28} tint="light" style={styles.glassBlur}>
          <View style={[styles.glassInner, { backgroundColor: ui.glassFill }]}>{children}</View>
        </BlurView>
      </View>
    );
  };

  const dateObj = new Date(event.date);
  const day = dateObj.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
  const weekday = dateObj.toLocaleDateString("he-IL", { weekday: "long" });
  const metaLine = `${weekday}, ${day} | ${String(event.location ?? "")}${event.city ? `, ${event.city}` : ""}`;

  const heroHeight = Math.max(420, Math.min(620, windowHeight * 0.62));
  const tabBarReserve = bottomReserve + insets.bottom;

  return (
    <BackSwipe fallbackHref="/(employee)/employee-events">
      <View style={[styles.safeRoot, { backgroundColor: ui.bg }]}>
        <SafeAreaView style={styles.safe}>
          {/* Background blobs */}
          <View pointerEvents="none" style={styles.bgLayer}>
            <LinearGradient
              colors={["rgba(224,231,255,0.95)", "rgba(224,231,255,0)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.blob, styles.blobLeft]}
            />
            <LinearGradient
              colors={["rgba(237,233,254,0.95)", "rgba(237,233,254,0)"]}
              start={{ x: 1, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={[styles.blob, styles.blobRight]}
            />
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.content, { paddingBottom: tabBarReserve }]}
            showsVerticalScrollIndicator={false}
          >
            {/* Hero */}
            <View style={[styles.heroStack, { height: heroHeight, paddingTop: 10 }]}>
              <View pointerEvents="none" style={styles.heroBackdrop}>
                <Image source={getHeroImageSource()} style={styles.heroBackdropImg} contentFit="cover" transition={150} />
                <LinearGradient
                  colors={["rgba(246,246,248,0.10)", "rgba(246,246,248,0.78)", ui.bg]}
                  locations={[0, 0.68, 1]}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={styles.heroBackdropFade}
                />
                <View style={styles.heroBackdropTint} />
              </View>

              <View style={styles.hero}>
                <View style={styles.heroWindowOuter}>
                  <BlurView intensity={24} tint="light" style={styles.heroWindowBlur}>
                    <View style={[styles.heroWindowInner, { backgroundColor: "rgba(255,255,255,0.78)" }]}>
                      <View style={styles.heroTopRow}>
                        <View style={styles.heroAvatarWrap}>
                          <View style={styles.heroAvatarRing}>
                            {userAvatarUrl ? (
                              <Image
                                source={{ uri: userAvatarUrl }}
                                style={styles.heroAvatar}
                                contentFit="cover"
                                transition={150}
                              />
                            ) : (
                              <View style={styles.heroAvatarFallback}>
                                {getInitials(event.userName) ? (
                                  <Text style={styles.heroAvatarInitials}>{getInitials(event.userName)}</Text>
                                ) : (
                                  <Ionicons name="person" size={18} color={"rgba(13,17,28,0.65)"} />
                                )}
                              </View>
                            )}
                          </View>
                        </View>
                      </View>

                      <View style={styles.heroTitleWrap}>
                        <Text style={[styles.heroTitleType, { color: ui.text }]}>{getEventTypeLabel()}</Text>
                        <Text style={[styles.heroTitleOwner, { color: ui.primary }]}>{`ניהול אורחים • ${counts.total} סה״כ`}</Text>
                      </View>

                      <View style={styles.heroMetaRow}>
                        <Ionicons name="calendar-outline" size={18} color={ui.muted} />
                        <Text style={[styles.heroMetaText, { color: ui.muted }]}>{metaLine}</Text>
                      </View>

                      {event.userName ? (
                        <View style={styles.heroMetaRow}>
                          <Ionicons name="person-outline" size={18} color={ui.muted} />
                          <Text style={[styles.heroMetaText, { color: ui.muted }]}>{`שם משתמש: ${event.userName}`}</Text>
                        </View>
                      ) : null}

                      {isWeddingEvent() ? (
                        <View style={styles.heroMetaRow}>
                          <Ionicons name="heart-outline" size={18} color={ui.muted} />
                          <Text style={[styles.heroMetaText, { color: ui.muted }]}>
                            {`חתן: ${groomLabel()} | כלה: ${brideLabel()}`}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </BlurView>
                </View>
              </View>
            </View>

            {/* Bottom sheet */}
            <View style={styles.sheet}>
              {/* RSVP approvals (top tile) */}
              <TouchableOpacity
                style={styles.tileWideOuter}
                activeOpacity={0.9}
                onPress={() => router.push(`/(employee)/employee-rsvp-approvals?eventId=${event.id}`)}
                accessibilityRole="button"
                accessibilityLabel="פתיחת אישורי הגעה"
              >
                <View pointerEvents="none" style={styles.tileLightDecorWrap}>
                  <View style={styles.tileLightDecorCircle} />
                  <View style={styles.tileLightDecorCircle2} />
                </View>

                <View style={styles.rsvpCardInner}>
                  <View style={styles.rsvpHeaderRow}>
                    <View style={styles.rsvpHeaderRight}>
                      <View style={styles.rsvpHeaderValueRow}>
                        <Text style={[styles.rsvpHeaderValue, { color: ui.primary }]}>{invitedPeople}</Text>
                        <Text style={styles.rsvpHeaderLabelInline}>מוזמנים לאירוע</Text>
                      </View>
                    </View>

                    <View style={styles.rsvpHeaderLeft}>
                      <View style={styles.rsvpArrowCircle}>
                        <Ionicons name="chevron-back" size={18} color={"rgba(17,24,39,0.55)"} />
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

              {/* Guest status */}
              <GlassPanel style={styles.panel}>
                <View style={styles.panelHeaderRow}>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[styles.panelTitle, { color: ui.text }]}>סטטוס אורחים</Text>
                    <Text style={styles.panelSubtitle}>{`הגיעו ${checkedInCount} מתוך ${counts.total}`}</Text>
                  </View>

                  <View style={styles.chipsRow}>
                    <View style={[styles.totalChip, { backgroundColor: "rgba(15,69,230,0.05)" }]}>
                      <Text style={[styles.totalChipText, { color: ui.primary }]}>{`${counts.total} סה״כ`}</Text>
                    </View>
                    <View style={[styles.totalChip, { backgroundColor: "rgba(52, 199, 89, 0.10)" }]}>
                      <Text style={[styles.totalChipText, { color: colors.success }]}>{`${checkedInCount} הגיעו`}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.ringsRow}>
                  <ProgressRing
                    size={92}
                    strokeWidth={10}
                    progress={counts.total ? checkedInCount / counts.total : 0}
                    color={"#34C759"}
                    centerText={`${checkedInCount}/${counts.total}`}
                    label="מתוך סה״כ"
                    valueFontSize={18}
                  />
                  <ProgressRing
                    size={68}
                    strokeWidth={9}
                    progress={counts.coming ? checkedInConfirmedCount / counts.coming : 0}
                    color={ui.primary}
                    centerText={`${checkedInConfirmedCount}/${counts.coming}`}
                    label="מתוך אישרו"
                    valueFontSize={15}
                  />
                  <ProgressRing
                    size={68}
                    strokeWidth={9}
                    progress={notConfirmedTotal ? checkedInNotConfirmedCount / notConfirmedTotal : 0}
                    color={"#FF3B30"}
                    centerText={`${checkedInNotConfirmedCount}/${notConfirmedTotal}`}
                    label="מתוך לא/ממתין"
                    valueFontSize={15}
                  />
                </View>
              </GlassPanel>

              {/* Seating stats */}
              <GlassPanel style={styles.panel}>
                <View style={styles.panelHeaderRow}>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[styles.panelTitle, { color: ui.text }]}>הושבה באולם</Text>
                    <Text style={styles.panelSubtitle}>{`קיבולת ${totalSeats} מקומות • הושבו ${seatedArrivedPeople} שהגיעו`}</Text>
                  </View>

                  <View style={styles.chipsRow}>
                    <View style={[styles.totalChip, { backgroundColor: "rgba(15,69,230,0.05)" }]}>
                      <Text style={[styles.totalChipText, { color: ui.primary }]}>{`${totalSeats} מקומות`}</Text>
                    </View>
                    <View style={[styles.totalChip, { backgroundColor: "rgba(52, 199, 89, 0.10)" }]}>
                      <Text style={[styles.totalChipText, { color: colors.success }]}>{`${seatedArrivedPeople} הושבו`}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.ringsRow}>
                  <ProgressRing
                    size={92}
                    strokeWidth={10}
                    progress={arrivedPeople ? seatedArrivedPeople / arrivedPeople : 0}
                    color={"#34C759"}
                    centerText={`${seatedArrivedPeople}/${arrivedPeople}`}
                    label="הושבו מתוך הגיעו"
                    valueFontSize={18}
                  />
                  <ProgressRing
                    size={68}
                    strokeWidth={9}
                    progress={arrivedPeople ? arrivedNotSeatedPeople / arrivedPeople : 0}
                    color={"#F97316"}
                    centerText={`${arrivedNotSeatedPeople}/${arrivedPeople}`}
                    label="הגיעו ולא הושבו"
                    valueFontSize={14}
                  />
                  <ProgressRing
                    size={68}
                    strokeWidth={9}
                    progress={totalSeats ? freeSeats / totalSeats : 0}
                    color={"#A855F7"}
                    centerText={`${freeSeats}/${totalSeats}`}
                    label="מקומות פנויים"
                    valueFontSize={14}
                  />
                </View>
              </GlassPanel>

              {/* Tables stats */}
              <GlassPanel style={styles.panel}>
                <View style={styles.panelHeaderRow}>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[styles.panelTitle, { color: ui.text }]}>שולחנות באולם</Text>
                    <Text style={styles.panelSubtitle}>
                      {`שולחנות ${tableStats.totalRegular} • רזרבה ${tableStats.totalReserve}`}
                    </Text>
                  </View>

                  <View style={styles.chipsRow}>
                    <View style={[styles.totalChip, { backgroundColor: "rgba(15,69,230,0.05)" }]}>
                      <Text style={[styles.totalChipText, { color: ui.primary }]}>{`${tableStats.totalRegular} שולחנות`}</Text>
                    </View>
                    <View style={[styles.totalChip, { backgroundColor: "rgba(168, 85, 247, 0.12)" }]}>
                      <Text style={[styles.totalChipText, { color: "#A855F7" }]}>{`${tableStats.openedReserve} רזרבה נפתחו`}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.ringsRow}>
                  <ProgressRing
                    size={76}
                    strokeWidth={9}
                    progress={tableStats.totalRegular ? tableStats.fullRegular / tableStats.totalRegular : 0}
                    color={"#34C759"}
                    centerText={`${tableStats.fullRegular}/${tableStats.totalRegular}`}
                    label="מלאים"
                    valueFontSize={15}
                  />
                  <ProgressRing
                    size={76}
                    strokeWidth={9}
                    progress={tableStats.totalRegular ? tableStats.notFullRegular / tableStats.totalRegular : 0}
                    color={"#0f45e6"}
                    centerText={`${tableStats.notFullRegular}/${tableStats.totalRegular}`}
                    label="לא מלאים"
                    valueFontSize={15}
                  />
                  <ProgressRing
                    size={76}
                    strokeWidth={9}
                    progress={tableStats.totalReserve ? tableStats.openedReserve / tableStats.totalReserve : 0}
                    color={"#A855F7"}
                    centerText={`${tableStats.openedReserve}/${tableStats.totalReserve}`}
                    label="רזרבה נפתחו"
                    valueFontSize={15}
                  />
                </View>
              </GlassPanel>

              {/* Quick actions tiles */}
              <View style={styles.tilesRow}>
                <TouchableOpacity
                  style={styles.tileDarkOuter}
                  activeOpacity={0.9}
                  onPress={() => router.push(`/(employee)/employee-seating-map?eventId=${event.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel="פתיחת מפת הושבה"
                >
                  <LinearGradient
                    colors={["#0B1020", "#111B3A"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.tileDark}
                  >
                    <View style={styles.tileTopRow}>
                      <View style={styles.tileIconBadge}>
                        <Ionicons name="grid-outline" size={18} color="#E5E7EB" />
                      </View>
                      <View style={styles.tileChevron}>
                        <Ionicons name="chevron-back" size={18} color={"rgba(229,231,235,0.85)"} />
                      </View>
                    </View>

                    <Text style={styles.tileValue}>{`${seatedPercent}%`}</Text>
                    <Text style={styles.tileLabel}>מפת הושבה</Text>
                    <Text style={styles.tileHint}>{`${seatedCount}/${counts.total} הושבו`}</Text>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.tileLightOuter}
                  activeOpacity={0.9}
                  onPress={() => router.push(`/(employee)/employee-guest-checkin?eventId=${event.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel="פתיחת הזנת מוזמנים"
                >
                  <View pointerEvents="none" style={styles.tileLightDecorWrap}>
                    <View style={styles.tileLightDecorCircle} />
                    <View style={styles.tileLightDecorCircle2} />
                  </View>

                  <View style={styles.tileTopRow}>
                    <View style={styles.tileLightIconCircle}>
                      <Ionicons name="checkmark-done-outline" size={18} color={ui.primary} />
                    </View>
                    <View style={styles.tileChevronLight}>
                      <Ionicons name="chevron-back" size={18} color={"rgba(17,24,39,0.55)"} />
                    </View>
                  </View>

                  <Text style={[styles.tileValueLight, { color: ui.text }]}>{checkedInCount}</Text>
                  <Text style={styles.tileLabelLight}>הזנת מוזמנים</Text>
                  <Text style={styles.tileHintLight}>{`${Math.max(0, counts.total - checkedInCount)} נשארו`}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    </BackSwipe>
  );
}

const styles = StyleSheet.create({
  safeRoot: { flex: 1 },
  safe: { flex: 1, backgroundColor: "transparent" },
  center: {
    flex: 1,
    backgroundColor: colors.gray[100],
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.gray[600],
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: colors.text,
    textAlign: "center",
  },
  backBtn: {
    marginTop: 14,
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
  },
  backBtnText: {
    color: colors.white,
    fontWeight: "900",
  },

  bgLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: -3,
  },
  blob: {
    position: "absolute",
    width: 520,
    height: 520,
    borderRadius: 520,
  },
  blobLeft: { top: -240, left: -280 },
  blobRight: { top: -260, right: -280 },

  scroll: { flex: 1, zIndex: 3 },
  content: {
    paddingHorizontal: 24,
    paddingTop: 0,
    paddingBottom: 80,
    gap: 16,
  },

  heroStack: {
    position: "relative",
    justifyContent: "flex-start",
    marginHorizontal: -24,
  },
  heroBackdrop: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
  heroBackdropImg: { ...StyleSheet.absoluteFillObject },
  heroBackdropFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 240,
  },
  heroBackdropTint: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,69,230,0.06)" },

  hero: {
    marginTop: 0,
    paddingTop: 10,
    paddingBottom: 4,
    alignItems: "center",
  },
  heroWindowOuter: {
    width: "100%",
    maxWidth: 560,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
    overflow: "hidden",
    shadowColor: colors.black,
    shadowOpacity: 0.10,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 16 },
    elevation: 5,
  },
  heroWindowBlur: { width: "100%" },
  heroWindowInner: { paddingHorizontal: 18, paddingVertical: 18, alignItems: "center" },
  heroTopRow: {
    width: "100%",
    flexDirection: "row-reverse",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  heroAvatarWrap: {
    position: "relative",
  },
  heroAvatarRing: {
    width: 92,
    height: 92,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "rgba(13,17,28,0.10)",
    shadowColor: colors.black,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
    overflow: "hidden",
  },
  heroAvatar: {
    width: "100%",
    height: "100%",
  },
  heroAvatarFallback: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(15,69,230,0.08)",
  },
  heroAvatarInitials: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0d111c",
  },
  heroTitleWrap: { alignItems: "center" },
  heroTitleType: {
    fontSize: 36,
    fontWeight: "900",
    lineHeight: 40,
    textAlign: "center",
    letterSpacing: -0.6,
  },
  heroTitleOwner: {
    marginTop: 6,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 22,
    textAlign: "center",
    letterSpacing: -0.2,
  },
  heroMetaRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    justifyContent: "center",
  },
  heroMetaText: { fontSize: 16, fontWeight: "500", textAlign: "center" },

  sheet: {
    marginTop: -34,
    marginHorizontal: -24,
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 24,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 34,
    borderTopRightRadius: 34,
    zIndex: 4,
    shadowColor: colors.black,
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -2 },
    elevation: 6,
    gap: 14,
  },

  glassOuter: {
    borderWidth: 1,
    borderRadius: 28,
    overflow: "hidden",
    shadowColor: colors.black,
    shadowOpacity: 0.07,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  glassBlur: { width: "100%" },
  glassInner: { padding: 18 },

  panel: {},
  panelHeaderRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    flexWrap: "wrap",
    gap: 10,
  },
  panelTitle: { fontSize: 18, fontWeight: "800", textAlign: "right" },
  panelSubtitle: { marginTop: 4, fontSize: 12, fontWeight: "800", color: "rgba(17,24,39,0.55)", textAlign: "right" },
  chipsRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-start",
    flexShrink: 0,
    // Extra breathing room so chips won't clip on the left edge (web)
    paddingLeft: 10,
    marginLeft: 6,
  },
  totalChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, flexShrink: 0 },
  totalChipText: { fontSize: 13, fontWeight: "800" },

  ringsRow: {
    flexDirection: "row-reverse",
    alignItems: "flex-end",
    justifyContent: "space-around",
    gap: 8,
  },
  ringWrap: { alignItems: "center", gap: 10 },
  ringCenter: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center" },
  ringValue: { fontWeight: "900", textAlign: "center", letterSpacing: -0.3 },
  ringLabel: { fontSize: 13, fontWeight: "600" },

  tilesRow: {
    flexDirection: "row-reverse",
    gap: 12,
    alignItems: "stretch",
  },
  tileDarkOuter: { flex: 1, height: 126 },
  tileDark: {
    flex: 1,
    borderRadius: 24,
    padding: 14,
    justifyContent: "space-between",
    shadowColor: colors.black,
    shadowOpacity: 0.20,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
    overflow: "hidden",
  },
  tileLightOuter: {
    flex: 1,
    height: 126,
    borderRadius: 24,
    padding: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(17, 24, 39, 0.06)",
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
    overflow: "hidden",
  },
  tileWideOuter: {
    width: "100%",
    minHeight: 232,
    borderRadius: 24,
    padding: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(17, 24, 39, 0.06)",
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
    overflow: "hidden",
  },
  tileLightDecorWrap: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
    borderRadius: 24,
  },
  tileLightDecorCircle: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 999,
    top: -58,
    left: -44,
    backgroundColor: "rgba(15,69,230,0.10)",
  },
  tileLightDecorCircle2: {
    position: "absolute",
    width: 90,
    height: 90,
    borderRadius: 999,
    top: -34,
    left: 32,
    backgroundColor: "rgba(15,69,230,0.06)",
  },
  tileTopRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tileIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.10)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  tileChevron: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  tileChevronLight: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: "rgba(17, 24, 39, 0.04)",
    justifyContent: "center",
    alignItems: "center",
  },
  tileValue: {
    color: "#EEF2FF",
    fontSize: 28,
    fontWeight: "900",
    textAlign: "right",
    letterSpacing: -0.6,
    marginTop: -2,
  },
  tileLabel: {
    color: "rgba(238,242,255,0.78)",
    fontSize: 13,
    fontWeight: "800",
    textAlign: "right",
    marginTop: -10,
  },
  tileHint: {
    color: "rgba(238,242,255,0.62)",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
    marginTop: -4,
  },
  tileLightIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: "rgba(15,69,230,0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  tileValueLight: {
    fontSize: 28,
    fontWeight: "900",
    textAlign: "right",
    letterSpacing: -0.6,
    marginTop: 6,
  },
  tileLabelLight: {
    fontSize: 13,
    fontWeight: "800",
    color: "rgba(17, 24, 39, 0.65)",
    textAlign: "right",
    marginTop: -6,
  },
  tileHintLight: {
    fontSize: 12,
    fontWeight: "700",
    color: "rgba(17, 24, 39, 0.52)",
    textAlign: "right",
    marginTop: 0,
  },

  // RSVP "Premium" tile (keeps blob background, upgrades inner layout)
  rsvpCardInner: { flex: 1, justifyContent: "space-between" },
  rsvpHeaderRow: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  rsvpHeaderRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  rsvpHeaderLeft: {
    alignItems: "flex-start",
    justifyContent: "flex-start",
  },
  rsvpHeaderValueRow: {
    flexDirection: "row-reverse",
    alignItems: "baseline",
    gap: 10,
  },
  rsvpHeaderValue: {
    fontSize: 54,
    fontWeight: "900",
    letterSpacing: -1.0,
    lineHeight: 56,
    textAlign: "right",
  },
  rsvpHeaderLabel: {
    fontSize: 16,
    fontWeight: "800",
    color: "rgba(17, 24, 39, 0.55)",
    textAlign: "right",
  },
  rsvpHeaderLabelInline: {
    fontSize: 16,
    fontWeight: "800",
    color: "rgba(17, 24, 39, 0.55)",
    textAlign: "right",
    // visually align with the big number, without dropping to a new line
    marginBottom: 8,
  },
  rsvpArrowCircle: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: "rgba(17, 24, 39, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(17, 24, 39, 0.06)",
    justifyContent: "center",
    alignItems: "center",
  },
  rsvpDivider: {
    height: 1,
    width: "100%",
    backgroundColor: "rgba(17, 24, 39, 0.07)",
    marginTop: 8,
    marginBottom: 10,
  },
  rsvpGrid: {
    flexDirection: "row-reverse",
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
    backgroundColor: "rgba(52, 199, 89, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(52, 199, 89, 0.18)",
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
    backgroundColor: "rgba(255, 193, 7, 0.16)",
    borderWidth: 2,
    borderColor: "rgba(255, 193, 7, 0.22)",
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
    backgroundColor: "rgba(255, 59, 48, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(255, 59, 48, 0.18)",
  },
});

