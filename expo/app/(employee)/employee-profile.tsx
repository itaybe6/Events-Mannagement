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
import { AppKeyboardAwareScrollView } from "@/components/AppKeyboardAware";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";

import { colors } from "@/constants/colors";
import { useUserStore } from "@/store/userStore";
import { supabase } from "@/lib/supabase";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DeleteAccountSection } from "@/components/DeleteAccountSection";

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
  const insets = useSafeAreaInsets();

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
  const topContentInset = Math.max(20, (insets.top || 0) + 10);

  return (
    <View style={[styles.root, { backgroundColor: ui.bg }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingTop: topContentInset, paddingBottom: footerBottomOffset + 160 },
        ]}
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
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>הפרטים שלי</Text>
            <View style={styles.cardHeaderBadge}>
              <Ionicons name="person-circle-outline" size={18} color={ui.primary} />
            </View>
          </View>

          <View style={styles.infoList}>
            <View style={styles.row}>
              <View style={styles.rowIconWrap}>
                <Ionicons name="person-outline" size={18} color={ui.primary} />
              </View>
              <Text style={styles.rowText}>{userData.name}</Text>
            </View>
            <View style={styles.rowDivider} />
            <View style={styles.row}>
              <View style={styles.rowIconWrap}>
                <Ionicons name="mail-outline" size={18} color={ui.primary} />
              </View>
              <Text style={styles.rowText}>{userData.email}</Text>
            </View>
            <View style={styles.rowDivider} />
            <View style={styles.row}>
              <View style={styles.rowIconWrap}>
                <Ionicons name="call-outline" size={18} color={ui.primary} />
              </View>
              <Text style={styles.rowText}>{userData.phone || "לא הוגדר"}</Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={() => setEditOpen(true)}
            style={styles.editDetailsBtn}
            activeOpacity={0.92}
            accessibilityRole="button"
            accessibilityLabel="עריכת פרופיל"
          >
            <Ionicons name="create-outline" size={18} color={colors.white} />
            <Text style={styles.editDetailsBtnText}>עריכת פרטים</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleLogout}
            style={styles.logoutBtn}
            activeOpacity={0.92}
            accessibilityRole="button"
            accessibilityLabel="התנתקות"
          >
            <Ionicons name="log-out-outline" size={18} color={colors.white} />
            <Text style={styles.logoutBtnText}>התנתק</Text>
          </TouchableOpacity>
        </View>

        {/* מחיקת חשבון - נדרש לפי הנחיות App Store 5.1.1(v) */}
        <View style={styles.deleteAccountWrap}>
          <DeleteAccountSection
            onDeleted={() => {
              router.replace("/login");
            }}
          />
        </View>
      </ScrollView>

      {/* Edit modal */}
      <Modal transparent visible={editOpen} animationType="fade" onRequestClose={() => setEditOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setEditOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => null}>
            <AppKeyboardAwareScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.modalScrollContent}
            >
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderIcon}>
                  <Ionicons name="create-outline" size={18} color={ui.primary} />
                </View>

                <View style={styles.modalHeaderTextWrap}>
                  <Text style={styles.modalTitle}>עריכת פרטים</Text>
                  <Text style={styles.modalSubtitle}>עדכן את הפרטים האישיים שלך כפי שיוצגו בפרופיל.</Text>
                </View>

                <TouchableOpacity
                  onPress={() => setEditOpen(false)}
                  style={styles.modalCloseBtn}
                  activeOpacity={0.9}
                  accessibilityRole="button"
                  accessibilityLabel="סגירת חלון"
                >
                  <Ionicons name="close" size={18} color={ui.muted} />
                </TouchableOpacity>
              </View>

              <View style={styles.modalFieldsCard}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>שם מלא</Text>
                  <TextInput
                    style={styles.input}
                    value={form.name}
                    onChangeText={(t) => setForm((f) => ({ ...f, name: t }))}
                    placeholder="שם מלא"
                    placeholderTextColor={colors.gray[500]}
                    textAlign="right"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>אימייל</Text>
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
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>טלפון</Text>
                  <TextInput
                    style={styles.input}
                    value={form.phone}
                    onChangeText={(t) => setForm((f) => ({ ...f, phone: t }))}
                    placeholder="טלפון (לא חובה)"
                    placeholderTextColor={colors.gray[500]}
                    keyboardType="phone-pad"
                    textAlign="right"
                  />
                </View>
              </View>

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
                  {saving ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={[styles.modalBtnText, { color: colors.white }]}>שמור</Text>
                  )}
                </TouchableOpacity>
              </View>
            </AppKeyboardAwareScrollView>
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
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 26,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(17,19,24,0.05)",
    shadowColor: colors.black,
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  deleteAccountWrap: {
    marginTop: 16,
  },
  cardHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  cardHeaderBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(8,33,95,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 18, fontWeight: "900", color: ui.text, textAlign: "right" },
  infoList: {
    backgroundColor: "rgba(245,247,251,0.7)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(17,19,24,0.04)",
    overflow: "hidden",
  },
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  rowIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(8,33,95,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  rowDivider: {
    height: 1,
    marginHorizontal: 14,
    backgroundColor: "rgba(17,19,24,0.06)",
  },
  rowText: { flex: 1, fontSize: 15, fontWeight: "800", color: colors.gray[800], textAlign: "right" },
  editDetailsBtn: {
    marginTop: 16,
    height: 54,
    borderRadius: 18,
    backgroundColor: ui.primary,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: ui.primary,
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  editDetailsBtnText: { color: colors.white, fontSize: 15, fontWeight: "900" },
  logoutBtn: {
    marginTop: 12,
    height: 52,
    borderRadius: 18,
    backgroundColor: ui.danger,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: ui.danger,
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  logoutBtnText: { color: colors.white, fontSize: 15, fontWeight: "900" },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(8, 15, 34, 0.34)", padding: 18, justifyContent: "center" },
  modalCard: {
    backgroundColor: colors.white,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(17,19,24,0.06)",
    shadowColor: colors.black,
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
    overflow: "hidden",
  },
  modalScrollContent: {
    padding: 18,
    gap: 16,
  },
  modalHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  modalHeaderTextWrap: {
    flex: 1,
    alignItems: "flex-end",
    gap: 4,
  },
  modalHeaderIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: "rgba(8,33,95,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCloseBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(17,19,24,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: { fontSize: 22, fontWeight: "900", color: ui.text, textAlign: "right" },
  modalSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    color: ui.muted,
    textAlign: "right",
  },
  modalFieldsCard: {
    backgroundColor: colors.white,
    borderRadius: 22,
    padding: 14,
    gap: 14,
    borderWidth: 1,
    borderColor: "rgba(17,19,24,0.06)",
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: ui.text,
    textAlign: "right",
  },
  input: {
    height: 50,
    borderRadius: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "rgba(17, 19, 24, 0.08)",
    backgroundColor: colors.white,
    color: ui.text,
    fontSize: 15,
    fontWeight: "700",
  },
  modalActions: { flexDirection: "row-reverse", gap: 10, marginTop: 2 },
  modalBtn: { flex: 1, height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  modalBtnGhost: {
    backgroundColor: "rgba(17, 19, 24, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(17,19,24,0.06)",
  },
  modalBtnPrimary: { backgroundColor: ui.primary },
  modalBtnText: { fontSize: 14, fontWeight: "900" },
});

