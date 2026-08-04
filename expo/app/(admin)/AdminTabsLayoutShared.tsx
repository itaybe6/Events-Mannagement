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
import { EmployeeTabBar } from "@/components/animations/shopifytabs/employee-tab-bar";
import { AdminSharedHeader } from "@/components/animations/shopifytabs/admin-shared-header";
import { isAdminMainTabRoute } from "@/components/animations/shopifytabs/lib/constants/admin-tabs";
import { useMobileWebLayout } from "@/lib/useMobileWebLayout";

export default function AdminTabsLayoutShared() {
  const router = useRouter();
  const segments = useSegments();
  const globalParams = useGlobalSearchParams<{ id?: string; eventId?: string }>();
  const { isTabBarVisible, isAdminHeaderVisible, setTabBarVisible, setAdminHeaderVisible } =
    useLayoutStore();
  const { userType, isLoggedIn, loading } = useUserStore();
  const { preferNativeMobileLayout } = useMobileWebLayout();
  const isWebDesktopShell = Platform.OS === "web" && !preferNativeMobileLayout;
  const insets = useSafeAreaInsets();
  const headerTotalHeight = getAppHeaderTotalHeight(insets.top, APP_HEADER_HEIGHT_COMPACT);
  const adminHeaderHeight = isAdminHeaderVisible ? insets.top + 64 : 0;
  const isAdminShopifyShell = userType === "admin";
  const isEmployeeWebShell = userType === "employee" && isWebDesktopShell;
  const currentAdminRoute = String(segments?.[1] ?? "");
  const isGuestCheckinRoute = currentAdminRoute === "admin-guest-checkin";
  const hideBackOnThisRoute =
    segments?.[0] === "(admin)" &&
    (currentAdminRoute === "admin-profile" ||
      currentAdminRoute === "admin-events" ||
      currentAdminRoute === "admin-events-list" ||
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

  useEffect(() => {
    if (!isWebDesktopShell || userType !== "employee") return;

    if (currentAdminRoute === "admin-events" || currentAdminRoute === "users") {
      router.replace("/(admin)/admin-events-list");
    }
  }, [currentAdminRoute, router, userType]);

  const screens: React.ReactElement[] = [];

  if (userType === "employee") {
    screens.push(<Tabs.Screen key="emp-search-hidden" name="admin-search" options={{ href: null }} />);
    screens.push(<Tabs.Screen key="emp-users-hidden" name="users" options={{ href: null }} />);
    screens.push(
      <Tabs.Screen
        key="emp-profile-tab"
        name="employee-profile-tab"
        options={{
          title: "פרופיל",
          ...( !isWebDesktopShell
            ? {
                headerShown: false,
              }
            : null),
        }}
      />
    );
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
          ...( !isWebDesktopShell
            ? {
                headerShown: false,
              }
            : null),
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
        title: userType === "employee" && isWebDesktopShell ? "אירועים" : "לוח בקרה",
        ...(userType === "employee" && !isWebDesktopShell
          ? {
              headerShown: false,
            }
          : null),
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

  screens.push(
    <Tabs.Screen
      key="admin-events-list"
      name="admin-events-list"
      options={{
        title: "אירועים",
        href: null,
        ...( !isWebDesktopShell
          ? {
              headerShown: false,
            }
          : null),
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
          animation: "none",
          headerShown: false,
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
        ...( !isWebDesktopShell
          ? {
              headerShown: false,
            }
          : null),
      }}
    />
  );
  screens.push(
    <Tabs.Screen
      key="admin-events-create"
      name="admin-events-create"
      options={{
        href: null,
        ...( !isWebDesktopShell
          ? {
              headerShown: false,
            }
          : null),
      }}
    />
  );
  screens.push(
    <Tabs.Screen
      key="admin-event-details"
      name="admin-event-details"
      options={{
        href: null,
        ...(isWebDesktopShell
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
  screens.push(<Tabs.Screen key="whatsapp-templates" name="whatsapp-templates" options={{ href: null, headerShown: false }} />);
  screens.push(<Tabs.Screen key="reports" name="reports" options={{ href: null, headerShown: false }} />);
  screens.push(<Tabs.Screen key="guests" name="guests" options={{ href: null }} />);
  screens.push(<Tabs.Screen key="TablesList" name="TablesList" options={{ href: null }} />);
  screens.push(<Tabs.Screen key="BrideGroomSeating" name="BrideGroomSeating" options={{ href: null }} />);
  screens.push(<Tabs.Screen key="seating-templates" name="seating-templates" options={{ href: null }} />);
  screens.push(<Tabs.Screen key="seating-map" name="seating-map" options={{ href: null }} />);

  return (
    <Tabs
      tabBar={
        isWebDesktopShell
          ? () => {
              if (!isTabBarVisible) return null;
              if (isGuestCheckinRoute) return null;
              if (isAdminShopifyShell) return null;
              if (!isEmployeeWebShell) return null;
              return null;
            }
          : isAdminShopifyShell
          ? (props) => {
              if (!isTabBarVisible) return null;
              return <AdminTabBar {...props} />;
            }
          : userType === "employee"
          ? (props) => {
              if (!isTabBarVisible) return null;
              return <EmployeeTabBar {...props} />;
            }
          : undefined
      }
      screenOptions={({ route, navigation }) => ({
        // טאבים שלא בפוקוס מוקפאים ולא מתרנדרים ברקע — מאיץ מעברים בין טאבים
        freezeOnBlur: true,
        tabBarActiveTintColor: colors.white,
        tabBarInactiveTintColor: colors.gray[500],
        tabBarPosition: isWebDesktopShell ? "left" : "bottom",
        headerShown: isAdminShopifyShell
          ? !isWebDesktopShell &&
            !(route.name === "admin-events" || route.name === "admin-search")
          : isEmployeeWebShell
          ? false
          : true,
        headerStyle: {
          height: isAdminShopifyShell ? adminHeaderHeight : headerTotalHeight,
          backgroundColor:
            isAdminShopifyShell && !isWebDesktopShell && route.name === "admin-search"
              ? "transparent"
              : "#FFFFFF",
        },
        headerShadowVisible: false,
        header: () => {
          if (isAdminShopifyShell) {
            return <AdminSharedHeader transparentBackground={!isWebDesktopShell && route.name === "admin-search"} />;
          }
          if (isEmployeeWebShell) {
            return null;
          }
          return (
            <AppHeader
              variant="compact"
              canGoBack={navigation.canGoBack() && !hideBackOnThisRoute}
              onPressBack={() =>
                handleAdminHeaderBack(navigation.canGoBack(), () => navigation.goBack())
              }
            />
          );
        },
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
          isWebDesktopShell
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
  logoutBtnAdmin: {
    minHeight: 52,
    borderRadius: 18,
    justifyContent: "flex-end",
    paddingHorizontal: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(6,23,62,0.06)",
    shadowColor: "#D64545",
    shadowOpacity: 0.02,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  logoutBtnHover: {
    backgroundColor: "#C73A3A",
  },
  logoutBtnAdminHover: {
    backgroundColor: "#FDF6F6",
    borderColor: "rgba(212,84,84,0.18)",
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
  logoutBtnTextAdmin: {
    color: "#C45454",
    fontWeight: "900",
  },
});
