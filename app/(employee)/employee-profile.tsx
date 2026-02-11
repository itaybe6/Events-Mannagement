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
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";

import { colors } from "@/constants/colors";
import { useUserStore } from "@/store/userStore";
import { supabase } from "@/lib/supabase";

const ui = {
  primary: colors.primary,
  bg: colors.gray[100],
  text: colors.text,
  muted: colors.gray[600],
  danger: colors.error,
};

export default function EmployeeProfileScreen() {
  const router = useRouter();
  const { userData, logout } = useUserStore();

  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [avatarFromUsersTable, setAvatarFromUsersTable] = useState<string>("");

  useEffect(() => {
    if (userData) {
      setForm({
        name: String(userData.name || ""),
        email: String(userData.email || ""),
        phone: String(userData.phone || ""),
      });
    }
  }, [userData?.id]);

  useEffect(() => {
    const loadAvatarFromUsers = async () => {
      if (!userData?.id) {
        setAvatarFromUsersTable("");
        return;
      }

      const { data, error } = await supabase
        .from("users")
        .select("avatar_url")
        .eq("id", userData.id)
        .maybeSingle();

      if (error) {
        console.error("Employee profile avatar fetch error:", error);
        setAvatarFromUsersTable("");
        return;
      }

      setAvatarFromUsersTable(String(data?.avatar_url ?? "").trim());
    };

    void loadAvatarFromUsers();
  }, [userData?.id]);

  const avatarUri = useMemo(() => {
    const fromUsers = avatarFromUsersTable.trim();
    if (fromUsers) return fromUsers;
    const direct = String(userData?.avatar_url ?? "").trim();
    if (direct) return direct;
    const seed = encodeURIComponent(userData?.email ?? "employee");
    return `https://i.pravatar.cc/256?u=${seed}`;
  }, [avatarFromUsersTable, userData?.avatar_url, userData?.email]);

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  const handleSave = async () => {
    if (!userData?.id) return;
    const nextName = form.name.trim();
    const nextEmail = form.email.trim();
    const nextPhone = form.phone.trim();

    if (!nextName || !nextEmail) {
      Alert.alert("שגיאה", "יש למלא שם ואימייל");
      return;
    }

    setSaving(true);
    try {
      const nameChanged = nextName !== (userData.name || "");
      const emailChanged = nextEmail !== (userData.email || "");
      const phoneChanged = nextPhone !== String(userData.phone || "");

      // Update profile table
      if (nameChanged || emailChanged || phoneChanged) {
        const { error: profileError } = await supabase
          .from("users")
          .update({ name: nextName, email: nextEmail, phone: nextPhone || null })
          .eq("id", userData.id);
        if (profileError) throw profileError;
      }

      // Update auth email (if changed)
      if (emailChanged) {
        const { error: emailError } = await supabase.auth.updateUser({ email: nextEmail });
        if (emailError) throw emailError;
      }

      // Sync local store
      useUserStore.setState((state) => ({
        userData: state.userData
          ? { ...state.userData, name: nextName, email: nextEmail, phone: nextPhone || undefined }
          : state.userData,
      }));

      setEditOpen(false);
      Alert.alert("נשמר", "הפרטים עודכנו בהצלחה");
    } catch (e) {
      console.error("Employee profile save error:", e);
      Alert.alert("שגיאה", "לא ניתן לעדכן את הפרטים");
    } finally {
      setSaving(false);
    }
  };

  if (!userData) {
    return (
      <View style={[styles.center, { backgroundColor: ui.bg }]}>
        <ActivityIndicator size="large" color={ui.primary} />
      </View>
    );
  }

  // This screen sits under the custom bottom tab bar.
  const TAB_BAR_HEIGHT = 65;
  const TAB_BAR_BOTTOM_GAP = Platform.OS === "ios" ? 30 : 20;
  const footerBottomOffset = TAB_BAR_HEIGHT + TAB_BAR_BOTTOM_GAP + 12;

  return (
    <View style={[styles.root, { backgroundColor: ui.bg }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: footerBottomOffset + 160 }]}
      >
        <View style={styles.topAccent} pointerEvents="none">
          <View style={styles.topAccentBlobA} />
          <View style={styles.topAccentBlobB} />
        </View>

        <View style={styles.hero}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatarRing}>
              <Image source={{ uri: avatarUri }} style={styles.avatar} contentFit="cover" />
            </View>
          </View>

          <View style={styles.heroText}>
            <Text style={styles.name} numberOfLines={1}>
              {userData.name}
            </Text>
            <Text style={styles.email} numberOfLines={1}>
              {userData.email}
            </Text>
            {userData.phone ? (
              <Text style={styles.phone} numberOfLines={1}>
                {userData.phone}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>הפרטים שלי</Text>

          <View style={styles.row}>
            <Ionicons name="person-outline" size={18} color={colors.gray[600]} />
            <Text style={styles.rowText}>{userData.name}</Text>
          </View>
          <View style={styles.row}>
            <Ionicons name="mail-outline" size={18} color={colors.gray[600]} />
            <Text style={styles.rowText}>{userData.email}</Text>
          </View>
          <View style={styles.row}>
            <Ionicons name="call-outline" size={18} color={colors.gray[600]} />
            <Text style={styles.rowText}>{userData.phone || "לא הוגדר"}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Bottom actions (fixed above tab bar) */}
      <View style={[styles.footerWrap, { bottom: footerBottomOffset }]}>
        <View style={styles.footerPanel}>
          <TouchableOpacity
            onPress={() => setEditOpen(true)}
            style={styles.primaryBtn}
            activeOpacity={0.92}
            accessibilityRole="button"
            accessibilityLabel="עריכת פרופיל"
          >
            <Ionicons name="create-outline" size={18} color={colors.white} />
            <Text style={styles.primaryBtnText}>עריכת פרטים</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleLogout}
            style={styles.dangerBtn}
            activeOpacity={0.92}
            accessibilityRole="button"
            accessibilityLabel="התנתקות"
          >
            <Ionicons name="log-out-outline" size={18} color={ui.danger} />
            <Text style={styles.dangerBtnText}>התנתק</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Edit modal */}
      <Modal transparent visible={editOpen} animationType="fade" onRequestClose={() => setEditOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setEditOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => null}>
            <Text style={styles.modalTitle}>עריכת פרטים</Text>

            <TextInput
              style={styles.input}
              value={form.name}
              onChangeText={(t) => setForm((f) => ({ ...f, name: t }))}
              placeholder="שם מלא"
              placeholderTextColor={colors.gray[500]}
              textAlign="right"
            />
            <TextInput
              style={styles.input}
              value={form.email}
              onChangeText={(t) => setForm((f) => ({ ...f, email: t }))}
              placeholder="אימייל"
              placeholderTextColor={colors.gray[500]}
              keyboardType="email-address"
              autoCapitalize="none"
              textAlign="right"
            />
            <TextInput
              style={styles.input}
              value={form.phone}
              onChangeText={(t) => setForm((f) => ({ ...f, phone: t }))}
              placeholder="טלפון (לא חובה)"
              placeholderTextColor={colors.gray[500]}
              keyboardType="phone-pad"
              textAlign="right"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setEditOpen(false)}
                style={[styles.modalBtn, styles.modalBtnGhost]}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityLabel="ביטול"
              >
                <Text style={[styles.modalBtnText, { color: ui.muted }]}>ביטול</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSave}
                style={[styles.modalBtn, styles.modalBtnPrimary, saving ? { opacity: 0.9 } : null]}
                activeOpacity={0.92}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="שמירה"
              >
                {saving ? <ActivityIndicator color={colors.white} /> : <Text style={[styles.modalBtnText, { color: colors.white }]}>שמור</Text>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { width: "100%", maxWidth: 520, alignSelf: "center", paddingHorizontal: 16, paddingTop: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  topAccent: {
    height: 118,
    marginBottom: -84,
    borderRadius: 26,
    overflow: "hidden",
    backgroundColor: "rgba(30, 79, 162, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(30, 79, 162, 0.10)",
  },
  topAccentBlobA: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 220,
    backgroundColor: "rgba(30, 79, 162, 0.18)",
    top: -110,
    right: -90,
  },
  topAccentBlobB: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 180,
    backgroundColor: "rgba(30, 79, 162, 0.12)",
    bottom: -110,
    left: -70,
  },

  hero: { alignItems: "center", gap: 12, marginTop: 10 },
  avatarWrap: { width: 132, height: 132, alignItems: "center", justifyContent: "center" },
  avatarRing: {
    width: 126,
    height: 126,
    borderRadius: 9999,
    padding: 4,
    backgroundColor: colors.white,
    shadowColor: colors.black,
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  avatar: { width: "100%", height: "100%", borderRadius: 9999 },
  heroText: { alignItems: "center", gap: 4 },
  name: { fontSize: 28, fontWeight: "900", color: ui.text, letterSpacing: -0.6 },
  email: { fontSize: 15, fontWeight: "700", color: ui.muted },
  phone: { fontSize: 14, fontWeight: "700", color: colors.gray[700] },

  card: {
    marginTop: 18,
    backgroundColor: colors.white,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  cardTitle: { fontSize: 16, fontWeight: "900", color: ui.text, textAlign: "right", marginBottom: 10 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingVertical: 10 },
  rowText: { flex: 1, fontSize: 14, fontWeight: "800", color: colors.gray[800], textAlign: "right" },

  footerWrap: {
    position: Platform.OS === "web" ? ("fixed" as any) : "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    zIndex: 50,
    elevation: 50,
  },
  footerPanel: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    flexDirection: "row-reverse",
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: 22,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  primaryBtn: {
    flex: 2,
    height: 52,
    borderRadius: 16,
    backgroundColor: ui.primary,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  primaryBtnText: { color: colors.white, fontSize: 14, fontWeight: "900" },
  dangerBtn: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "rgba(227, 77, 77, 0.35)",
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  dangerBtnText: { color: ui.danger, fontSize: 14, fontWeight: "900" },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.25)", padding: 18, justifyContent: "center" },
  modalCard: {
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 24,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.65)",
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
  modalActions: { flexDirection: "row-reverse", gap: 10, marginTop: 4 },
  modalBtn: { flex: 1, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  modalBtnGhost: { backgroundColor: "rgba(17, 19, 24, 0.04)" },
  modalBtnPrimary: { backgroundColor: ui.primary },
  modalBtnText: { fontSize: 14, fontWeight: "900" },
});

