import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Search, CalendarDays, Users as UsersIcon, ChevronLeft, UserRound } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "@/constants/colors";
import { eventService } from "@/lib/services/eventService";
import { userService, type UserWithMetadata } from "@/lib/services/userService";
import { useUserStore } from "@/store/userStore";
import type { Event } from "@/types";
import { AdminTabRoute } from "@/components/animations/shopifytabs/lib/constants/admin-tabs";
import { ROW_DIR, ALIGN_RIGHT, rtlText } from "@/lib/rtl";
import { getFloatingTabBarContentPadding } from "@/lib/floatingTabBarInset";
import { inferEventType } from "@/features/events/eventsConstants";

type SearchScope = "all" | "events" | "users";

const SEARCH_SCOPES: Array<{ label: string; value: SearchScope }> = [
  { label: "הכל", value: "all" },
  { label: "אירועים", value: "events" },
  { label: "משתמשים", value: "users" },
];

const formatDate = (value: Date) => {
  try {
    return value.toLocaleDateString("he-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  } catch {
    return "";
  }
};

const getEventDisplayTitle = (rawTitle: string) => {
  const title = String(rawTitle || "").trim();
  if (!title) return "";
  const eventType = inferEventType(title);
  if (!eventType) return title;
  const withoutTypePrefix = title.replace(new RegExp(`^${eventType}\\s*[–—-]\\s*`), "").trim();
  return withoutTypePrefix || title;
};

const getUserTypeLabel = (userType?: string) => {
  switch (String(userType || "").trim()) {
    case "event_owner":
      return "בעל אירוע";
    case "admin":
      return "מנהל";
    case "employee":
      return "עובד";
    default:
      return userType || "";
  }
};

export default function AdminSearchScreen() {
  const router = useRouter();
  const { isLoggedIn, userType } = useUserStore();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const hasLoadedOnceRef = React.useRef(false);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>("all");
  const [events, setEvents] = useState<Event[]>([]);
  const [users, setUsers] = useState<UserWithMetadata[]>([]);
  const [isScopeVisible, setIsScopeVisible] = useState(true);
  const [isStickyHeaderActive, setIsStickyHeaderActive] = useState(false);
  const lastScrollYRef = React.useRef(0);
  const scrollY = React.useRef(new Animated.Value(0)).current;
  const scopeProgress = React.useRef(new Animated.Value(1)).current;

  const loadSearchData = useCallback(async () => {
    // לואדר מלא רק בטעינה הראשונה; בחזרות למסך מרעננים בשקט ברקע
    const isFirstLoad = !hasLoadedOnceRef.current;
    if (isFirstLoad) setLoading(true);
    try {
      const [eventsData, usersData] = await Promise.all([
        eventService.getEvents(),
        userService.getAllUsers(),
      ]);

      setEvents(Array.isArray(eventsData) ? eventsData : []);
      setUsers(Array.isArray(usersData) ? usersData : []);
    } catch (error) {
      console.error("Admin search load error:", error);
      setEvents([]);
      setUsers([]);
    } finally {
      hasLoadedOnceRef.current = true;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn || userType !== "admin") {
      router.replace("/login");
    }
  }, [isLoggedIn, userType, router]);

  // הפוקוס מכסה גם את הטעינה הראשונית — קריאה נוספת ב-useEffect הייתה גורמת ל-fetch כפול
  useFocusEffect(
    useCallback(() => {
      if (!isLoggedIn || userType !== "admin") return;
      void loadSearchData();
    }, [isLoggedIn, userType, loadSearchData])
  );

  const normalizedQuery = query.trim().toLowerCase();

  const filteredEvents = useMemo(() => {
    const base = [...events].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    if (!normalizedQuery) return base;

    return base.filter((event) =>
      [event.title, event.location, event.city, event.userName ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [events, normalizedQuery]);

  const filteredUsers = useMemo(() => {
    const base = [...users];

    if (!normalizedQuery) return base;

    return base.filter((user) =>
      [user.name, user.email, user.phone ?? "", user.userType]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [users, normalizedQuery]);

  const showEvents = scope === "all" || scope === "events";
  const showUsers = scope === "all" || scope === "users";

  useEffect(() => {
    Animated.timing(scopeProgress, {
      toValue: isScopeVisible ? 1 : 0,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [isScopeVisible, scopeProgress]);

  const scopeHeight = scopeProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 62],
  });
  const scopeOpacity = scopeProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const scopeTranslateY = scopeProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-10, 0],
  });
  const scopeMarginTop = scopeProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 14],
  });
  const headerBackdropColor = scrollY.interpolate({
    inputRange: [0, 16],
    outputRange: ["rgba(255,255,255,0)", "rgba(255,255,255,0.98)"],
    extrapolate: "clamp",
  });
  const headerBorderColor = scrollY.interpolate({
    inputRange: [0, 16],
    outputRange: ["rgba(6,23,62,0)", "rgba(6,23,62,0.05)"],
    extrapolate: "clamp",
  });
  const headerShadowOpacity = scrollY.interpolate({
    inputRange: [0, 16],
    outputRange: [0, 0.08],
    extrapolate: "clamp",
  });
  const searchCardBorderColor = scrollY.interpolate({
    inputRange: [0, 16],
    outputRange: ["rgba(255,255,255,0.92)", "rgba(6,23,62,0.12)"],
    extrapolate: "clamp",
  });
  const searchHeaderSpacerHeight = insets.top + 16 + 60;
  const scopeSpacerHeight = Animated.add(scopeHeight, scopeMarginTop);

  return (
    <View style={styles.screen}>
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
      <Animated.View
        style={[
          styles.floatingTopControls,
          {
            paddingTop: insets.top + 16,
            backgroundColor: headerBackdropColor,
            borderBottomColor: headerBorderColor,
            shadowOpacity: headerShadowOpacity,
            elevation: isStickyHeaderActive ? 3 : 0,
          },
        ]}
      >
        <Animated.View style={[styles.searchCard, { borderColor: searchCardBorderColor }]}>
          <View style={styles.searchIconWrap}>
            <Search size={17} color={colors.primary} />
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="חפש אירוע, משתמש או אימייל..."
            placeholderTextColor={colors.gray[500]}
            style={styles.searchInput}
            textAlign="right"
            returnKeyType="search"
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.scopeAnimatedWrap,
            {
              height: scopeHeight,
              marginTop: scopeMarginTop,
            },
          ]}
        >
          <Animated.View
            style={[
              styles.scopeAnimatedInner,
              {
                opacity: scopeOpacity,
                transform: [{ translateY: scopeTranslateY }],
              },
            ]}
          >
            <View style={styles.scopeRow}>
              {SEARCH_SCOPES.map((item) => {
                const active = scope === item.value;

                return (
                  <Pressable
                    key={item.value}
                    onPress={() => setScope(item.value)}
                    style={[styles.scopeChip, active && styles.scopeChipActive]}
                  >
                    <Text style={[styles.scopeChipText, active && styles.scopeChipTextActive]}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>
        </Animated.View>
      </Animated.View>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: getFloatingTabBarContentPadding(insets.bottom) },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={(event) => {
          const offsetY = Math.max(Number(event.nativeEvent.contentOffset.y ?? 0), 0);
          const deltaY = offsetY - lastScrollYRef.current;
          scrollY.setValue(offsetY);

          if (offsetY <= 12) {
            setIsScopeVisible(true);
            setIsStickyHeaderActive(false);
            lastScrollYRef.current = 0;
            return;
          }

          if (Math.abs(deltaY) < 2) {
            lastScrollYRef.current = offsetY;
            return;
          }

          if (deltaY > 3) {
            if (!isStickyHeaderActive) setIsStickyHeaderActive(true);
            if (isScopeVisible) setIsScopeVisible(false);
          } else if (deltaY < -3) {
            if (isStickyHeaderActive) setIsStickyHeaderActive(false);
            if (!isScopeVisible) setIsScopeVisible(true);
          }

          lastScrollYRef.current = offsetY;
        }}
      >
        <View style={{ height: searchHeaderSpacerHeight }} />
        <Animated.View style={{ height: scopeSpacerHeight }} />

        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <>
            {showEvents ? (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>אירועים</Text>
                  <View style={styles.sectionBadge}>
                    <Text style={styles.sectionBadgeText}>{filteredEvents.length}</Text>
                  </View>
                </View>

                {filteredEvents.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <Text style={styles.emptyText}>לא נמצאו אירועים עבור החיפוש הזה.</Text>
                  </View>
                ) : (
                  filteredEvents.map((event) => {
                    const eventTypeLabel = rtlText(inferEventType(event.title) || "אירוע");
                    const eventTitleLabel = rtlText(getEventDisplayTitle(event.title));

                    return (
                      <Pressable
                        key={event.id}
                        style={[styles.resultCard, styles.resultCardEvent]}
                        onPress={() =>
                          router.push({
                            pathname: "/(admin)/admin-event-details",
                            params: { id: event.id },
                          })
                        }
                      >
                        <View style={[styles.resultIconWrap, styles.eventResultIconWrap]}>
                          <CalendarDays size={18} color={colors.primary} />
                        </View>
                        <View style={styles.resultTextWrap}>
                          <View style={styles.resultTextTag}>
                            <Text style={styles.resultTitle}>{eventTitleLabel}</Text>
                          </View>
                          <View style={styles.eventTypeTag}>
                            <Text style={styles.eventTypeTagText}>{eventTypeLabel}</Text>
                          </View>
                          <View style={styles.resultTextTag}>
                            <Text style={styles.resultSubtitle}>
                              {event.userName ? `${event.userName} • ` : ""}
                              {event.location}
                              {event.city ? `, ${event.city}` : ""}
                            </Text>
                          </View>
                          <View style={styles.resultMetaPill}>
                            <Text style={styles.resultMeta}>{formatDate(new Date(event.date))}</Text>
                          </View>
                        </View>
                        <View style={styles.resultChevronWrap}>
                          <ChevronLeft size={16} color={colors.gray[500]} />
                        </View>
                      </Pressable>
                    );
                  })
                )}
              </View>
            ) : null}

            {showUsers ? (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>משתמשים</Text>
                  <View style={styles.sectionBadge}>
                    <Text style={styles.sectionBadgeText}>{filteredUsers.length}</Text>
                  </View>
                </View>

                {filteredUsers.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <Text style={styles.emptyText}>לא נמצאו משתמשים עבור החיפוש הזה.</Text>
                  </View>
                ) : (
                  filteredUsers.map((user) => {
                    const userTypeLabel = getUserTypeLabel(user.userType);

                    return (
                      <Pressable
                        key={user.id}
                        style={[styles.resultCard, styles.resultCardUser]}
                        onPress={() => router.navigate(`/(admin)/${AdminTabRoute.Users}`)}
                      >
                        <View style={[styles.resultIconWrap, styles.userResultIconWrap]}>
                          {user.userType === "admin" ? (
                            <UserRound size={18} color={colors.primary} />
                          ) : (
                            <UsersIcon size={18} color={colors.primary} />
                          )}
                        </View>
                        <View style={styles.resultTextWrap}>
                          <View style={styles.resultTextTag}>
                            <Text style={styles.resultTitle}>{user.name}</Text>
                          </View>
                          <View style={styles.resultTextTag}>
                            <Text style={styles.resultSubtitle}>{user.email}</Text>
                          </View>
                          <View style={styles.resultMetaPill}>
                            <Text style={styles.resultMeta}>{userTypeLabel}</Text>
                          </View>
                        </View>
                        <View style={styles.resultChevronWrap}>
                          <ChevronLeft size={16} color={colors.gray[500]} />
                        </View>
                      </Pressable>
                    );
                  })
                )}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#E8F1FF",
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
  },
  bgHighlight: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.95,
  },
  bgWarmGlow: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.78,
  },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 0,
    gap: 16,
  },
  floatingTopControls: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    paddingHorizontal: 18,
    paddingBottom: 10,
    borderBottomWidth: 1,
    shadowColor: colors.black,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  searchCard: {
    flexDirection: ROW_DIR,
    alignItems: "center",
    gap: 12,
    minHeight: 60,
    paddingHorizontal: 16,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.94)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.92)",
    shadowColor: colors.richBlack,
    shadowOpacity: 0.035,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  searchIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(6,23,62,0.06)",
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  scopeAnimatedWrap: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  scopeAnimatedInner: {
    alignItems: "center",
    justifyContent: "center",
  },
  scopeRow: {
    flexDirection: ROW_DIR,
    alignSelf: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.52)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.82)",
    shadowColor: colors.richBlack,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  scopeChip: {
    minWidth: 84,
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.82)",
    borderWidth: 1,
    borderColor: "rgba(6,23,62,0.05)",
  },
  scopeChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  scopeChipText: {
    color: colors.gray[700],
    fontWeight: "800",
    textAlign: "center",
  },
  scopeChipTextActive: {
    color: colors.white,
  },
  loadingState: {
    paddingTop: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: ROW_DIR,
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: colors.text,
    textAlign: "right",
  },
  sectionBadge: {
    minWidth: 34,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(6,23,62,0.08)",
  },
  sectionBadgeText: {
    color: colors.primary,
    fontWeight: "800",
  },
  emptyCard: {
    padding: 18,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.75)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  emptyText: {
    color: colors.gray[600],
    textAlign: "right",
    fontWeight: "700",
  },
  resultCard: {
    flexDirection: ROW_DIR,
    alignItems: "center",
    gap: 12,
    padding: 15,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.78)",
    shadowColor: colors.richBlack,
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  resultCardEvent: {
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  resultCardUser: {
    backgroundColor: "rgba(255,255,255,0.88)",
  },
  resultIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(6,23,62,0.05)",
  },
  eventResultIconWrap: {
    backgroundColor: "rgba(232, 240, 255, 0.9)",
  },
  userResultIconWrap: {
    backgroundColor: "rgba(244, 239, 226, 0.95)",
  },
  resultTextWrap: {
    flex: 1,
    alignItems: ALIGN_RIGHT,
  },
  resultTextTag: {
    alignSelf: ALIGN_RIGHT,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  resultTitle: {
    textAlign: "right",
    fontSize: 16,
    fontWeight: "900",
    color: colors.text,
  },
  eventTypeTag: {
    alignSelf: ALIGN_RIGHT,
    marginTop: 4,
    marginBottom: 2,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(6,23,62,0.06)",
    borderWidth: 1,
    borderColor: "rgba(6,23,62,0.05)",
  },
  eventTypeTagText: {
    textAlign: "right",
    fontSize: 12,
    fontWeight: "800",
    color: colors.primary,
  },
  resultSubtitle: {
    textAlign: "right",
    fontSize: 13,
    fontWeight: "700",
    color: colors.gray[600],
  },
  resultMeta: {
    textAlign: "center",
    fontSize: 12,
    fontWeight: "800",
    color: colors.primary,
  },
  resultMetaPill: {
    marginTop: 8,
    alignSelf: ALIGN_RIGHT,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(6,23,62,0.06)",
    borderWidth: 1,
    borderColor: "rgba(6,23,62,0.05)",
  },
  resultChevronWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(6,23,62,0.04)",
  },
});
