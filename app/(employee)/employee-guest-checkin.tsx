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
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "@/constants/colors";
import { guestService } from "@/lib/services/guestService";
import { Guest, GuestCategory } from "@/types";
import BackSwipe from "@/components/BackSwipe";

type CheckInFilter = "all" | "checked_in" | "not_checked_in";
type GuestWithCategory = Guest & { categoryName: string };

export default function EmployeeGuestCheckInScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();

  const resolvedEventId = useMemo(() => String(eventId || "").trim(), [eventId]);
  const fallbackToDetails = useMemo(
    () =>
      resolvedEventId
        ? `/(employee)/employee-event-details?id=${resolvedEventId}`
        : "/(employee)/employee-events",
    [resolvedEventId]
  );

  const [loading, setLoading] = useState(true);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [categories, setCategories] = useState<GuestCategory[]>([]);
  const [query, setQuery] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<CheckInFilter>("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const load = async () => {
    if (!resolvedEventId) {
      setGuests([]);
      setCategories([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [data, cats] = await Promise.all([
        guestService.getGuests(resolvedEventId),
        guestService.getGuestCategories(resolvedEventId),
      ]);
      setGuests(Array.isArray(data) ? data : []);
      setCategories(Array.isArray(cats) ? (cats as any) : []);
    } catch (e) {
      console.error("Employee check-in load error:", e);
      Alert.alert("שגיאה", "לא ניתן לטעון את רשימת האורחים");
      setGuests([]);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedEventId]);

  const filteredGuests = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = guests.filter((g) => {
      if (filter === "checked_in") return Boolean(g.checkedIn);
      if (filter === "not_checked_in") return !Boolean(g.checkedIn);
      return true;
    });
    if (!q) return base;
    return base.filter((g) => `${g.name} ${g.phone} ${g.status}`.toLowerCase().includes(q));
  }, [guests, query, filter]);

  const counts = useMemo(() => {
    const checkedIn = guests.filter((g) => Boolean(g.checkedIn)).length;
    return {
      total: guests.length,
      checkedIn,
    };
  }, [guests]);

  const categoryNameById = useMemo(() => {
    const m = new Map<string, string>();
    categories.forEach((c) => {
      if (c?.id) m.set(String(c.id), String(c.name || "").trim() || "ללא קטגוריה");
    });
    return m;
  }, [categories]);

  const guestsWithCategory = useMemo<GuestWithCategory[]>(() => {
    return filteredGuests.map((g) => ({
      ...g,
      categoryName: g.category_id ? categoryNameById.get(String(g.category_id)) || "ללא קטגוריה" : "ללא קטגוריה",
    }));
  }, [filteredGuests, categoryNameById]);

  const sections = useMemo(() => {
    // Order categories as created, then "ללא קטגוריה" if needed.
    const order: string[] = categories.map((c) => String(c.name || "").trim() || "ללא קטגוריה");
    const grouped = new Map<string, GuestWithCategory[]>();
    guestsWithCategory.forEach((g) => {
      const key = g.categoryName || "ללא קטגוריה";
      const prev = grouped.get(key) || [];
      prev.push(g);
      grouped.set(key, prev);
    });

    const hasUncategorized = grouped.has("ללא קטגוריה") && !order.includes("ללא קטגוריה");
    const finalOrder = hasUncategorized ? [...order, "ללא קטגוריה"] : order;
    const inOrder = new Set(finalOrder);
    const extra = Array.from(grouped.keys()).filter((k) => !inOrder.has(k)).sort((a, b) => a.localeCompare(b, "he"));

    const names = [...finalOrder, ...extra].filter((n) => grouped.has(n));
    return names.map((name) => {
      const data = grouped.get(name) || [];
      const checkedIn = data.filter((g) => Boolean(g.checkedIn)).length;
      return { name, data, checkedIn, total: data.length };
    });
  }, [categories, guestsWithCategory]);

  const toggleCollapsed = (name: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleCheckIn = async (guest: Guest) => {
    const next = !Boolean(guest.checkedIn);
    setSavingId(guest.id);
    try {
      const updated = await guestService.setGuestCheckedIn(guest.id, next);
      setGuests((prev) => prev.map((g) => (g.id === guest.id ? { ...g, ...updated } : g)));
    } catch (e) {
      console.error("Check-in update error:", e);
      Alert.alert("שגיאה", "לא ניתן לעדכן הגעה");
    } finally {
      setSavingId(null);
    }
  };

  // Keep content above the custom tab bar
  const TAB_BAR_HEIGHT = 65;
  const TAB_BAR_BOTTOM_GAP = Platform.OS === "ios" ? 30 : 20;
  const bottomReserve = TAB_BAR_HEIGHT + TAB_BAR_BOTTOM_GAP + 18;

  if (loading) {
    return (
      <BackSwipe fallbackHref={fallbackToDetails}>
        <SafeAreaView style={[styles.center, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>טוען...</Text>
        </SafeAreaView>
      </BackSwipe>
    );
  }

  if (!resolvedEventId) {
    return (
      <BackSwipe fallbackHref="/(employee)/employee-events">
        <SafeAreaView style={[styles.center, { paddingTop: insets.top, paddingHorizontal: 20 }]}>
          <Text style={styles.errorTitle}>חסר מזהה אירוע</Text>
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

  return (
    <BackSwipe fallbackHref={fallbackToDetails}>
      <SafeAreaView style={[styles.screen, { paddingTop: insets.top }]}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={() => router.replace(fallbackToDetails)}
            style={styles.topIconBtn}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="חזרה"
          >
            <Ionicons name="chevron-back" size={24} color={colors.primary} />
          </TouchableOpacity>

          <View style={styles.topCenter}>
            <Text style={styles.topTitle} numberOfLines={1}>
              הזנת מוזמנים
            </Text>
            <Text style={styles.topSubtitle} numberOfLines={1}>
              {`${counts.checkedIn}/${counts.total} הגיעו`}
            </Text>
          </View>

          <TouchableOpacity
            onPress={load}
            style={styles.topIconBtn}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="רענון"
          >
            <Ionicons name="refresh" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: bottomReserve + insets.bottom }]}
        >
          {/* Search */}
          <View style={styles.searchCard}>
            <Text>
              <Ionicons name="search" size={18} color={colors.gray[500]} />
            </Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="חיפוש שם או טלפון..."
              placeholderTextColor={colors.gray[500]}
              style={styles.searchInput}
              textAlign="right"
              returnKeyType="search"
            />
          </View>

          {/* Filters */}
          <View style={styles.filtersRow}>
            {[
              { key: "all" as const, label: "הכל" },
              { key: "checked_in" as const, label: "הגיעו" },
              { key: "not_checked_in" as const, label: "לא הגיעו" },
            ].map((opt) => {
              const active = filter === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setFilter(opt.key)}
                  activeOpacity={0.9}
                  accessibilityRole="button"
                  accessibilityLabel={`סינון: ${opt.label}`}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Categories */}
          <View style={{ gap: 12, marginTop: 12 }}>
            {sections.map((sec) => {
              const isCollapsed = collapsed.has(sec.name);
              const pct = sec.total ? Math.round((sec.checkedIn / sec.total) * 100) : 0;
              return (
                <View key={sec.name} style={styles.categoryCard}>
                  <TouchableOpacity
                    style={styles.categoryHeader}
                    onPress={() => toggleCollapsed(sec.name)}
                    activeOpacity={0.9}
                    accessibilityRole="button"
                    accessibilityLabel={`קטגוריה ${sec.name}`}
                  >
                    <View style={styles.categoryHeaderLeft}>
                      <View style={styles.categoryCountPill}>
                        <Text style={styles.categoryCountText}>{`${sec.checkedIn}/${sec.total}`}</Text>
                      </View>
                      <View style={styles.categoryPctPill}>
                        <Text style={styles.categoryPctText}>{`${pct}%`}</Text>
                      </View>
                      <Ionicons
                        name={isCollapsed ? "chevron-down" : "chevron-up"}
                        size={18}
                        color={"rgba(17,24,39,0.55)"}
                      />
                    </View>

                    <View style={styles.categoryHeaderRight}>
                      <Text style={styles.categoryTitle} numberOfLines={1}>
                        {sec.name}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {!isCollapsed ? (
                    <View style={{ gap: 10, marginTop: 12 }}>
                      {sec.data.map((g) => {
                        const checkedIn = Boolean(g.checkedIn);
                        const isSaving = savingId === g.id;
                        return (
                          <View key={g.id} style={[styles.guestRow, checkedIn && styles.guestRowChecked]}>
                            <TouchableOpacity
                              onPress={() => toggleCheckIn(g)}
                              style={[styles.checkInPill, checkedIn ? styles.checkInPillOn : styles.checkInPillOff]}
                              activeOpacity={0.9}
                              disabled={isSaving}
                              accessibilityRole="button"
                              accessibilityLabel={checkedIn ? `סמן שלא הגיע: ${g.name}` : `סמן שהגיע: ${g.name}`}
                            >
                              {isSaving ? (
                                <ActivityIndicator color={checkedIn ? colors.white : colors.primary} />
                              ) : (
                                <Ionicons
                                  name={checkedIn ? "checkmark-circle" : "ellipse-outline"}
                                  size={16}
                                  color={checkedIn ? colors.white : colors.primary}
                                />
                              )}
                              <Text style={[styles.checkInText, checkedIn ? { color: colors.white } : { color: colors.primary }]}>
                                הגיע
                              </Text>
                            </TouchableOpacity>

                            <View style={styles.guestMain}>
                              <Text style={styles.guestName} numberOfLines={1}>
                                {g.name}
                              </Text>
                              <View style={styles.guestMetaRow}>
                                <Text style={styles.guestPhone} numberOfLines={1}>
                                  {g.phone}
                                </Text>
                                <View style={styles.peoplePill}>
                                  <Ionicons name="person" size={12} color={"rgba(17,24,39,0.65)"} />
                                  <Text style={styles.peopleText}>{Number(g.numberOfPeople) || 1}</Text>
                                </View>
                              </View>
                            </View>

                            <View
                              style={[
                                styles.statusPill,
                                g.status === "מגיע"
                                  ? styles.statusComing
                                  : g.status === "לא מגיע"
                                  ? styles.statusNot
                                  : styles.statusPending,
                              ]}
                            >
                              <Text style={styles.statusText}>{g.status}</Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              );
            })}

            {sections.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="people-outline" size={42} color={colors.gray[500]} />
                <Text style={styles.emptyTitle}>לא נמצאו אורחים</Text>
                <Text style={styles.emptyText}>נסה לשנות את החיפוש או הפילטר</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    </BackSwipe>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.gray[100] },
  center: { flex: 1, backgroundColor: colors.gray[100], alignItems: "center", justifyContent: "center", gap: 10 },
  loadingText: { fontSize: 14, fontWeight: "700", color: colors.gray[600] },
  errorTitle: { fontSize: 16, fontWeight: "900", color: colors.text, textAlign: "center" },
  backBtn: { marginTop: 14, backgroundColor: colors.primary, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14 },
  backBtnText: { color: colors.white, fontWeight: "900" },

  topBar: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  topCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  topTitle: { fontSize: 16, fontWeight: "900", color: colors.text },
  topSubtitle: { marginTop: 2, fontSize: 12, fontWeight: "800", color: colors.gray[600], textAlign: "center" },

  content: { padding: 16, paddingTop: 6 },

  searchCard: {
    marginTop: 8,
    height: 54,
    borderRadius: 22,
    paddingHorizontal: 14,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  searchInput: { flex: 1, fontSize: 15, fontWeight: "700", color: colors.text },

  filtersRow: {
    marginTop: 12,
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 10,
  },
  filterChip: {
    backgroundColor: "rgba(0,0,0,0.04)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  filterChipActive: {
    backgroundColor: "rgba(17, 82, 212, 0.10)",
    borderColor: "rgba(17, 82, 212, 0.22)",
  },
  filterChipText: { fontSize: 12, fontWeight: "900", color: colors.gray[800] },
  filterChipTextActive: { color: colors.primary },

  categoryCard: {
    backgroundColor: colors.white,
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  categoryHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  categoryHeaderRight: { flex: 1, alignItems: "flex-end" },
  categoryTitle: { fontSize: 16, fontWeight: "900", color: colors.text, textAlign: "right" },
  categoryHeaderLeft: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  categoryCountPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(17, 82, 212, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(17, 82, 212, 0.16)",
  },
  categoryCountText: { fontSize: 12, fontWeight: "900", color: colors.primary },
  categoryPctPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(52, 199, 89, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(52, 199, 89, 0.20)",
  },
  categoryPctText: { fontSize: 12, fontWeight: "900", color: colors.success },

  guestRow: {
    backgroundColor: colors.white,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
  },
  guestRowChecked: {
    borderColor: "rgba(52, 199, 89, 0.22)",
    backgroundColor: "rgba(52, 199, 89, 0.06)",
  },
  guestMain: { flex: 1, alignItems: "flex-end", gap: 2 },
  guestName: { fontSize: 15, fontWeight: "900", color: colors.text, textAlign: "right" },
  guestPhone: { fontSize: 13, fontWeight: "700", color: colors.gray[600], textAlign: "right" },
  guestMetaRow: { width: "100%", flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  peoplePill: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.04)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  peopleText: { fontSize: 12, fontWeight: "900", color: "rgba(17,24,39,0.70)" },

  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 74,
    alignItems: "center",
  },
  statusText: { fontSize: 12, fontWeight: "900", color: colors.text },
  statusComing: { backgroundColor: "rgba(52, 199, 89, 0.10)", borderColor: "rgba(52, 199, 89, 0.22)" },
  statusPending: { backgroundColor: "rgba(255, 193, 7, 0.10)", borderColor: "rgba(255, 193, 7, 0.22)" },
  statusNot: { backgroundColor: "rgba(255, 59, 48, 0.08)", borderColor: "rgba(255, 59, 48, 0.22)" },

  checkInPill: {
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 999,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    minWidth: 84,
  },
  checkInPillOn: { backgroundColor: colors.success, borderColor: "rgba(0,0,0,0.08)" },
  checkInPillOff: { backgroundColor: "rgba(17, 82, 212, 0.06)", borderColor: "rgba(17, 82, 212, 0.22)" },
  checkInText: { fontSize: 12, fontWeight: "900" },

  emptyCard: {
    marginTop: 24,
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 18,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  emptyTitle: { marginTop: 10, fontSize: 16, fontWeight: "900", color: colors.text, textAlign: "center" },
  emptyText: { marginTop: 6, fontSize: 13, fontWeight: "700", color: colors.gray[600], textAlign: "center" },
});

