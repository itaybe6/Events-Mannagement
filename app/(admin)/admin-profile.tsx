import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useUserStore } from "@/store/userStore";
import { userService } from "@/lib/services/userService";
import { eventService } from "@/lib/services/eventService";
import { supabase } from "@/lib/supabase";

const ui = {
  primary: "#1152d4",
  primaryLight: "#5c92f5",
  bg: "#f2f4f8",
  text: "#111318",
  muted: "#616f89",
  danger: "#e34d4d",
  glass: "rgba(255, 255, 255, 0.65)",
  glassBorder: "rgba(255, 255, 255, 0.5)",
};

type MonthBar = { label: string; value: number };

function monthLabelHe(monthIndex0: number) {
  const months = ["ינו", "פבר", "מרץ", "אפר", "מאי", "יונ", "יול", "אוג", "ספט", "אוק", "נוב", "דצמ"];
  return months[monthIndex0] ?? "";
}

function getLastNMonthsBars(valuesByMonth: number[], n: number, now = new Date()): MonthBar[] {
  const out: MonthBar[] = [];
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(start.getFullYear(), start.getMonth() - i, 1);
    out.push({
      label: monthLabelHe(d.getMonth()),
      value: valuesByMonth[d.getMonth()] ?? 0,
    });
  }
  return out;
}

function GlassPanel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: any;
}) {
  if (Platform.OS === "web") {
    return (
      <View
        style={[
          styles.glassBase,
          // @ts-expect-error web-only style
          { backdropFilter: "blur(20px)" },
          style,
        ]}
      >
        {children}
      </View>
    );
  }

  return (
    <BlurView intensity={24} tint="light" style={[styles.glassBase, style]}>
      {children}
    </BlurView>
  );
}

