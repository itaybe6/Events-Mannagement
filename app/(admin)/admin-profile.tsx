import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useUserStore } from "@/store/userStore";
import { userService } from "@/lib/services/userService";
import { eventService } from "@/lib/services/eventService";
import { supabase } from "@/lib/supabase";

const ui = {
  bg: "#F4F7FB",
  card: "#FFFFFF",
  text: "#0F172A",
  muted: "#64748B",
  border: "rgba(15, 23, 42, 0.08)",
  primary: "#1152D4",
  primary2: "#5C92F5",
  danger: "#E11D48",
};

type MonthBar = { monthIndex: number; label: string; value: number };

function monthLabelHe(monthIndex0: number) {
  const months = ["ינו", "פבר", "מרץ", "אפר", "מאי", "יונ", "יול", "אוג", "ספט", "אוק", "נוב", "דצמ"];
  return months[monthIndex0] ?? "";
}

function buildYearBars(valuesByMonth: number[]): MonthBar[] {
  return Array.from({ length: 12 }).map((_, m) => ({
    monthIndex: m,
    label: monthLabelHe(m),
    value: valuesByMonth[m] ?? 0,
  }));
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: any }) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statIcon}>
        <Ionicons name={icon} size={18} color={ui.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.statValue} numberOfLines={1}>
          {value}
        </Text>
        <Text style={styles.statLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
  );
}

