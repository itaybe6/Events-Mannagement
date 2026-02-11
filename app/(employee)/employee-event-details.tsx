import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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

type GuestStatus = Guest["status"];

const STATUS_OPTIONS: Array<{ key: GuestStatus; label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: "מגיע", label: "מגיע", color: colors.success, icon: "checkmark-circle" },
  { key: "ממתין", label: "ממתין", color: colors.warning, icon: "time" },
  { key: "לא מגיע", label: "לא מגיע", color: colors.error, icon: "close-circle" },
];

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
  const [query, setQuery] = useState("");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<GuestStatus | null>(null);

  const load = async () => {
    if (!eventId) {
      setEvent(null);
      setGuests([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [{ data: evRow, error: evError }, gs] = await Promise.all([
        supabase
          .from("events")
          .select("id,title,date,location,city,story,guests_count,budget,groom_name,bride_name,rsvp_link,user_id")
          .eq("id", eventId)
          .maybeSingle(),
        guestService.getGuests(eventId),
      ]);

      if (evError) throw evError;

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
          }
        : null;

      setEvent(ev);
      setGuests(Array.isArray(gs) ? gs : []);
    } catch (e) {
      console.error("Employee event details load error:", e);
      Alert.alert("שגיאה", "לא ניתן לטעון את האירוע");
      setEvent(null);
      setGuests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const filteredGuests = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return guests;
    return guests.filter((g) => {
      const hay = `${g.name} ${g.phone} ${g.status}`.toLowerCase();
      return hay.includes(q);
    });
  }, [guests, query]);

  const toggle = (guestId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(guestId)) next.delete(guestId);
      else next.add(guestId);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const applyStatusToSelection = async (status: GuestStatus) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      Alert.alert("שים לב", "בחר אורחים כדי לעדכן סטטוס");
      return;
    }

    setSaving(status);
    try {
      await Promise.all(ids.map((gid) => guestService.updateGuestStatus(gid, status)));
      setGuests((prev) => prev.map((g) => (selectedIds.has(g.id) ? { ...g, status } : g)));
      clearSelection();
    } catch (e) {
      console.error("Employee update status error:", e);
      Alert.alert("שגיאה", "לא ניתן לעדכן סטטוס אורחים");
    } finally {
      setSaving(null);
    }
  };

  const counts = useMemo(() => {
    const coming = guests.filter((g) => g.status === "מגיע").length;
    const pending = guests.filter((g) => g.status === "ממתין").length;
    const notComing = guests.filter((g) => g.status === "לא מגיע").length;
    return { coming, pending, notComing, total: guests.length };
  }, [guests]);

  const seatedCount = guests.filter((g) => Boolean(g.tableId)).length;
  const seatedPercent = counts.total ? Math.round((seatedCount / counts.total) * 100) : 0;
  const checkedInCount = guests.filter((g) => Boolean(g.checkedIn)).length;

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
            <Text style={[styles.ringValue, { fontSize: valueFontSize, color: ui.text }]}>{value}</Text>
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
                        <TouchableOpacity
                          style={styles.navCircle}
                          onPress={() => router.back()}
                          activeOpacity={0.85}
                          accessibilityRole="button"
                          accessibilityLabel="חזרה"
                        >
                          <Ionicons name="chevron-back" size={22} color={ui.primary} />
                        </TouchableOpacity>
                      </View>

                      <View style={styles.heroTitleWrap}>
                        <Text style={[styles.heroTitleType, { color: ui.text }]}>{getEventTypeLabel()}</Text>
                        <Text style={[styles.heroTitleOwner, { color: ui.primary }]}>{`ניהול אורחים • ${counts.total} סה״כ`}</Text>
                      </View>

                      <View style={styles.heroMetaRow}>
                        <Ionicons name="calendar-outline" size={18} color={ui.muted} />
                        <Text style={[styles.heroMetaText, { color: ui.muted }]}>{metaLine}</Text>
                      </View>

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
              {/* Guest status */}
              <GlassPanel style={styles.panel}>
                <View style={styles.panelHeaderRow}>
                  <Text style={[styles.panelTitle, { color: ui.text }]}>סטטוס אורחים</Text>
                  <View style={[styles.totalChip, { backgroundColor: "rgba(15,69,230,0.05)" }]}>
                    <Text style={[styles.totalChipText, { color: ui.primary }]}>{`${counts.total} סה״כ`}</Text>
                  </View>
                </View>

                <View style={styles.ringsRow}>
                  <ProgressRing
                    size={84}
                    strokeWidth={9}
                    progress={counts.total ? counts.coming / counts.total : 0}
                    color={"#34C759"}
                    value={counts.coming}
                    label="אישרו"
                    valueFontSize={20}
                  />
                  <ProgressRing
                    size={68}
                    strokeWidth={9}
                    progress={counts.total ? counts.pending / counts.total : 0}
                    color={ui.primary}
                    value={counts.pending}
                    label="אולי"
                    valueFontSize={18}
                  />
                  <ProgressRing
                    size={68}
                    strokeWidth={9}
                    progress={counts.total ? counts.notComing / counts.total : 0}
                    color={"#FF3B30"}
                    value={counts.notComing}
                    label="לא"
                    valueFontSize={18}
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

              {/* Search + bulk */}
              <GlassPanel style={styles.panel}>
                <View style={styles.searchRow}>
                  <Ionicons name="search" size={18} color={"rgba(17,24,39,0.55)"} />
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="חיפוש אורח..."
                    placeholderTextColor={"rgba(17,24,39,0.35)"}
                    style={styles.searchInput}
                    textAlign="right"
                    returnKeyType="search"
                  />
                </View>

                <View style={styles.bulkHeader2}>
                  <Text style={styles.bulkTitle}>עדכון סטטוס</Text>
                  <Text style={styles.bulkSubtitle}>{`נבחרו ${selectedIds.size} אורחים`}</Text>
                </View>

                <View style={styles.bulkButtonsRow}>
                  {STATUS_OPTIONS.map((opt) => {
                    const isBusy = saving !== null;
                    const isThisBusy = saving === opt.key;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        style={[
                          styles.bulkBtn,
                          { backgroundColor: opt.color },
                          isBusy && !isThisBusy ? { opacity: 0.6 } : null,
                        ]}
                        onPress={() => applyStatusToSelection(opt.key)}
                        disabled={isBusy}
                        activeOpacity={0.9}
                        accessibilityRole="button"
                        accessibilityLabel={`עדכון סטטוס לנבחרים: ${opt.label}`}
                      >
                        {isThisBusy ? (
                          <ActivityIndicator color={colors.white} />
                        ) : (
                          <Ionicons name={opt.icon} size={18} color={colors.white} />
                        )}
                        <Text style={styles.bulkBtnText}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TouchableOpacity
                  onPress={clearSelection}
                  style={[styles.clearBtn, selectedIds.size === 0 ? { opacity: 0.5 } : null]}
                  disabled={selectedIds.size === 0}
                  accessibilityRole="button"
                  accessibilityLabel="נקה בחירה"
                >
                  <Ionicons name="close" size={16} color={"rgba(17,24,39,0.70)"} />
                  <Text style={styles.clearBtnText}>נקה בחירה</Text>
                </TouchableOpacity>
              </GlassPanel>

              {/* Guests list */}
              <View style={styles.listWrap}>
                {filteredGuests.map((g) => {
                  const selected = selectedIds.has(g.id);
                  const statusMeta = STATUS_OPTIONS.find((o) => o.key === g.status);
                  return (
                    <TouchableOpacity
                      key={g.id}
                      style={[styles.guestCard, selected && styles.guestCardSelected]}
                      onPress={() => toggle(g.id)}
                      activeOpacity={0.9}
                      accessibilityRole="button"
                      accessibilityLabel={`בחירת אורח ${g.name}`}
                    >
                      <View style={styles.guestLeft}>
                        <Ionicons
                          name={selected ? "checkbox" : "square-outline"}
                          size={22}
                          color={selected ? ui.primary : "rgba(17,24,39,0.45)"}
                        />
                      </View>

                      <View style={styles.guestMain}>
                        <Text style={[styles.guestName, { color: ui.text }]} numberOfLines={1}>
                          {g.name}
                        </Text>
                        <Text style={styles.guestPhone} numberOfLines={1}>
                          {g.phone}
                        </Text>
                      </View>

                      <View style={[styles.statusPill, statusMeta ? { borderColor: statusMeta.color } : null]}>
                        {statusMeta ? (
                          <>
                            <Ionicons name={statusMeta.icon} size={16} color={statusMeta.color} />
                            <Text style={[styles.statusText, { color: statusMeta.color }]}>{g.status}</Text>
                          </>
                        ) : (
                          <Text style={styles.statusText}>{g.status}</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}

                {filteredGuests.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <Ionicons name="people-outline" size={42} color={"rgba(17,24,39,0.45)"} />
                    <Text style={styles.emptyTitle}>לא נמצאו אורחים</Text>
                    <Text style={styles.emptyText}>נסה לשנות את החיפוש</Text>
                  </View>
                ) : null}
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
    justifyContent: "flex-start",
    marginBottom: 12,
  },
  navCircle: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "rgba(13,17,28,0.10)",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: colors.black,
    shadowOpacity: 0.10,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
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
  },
  panelTitle: { fontSize: 18, fontWeight: "800", textAlign: "right" },
  totalChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  totalChipText: { fontSize: 13, fontWeight: "800" },

  ringsRow: {
    flexDirection: "row-reverse",
    alignItems: "flex-end",
    justifyContent: "space-around",
    gap: 8,
  },
  ringWrap: { alignItems: "center", gap: 10 },
  ringCenter: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center" },
  ringValue: { fontWeight: "900" },
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

  searchRow: {
    height: 54,
    borderRadius: 18,
    paddingHorizontal: 14,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(17,24,39,0.10)",
    backgroundColor: "rgba(17,24,39,0.04)",
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },

  bulkHeader2: {
    marginTop: 14,
    flexDirection: "row-reverse",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  bulkTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: colors.text,
    textAlign: "right",
  },
  bulkSubtitle: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.gray[600],
    textAlign: "left",
  },
  bulkButtonsRow: {
    flexDirection: "row-reverse",
    gap: 10,
  },
  bulkBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  bulkBtnText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "900",
  },
  clearBtn: {
    marginTop: 12,
    alignSelf: "flex-end",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.04)",
  },
  clearBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.gray[700],
  },

  listWrap: { gap: 10, marginTop: 2 },
  guestCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(17, 24, 39, 0.06)",
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  guestCardSelected: {
    borderColor: "rgba(15,69,230,0.22)",
    backgroundColor: "rgba(15,69,230,0.05)",
  },
  guestLeft: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  guestMain: {
    flex: 1,
    alignItems: "flex-end",
    gap: 2,
  },
  guestName: {
    fontSize: 15,
    fontWeight: "900",
    textAlign: "right",
  },
  guestPhone: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.gray[600],
    textAlign: "right",
  },
  statusPill: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "900",
    textAlign: "right",
    color: colors.gray[800],
  },
  emptyCard: {
    marginTop: 24,
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 18,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  emptyTitle: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: "900",
    color: colors.text,
    textAlign: "center",
  },
  emptyText: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "700",
    color: colors.gray[600],
    textAlign: "center",
  },
});