export default function AdminProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userData, logout } = useUserStore();

  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);

  const [clientsCount, setClientsCount] = useState<number | null>(null);
  const [eventsThisYearCount, setEventsThisYearCount] = useState<number | null>(null);
  const [bars6, setBars6] = useState<MonthBar[]>([]);
  const [trendPct, setTrendPct] = useState<number>(0);

  useEffect(() => {
    if (userData) {
      setForm({ name: userData.name, email: userData.email, password: "", confirmPassword: "" });
    }
    void loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userData?.id]);

  const avatarUri = useMemo(() => {
    const direct = userData?.avatar_url?.trim();
    if (direct) return direct;
    const seed = encodeURIComponent(userData?.email ?? "admin");
    return `https://i.pravatar.cc/256?u=${seed}`;
  }, [userData?.avatar_url, userData?.email]);

  const loadStats = async () => {
    setLoading(true);
    try {
      const [users, events] = await Promise.all([userService.getClients(), eventService.getEvents()]);

      const now = new Date();
      const year = now.getFullYear();
      const eventsThisYear = events.filter((e: any) => {
        const d = new Date(e.date);
        return Number.isFinite(d.getTime()) && d.getFullYear() === year;
      });

      // Build events count per month (current year not required, just month buckets).
      const eventsByMonth = Array(12).fill(0);
      events.forEach((e: any) => {
        const d = new Date(e.date);
        if (!Number.isFinite(d.getTime())) return;
        eventsByMonth[d.getMonth()] += 1;
      });

      const last6 = getLastNMonthsBars(eventsByMonth, 6, now);
      setBars6(last6);

      const prev = last6.at(-2)?.value ?? 0;
      const curr = last6.at(-1)?.value ?? 0;
      const pct = prev > 0 ? Math.round(((curr - prev) / prev) * 100) : curr > 0 ? 100 : 0;
      setTrendPct(pct);

      setClientsCount(users.length);
      setEventsThisYearCount(eventsThisYear.length);
    } catch (e) {
      setClientsCount(null);
      setEventsThisYearCount(null);
      setBars6([]);
      setTrendPct(0);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      Alert.alert("שגיאה", "יש למלא שם ואימייל");
      return;
    }
    if (form.password && form.password !== form.confirmPassword) {
      Alert.alert("שגיאה", "הסיסמאות אינן תואמות");
      return;
    }

    setLoading(true);
    try {
      const nextName = form.name.trim();
      const nextEmail = form.email.trim();
      const emailChanged = nextEmail !== userData.email;
      const nameChanged = nextName !== userData.name;

      // Keep our public profile table in sync
      if (nameChanged || emailChanged) {
        const { error: profileError } = await supabase
          .from("users")
          .update({ name: nextName, email: nextEmail })
          .eq("id", userData.id);
        if (profileError) throw profileError;
      }

      // Update auth email (may require re-verification depending on Supabase settings)
      if (emailChanged) {
        const { error: emailError } = await supabase.auth.updateUser({ email: nextEmail });
        if (emailError) throw emailError;
      }

      // Update auth password (if provided)
      if (form.password) {
        const { error: passwordError } = await supabase.auth.updateUser({ password: form.password });
        if (passwordError) throw passwordError;
      }

      // Update local store without extra network calls
      useUserStore.setState((state) => ({
        userData: state.userData ? { ...state.userData, name: nextName, email: nextEmail } : state.userData,
      }));

      Alert.alert("הצלחה", "הפרופיל עודכן בהצלחה");
      setEditOpen(false);
      setForm((f) => ({ ...f, password: "", confirmPassword: "" }));
    } catch (e) {
      Alert.alert("שגיאה", "לא ניתן לעדכן את הפרופיל");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  if (!userData) {
    return (
      <View style={[styles.center, { backgroundColor: ui.bg }]}>
        <ActivityIndicator size="large" color={ui.primary} />
      </View>
    );
  }

  const maxBar = Math.max(1, ...bars6.map((b) => b.value));
  // This screen sits under the custom bottom tab bar (see `app/(tabs)/_layout.tsx`).
  // Keep the fixed actions above it so they remain visible.
  const TAB_BAR_HEIGHT = 65;
  const TAB_BAR_BOTTOM_GAP = Platform.OS === "ios" ? 30 : 20;
  const footerBottomOffset = TAB_BAR_HEIGHT + TAB_BAR_BOTTOM_GAP + 12;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Atmosphere blobs */}
      <View pointerEvents="none" style={styles.blobsWrap}>
        <View
          style={[
            styles.blob,
            styles.blobA,
            Platform.OS === "web" ? ({ filter: "blur(80px)" } as any) : null,
          ]}
        />
        <View
          style={[
            styles.blob,
            styles.blobB,
            Platform.OS === "web" ? ({ filter: "blur(80px)" } as any) : null,
          ]}
        />
        <View
          style={[
            styles.blob,
            styles.blobC,
            Platform.OS === "web" ? ({ filter: "blur(100px)" } as any) : null,
          ]}
        />
      </View>

      <ScrollView
        style={styles.scroll}
        // Footer is positioned above the tab bar; keep enough room so content won't be covered.
        contentContainerStyle={[
          styles.content,
          { paddingBottom: footerBottomOffset + 140 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Top App Bar */}
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.topIconBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="חזרה"
          >
            <Ionicons name="chevron-forward" size={28} color={ui.text} />
          </Pressable>

          {/* Hidden title for spacing balance */}
          <Text style={[styles.topTitle, { opacity: 0 }]} numberOfLines={1}>
            פרופיל
          </Text>

          <Pressable
            onPress={() => Alert.alert("עוד פעולות", "בקרוב")}
            style={({ pressed }) => [styles.topIconBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="עוד פעולות"
          >
            <Ionicons name="ellipsis-horizontal" size={24} color={ui.text} />
          </Pressable>
        </View>

        {/* Profile Hero */}
        <View style={styles.hero}>
          <Pressable onPress={() => setEditOpen(true)} style={styles.avatarWrap}>
            <View style={styles.avatarGlow} />
            <View style={styles.avatarRing}>
              <Image source={{ uri: avatarUri }} style={styles.avatar} contentFit="cover" />
            </View>
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={18} color={ui.primary} />
            </View>
          </Pressable>

          <View style={styles.heroText}>
            <Text style={styles.name} numberOfLines={1}>
              {userData.name}
            </Text>
            <Text style={styles.email} numberOfLines={1}>
              {userData.email}
            </Text>
          </View>
        </View>

        {/* Key Metrics */}
        <View style={styles.metrics}>
          <View style={styles.metricCol}>
            <Text style={styles.metricValue}>{eventsThisYearCount ?? "—"}</Text>
            <Text style={styles.metricLabel}>אירועים השנה</Text>
          </View>

          <View style={styles.metricDivider} />

          <View style={styles.metricCol}>
            <Text style={styles.metricValue}>{clientsCount ?? "—"}</Text>
            <Text style={styles.metricLabel}>לקוחות פעילים</Text>
          </View>
        </View>

        {/* Monthly Activity */}
        <View style={styles.sectionWrap}>
          <GlassPanel style={styles.monthCard}>
            <View style={styles.monthHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.monthTitle}>פעילות חודשית</Text>
                <Text style={styles.monthSubtitle}>סיכום 6 חודשים אחרונים</Text>
              </View>

              <View style={styles.trendPill}>
                <Ionicons name="trending-up" size={16} color="#059669" />
                <Text style={styles.trendText}>{trendPct >= 0 ? `+${trendPct}%` : `${trendPct}%`}</Text>
              </View>
            </View>

            {loading && bars6.length === 0 ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator color={ui.primary} />
              </View>
            ) : (
              <View style={styles.barGrid}>
                {bars6.map((b, idx) => {
                  const pct = Math.max(0.12, b.value / maxBar);
                  const isHot = idx >= bars6.length - 2;
                  return (
                    <View key={`${b.label}-${idx}`} style={styles.barCol}>
                      <View style={styles.barTrack}>
                        <LinearGradient
                          colors={
                            isHot
                              ? [ui.primary, ui.primaryLight]
                              : ["rgba(17, 82, 212, 0.35)", "rgba(92, 146, 245, 0.20)"]
                          }
                          start={{ x: 0.5, y: 1 }}
                          end={{ x: 0.5, y: 0 }}
                          style={[styles.barFill, { height: `${Math.round(pct * 100)}%` } as any]}
                        />
                      </View>
                      <Text style={[styles.barLabel, isHot && styles.barLabelHot]}>{b.label}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </GlassPanel>
        </View>
      </ScrollView>

      {/* Bottom actions (fixed above the tab bar) */}
      <View style={[styles.footerWrap, { bottom: footerBottomOffset }]}>
        <GlassPanel style={[styles.footerPanel, { paddingBottom: 12 + insets.bottom }]}>
          <View style={styles.actions}>
            <Pressable
              onPress={() => setEditOpen(true)}
              style={({ pressed }) => [
                styles.actionBtn,
                styles.actionBtnPrimary,
                pressed && styles.actionBtnPressed,
              ]}
              accessibilityRole="button"
            >
              <Ionicons name="create-outline" size={18} color="white" />
              <Text style={[styles.actionBtnText, { color: "white" }]}>עריכה</Text>
            </Pressable>

            <Pressable
              onPress={handleLogout}
              style={({ pressed }) => [
                styles.actionBtn,
                styles.actionBtnDanger,
                pressed && styles.actionBtnPressed,
              ]}
              accessibilityRole="button"
            >
              <Ionicons name="log-out-outline" size={18} color={ui.danger} />
              <Text style={[styles.actionBtnText, { color: ui.danger }]}>התנתק</Text>
            </Pressable>
          </View>
        </GlassPanel>
      </View>

      {/* Edit Modal */}
      <Modal transparent visible={editOpen} animationType="fade" onRequestClose={() => setEditOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setEditOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => null}>
            <Text style={styles.modalTitle}>עריכת פרופיל</Text>

            <TextInput
              style={styles.input}
              value={form.name}
              onChangeText={(t) => setForm((f) => ({ ...f, name: t }))}
              placeholder="שם מלא"
              placeholderTextColor="rgba(17,19,24,0.35)"
              textAlign="right"
            />
            <TextInput
              style={styles.input}
              value={form.email}
              onChangeText={(t) => setForm((f) => ({ ...f, email: t }))}
              placeholder="אימייל"
              placeholderTextColor="rgba(17,19,24,0.35)"
              keyboardType="email-address"
              autoCapitalize="none"
              textAlign="right"
            />
            <TextInput
              style={styles.input}
              value={form.password}
              onChangeText={(t) => setForm((f) => ({ ...f, password: t }))}
              placeholder="סיסמה חדשה (לא חובה)"
              placeholderTextColor="rgba(17,19,24,0.35)"
              secureTextEntry
              textAlign="right"
            />
            <TextInput
              style={styles.input}
              value={form.confirmPassword}
              onChangeText={(t) => setForm((f) => ({ ...f, confirmPassword: t }))}
              placeholder="אישור סיסמה"
              placeholderTextColor="rgba(17,19,24,0.35)"
              secureTextEntry
              textAlign="right"
            />

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setEditOpen(false)}
                style={({ pressed }) => [styles.modalBtn, styles.modalBtnGhost, pressed && styles.pressed]}
              >
                <Text style={[styles.modalBtnText, { color: ui.muted }]}>ביטול</Text>
              </Pressable>

              <Pressable
                onPress={handleSave}
                disabled={loading}
                style={({ pressed }) => [
                  styles.modalBtn,
                  styles.modalBtnPrimary,
                  (pressed || loading) && { opacity: 0.9 },
                ]}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={[styles.modalBtnText, { color: "white" }]}>שמור</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ui.bg },
  scroll: { flex: 1 },
  content: { width: "100%", maxWidth: 420, alignSelf: "center" },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  blobsWrap: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
  blob: { position: "absolute", borderRadius: 9999, opacity: 0.7 },
  blobA: { top: "-10%", left: "-10%", width: 500, height: 500, backgroundColor: "rgba(191, 219, 254, 0.7)" },
  blobB: { top: "20%", right: "-20%", width: 400, height: 400, backgroundColor: "rgba(233, 213, 255, 0.7)" },
  blobC: { bottom: "-10%", left: "20%", width: 600, height: 600, backgroundColor: "rgba(224, 231, 255, 0.8)" },

  topBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { backgroundColor: "rgba(0,0,0,0.04)" },
  topTitle: { fontSize: 18, fontWeight: "800", color: ui.text, letterSpacing: -0.2 },

  hero: { paddingHorizontal: 20, marginTop: 6, alignItems: "center", gap: 14 },
  avatarWrap: { width: 132, height: 132, alignItems: "center", justifyContent: "center" },
  avatarGlow: {
    position: "absolute",
    inset: 0,
    borderRadius: 9999,
    backgroundColor: ui.primary,
    opacity: 0.18,
    transform: [{ scale: 1.05 }],
  },
  avatarRing: {
    width: 128,
    height: 128,
    borderRadius: 9999,
    padding: 4,
    backgroundColor: "white",
    shadowColor: ui.primary,
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  avatar: { width: "100%", height: "100%", borderRadius: 9999 },
  verifiedBadge: {
    position: "absolute",
    bottom: 6,
    right: 6,
    backgroundColor: "white",
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "rgba(0,0,0,0.2)",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  heroText: { alignItems: "center", gap: 4 },
  name: { fontSize: 30, fontWeight: "900", color: ui.text, letterSpacing: -0.6 },
  email: { fontSize: 16, fontWeight: "600", color: ui.muted },

  actions: {
    flexDirection: "row",
    gap: 12,
  },
  footerWrap: {
    // On web, "fixed" keeps actions visible at the bottom of the viewport.
    // On native, "absolute" is correct within the screen.
    position: Platform.OS === "web" ? ("fixed" as any) : "absolute",
    left: 0,
    right: 0,
    // bottom is set inline to account for the custom tab bar height
    paddingHorizontal: 16,
    paddingTop: 8,
    zIndex: 50,
    elevation: 50,
  },
  footerPanel: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    paddingTop: 12,
    paddingHorizontal: 14,
  },
  actionBtn: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    paddingHorizontal: 14,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    ...(Platform.OS === "web"
      ? ({
          // @ts-expect-error web-only style
          boxShadow: "0 10px 30px rgba(15, 23, 42, 0.12)",
        } as any)
      : {
          shadowColor: "rgba(15, 23, 42, 0.22)",
          shadowOpacity: 0.14,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 10 },
          elevation: 6,
        }),
  },
  actionBtnPrimary: {
    backgroundColor: ui.primary,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  actionBtnDanger: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "rgba(227, 77, 77, 0.35)",
  },
  actionBtnPressed: { transform: [{ scale: 0.985 }], opacity: 0.92 },
  actionBtnText: { fontSize: 14, fontWeight: "900", letterSpacing: -0.1 },

  metrics: { marginTop: 26, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 18 },
  metricCol: { alignItems: "center", gap: 6, minWidth: 130 },
  metricValue: { fontSize: 52, fontWeight: "900", color: ui.text, letterSpacing: -1.5, lineHeight: 56 },
  metricLabel: { fontSize: 12, fontWeight: "700", color: ui.muted },
  metricDivider: {
    width: 1,
    height: 64,
    backgroundColor: "rgba(219, 223, 230, 1)",
    opacity: 0.8,
  },

  sectionWrap: { marginTop: 28, paddingHorizontal: 16 },
  glassBase: {
    backgroundColor: ui.glass,
    borderWidth: 1,
    borderColor: ui.glassBorder,
    borderRadius: 26,
    overflow: "hidden",
  },
  monthCard: {
    padding: 18,
    shadowColor: "rgba(31, 38, 135, 0.20)",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  monthHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 16, gap: 12 },
  monthTitle: { fontSize: 17, fontWeight: "800", color: ui.text },
  monthSubtitle: { fontSize: 11, fontWeight: "700", color: ui.muted, marginTop: 4 },
  trendPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(16, 185, 129, 0.10)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  trendText: { fontSize: 13, fontWeight: "900", color: "#059669" },

  loadingBox: { height: 160, alignItems: "center", justifyContent: "center" },
  barGrid: { height: 160, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 4, gap: 10 },
  barCol: { flex: 1, alignItems: "center", gap: 10 },
  barTrack: {
    width: 24,
    height: 130,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(15, 23, 42, 0.04)",
    alignItems: "stretch",
    justifyContent: "flex-end",
  },
  barFill: { width: "100%", borderRadius: 999 },
  barLabel: { fontSize: 12, fontWeight: "700", color: ui.muted },
  barLabelHot: { color: ui.text, fontWeight: "900" },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    padding: 18,
    justifyContent: "center",
  },
  modalCard: {
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 24,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.65)",
    // web blur
    ...(Platform.OS === "web" ? ({ backdropFilter: "blur(16px)" } as any) : null),
  },
  modalTitle: { fontSize: 18, fontWeight: "900", color: ui.text, textAlign: "right", marginBottom: 4 },
  input: {
    height: 46,
    borderRadius: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(17, 19, 24, 0.08)",
    backgroundColor: "rgba(242, 244, 248, 0.7)",
    color: ui.text,
    fontSize: 15,
    fontWeight: "700",
  },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  modalBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnGhost: { backgroundColor: "rgba(17, 19, 24, 0.04)" },
  modalBtnPrimary: { backgroundColor: ui.primary },
  modalBtnText: { fontSize: 14, fontWeight: "900" },
});