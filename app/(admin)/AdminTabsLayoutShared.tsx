import React, { useEffect } from "react";
import { Tabs, useGlobalSearchParams, useRouter, useSegments } from "expo-router";
import { colors } from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useLayoutStore } from "@/store/layoutStore";
import { useUserStore } from "@/store/userStore";
import AppHeader, {
  APP_HEADER_HEIGHT_COMPACT,
  getAppHeaderTotalHeight,
} from "@/components/AppHeader";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AdminTabBar } from "@/components/animations/shopifytabs/admin-tab-bar";
import { AdminSharedHeader } from "@/components/animations/shopifytabs/admin-shared-header";
import { isAdminMainTabRoute } from "@/components/animations/shopifytabs/lib/constants/admin-tabs";
import DesktopSidebar, { type DesktopNavItem } from "@/components/desktop/DesktopSidebar";

export default function AdminTabsLayoutShared() {
  const router = useRouter();
  const segments = useSegments();
  const globalParams = useGlobalSearchParams<{ id?: string; eventId?: string }>();
  const { isTabBarVisible, isAdminHeaderVisible, setTabBarVisible, setAdminHeaderVisible } =
    useLayoutStore();
  const { userType, isLoggedIn, loading, logout } = useUserStore();
  const insets = useSafeAreaInsets();
  const headerTotalHeight = getAppHeaderTotalHeight(insets.top, APP_HEADER_HEIGHT_COMPACT);
  const adminHeaderHeight = isAdminHeaderVisible ? insets.top + 64 : 0;
  const isAdminShopifyShell = userType === "admin";
  const currentAdminRoute = String(segments?.[1] ?? "");
  const desktopNavItems = React.useMemo<DesktopNavItem[]>(() => {
    const items: DesktopNavItem[] = [
      { href: "/(admin)/admin-events", label: "אירועים", icon: "calendar-outline" },
    ];

    if (userType !== "employee" && Platform.OS !== "web") {
      items.unshift({ href: "/(admin)/admin-search", label: "חיפוש", icon: "search-outline" });
    }

    if (userType !== "employee") {
      items.push({ href: "/(admin)/users", label: "משתמשים", icon: "people-outline" });
      items.push({ href: "/(admin)/admin-profile", label: "פרופיל", icon: "person-outline" });
    }

    return items;
  }, [userType]);

  const hideBackOnThisRoute =
    segments?.[0] === "(admin)" &&
    (currentAdminRoute === "admin-profile" ||
      currentAdminRoute === "admin-events" ||
      currentAdminRoute === "admin-search");

  const handleAdminHeaderBack = (canGoBack: boolean, goBack: () => void) => {
    if (!canGoBack || hideBackOnThisRoute) return;

    const route = currentAdminRoute;
    const eventId = String(globalParams?.eventId || globalParams?.id || "").trim();

    if (route === "admin-event-details") {
      router.replace("/(admin)/admin-events");
      return;
    }

    if (route === "admin-events-create") {
      router.replace("/(admin)/admin-events");
      return;
    }

    if (route === "admin-invitation-links" || route === "BrideGroomSeating") {
      if (eventId) {
        router.replace(`/(admin)/admin-event-details?id=${encodeURIComponent(eventId)}`);
      } else {
        router.replace("/(admin)/admin-events");
      }
      return;
    }

    goBack();
  };

  const handleLogout = async () => {
    try {
      await logout();
      router.replace("/login");
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    setTabBarVisible(true);
    setAdminHeaderVisible(true);
  }, [setAdminHeaderVisible, setTabBarVisible]);

  useEffect(() => {
    if (loading) return;
    if (!isLoggedIn) {
      router.replace("/login");
      return;
    }
    if (userType !== "admin" && userType !== "employee") {
      router.replace("/(couple)");
    }
  }, [isLoggedIn, userType, loading, router]);

  const screens: React.ReactElement[] = [];

  if (userType === "employee") {
    screens.push(<Tabs.Screen key="emp-search-hidden" name="admin-search" options={{ href: null }} />);
    screens.push(<Tabs.Screen key="emp-users-hidden" name="users" options={{ href: null }} />);
    screens.push(
      <Tabs.Screen
        key="emp-admin-profile-hidden"
        name="admin-profile"
        options={{ href: null, headerShown: false }}
      />
    );
  } else {
    screens.push(
      <Tabs.Screen
        key="admin-search"
        name="admin-search"
        options={{
          title: "חיפוש",
          ...(Platform.OS === "web" ? { href: null } : null),
        }}
      />
    );
    screens.push(
      <Tabs.Screen
        key="admin-profile"
        name="admin-profile"
        options={{
          title: "פרופיל",
          tabBarIcon: ({ focused }) => (
            <View style={styles.tabItem}>
              <View style={[styles.iconCircle, focused && styles.iconCircleActive]}>
                <LinearGradient
                  pointerEvents="none"
                  colors={[
                    "rgba(255,255,255,0.55)",
                    "rgba(255,255,255,0.18)",
                    "rgba(255,255,255,0)",
                  ]}
                  locations={[0, 0.55, 1]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.iconGloss}
                />
                <Ionicons
                  name={focused ? "person" : "person-outline"}
                  size={22}
                  color={focused ? colors.white : colors.gray[700]}
                />
              </View>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.65}
                style={[styles.tabLabel, focused && styles.tabLabelActive]}
              >
                פרופיל
              </Text>
            </View>
          ),
        }}
      />
    );
  }

  screens.push(
    <Tabs.Screen
      key="admin-events"
      name="admin-events"
      options={{
        title: "אירועים",
        tabBarIcon: ({ focused }) => (
          <View style={styles.tabItem}>
            <View style={[styles.iconCircle, styles.centerCircle, focused && styles.iconCircleActive]}>
              <LinearGradient
                pointerEvents="none"
                colors={[
                  "rgba(255,255,255,0.55)",
                  "rgba(255,255,255,0.18)",
                  "rgba(255,255,255,0)",
                ]}
                locations={[0, 0.55, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconGloss}
              />
              <Ionicons
                name={focused ? "calendar" : "calendar-outline"}
                size={22}
                color={focused ? colors.white : colors.gray[700]}
              />
            </View>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.65}
              style={[styles.tabLabel, focused && styles.tabLabelActive]}
            >
              אירועים
            </Text>
          </View>
        ),
      }}
    />
  );

  if (userType !== "employee") {
    screens.push(
      <Tabs.Screen
        key="users"
        name="users"
        options={{
          title: "ניהול משתמשים",
          tabBarIcon: ({ focused }) => (
            <View style={styles.tabItem}>
              <View style={[styles.iconCircle, focused && styles.iconCircleActive]}>
                <LinearGradient
                  pointerEvents="none"
                  colors={[
                    "rgba(255,255,255,0.55)",
                    "rgba(255,255,255,0.18)",
                    "rgba(255,255,255,0)",
                  ]}
                  locations={[0, 0.55, 1]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.iconGloss}
                />
                <Ionicons
                  name={focused ? "people" : "people-outline"}
                  size={22}
                  color={focused ? colors.white : colors.gray[700]}
                />
              </View>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.65}
                style={[styles.tabLabel, focused && styles.tabLabelActive]}
              >
                משתמשים
              </Text>
            </View>
          ),
        }}
      />
    );
  }

  screens.push(<Tabs.Screen key="add-user-v2" name="add-user-v2" options={{ href: null, headerShown: false }} />);
  screens.push(<Tabs.Screen key="admin-guest-checkin" name="admin-guest-checkin" options={{ href: null }} />);
  screens.push(
    <Tabs.Screen
      key="admin-invitation-links"
      name="admin-invitation-links"
      options={{
        href: null,
        ...(Platform.OS !== "web"
          ? {
              headerShown: false,
            }
          : null),
      }}
    />
  );
  screens.push(<Tabs.Screen key="admin-events-create" name="admin-events-create" options={{ href: null }} />);
  screens.push(
    <Tabs.Screen
      key="admin-event-details"
      name="admin-event-details"
      options={{
        href: null,
        ...(Platform.OS === "web"
          ? {
              headerStyle: {
                height: headerTotalHeight,
              },
            }
          : {
              headerShown: false,
            }),
      }}
    />
  );
  screens.push(<Tabs.Screen key="admin-event-messages" name="admin-event-messages" options={{ href: null }} />);
  screens.push(<Tabs.Screen key="notification-editor" name="notification-editor" options={{ href: null, headerShown: false }} />);
  screens.push(<Tabs.Screen key="admin-rsvp-approvals" name="admin-rsvp-approvals" options={{ href: null }} />);
  screens.push(<Tabs.Screen key="automatic-notifications" name="automatic-notifications" options={{ href: null }} />);
  screens.push(<Tabs.Screen key="guests" name="guests" options={{ href: null }} />);
  screens.push(<Tabs.Screen key="TablesList" name="TablesList" options={{ href: null }} />);
  screens.push(<Tabs.Screen key="BrideGroomSeating" name="BrideGroomSeating" options={{ href: null }} />);
  screens.push(<Tabs.Screen key="seating-templates" name="seating-templates" options={{ href: null }} />);
  screens.push(<Tabs.Screen key="seating-map" name="seating-map" options={{ href: null }} />);

  return (
    <Tabs
      tabBar={
        isAdminShopifyShell
          ? (props) => {
              if (!isTabBarVisible) return null;

              if (Platform.OS === "web") {
                return (
                  <DesktopSidebar
                    navItems={desktopNavItems}
                    footer={
                      <Pressable
                        onPress={handleLogout}
                        accessibilityRole="button"
                        accessibilityLabel="התנתקות"
                        style={({ hovered, pressed }: any) => [
                          styles.logoutBtn,
                          Platform.OS === "web" && hovered ? styles.logoutBtnHover : null,
                          pressed ? styles.logoutBtnPressed : null,
                        ]}
                      >
                        <Ionicons name="log-out-outline" size={18} color={colors.white} />
                        <Text style={styles.logoutBtnText}>התנתק</Text>
                      </Pressable>
                    }
                  />
                );
              }

              return <AdminTabBar {...props} />;
            }
          : undefined
      }
      screenOptions={({ route, navigation }) => ({
        tabBarActiveTintColor: colors.white,
        tabBarInactiveTintColor: colors.gray[500],
        tabBarPosition: Platform.OS === "web" ? "left" : "bottom",
        headerShown: isAdminShopifyShell
          ? Platform.OS !== "web" &&
            !(route.name === "admin-events" || route.name === "admin-search")
          : true,
        headerStyle: {
          height: isAdminShopifyShell ? adminHeaderHeight : headerTotalHeight,
          backgroundColor:
            isAdminShopifyShell && Platform.OS !== "web" && route.name === "admin-search"
              ? "transparent"
              : "#FFFFFF",
        },
        headerShadowVisible: false,
        header: () =>
          isAdminShopifyShell ? (
            <AdminSharedHeader transparentBackground={Platform.OS !== "web" && route.name === "admin-search"} />
          ) : (
            <AppHeader
              variant="compact"
              canGoBack={navigation.canGoBack() && !hideBackOnThisRoute}
              onPressBack={() =>
                handleAdminHeaderBack(navigation.canGoBack(), () => navigation.goBack())
              }
            />
          ),
        tabBarShowLabel: false,
        tabBarBackground:
          isAdminShopifyShell && isAdminMainTabRoute(route.name)
            ? undefined
            : () => (
                <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                  <BlurView intensity={28} tint="light" style={styles.tabBarBlur} />
                  <View style={styles.tabBarFrame} />
                  <LinearGradient
                    pointerEvents="none"
                    colors={[
                      "rgba(255,255,255,0.65)",
                      "rgba(255,255,255,0.18)",
                      "rgba(255,255,255,0)",
                    ]}
                    locations={[0, 0.35, 1]}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={styles.tabBarTopShine}
                  />
                  <LinearGradient
                    pointerEvents="none"
                    colors={["rgba(255,255,255,0.28)", "rgba(255,255,255,0)"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.tabBarSheen}
                  />
                  <LinearGradient
                    pointerEvents="none"
                    colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.06)"]}
                    start={{ x: 0.5, y: 0.5 }}
                    end={{ x: 0.5, y: 1 }}
                    style={styles.tabBarBottomShade}
                  />
                </View>
              ),
        tabBarStyle:
          Platform.OS === "web"
            ? {
                width: 270,
                backgroundColor: colors.white,
                borderTopWidth: 0,
                borderRightWidth: 0,
                borderLeftWidth: 0,
                elevation: 0,
                shadowOpacity: 0,
                display: isTabBarVisible ? "flex" : "none",
              }
            : isAdminShopifyShell && isAdminMainTabRoute(route.name)
            ? {
                position: "absolute",
                backgroundColor: "transparent",
                borderTopWidth: 0,
                elevation: 0,
                shadowOpacity: 0,
                display: "none",
              }
            : {
                position: "absolute",
                bottom: Platform.OS === "ios" ? 22 : 16,
                left: 20,
                right: 20,
                height: 74,
                backgroundColor: "transparent",
                borderRadius: 32,
                paddingHorizontal: 8,
                paddingVertical: 0,
                paddingTop: 16,
                paddingBottom: 0,
                overflow: "visible",
                shadowColor: colors.richBlack,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.12,
                shadowRadius: 16,
                elevation: 14,
                borderTopWidth: 0,
                borderWidth: 0,
                display: isTabBarVisible ? "flex" : "none",
              },
        tabBarItemStyle: {
          flex: 1,
          marginHorizontal: 2,
          paddingVertical: 0,
          paddingHorizontal: 0,
          justifyContent: "center",
          alignItems: "center",
        },
        tabBarIconStyle: {
          marginRight: 0,
          marginLeft: 0,
          marginTop: 0,
          marginBottom: 0,
        },
      })}
    >
      {screens}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarBlur: {
    flex: 1,
    borderRadius: 32,
    overflow: "hidden",
  },
  tabBarFrame: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.7)",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  tabBarTopShine: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 32,
  },
  tabBarSheen: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 32,
  },
  tabBarBottomShade: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 32,
  },
  tabItem: {
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    width: "100%",
    paddingHorizontal: 2,
  },
  tabLabel: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "600",
    color: "rgba(0,0,0,0.42)",
    textAlign: "center",
    writingDirection: "rtl",
    includeFontPadding: false,
    width: "100%",
  },
  tabLabelActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.42)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.75)",
    overflow: "hidden",
  },
  iconGloss: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.9,
  },
  iconCircleActive: {
    backgroundColor: colors.primary,
    borderColor: "rgba(255,255,255,0.55)",
  },
  centerCircle: {
    transform: [{ scale: 1 }],
  },
  logoutBtn: {
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#D64545",
  },
  logoutBtnHover: {
    backgroundColor: "#C73A3A",
  },
  logoutBtnPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  logoutBtnText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },
});
