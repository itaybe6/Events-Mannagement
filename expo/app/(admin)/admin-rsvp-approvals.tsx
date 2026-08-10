import React, { useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
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
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { AppKeyboardAwareScrollView } from "@/components/AppKeyboardAware";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "@/constants/colors";
import { Guest, GuestCategory } from "@/types";
import BackSwipe from "@/components/BackSwipe";
import AppHeader, { APP_HEADER_HEIGHT_COMPACT, getAppHeaderTotalHeight } from "@/components/AppHeader";
import { useRsvpApprovalsModel } from "@/features/rsvp/useRsvpApprovalsModel";
import { ALIGN_LEFT, ALIGN_RIGHT, ROW_DIR } from "@/lib/rtl";
import { getGuestInviteUrl, openInviteUrl } from "@/lib/invitationUrl";

const sanitizePhone = (raw: string) => (raw || "").replace(/[^\d+]/g, "");

export default function AdminRsvpApprovalsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  const isWeb = Platform.OS === "web";
  const headerTotalHeight = getAppHeaderTotalHeight(insets.top, APP_HEADER_HEIGHT_COMPACT);
  const topContentInset = Math.max(30, (insets.top || 0) + 14);

  const resolvedEventId = useMemo(() => String(eventId || "").trim(), [eventId]);
  const fallbackToDetails = useMemo(
    () =>
      resolvedEventId
        ? `/(admin)/admin-event-details?id=${resolvedEventId}`
        : "/(admin)/admin-events",
    [resolvedEventId]
  );

  const handleBack = useCallback(() => {
    router.replace(fallbackToDetails as any);
  }, [fallbackToDetails, router]);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "android") return;
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        handleBack();
        return true;
      });
      return () => sub.remove();
    }, [handleBack])
  );

  const {
    loading,
    query,
    setQuery,
    statusFilter,
    setStatusFilter,
    savingId,
    editingId,
    setEditingId,
    collapsed,
    toggleCollapsed,
    stats,
    sections,
    callGuest,
    setStatus,
  } = useRsvpApprovalsModel(resolvedEventId);

  // Keep content above the custom tab bar
  const TAB_BAR_HEIGHT = 65;
  const TAB_BAR_BOTTOM_GAP = Platform.OS === "ios" ? 30 : 20;
  const bottomReserve = TAB_BAR_HEIGHT + TAB_BAR_BOTTOM_GAP + 18;

  if (loading) {
    return (
      <BackSwipe fallbackHref={fallbackToDetails} onBack={handleBack}>
        <Stack.Screen
          options={
            isWeb
              ? {
                  headerStyle: { height: headerTotalHeight },
                  header: () => <AppHeader variant="compact" canGoBack onPressBack={handleBack} />,
                }
              : { headerShown: false }
          }
        />
        <View style={styles.screen}>
          {!isWeb ? (
            <>
              <LinearGradient
                colors={["#F7FAFF", "#E8F1FF", "#F2E0BA"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.bg}
              />
              <LinearGradient
                colors={["rgba(255,255,255,0.68)", "rgba(255,255,255,0)"]}
                start={{ x: 0.05, y: 0 }}
                end={{ x: 0.75, y: 0.55 }}
                style={styles.bgHighlight}
              />
              <LinearGradient
                colors={["rgba(232,196,122,0.58)", "rgba(244,224,186,0.22)", "rgba(244,224,186,0)"]}
                start={{ x: 1, y: 0.95 }}
                end={{ x: 0.18, y: 0.22 }}
                style={styles.bgWarmGlow}
              />
              <View style={[styles.topSpacer, { paddingTop: topContentInset }]}>
                <View style={styles.topRow}>
                  <TouchableOpacity
                    style={styles.backButton}
                    onPress={handleBack}
                    activeOpacity={0.86}
                    accessibilityRole="button"
                    accessibilityLabel="חזרה לעמוד האירוע"
                  >
                    <Ionicons name="chevron-forward" size={22} color={colors.primary} />
                  </TouchableOpacity>
                  <Text style={styles.screenTitle}>אישורי הגעה</Text>
                </View>
              </View>
            </>
          ) : null}
          <View style={[styles.center, !isWeb ? styles.centerTransparent : null, { paddingTop: isWeb ? insets.top : 0 }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>טוען...</Text>
          </View>
        </View>
      </BackSwipe>
    );
  }

  if (!resolvedEventId) {
    return (
      <BackSwipe fallbackHref="/(admin)/admin-events" onBack={handleBack}>
        <Stack.Screen
          options={
            isWeb
              ? {
                  headerStyle: { height: headerTotalHeight },
                  header: () => <AppHeader variant="compact" canGoBack onPressBack={handleBack} />,
                }
              : { headerShown: false }
          }
        />
        <View style={styles.screen}>
          {!isWeb ? (
            <>
              <LinearGradient
                colors={["#F7FAFF", "#E8F1FF", "#F2E0BA"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.bg}
              />
              <LinearGradient
                colors={["rgba(255,255,255,0.68)", "rgba(255,255,255,0)"]}
                start={{ x: 0.05, y: 0 }}
                end={{ x: 0.75, y: 0.55 }}
                style={styles.bgHighlight}
              />
              <LinearGradient
                colors={["rgba(232,196,122,0.58)", "rgba(244,224,186,0.22)", "rgba(244,224,186,0)"]}
                start={{ x: 1, y: 0.95 }}
                end={{ x: 0.18, y: 0.22 }}
                style={styles.bgWarmGlow}
              />
              <View style={[styles.topSpacer, { paddingTop: topContentInset }]}>
                <View style={styles.topRow}>
                  <TouchableOpacity
                    style={styles.backButton}
                    onPress={handleBack}
                    activeOpacity={0.86}
                    accessibilityRole="button"
                    accessibilityLabel="חזרה לרשימת אירועים"
                  >
                    <Ionicons name="chevron-forward" size={22} color={colors.primary} />
                  </TouchableOpacity>
                  <Text style={styles.screenTitle}>אישורי הגעה</Text>
                </View>
              </View>
            </>
          ) : null}
          <View
            style={[
              styles.center,
              !isWeb ? styles.centerTransparent : null,
              { paddingTop: isWeb ? insets.top : 0, paddingHorizontal: 20 },
            ]}
          >
          <Text style={styles.errorTitle}>חסר מזהה אירוע</Text>
          <TouchableOpacity
            onPress={() => router.replace("/(admin)/admin-events")}
            style={styles.backBtn}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="חזרה לרשימת אירועים"
          >
            <Text style={styles.backBtnText}>חזרה</Text>
          </TouchableOpacity>
          </View>
        </View>
      </BackSwipe>
    );
  }

  return (
    <BackSwipe fallbackHref={fallbackToDetails} onBack={handleBack}>
      <Stack.Screen
        options={
          isWeb
            ? {
                headerStyle: { height: headerTotalHeight },
                header: () => <AppHeader variant="compact" canGoBack onPressBack={handleBack} />,
              }
            : { headerShown: false }
        }
      />
      <View style={styles.screen}>
        {!isWeb ? (
          <>
            <LinearGradient
              colors={["#F7FAFF", "#E8F1FF", "#F2E0BA"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.bg}
            />
            <LinearGradient
              colors={["rgba(255,255,255,0.68)", "rgba(255,255,255,0)"]}
              start={{ x: 0.05, y: 0 }}
              end={{ x: 0.75, y: 0.55 }}
              style={styles.bgHighlight}
            />
            <LinearGradient
              colors={["rgba(232,196,122,0.58)", "rgba(244,224,186,0.22)", "rgba(244,224,186,0)"]}
              start={{ x: 1, y: 0.95 }}
              end={{ x: 0.18, y: 0.22 }}
              style={styles.bgWarmGlow}
            />

            <View style={[styles.topSpacer, { paddingTop: topContentInset }]}>
              <View style={styles.topRow}>
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={handleBack}
                  activeOpacity={0.86}
                  accessibilityRole="button"
                  accessibilityLabel="חזרה לעמוד האירוע"
                >
                  <Ionicons name="chevron-forward" size={22} color={colors.primary} />
                </TouchableOpacity>
                <Text style={styles.screenTitle}>אישורי הגעה</Text>
              </View>
            </View>
          </>
        ) : null}
        <AppKeyboardAwareScrollView
          showsVerticalScrollIndicator={false}
          stickyHeaderIndices={isWeb ? [0] : undefined}
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: isWeb ? insets.top : 8,
              paddingBottom: bottomReserve + insets.bottom,
            },
          ]}
        >
          {/* Sticky header (inspired by provided design) */}
          <View style={[styles.headerSticky, !isWeb ? styles.headerStickyMobile : null]}>
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
                onPress={() => setStatusFilter("אולי מגיע")}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityLabel="סינון: אולי מגיעים"
                style={[styles.pillMaybe, statusFilter === "אולי מגיע" && styles.pillActiveMaybe]}
              >
                <Text style={[styles.pillTextMaybe, statusFilter === "אולי מגיע" && styles.pillTextActiveMaybe]}>
                  {`${stats.maybe} אולי מגיעים`}
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
                      style={{ marginStart: 6 }}
                    />
                  </TouchableOpacity>

                  {!isCollapsed ? (
                    <View>
                      {sec.data.map((g) => {
                        const isSaving = savingId === g.id;
                        const phoneOk = Boolean(sanitizePhone(g.phone));
                        const badgeLabel = g.status; // "מגיע" | "אולי מגיע" | "ממתין" | "לא מגיע"
                        const isEditing = editingId === g.id;
                        const showActionButtons = g.status === "ממתין" || g.status === "אולי מגיע" || isEditing;
                        const inviteUrl = getGuestInviteUrl(g);
                        return (
                          <View key={g.id} style={styles.guestItem}>
                            <View style={styles.rightGroup}>
                              <View style={styles.nameCol}>
                                <Text style={styles.guestName} numberOfLines={1}>
                                  {g.name}
                                </Text>
                                {inviteUrl ? (
                                  <TouchableOpacity
                                    onPress={() => void openInviteUrl(inviteUrl)}
                                    activeOpacity={0.75}
                                    accessibilityRole="link"
                                    accessibilityLabel={`פתיחת הזמנה עבור ${g.name}`}
                                    style={styles.inviteLinkBtn}
                                  >
                                    <Ionicons name="open-outline" size={13} color={colors.primary} />
                                    <Text style={styles.inviteLinkText}>קישור להזמנה</Text>
                                  </TouchableOpacity>
                                ) : null}
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
                                    <Ionicons name="call" size={19} color={colors.gray[500]} />
                                  </TouchableOpacity>

                                  <TouchableOpacity
                                    onPress={() => setStatus(g.id, "לא מגיע")}
                                    style={[styles.iconBtn, styles.iconBtnDecline]}
                                    activeOpacity={0.9}
                                    disabled={isSaving}
                                    accessibilityRole="button"
                                    accessibilityLabel={`סימון לא מגיע ל${g.name}`}
                                  >
                                    <Ionicons name="close" size={19} color={"#f87171"} />
                                  </TouchableOpacity>

                                  <TouchableOpacity
                                    onPress={() => setStatus(g.id, "אולי מגיע")}
                                    style={[styles.iconBtn, styles.iconBtnMaybe]}
                                    activeOpacity={0.9}
                                    disabled={isSaving}
                                    accessibilityRole="button"
                                    accessibilityLabel={`סימון אולי מגיע עבור ${g.name}`}
                                  >
                                    <Ionicons name="help" size={19} color={colors.primary} />
                                  </TouchableOpacity>

                                  <TouchableOpacity
                                    onPress={() => setStatus(g.id, "מגיע")}
                                    style={[styles.iconBtn, styles.iconBtnConfirm]}
                                    activeOpacity={0.9}
                                    disabled={isSaving}
                                    accessibilityRole="button"
                                    accessibilityLabel={`אישור הגעה ל${g.name}`}
                                  >
                                    <Ionicons name="checkmark" size={19} color={colors.primary} />
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
                                      <Ionicons name="close" size={19} color={colors.gray[600]} />
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
                                      g.status === "מגיע"
                                        ? styles.badgeConfirmed
                                        : g.status === "אולי מגיע"
                                          ? styles.badgeMaybe
                                          : styles.badgeDeclined,
                                      g.status === "מגיע" ? styles.badgeOffsetComing : null,
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.badgeTextBase,
                                        g.status === "מגיע"
                                          ? styles.badgeTextConfirmed
                                          : g.status === "אולי מגיע"
                                            ? styles.badgeTextMaybe
                                            : styles.badgeTextDeclined,
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
        </AppKeyboardAwareScrollView>
      </View>
    </BackSwipe>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.gray[100] },
  bg: {
    ...StyleSheet.absoluteFillObject,
  },
  bgHighlight: {
    ...StyleSheet.absoluteFillObject,
  },
  bgWarmGlow: {
    ...StyleSheet.absoluteFillObject,
  },
  topSpacer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  topRow: {
    flexDirection: ROW_DIR,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.08)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.richBlack,
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  screenTitle: {
    flex: 1,
    fontSize: 24,
    fontWeight: "900",
    color: colors.richBlack,
    textAlign: "right",
  },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16 },
  center: { flex: 1, backgroundColor: colors.gray[100], alignItems: "center", justifyContent: "center", gap: 10 },
  centerTransparent: { backgroundColor: "transparent" },
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
  headerStickyMobile: {
    borderBottomWidth: 0,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(21,76,151,0.08)",
    backgroundColor: "rgba(255,255,255,0.88)",
    shadowColor: colors.richBlack,
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
    marginBottom: 14,
  },

  pillsRow: { flexDirection: ROW_DIR, gap: 10, paddingRight: 0, minWidth: "100%", justifyContent: "flex-start" },
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

  pillMaybe: {
    backgroundColor: "rgba(17, 82, 212, 0.10)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(17, 82, 212, 0.18)",
  },
  pillTextMaybe: { fontSize: 11, fontWeight: "900", color: colors.primary },
  pillActiveMaybe: { backgroundColor: "rgba(17, 82, 212, 0.16)", borderColor: "rgba(17, 82, 212, 0.28)" },
  pillTextActiveMaybe: { color: colors.primary },

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
  searchIcon: { position: "absolute", right: 14 },
  searchInputNew: {
    paddingRight: 40,
    paddingLeft: 16,
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
  },

  body: { paddingHorizontal: 0, paddingTop: 0 },

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
    flexDirection: ROW_DIR,
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
    flexDirection: ROW_DIR,
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(15,23,42,0.06)",
    backgroundColor: colors.white,
  },
  rightGroup: { flex: 1, minWidth: 0, flexDirection: ROW_DIR, alignItems: "center" },
  nameCol: { flex: 1, minWidth: 0, alignItems: ALIGN_RIGHT },
  guestName: { minWidth: 0, flexShrink: 1, fontSize: 14, fontWeight: "900", color: colors.text, textAlign: "right" },
  inviteLinkBtn: {
    marginTop: 4,
    flexDirection: ROW_DIR,
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-end",
  },
  inviteLinkText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.primary,
    textDecorationLine: "underline",
    textDecorationColor: "rgba(17, 82, 212, 0.35)",
  },
  leftSlot: { width: 210, alignItems: ALIGN_LEFT, justifyContent: "center" },

  badgeBase: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  // Nudge "מגיע" badge right to align with "לא מגיע"
  badgeOffsetComing: { marginStart: 10 },
  badgeTextBase: { fontSize: 13, fontWeight: "900" },
  badgeConfirmed: { backgroundColor: "rgba(52, 199, 89, 0.12)", borderColor: "rgba(52, 199, 89, 0.22)" },
  badgeTextConfirmed: { color: colors.success },
  badgeMaybe: { backgroundColor: "rgba(17, 82, 212, 0.10)", borderColor: "rgba(17, 82, 212, 0.18)" },
  badgeTextMaybe: { color: colors.primary },
  badgeDeclined: { backgroundColor: "rgba(255, 59, 48, 0.10)", borderColor: "rgba(255, 59, 48, 0.18)" },
  badgeTextDeclined: { color: "#dc2626" },

  actionsInline: { flexDirection: ROW_DIR, alignItems: "center", gap: 10 },
  statusEditRow: { flexDirection: ROW_DIR, alignItems: "center", gap: 10 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.04)",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.06)",
  },
  iconBtnDecline: { backgroundColor: "rgba(255, 59, 48, 0.10)", borderColor: "rgba(255, 59, 48, 0.16)" },
  iconBtnMaybe: { backgroundColor: "rgba(17, 82, 212, 0.10)", borderColor: "rgba(17, 82, 212, 0.16)" },
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

