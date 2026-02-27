import React, { useEffect } from "react";
import { Tabs, useRouter } from "expo-router";
import { colors } from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useLayoutStore } from '@/store/layoutStore';
import { useUserStore } from '@/store/userStore';
import AppHeader, { getAppHeaderTotalHeight } from "@/components/AppHeader";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function AdminTabsLayout() {
  const router = useRouter();
  const { isTabBarVisible, setTabBarVisible } = useLayoutStore();
  const { userType, isLoggedIn, loading } = useUserStore();
  const insets = useSafeAreaInsets();
  const headerTotalHeight = getAppHeaderTotalHeight(insets.top);

  useEffect(() => {
    setTabBarVisible(true);
  }, [setTabBarVisible]);

  useEffect(() => {
    if (loading) return;
    if (!isLoggedIn) {
      router.replace('/login');
      return;
    }
    if (userType !== 'admin' && userType !== 'employee') {
      router.replace('/(couple)');
    }
  }, [isLoggedIn, userType, loading, router]);

  // Avoid non-Screen children inside Tabs. Expo Router can warn/crash if booleans/nulls leak into children.
  const screens: React.ReactElement[] = [];

  if (userType === "employee") {
    // Hide admin-only tabs for employee.
    screens.push(<Tabs.Screen key="emp-users-hidden" name="users" options={{ href: null }} />);
    screens.push(<Tabs.Screen key="emp-admin-profile-hidden" name="admin-profile" options={{ href: null }} />);
  } else {
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
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={[styles.tabLabel, focused && styles.tabLabelActive]}>
                משתמשים
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
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={[styles.tabLabel, focused && styles.tabLabelActive]}>
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
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={[styles.tabLabel, focused && styles.tabLabelActive]}>
                פרופיל
              </Text>
            </View>
          ),
        }}
      />
    );
  }

  // Hidden routes in admin group
  screens.push(<Tabs.Screen key="add-user-v2" name="add-user-v2" options={{ href: null }} />);
  screens.push(<Tabs.Screen key="admin-guest-checkin" name="admin-guest-checkin" options={{ href: null }} />);
  screens.push(<Tabs.Screen key="admin-invitation-links" name="admin-invitation-links" options={{ href: null }} />);
  screens.push(<Tabs.Screen key="admin-events-create" name="admin-events-create" options={{ href: null }} />);
  screens.push(
    <Tabs.Screen
      key="admin-event-details"
      name="admin-event-details"
      options={{
        href: null,
        headerStyle: {
          height: headerTotalHeight,
        },
      }}
    />
  );
  screens.push(<Tabs.Screen key="admin-event-messages" name="admin-event-messages" options={{ href: null }} />);
  screens.push(<Tabs.Screen key="notification-editor" name="notification-editor" options={{ href: null }} />);
  screens.push(<Tabs.Screen key="admin-rsvp-approvals" name="admin-rsvp-approvals" options={{ href: null }} />);
  screens.push(<Tabs.Screen key="automatic-notifications" name="automatic-notifications" options={{ href: null }} />);
  screens.push(<Tabs.Screen key="guests" name="guests" options={{ href: null }} />);
  screens.push(<Tabs.Screen key="TablesList" name="TablesList" options={{ href: null }} />);
  // Hidden admin wrappers for seating screens (keep admin tab bar)
  screens.push(<Tabs.Screen key="BrideGroomSeating" name="BrideGroomSeating" options={{ href: null }} />);
  screens.push(<Tabs.Screen key="seating-templates" name="seating-templates" options={{ href: null }} />);
  screens.push(<Tabs.Screen key="seating-map" name="seating-map" options={{ href: null }} />);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.white,
        tabBarInactiveTintColor: colors.gray[500],
        headerShown: true,
        headerStyle: {
          height: headerTotalHeight,
          backgroundColor: "#FFFFFF",
        },
        headerShadowVisible: false,
        header: ({ navigation }) => (
          <AppHeader
            canGoBack={navigation.canGoBack()}
            onPressBack={() => navigation.goBack()}
          />
        ),
        tabBarShowLabel: false,
        tabBarBackground: () => (
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
        tabBarStyle: {
          position: 'absolute',
          bottom: Platform.OS === 'ios' ? 22 : 16,
          left: 20,
          right: 20,
          height: 74,
          backgroundColor: 'transparent',
          borderRadius: 32,
          paddingHorizontal: 8,
          paddingVertical: 0,
          paddingTop: 16,
          paddingBottom: 0,
          overflow: 'visible',
          shadowColor: colors.richBlack,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.12,
          shadowRadius: 16,
          elevation: 14,
          borderTopWidth: 0,
          borderWidth: 0,
          display: isTabBarVisible ? 'flex' : 'none',
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
      }}
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
});