export default function AdminProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userData, logout } = useUserStore();

  const [editOpen, setEditOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [clientsCount, setClientsCount] = useState<number | null>(null);
  const [eventsThisYearCount, setEventsThisYearCount] = useState<number | null>(null);
  const [bars12, setBars12] = useState<MonthBar[]>([]);
  const [yearTotal, setYearTotal] = useState<number>(0);

  useEffect(() => {
    if (userData) {
      setForm({ name: userData.name, email: userData.email, password: "", confirmPassword: "" });
    }
  }, [userData?.id]);

  const avatarUri = useMemo(() => {
    const direct = userData?.avatar_url?.trim();
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

  const loadStats = async () => {
    setLoading(true);
    try {
      const [users, events] = await Promise.all([userService.getClients(), eventService.getEvents()]);

      const years = new Set<number>();
      years.add(new Date().getFullYear());
      events.forEach((e: any) => {
        const d = new Date(e.date);
        if (!Number.isFinite(d.getTime())) return;
        years.add(d.getFullYear());
      });
      const yearsSorted = Array.from(years).sort((a, b) => b - a);
      setAvailableYears(yearsSorted);

      const yearToUse = yearsSorted.includes(selectedYear) ? selectedYear : yearsSorted[0] ?? selectedYear;
      if (yearToUse !== selectedYear) setSelectedYear(yearToUse);

      const eventsThisYear = events.filter((e: any) => {
        const d = new Date(e.date);
        return Number.isFinite(d.getTime()) && d.getFullYear() === yearToUse;
      });

      const eventsByMonth = Array(12).fill(0);
      eventsThisYear.forEach((e: any) => {
        const d = new Date(e.date);
        if (!Number.isFinite(d.getTime())) return;
        eventsByMonth[d.getMonth()] += 1;
      });

      const bars = buildYearBars(eventsByMonth);
      setBars12(bars);
      setYearTotal(bars.reduce((sum, b) => sum + b.value, 0));
      setClientsCount(users.length);
      setEventsThisYearCount(eventsThisYear.length);
    } catch (e) {
      setAvailableYears([]);
      setClientsCount(null);
      setEventsThisYearCount(null);
      setBars12([]);
      setYearTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!userData) return;
    void loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userData?.id, selectedYear]);

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
      const emailChanged = nextEmail !== userData?.email;
      const nameChanged = nextName !== userData?.name;

      if (!userData) throw new Error("Missing user");

      if (nameChanged || emailChanged) {
        const { error: profileError } = await supabase
          .from("users")
          .update({ name: nextName, email: nextEmail })
          .eq("id", userData.id);
        if (profileError) throw profileError;
      }

      if (emailChanged) {
        const { error: emailError } = await supabase.auth.updateUser({ email: nextEmail });
        if (emailError) throw emailError;
      }

      if (form.password) {
        const { error: passwordError } = await supabase.auth.updateUser({ password: form.password });
        if (passwordError) throw passwordError;
      }

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

  const handleLogoutPress = () => {
    setLogoutConfirmOpen(true);
  };

  if (!userData) {
    return (
      <View style={[styles.center, { backgroundColor: ui.bg }]}>
        <ActivityIndicator size="large" color={ui.primary} />
      </View>
    );
  }

  const maxBar = Math.max(1, ...bars12.map((b) => b.value));
  const now = new Date();
  const isCurrentYear = selectedYear === now.getFullYear();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.profileRow}>
            <View style={styles.avatarWrap}>
              <Image source={{ uri: avatarUri }} style={styles.avatar} contentFit="cover" />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>
                {userData.name}
              </Text>
              <Text style={styles.email} numberOfLines={1}>
                {userData.email}
              </Text>

              <View style={styles.badgesRow}>
                <View style={styles.badge}>
                  <Ionicons name="shield-checkmark-outline" size={14} color={ui.primary} />
                  <Text style={styles.badgeText}>מנהל</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.statsRow}>
          <StatCard
            label={`אירועים בשנת ${selectedYear}`}
            value={eventsThisYearCount === null ? "—" : String(eventsThisYearCount)}
            icon="calendar-outline"
          />
          <StatCard label="לקוחות פעילים" value={clientsCount === null ? "—" : String(clientsCount)} icon="people-outline" />
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>פעילות חודשית</Text>
              <Text style={styles.sectionSubtitle}>ינואר–דצמבר · {selectedYear}</Text>
            </View>

            <View style={styles.yearControls}>
              <Pressable
                onPress={() => setSelectedYear((y) => y - 1)}
                disabled={!canPrevYear}
                style={({ pressed }) => [
                  styles.yearBtn,
                  pressed && canPrevYear && styles.yearBtnPressed,
                  !canPrevYear && { opacity: 0.35 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="שנה קודמת"
              >
                <Ionicons name="chevron-forward" size={18} color={ui.text} />
              </Pressable>

              <View style={styles.yearPill}>
                <Ionicons name="calendar-outline" size={14} color={ui.text} />
                <Text style={styles.yearPillText}>{selectedYear}</Text>
                <View style={styles.dot} />
                <Text style={styles.yearPillText}>סה״כ {yearTotal}</Text>
              </View>

              <Pressable
                onPress={() => setSelectedYear((y) => y + 1)}
                disabled={!canNextYear}
                style={({ pressed }) => [
                  styles.yearBtn,
                  pressed && canNextYear && styles.yearBtnPressed,
                  !canNextYear && { opacity: 0.35 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="שנה הבאה"
              >
                <Ionicons name="chevron-back" size={18} color={ui.text} />
              </Pressable>
            </View>
          </View>

          {loading && bars12.length === 0 ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={ui.primary} />
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chartRow}>
              {bars12.map((b) => {
                const isCurrentMonth = isCurrentYear && b.monthIndex === now.getMonth();
                const pct = b.value === 0 ? 0 : Math.max(0.08, b.value / maxBar);
                return (
                  <View key={`${selectedYear}-${b.monthIndex}`} style={styles.barCol}>
                    <Text style={[styles.barValue, isCurrentMonth && styles.barValueHot]}>{b.value}</Text>
                    <View style={styles.barTrack}>
                      <LinearGradient
                        colors={
                          isCurrentMonth
                            ? [ui.primary, ui.primary2]
                            : ["rgba(17, 82, 212, 0.28)", "rgba(92, 146, 245, 0.16)"]
                        }
                        start={{ x: 0.5, y: 1 }}
                        end={{ x: 0.5, y: 0 }}
                        style={[styles.barFill, { height: `${Math.round(pct * 100)}%` } as any]}
                      />
                    </View>
                    <Text style={[styles.barLabel, isCurrentMonth && styles.barLabelHot]}>{b.label}</Text>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>

        <Pressable
          onPress={handleLogoutPress}
          disabled={loggingOut}
          style={({ pressed }) => [styles.logoutBtnShadow, (pressed || loggingOut) && styles.iconBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel="התנתקות"
        >
          <LinearGradient
            colors={["#FB7185", "#E11D48"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.logoutBtnSurface}
          >
            {loggingOut ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Ionicons name="log-out-outline" size={18} color="white" />
                <Text style={styles.actionBtnTextLight}>התנתק</Text>
              </>
            )}
          </LinearGradient>
        </Pressable>

      </ScrollView>

      <Modal transparent visible={logoutConfirmOpen} animationType="fade" onRequestClose={() => setLogoutConfirmOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => setLogoutConfirmOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="סגור חלון התנתקות"
          />

          <View style={styles.confirmModalWrap}>
            <View style={styles.confirmModalCard}>
              <Text style={styles.confirmTitle}>התנתקות</Text>
              <Text style={styles.confirmMessage}>בטוח שברצונך להתנתק?</Text>

              <View style={styles.confirmActions}>
                <Pressable
                  onPress={() => setLogoutConfirmOpen(false)}
                  style={({ pressed }) => [styles.confirmBtn, styles.confirmBtnGhost, pressed && styles.modalBtnPressed]}
                >
                  <Text style={styles.confirmBtnGhostText}>ביטול</Text>
                </Pressable>

                <Pressable
                  onPress={async () => {
                    setLogoutConfirmOpen(false);
                    await performLogout();
                  }}
                  disabled={loggingOut}
                  style={({ pressed }) => [
                    styles.confirmBtn,
                    styles.confirmBtnDanger,
                    (pressed || loggingOut) && styles.modalBtnPressed,
                  ]}
                >
                  {loggingOut ? <ActivityIndicator color="white" /> : <Text style={styles.confirmBtnDangerText}>אישור</Text>}
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={editOpen} animationType="fade" onRequestClose={() => setEditOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setEditOpen(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
            <Pressable style={styles.modalCard} onPress={() => null}>
              <Text style={styles.modalTitle}>עריכת פרופיל</Text>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10 }} bounces={false}>
                <TextInput
                  style={styles.input}
                  value={form.name}
                  onChangeText={(t) => setForm((f) => ({ ...f, name: t }))}
                  placeholder="שם מלא"
                  placeholderTextColor="rgba(15,23,42,0.35)"
                  textAlign="right"
                />
                <TextInput
                  style={styles.input}
                  value={form.email}
                  onChangeText={(t) => setForm((f) => ({ ...f, email: t }))}
                  placeholder="אימייל"
                  placeholderTextColor="rgba(15,23,42,0.35)"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  textAlign="right"
                />
                <TextInput
                  style={styles.input}
                  value={form.password}
                  onChangeText={(t) => setForm((f) => ({ ...f, password: t }))}
                  placeholder="סיסמה חדשה (לא חובה)"
                  placeholderTextColor="rgba(15,23,42,0.35)"
                  secureTextEntry
                  textAlign="right"
                />
                <TextInput
                  style={styles.input}
                  value={form.confirmPassword}
                  onChangeText={(t) => setForm((f) => ({ ...f, confirmPassword: t }))}
                  placeholder="אישור סיסמה"
                  placeholderTextColor="rgba(15,23,42,0.35)"
                  secureTextEntry
                  textAlign="right"
                />
              </ScrollView>

              <View style={styles.modalActions}>
                <Pressable
                  onPress={() => setEditOpen(false)}
                  style={({ pressed }) => [styles.modalBtn, styles.modalBtnGhost, pressed && styles.modalBtnPressed]}
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
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ui.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  header: {
    position: "relative",
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "900", color: ui.text, letterSpacing: -0.2 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.80)",
    borderWidth: 1,
    borderColor: ui.border,
  },
  backBtnAbs: {
    position: "absolute",
    left: 14,
    top: 10,
    zIndex: 10,
  },
  iconBtnPressed: { opacity: 0.92, transform: [{ scale: 0.98 }] },

  scroll: { flex: 1 },
  content: { paddingHorizontal: 14, paddingTop: 12, gap: 12 },

  card: {
    backgroundColor: ui.card,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: ui.border,
    shadowColor: "rgba(15,23,42,0.25)",
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },

  profileRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  avatarWrap: {
    width: 62,
    height: 62,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: ui.border,
    backgroundColor: "rgba(15,23,42,0.02)",
  },
  avatar: { width: "100%", height: "100%" },
  name: { fontSize: 18, fontWeight: "900", color: ui.text, textAlign: "right" },
  email: { fontSize: 13, fontWeight: "700", color: ui.muted, textAlign: "right", marginTop: 2 },
  badgesRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginTop: 10 },
  badge: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(17,82,212,0.08)",
    borderWidth: 1,
    borderColor: "rgba(17,82,212,0.12)",
  },
  badgeText: { fontSize: 12, fontWeight: "900", color: ui.primary },

  smallBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(17,82,212,0.08)",
    borderWidth: 1,
    borderColor: "rgba(17,82,212,0.12)",
  },
  smallBtnPressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },

  statsRow: { flexDirection: "row-reverse", gap: 12 },
  statCard: {
    flex: 1,
    backgroundColor: ui.card,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: ui.border,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(17,82,212,0.08)",
    borderWidth: 1,
    borderColor: "rgba(17,82,212,0.12)",
  },
  statValue: { fontSize: 22, fontWeight: "900", color: ui.text, textAlign: "right" },
  statLabel: { fontSize: 12, fontWeight: "800", color: ui.muted, textAlign: "right", marginTop: 2 },

  sectionHeader: { flexDirection: "row-reverse", alignItems: "flex-end", justifyContent: "space-between", gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "900", color: ui.text, textAlign: "right" },
  sectionSubtitle: { fontSize: 12, fontWeight: "800", color: ui.muted, textAlign: "right", marginTop: 4 },

  yearControls: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  yearBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.04)",
    borderWidth: 1,
    borderColor: ui.border,
  },
  yearBtnPressed: { opacity: 0.92, transform: [{ scale: 0.98 }] },
  yearPill: {
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.04)",
    borderWidth: 1,
    borderColor: ui.border,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  yearPillText: { fontSize: 12, fontWeight: "900", color: ui.text },
  dot: { width: 4, height: 4, borderRadius: 99, backgroundColor: "rgba(15,23,42,0.25)" },

  loadingBox: { height: 160, alignItems: "center", justifyContent: "center" },
  chartRow: { paddingTop: 12, paddingBottom: 4, paddingHorizontal: 2, gap: 10 },
  barCol: { width: 44, alignItems: "center", gap: 8 },
  barValue: { fontSize: 12, fontWeight: "900", color: ui.muted },
  barValueHot: { color: ui.text },
  barTrack: {
    width: 20,
    height: 110,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(15,23,42,0.05)",
    justifyContent: "flex-end",
  },
  barFill: { width: "100%", borderRadius: 999 },
  barLabel: { fontSize: 12, fontWeight: "800", color: ui.muted },
  barLabelHot: { color: ui.text },

  actionsBlock: {
    gap: 12,
    backgroundColor: ui.card,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: ui.border,
    shadowColor: "rgba(15,23,42,0.25)",
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },
  actionBtnShadow: {
    height: 56,
    borderRadius: 22,
    width: "100%",
    shadowColor: "rgba(2, 6, 23, 0.30)",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5,
  },
  actionBtnSurface: {
    flex: 1,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 16,
    borderRadius: 22,
    overflow: "hidden",
  },
  actionBtnSurfaceOutline: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(225, 29, 72, 0.35)",
  },
  actionBtnTextLight: { fontSize: 14, fontWeight: "900", color: "white" },
  actionBtnTextDanger: { fontSize: 14, fontWeight: "900", color: ui.danger },

  logoutBtnShadow: {
    height: 56,
    borderRadius: 22,
    width: "100%",
    shadowColor: "rgba(2, 6, 23, 0.30)",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5,
    marginTop: 8,
  },
  logoutBtnSurface: {
    flex: 1,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 16,
    borderRadius: 22,
    overflow: "hidden",
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.35)",
    padding: 16,
    justifyContent: "center",
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.98)",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.65)",
    gap: 12,
  },
  modalTitle: { fontSize: 16, fontWeight: "900", color: ui.text, textAlign: "right" },
  input: {
    height: 46,
    borderRadius: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: ui.border,
    backgroundColor: "rgba(244, 247, 251, 0.9)",
    color: ui.text,
    fontSize: 15,
    fontWeight: "700",
  },
  modalActions: { flexDirection: "row-reverse", gap: 10 },
  modalBtn: { flex: 1, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  modalBtnGhost: { backgroundColor: "rgba(15,23,42,0.05)", borderWidth: 1, borderColor: ui.border },
  modalBtnPrimary: { backgroundColor: ui.primary },
  modalBtnPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  modalBtnText: { fontSize: 14, fontWeight: "900" },

  confirmModalWrap: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  confirmModalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.65)",
    zIndex: 2,
    elevation: 10,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: ui.text,
    textAlign: "right",
    writingDirection: "rtl",
  },
  confirmMessage: {
    fontSize: 14,
    fontWeight: "700",
    color: ui.muted,
    textAlign: "right",
    writingDirection: "rtl",
    lineHeight: 22,
  },
  confirmActions: {
    flexDirection: "row-reverse",
    marginTop: 12,
    marginHorizontal: -6,
  },
  confirmBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 6,
  },
  confirmBtnGhost: {
    backgroundColor: "rgba(15,23,42,0.05)",
    borderWidth: 1,
    borderColor: ui.border,
  },
  confirmBtnDanger: {
    backgroundColor: ui.danger,
  },
  confirmBtnGhostText: {
    fontSize: 14,
    fontWeight: "900",
    color: ui.muted,
    writingDirection: "rtl",
  },
  confirmBtnDangerText: {
    fontSize: 14,
    fontWeight: "900",
    color: "white",
    writingDirection: "rtl",
  },
});

