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
import { eventService } from "@/lib/services/eventService";
import { guestService } from "@/lib/services/guestService";
import { Event, Guest } from "@/types";

type GuestStatus = Guest["status"];

const STATUS_OPTIONS: Array<{ key: GuestStatus; label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: "מגיע", label: "מגיע", color: colors.success, icon: "checkmark-circle" },
  { key: "ממתין", label: "ממתין", color: colors.warning, icon: "time" },
  { key: "לא מגיע", label: "לא מגיע", color: colors.error, icon: "close-circle" },
];

export default function EmployeeEventDetailsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();

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
      const [ev, gs] = await Promise.all([eventService.getEvent(eventId), guestService.getGuests(eventId)]);
      setEvent(ev ?? null);
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

  // Keep content above the custom tab bar
  const TAB_BAR_HEIGHT = 65;
  const TAB_BAR_BOTTOM_GAP = Platform.OS === "ios" ? 30 : 20;
  const bottomReserve = TAB_BAR_HEIGHT + TAB_BAR_BOTTOM_GAP + 18;

  if (loading) {
    return (
      <SafeAreaView style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>טוען...</Text>
      </SafeAreaView>
    );
  }

  if (!eventId || !event) {
    return (
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
    );
  }

  const dateObj = new Date(event.date);
  const dateLabel = Number.isFinite(dateObj.getTime())
    ? dateObj.toLocaleDateString("he-IL", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })
    : "";

  return (
    <SafeAreaView style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.topIconBtn, styles.backBtnAbs]}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="חזרה"
        >
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>

        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.topTitle} numberOfLines={1}>
            אורחים
          </Text>
          <Text style={styles.topSubtitle} numberOfLines={1}>
            {event.title}
          </Text>
        </View>

      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: bottomReserve + insets.bottom }]}
      >
        {/* Event meta */}
        <View style={styles.eventCard}>
          <View style={styles.eventRow}>
            <Ionicons name="calendar-outline" size={18} color={colors.gray[600]} />
            <Text style={styles.eventMetaText}>{dateLabel}</Text>
          </View>
          <View style={styles.eventRow}>
            <Ionicons name="location-outline" size={18} color={colors.gray[600]} />
            <Text style={styles.eventMetaText} numberOfLines={1}>
              {event.location}
              {event.city ? `, ${event.city}` : ""}
            </Text>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={[styles.statChip, { backgroundColor: "rgba(52, 199, 89, 0.12)" }]}>
            <Text style={[styles.statChipText, { color: colors.success }]}>{`מגיע: ${counts.coming}`}</Text>
          </View>
          <View style={[styles.statChip, { backgroundColor: "rgba(255, 193, 7, 0.12)" }]}>
            <Text style={[styles.statChipText, { color: colors.warning }]}>{`ממתין: ${counts.pending}`}</Text>
          </View>
          <View style={[styles.statChip, { backgroundColor: "rgba(255, 59, 48, 0.10)" }]}>
            <Text style={[styles.statChipText, { color: colors.error }]}>{`לא מגיע: ${counts.notComing}`}</Text>
          </View>
          <View style={styles.statChip}>
            <Text style={styles.statChipText}>{`סה״כ: ${counts.total}`}</Text>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchCard}>
          <Ionicons name="search" size={18} color={colors.gray[500]} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="חיפוש אורח..."
            placeholderTextColor={colors.gray[500]}
            style={styles.searchInput}
            textAlign="right"
            returnKeyType="search"
          />
        </View>

        {/* Bulk actions */}
        <View style={styles.bulkCard}>
          <View style={styles.bulkHeader}>
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
                    (isBusy && !isThisBusy) ? { opacity: 0.6 } : null,
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
            <Ionicons name="close" size={16} color={colors.gray[700]} />
            <Text style={styles.clearBtnText}>נקה בחירה</Text>
          </TouchableOpacity>
        </View>

        {/* Guests list */}
        <View style={{ gap: 10 }}>
          {filteredGuests.map((g) => {
            const selected = selectedIds.has(g.id);
            const statusMeta = STATUS_OPTIONS.find((o) => o.key === g.status);
            return (
              <TouchableOpacity
                key={g.id}
                style={[styles.guestRow, selected && styles.guestRowSelected]}
                onPress={() => toggle(g.id)}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityLabel={`בחירת אורח ${g.name}`}
              >
                <View style={styles.guestLeft}>
                  <Ionicons
                    name={selected ? "checkbox" : "square-outline"}
                    size={22}
                    color={selected ? colors.primary : colors.gray[500]}
                  />
                </View>

                <View style={styles.guestMain}>
                  <Text style={styles.guestName} numberOfLines={1}>
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
              <Ionicons name="people-outline" size={42} color={colors.gray[500]} />
              <Text style={styles.emptyTitle}>לא נמצאו אורחים</Text>
              <Text style={styles.emptyText}>נסה לשנות את החיפוש</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.gray[100],
  },
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
  topBar: {
    position: "relative",
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    alignItems: "center",
    justifyContent: "center",
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
  },
  backBtnAbs: {
    position: "absolute",
    left: 14,
    top: 8,
    zIndex: 10,
  },
  topTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: colors.text,
  },
  topSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "700",
    color: colors.gray[600],
    textAlign: "center",
  },
  content: {
    padding: 16,
    paddingTop: 6,
  },
  eventCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  eventRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
  },
  eventMetaText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
    color: colors.gray[700],
    textAlign: "right",
  },
  statsRow: {
    marginTop: 12,
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 10,
  },
  statChip: {
    backgroundColor: "rgba(0,0,0,0.04)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  statChipText: {
    fontSize: 12,
    fontWeight: "900",
    color: colors.gray[800],
  },
  searchCard: {
    marginTop: 12,
    height: 54,
    borderRadius: 22,
    paddingHorizontal: 14,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  bulkCard: {
    marginTop: 12,
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  bulkHeader: {
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
  guestRow: {
    backgroundColor: colors.white,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
  },
  guestRowSelected: {
    borderColor: "rgba(17, 82, 212, 0.45)",
    backgroundColor: "rgba(17, 82, 212, 0.06)",
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
    color: colors.text,
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

