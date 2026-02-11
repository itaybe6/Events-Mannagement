import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "@/constants/colors";
import { supabase } from "@/lib/supabase";
import BackSwipe from "@/components/BackSwipe";

type TableRow = {
  id: string;
  number: number | null;
  name: string | null;
  capacity: number;
  shape: "square" | "rectangle" | "reserve" | null;
  x: number | null;
  y: number | null;
};

type GuestRow = {
  id: string;
  name: string;
  table_id: string | null;
  number_of_people: number | null;
};

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

export default function EmployeeSeatingMapScreen() {
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
  const [eventTitle, setEventTitle] = useState<string>("");
  const [tables, setTables] = useState<TableRow[]>([]);
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [annotations, setAnnotations] = useState<Array<{ id?: string; x?: number; y?: number; text?: string }>>(
    []
  );

  const [tableModalOpen, setTableModalOpen] = useState(false);
  const [activeTableId, setActiveTableId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!resolvedEventId) {
        if (!active) return;
        setTables([]);
        setGuests([]);
        setAnnotations([]);
        setEventTitle("");
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const [evRes, tablesRes, guestsRes, mapRes] = await Promise.all([
          supabase.from("events").select("title").eq("id", resolvedEventId).maybeSingle(),
          supabase
            .from("tables")
            .select("id,number,name,capacity,shape,x,y")
            .eq("event_id", resolvedEventId)
            .order("number"),
          supabase
            .from("guests")
            .select("id,name,table_id,number_of_people")
            .eq("event_id", resolvedEventId)
            .order("name"),
          supabase.from("seating_maps").select("annotations").eq("event_id", resolvedEventId).maybeSingle(),
        ]);

        if (!active) return;

        if (evRes.error) throw evRes.error;
        if (tablesRes.error) throw tablesRes.error;
        if (guestsRes.error) throw guestsRes.error;
        // mapRes may be null (no map yet) — that's ok.

        setEventTitle(String((evRes.data as any)?.title || ""));
        setTables((tablesRes.data as any[]) || []);
        setGuests((guestsRes.data as any[]) || []);
        setAnnotations(Array.isArray((mapRes.data as any)?.annotations) ? (mapRes.data as any).annotations : []);
      } catch (e) {
        console.error("Employee seating map load error:", e);
        setTables([]);
        setGuests([]);
        setAnnotations([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [resolvedEventId]);

  const tableById = useMemo(() => new Map(tables.map((t) => [t.id, t])), [tables]);
  const activeTable = activeTableId ? tableById.get(activeTableId) : undefined;

  const guestsForActiveTable = useMemo(() => {
    if (!activeTableId) return [];
    return guests.filter((g) => g.table_id === activeTableId);
  }, [activeTableId, guests]);

  const sumPeople = (rows: Array<{ number_of_people: number | null }>) =>
    rows.reduce((sum, r) => sum + (Number(r.number_of_people) || 1), 0);

  const minX = tables.length > 0 ? Math.min(...tables.map((t) => (typeof t.x === "number" ? t.x : 0))) : 0;
  const maxX = tables.length > 0 ? Math.max(...tables.map((t) => (typeof t.x === "number" ? t.x : screenWidth))) : screenWidth;
  const padding = 100;
  const canvasWidth = Math.max(screenWidth, maxX - minX + padding * 2);
  const canvasHeight = Math.max(screenHeight * 1.4, 900);

  const openTable = (tableId: string) => {
    setActiveTableId(tableId);
    setTableModalOpen(true);
  };

  const closeTable = () => {
    setTableModalOpen(false);
    setActiveTableId(null);
  };

  if (loading) {
    return (
      <BackSwipe fallbackHref={fallbackToDetails}>
        <SafeAreaView style={[styles.center, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>טוען מפת הושבה...</Text>
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
              מפת הושבה
            </Text>
            <Text style={styles.topSubtitle} numberOfLines={1}>
              {eventTitle || "אירוע"}
            </Text>
          </View>

          <View style={{ width: 44 }} />
        </View>

        {/* Map */}
        <ScrollView
          style={styles.canvasScroll}
          contentContainerStyle={{ width: canvasWidth, height: canvasHeight }}
          maximumZoomScale={3}
          minimumZoomScale={0.5}
          bounces={false}
          bouncesZoom={false}
          horizontal
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.canvas, { width: canvasWidth, height: canvasHeight }]}>
            {/* Grid */}
            {[...Array(Math.ceil(canvasHeight / 60))].map((_, i) => (
              <View key={`h-${i}`} style={[styles.gridLine, { top: i * 60 }]} />
            ))}
            {[...Array(Math.ceil(canvasWidth / 90))].map((_, i) => (
              <View key={`v-${i}`} style={[styles.gridLineV, { left: i * 90 }]} />
            ))}

            {/* Tables */}
            {tables.map((t) => {
              const x = (typeof t.x === "number" ? t.x : 40) - minX + padding;
              const y = typeof t.y === "number" ? t.y : 60;
              const guestsAtTable = guests.filter((g) => g.table_id === t.id);
              const totalPeople = sumPeople(guestsAtTable);
              const isFull = totalPeople >= (Number(t.capacity) || 0);
              const isReserve = t.shape === "reserve";

              return (
                <TouchableOpacity
                  key={t.id}
                  style={[
                    styles.table,
                    t.shape === "rectangle" ? styles.tableRect : styles.tableSquare,
                    isFull && styles.tableFullStyle,
                    isReserve && styles.reserveTableStyle,
                    { left: x, top: y },
                  ]}
                  activeOpacity={0.9}
                  onPress={() => openTable(t.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`שולחן ${t.number ?? ""}`}
                >
                  <Text style={[styles.tableNumber, isFull && styles.tableFullText, isReserve && styles.reserveTableText]}>
                    {t.number ?? "?"}
                  </Text>
                  <Text style={[styles.tableCap, isFull && styles.tableFullCapText, isReserve && styles.reserveTableCapText]}>
                    {totalPeople} / {t.capacity}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {/* Annotations */}
            {annotations.map((a, idx) => (
              <View
                key={String(a.id || idx)}
                style={[
                  styles.textArea,
                  {
                    left: typeof a.x === "number" ? a.x : 200,
                    top: typeof a.y === "number" ? a.y : 200 + idx * 40,
                  },
                ]}
              >
                <Text style={styles.textAreaText}>{String(a.text || "").trim()}</Text>
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Table modal (read-only) */}
        <Modal visible={tableModalOpen} transparent animationType="fade" onRequestClose={closeTable}>
          <Pressable style={styles.modalOverlay} onPress={closeTable}>
            <Pressable style={styles.modalCard} onPress={() => null}>
              <View style={styles.modalHeader}>
                <TouchableOpacity
                  onPress={closeTable}
                  style={styles.modalCloseBtn}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="סגירה"
                >
                  <Ionicons name="close" size={18} color={"rgba(17,24,39,0.70)"} />
                </TouchableOpacity>

                <View style={{ flex: 1, alignItems: "center" }}>
                  <Text style={styles.modalTitle} numberOfLines={1}>
                    {activeTable ? `שולחן ${activeTable.number ?? ""}` : "שולחן"}
                  </Text>
                  <Text style={styles.modalSubtitle} numberOfLines={1}>
                    {activeTable ? `${sumPeople(guestsForActiveTable)} / ${activeTable.capacity}` : ""}
                  </Text>
                </View>

                <View style={{ width: 40 }} />
              </View>

              <View style={styles.modalDivider} />

              <ScrollView contentContainerStyle={styles.modalBody} showsVerticalScrollIndicator={false}>
                {guestsForActiveTable.length === 0 ? (
                  <View style={styles.emptyBox}>
                    <Ionicons name="people-outline" size={38} color={"rgba(17,24,39,0.45)"} />
                    <Text style={styles.emptyTitle}>אין אורחים בשולחן</Text>
                    <Text style={styles.emptyText}>זו תצוגה בלבד לעובד</Text>
                  </View>
                ) : (
                  guestsForActiveTable.map((g) => (
                    <View key={g.id} style={styles.guestRow}>
                      <Text style={styles.guestPeople}>{`${Number(g.number_of_people) || 1}×`}</Text>
                      <Text style={styles.guestName} numberOfLines={1}>
                        {g.name}
                      </Text>
                    </View>
                  ))
                )}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      </SafeAreaView>
    </BackSwipe>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.gray[100] },
  center: { flex: 1, backgroundColor: colors.gray[100], alignItems: "center", justifyContent: "center", gap: 10 },
  loadingText: { fontSize: 14, fontWeight: "800", color: colors.gray[600] },
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
  topSubtitle: { marginTop: 2, fontSize: 12, fontWeight: "700", color: colors.gray[600], textAlign: "center" },

  canvasScroll: { flex: 1 },
  canvas: { backgroundColor: colors.white, overflow: "hidden" },
  gridLine: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: colors.gray[200] },
  gridLineV: { position: "absolute", top: 0, bottom: 0, width: 1, backgroundColor: colors.gray[200] },

  table: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.gray[50],
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.gray[300],
    shadowColor: colors.richBlack,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  tableSquare: { width: 74, height: 74 },
  tableRect: { width: 60, height: 124 },
  tableNumber: { fontWeight: "900", fontSize: 16, color: colors.text },
  tableCap: { fontSize: 13, fontWeight: "700", color: colors.gray[600], marginTop: 2 },
  tableFullStyle: {
    backgroundColor: colors.success,
    borderColor: colors.success,
    shadowColor: colors.success,
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  tableFullText: { color: colors.white },
  tableFullCapText: { color: "rgba(255,255,255,0.92)" },
  reserveTableStyle: { backgroundColor: "rgba(0,0,0,0.72)", borderColor: colors.gray[800] },
  reserveTableText: { color: colors.white },
  reserveTableCapText: { color: "rgba(255,255,255,0.70)" },

  textArea: {
    position: "absolute",
    backgroundColor: colors.gray[100],
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.gray[300],
  },
  textAreaText: { fontSize: 14, fontWeight: "800", color: colors.text },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 18,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.70)",
    shadowColor: colors.black,
    shadowOpacity: 0.20,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
    overflow: "hidden",
    maxHeight: Platform.OS === "web" ? 640 : "84%",
  },
  modalHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: "rgba(17,24,39,0.06)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalTitle: { fontSize: 18, fontWeight: "900", color: "#111827", textAlign: "center" },
  modalSubtitle: { marginTop: 4, fontSize: 12, fontWeight: "800", color: "rgba(17,24,39,0.55)", textAlign: "center" },
  modalDivider: { height: 1, backgroundColor: "rgba(17,24,39,0.08)", marginHorizontal: 16 },
  modalBody: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, gap: 10 },

  guestRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "rgba(17,24,39,0.04)",
    borderWidth: 1,
    borderColor: "rgba(17,24,39,0.06)",
  },
  guestName: { flex: 1, textAlign: "right", fontSize: 14, fontWeight: "900", color: colors.text },
  guestPeople: { width: 44, textAlign: "left", fontSize: 13, fontWeight: "900", color: colors.primary },

  emptyBox: {
    paddingVertical: 26,
    paddingHorizontal: 18,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: { fontSize: 15, fontWeight: "900", color: colors.text, textAlign: "center" },
  emptyText: { fontSize: 13, fontWeight: "700", color: colors.gray[600], textAlign: "center" },
});

