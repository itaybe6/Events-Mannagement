import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
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

type StatusFilter = "all" | Guest["status"];
type GuestWithCategory = Guest & { categoryName: string };

const sanitizePhone = (raw: string) => (raw || "").replace(/[^\d+]/g, "");

export default function EmployeeRsvpApprovalsScreen() {
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
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
      const [gs, cats] = await Promise.all([
        guestService.getGuests(resolvedEventId),
        guestService.getGuestCategories(resolvedEventId),
      ]);
      setGuests(Array.isArray(gs) ? gs : []);
      setCategories(Array.isArray(cats) ? (cats as any) : []);
    } catch (e) {
      console.error("Employee RSVP approvals load error:", e);
      Alert.alert("שגיאה", "לא ניתן לטעון את המוזמנים");
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

  const categoryNameById = useMemo(() => {
    const m = new Map<string, string>();
    categories.forEach((c) => {
      if (c?.id) m.set(String(c.id), String(c.name || "").trim() || "ללא קטגוריה");
    });
    return m;
  }, [categories]);

  const filteredGuests = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = guests.filter((g) => (statusFilter === "all" ? true : g.status === statusFilter));
    if (!q) return base;
    return base.filter((g) => `${g.name} ${g.phone} ${g.status}`.toLowerCase().includes(q));
  }, [guests, query, statusFilter]);

  const stats = useMemo(() => {
    const total = guests.length;
    const coming = guests.filter((g) => g.status === "מגיע").length;
    const pending = guests.filter((g) => g.status === "ממתין").length;
    const notComing = guests.filter((g) => g.status === "לא מגיע").length;
    return { total, coming, pending, notComing };
  }, [guests]);

  const guestsWithCategory = useMemo<GuestWithCategory[]>(() => {
    return filteredGuests.map((g) => ({
      ...g,
      categoryName: g.category_id ? categoryNameById.get(String(g.category_id)) || "ללא קטגוריה" : "ללא קטגוריה",
    }));
  }, [filteredGuests, categoryNameById]);

  const sections = useMemo(() => {
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
    return names.map((name) => ({ name, data: grouped.get(name) || [] }));
  }, [categories, guestsWithCategory]);

  const toggleCollapsed = (name: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const callGuest = async (phone: string) => {
    const p = sanitizePhone(phone);
    if (!p) return;
    try {
      await Linking.openURL(`tel:${p}`);
    } catch (e) {
      console.error("Call openURL error:", e);
      Alert.alert("שגיאה", "לא ניתן לפתוח שיחה");
    }
  };

  const setStatus = async (guestId: string, status: Guest["status"]) => {
    setSavingId(guestId);
    try {
      await guestService.updateGuestStatus(guestId, status);
      setGuests((prev) => prev.map((g) => (g.id === guestId ? { ...g, status } : g)));
      setEditingId(null);
    } catch (e) {
      console.error("Update RSVP status error:", e);
      Alert.alert("שגיאה", "לא ניתן לעדכן סטטוס");
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
        <ScrollView
          showsVerticalScrollIndicator={false}
          stickyHeaderIndices={[0]}
          contentContainerStyle={{ paddingBottom: bottomReserve + insets.bottom }}
        >
          {/* Sticky header (inspired by provided design) */}
          <View style={styles.headerSticky}>
            {/* Stats pills (also filter) */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pillsRow}
              style={{ marginBottom: 12 }}
            >
              <TouchableOpacity
                onPress={() => setStatusFilter("all")}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityLabel="סינון: הכל"
                style={[styles.pillBase, statusFilter === "all" && styles.pillActiveAll]}
              >
                <Text style={[styles.pillTextBase, statusFilter === "all" && styles.pillTextActiveAll]}>
                  {`${stats.total} סה״כ`}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setStatusFilter("מגיע")}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityLabel="סינון: אישרו"
                style={[styles.pillPrimary, statusFilter === "מגיע" && styles.pillActivePrimary]}
              >
                <Text style={[styles.pillTextPrimary, statusFilter === "מגיע" && styles.pillTextActivePrimary]}>
                  {`${stats.coming} אישרו`}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setStatusFilter("ממתין")}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityLabel="סינון: ממתינים"
                style={[styles.pillPending, statusFilter === "ממתין" && styles.pillActivePending]}
              >
                <Text style={[styles.pillTextPending, statusFilter === "ממתין" && styles.pillTextActivePending]}>
                  {`${stats.pending} ממתינים`}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setStatusFilter("לא מגיע")}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityLabel="סינון: לא מגיעים"
                style={[styles.pillDeclined, statusFilter === "לא מגיע" && styles.pillActiveDeclined]}
              >
                <Text style={[styles.pillTextDeclined, statusFilter === "לא מגיע" && styles.pillTextActiveDeclined]}>
                  {`${stats.notComing} לא מגיעים`}
                </Text>
              </TouchableOpacity>
            </ScrollView>

            {/* Search */}
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={18} color={colors.gray[500]} style={styles.searchIcon} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="חיפוש מוזמנים..."
                placeholderTextColor={colors.gray[500]}
                style={styles.searchInputNew}
                textAlign="right"
                returnKeyType="search"
              />
            </View>

            {/* Tabs */}
            <View style={styles.tabsRow}>
              {[
                { key: "all" as const, label: "הכל" },
                { key: "מגיע" as const, label: "אישרו" },
                { key: "ממתין" as const, label: "ממתינים" },
                { key: "לא מגיע" as const, label: "לא מגיעים" },
              ].map((t) => {
                const active = statusFilter === t.key;
                return (
                  <TouchableOpacity
                    key={t.key}
                    onPress={() => setStatusFilter(t.key)}
                    activeOpacity={0.9}
                    accessibilityRole="button"
                    accessibilityLabel={`טאב סינון: ${t.label}`}
                    style={[styles.tabBtn, active && styles.tabBtnActive]}
                  >
                    <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* List content */}
          <View style={styles.body}>
            {sections.map((sec) => {
              const isCollapsed = collapsed.has(sec.name);
              return (
                <View key={sec.name} style={styles.section}>
                  <TouchableOpacity
                    style={styles.sectionHeader}
                    onPress={() => toggleCollapsed(sec.name)}
                    activeOpacity={0.9}
                    accessibilityRole="button"
                    accessibilityLabel={`קטגוריה ${sec.name}`}
                  >
                    <Text style={styles.sectionTitle} numberOfLines={1}>
                      {`${sec.name} (${sec.data.length})`}
                    </Text>
                    <Ionicons
                      name={isCollapsed ? "chevron-down" : "chevron-up"}
                      size={18}
                      color={colors.gray[500]}
                      style={{ marginRight: 6 }}
                    />
                  </TouchableOpacity>

                  {!isCollapsed ? (
                    <View>
                      {sec.data.map((g) => {
                        const isSaving = savingId === g.id;
                        const phoneOk = Boolean(sanitizePhone(g.phone));
                        // Guest status badge should be singular (Hebrew)
                        const badgeLabel = g.status; // "מגיע" | "ממתין" | "לא מגיע"
                        const isEditing = editingId === g.id;
                        const showActionButtons = g.status === "ממתין" || isEditing;
                        return (
                          <View key={g.id} style={styles.guestItem}>
                            <View style={styles.rightGroup}>
                              <View style={styles.nameCol}>
                                <Text style={styles.guestName} numberOfLines={1}>
                                  {g.name}
                                </Text>
                              </View>
                            </View>

                            <View style={styles.leftSlot}>
                              {showActionButtons ? (
                                <View style={styles.actionsInline}>
                                  {isSaving ? <ActivityIndicator size="small" color={colors.primary} /> : null}
                                  <TouchableOpacity
                                    onPress={() => callGuest(g.phone)}
                                    style={[styles.iconBtn, !phoneOk && { opacity: 0.35 }]}
                                    activeOpacity={0.85}
                                    disabled={!phoneOk || isSaving}
                                    accessibilityRole="button"
                                    accessibilityLabel={phoneOk ? `התקשר אל ${g.name}` : `אין מספר טלפון ל${g.name}`}
                                  >
                                    <Ionicons name="call" size={16} color={colors.gray[500]} />
                                  </TouchableOpacity>

                                  <TouchableOpacity
                                    onPress={() => setStatus(g.id, "לא מגיע")}
                                    style={[styles.iconBtn, styles.iconBtnDecline]}
                                    activeOpacity={0.9}
                                    disabled={isSaving}
                                    accessibilityRole="button"
                                    accessibilityLabel={`סימון לא מגיע ל${g.name}`}
                                  >
                                    <Ionicons name="close" size={16} color={"#f87171"} />
                                  </TouchableOpacity>

                                  <TouchableOpacity
                                    onPress={() => setStatus(g.id, "מגיע")}
                                    style={[styles.iconBtn, styles.iconBtnConfirm]}
                                    activeOpacity={0.9}
                                    disabled={isSaving}
                                    accessibilityRole="button"
                                    accessibilityLabel={`אישור הגעה ל${g.name}`}
                                  >
                                    <Ionicons name="checkmark" size={16} color={colors.primary} />
                                  </TouchableOpacity>

                                  {isEditing ? (
                                    <TouchableOpacity
                                      onPress={() => setEditingId(null)}
                                      style={styles.iconBtn}
                                      activeOpacity={0.9}
                                      disabled={isSaving}
                                      accessibilityRole="button"
                                      accessibilityLabel={`ביטול עריכה עבור ${g.name}`}
                                    >
                                      <Ionicons name="close" size={16} color={colors.gray[600]} />
                                    </TouchableOpacity>
                                  ) : null}
                                </View>
                              ) : (
                                <View style={styles.statusEditRow}>
                                  <TouchableOpacity
                                    onPress={() => setEditingId(g.id)}
                                    activeOpacity={0.9}
                                    accessibilityRole="button"
                                    accessibilityLabel={`שינוי סטטוס עבור ${g.name}`}
                                    style={[
                                      styles.badgeBase,
                                      g.status === "מגיע" ? styles.badgeConfirmed : styles.badgeDeclined,
                                      g.status === "מגיע" ? styles.badgeOffsetComing : null,
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.badgeTextBase,
                                        g.status === "מגיע" ? styles.badgeTextConfirmed : styles.badgeTextDeclined,
                                      ]}
                                    >
                                      {badgeLabel}
                                    </Text>
                                  </TouchableOpacity>
                                </View>
                              )}
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
                <Text style={styles.emptyTitle}>לא נמצאו מוזמנים</Text>
                <Text style={styles.emptyText}>נסה לשנות את החיפוש או הסינון</Text>
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

  headerSticky: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(15, 23, 42, 0.06)",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },

  pillsRow: { flexDirection: "row-reverse", gap: 10, paddingRight: 0, minWidth: "100%", justifyContent: "flex-start" },
  pillBase: {
    backgroundColor: "rgba(15,23,42,0.04)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.06)",
  },
  pillTextBase: { fontSize: 11, fontWeight: "900", color: colors.gray[700] },
  pillActiveAll: { backgroundColor: "rgba(15,23,42,0.08)", borderColor: "rgba(15,23,42,0.10)" },
  pillTextActiveAll: { color: colors.text },

  pillPrimary: {
    backgroundColor: "rgba(52, 199, 89, 0.12)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(52, 199, 89, 0.22)",
  },
  pillTextPrimary: { fontSize: 11, fontWeight: "900", color: colors.success },
  pillActivePrimary: { backgroundColor: "rgba(52, 199, 89, 0.18)", borderColor: "rgba(52, 199, 89, 0.32)" },
  pillTextActivePrimary: { color: colors.success },

  pillPending: {
    backgroundColor: "rgba(255, 193, 7, 0.12)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(255, 193, 7, 0.22)",
  },
  pillTextPending: { fontSize: 11, fontWeight: "900", color: "#b45309" },
  pillActivePending: { backgroundColor: "rgba(255, 193, 7, 0.18)", borderColor: "rgba(255, 193, 7, 0.30)" },
  pillTextActivePending: { color: "#92400e" },

  pillDeclined: {
    backgroundColor: "rgba(255, 59, 48, 0.10)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(255, 59, 48, 0.18)",
  },
  pillTextDeclined: { fontSize: 11, fontWeight: "900", color: "#dc2626" },
  pillActiveDeclined: { backgroundColor: "rgba(255, 59, 48, 0.14)", borderColor: "rgba(255, 59, 48, 0.26)" },
  pillTextActiveDeclined: { color: "#b91c1c" },

  searchWrap: {
    height: 44,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.05)",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.06)",
    justifyContent: "center",
    marginBottom: 12,
  },
  searchIcon: { position: "absolute", left: 14 },
  searchInputNew: {
    paddingLeft: 40,
    paddingRight: 16,
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
  },

  tabsRow: { flexDirection: "row-reverse", borderBottomWidth: 1, borderBottomColor: "rgba(15,23,42,0.06)" },
  tabBtn: { flex: 1, paddingBottom: 10, alignItems: "center" },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: colors.primary },
  tabText: { fontSize: 13, fontWeight: "800", color: colors.gray[500] },
  tabTextActive: { color: colors.primary, fontWeight: "900" },

  body: { paddingHorizontal: 16, paddingTop: 12 },

  section: {
    backgroundColor: colors.white,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.06)",
    marginBottom: 12,
  },
  sectionHeader: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.98)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(15,23,42,0.06)",
  },
  sectionTitle: { fontSize: 12, fontWeight: "900", color: colors.gray[600], textTransform: "uppercase" },

  guestItem: {
    minHeight: 60,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(15,23,42,0.06)",
    backgroundColor: colors.white,
  },
  // Keep badge aligned on a fixed vertical line across rows
  rightGroup: { flex: 1, minWidth: 0, flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  nameCol: { flex: 1, minWidth: 0, alignItems: "flex-end" },
  guestName: { minWidth: 0, flexShrink: 1, fontSize: 14, fontWeight: "900", color: colors.text, textAlign: "right" },
  leftSlot: { width: 170, alignItems: "flex-start", justifyContent: "center" },

  badgeBase: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  // Nudge "מגיע" badge right to align with "לא מגיע"
  badgeOffsetComing: { marginLeft: 10 },
  badgeTextBase: { fontSize: 10, fontWeight: "900" },
  badgeConfirmed: { backgroundColor: "rgba(52, 199, 89, 0.12)", borderColor: "rgba(52, 199, 89, 0.22)" },
  badgeTextConfirmed: { color: colors.success },
  badgeDeclined: { backgroundColor: "rgba(255, 59, 48, 0.10)", borderColor: "rgba(255, 59, 48, 0.18)" },
  badgeTextDeclined: { color: "#dc2626" },

  actionsInline: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  statusEditRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.04)",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.06)",
  },
  iconBtnDecline: { backgroundColor: "rgba(255, 59, 48, 0.10)", borderColor: "rgba(255, 59, 48, 0.16)" },
  iconBtnConfirm: { backgroundColor: "rgba(17, 82, 212, 0.10)", borderColor: "rgba(17, 82, 212, 0.16)" },

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

