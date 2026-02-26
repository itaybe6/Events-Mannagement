import React, { useEffect } from "react";
import { Tabs, useRouter } from "expo-router";
import { colors } from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
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
            <View style={styles.tabIconWithLabel}>
              <Ionicons
                name={focused ? "people" : "people-outline"}
                size={22}
                color={focused ? colors.primary : colors.gray[400]}
              />
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
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

  screens.push(
    <Tabs.Screen
      key="admin-events"
      name="admin-events"
      options={{
        title: "אירועים",
        tabBarIcon: ({ focused }) => (
          <View style={[styles.tabIconWithLabel, styles.centerTab]}>
            <View style={[styles.centerIconBubble, focused && styles.centerIconBubbleActive]}>
              <Ionicons
                name={focused ? "calendar" : "calendar-outline"}
                size={22}
                color={focused ? colors.white : colors.primary}
              />
            </View>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
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
        key="admin-profile"
        name="admin-profile"
        options={{
          title: "פרופיל",
          tabBarIcon: ({ focused }) => (
            <View style={styles.tabIconWithLabel}>
              <Ionicons
                name={focused ? "person" : "person-outline"}
                size={22}
                color={focused ? colors.primary : colors.gray[400]}
              />
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
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
        tabBarStyle: {
          position: 'absolute',
          bottom: Platform.OS === 'ios' ? 30 : 20,
          left: 20,
          right: 20,
          height: 68,
          backgroundColor: colors.white,
          borderRadius: 34,
          paddingHorizontal: 8,
          paddingTop: 8,
          paddingBottom: 8,
          overflow: 'visible',
          shadowColor: colors.richBlack,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.12,
          shadowRadius: 16,
          elevation: 14,
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: colors.gray[200],
          display: isTabBarVisible ? 'flex' : 'none',
        },
        tabBarItemStyle: {
          flex: 1,
          marginHorizontal: 2,
          paddingVertical: 2,
          paddingHorizontal: 0,
          justifyContent: "center",
          alignItems: "center",
        },
        tabBarIconStyle: {
          marginRight: 0,
          marginLeft: 0,
        },
      }}
    >
      {screens}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabIconWithLabel: {
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    width: "100%",
  },
  centerTab: {
    marginTop: 0,
  },
  centerIconBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.gray[100],
    borderWidth: 1.5,
    borderColor: colors.gray[300],
  },
  centerIconBubbleActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabLabel: {
    fontSize: 11,
    color: colors.gray[400],
    fontWeight: "600",
    textAlign: "center",
    writingDirection: "rtl",
    includeFontPadding: false,
    lineHeight: 13,
  },
  tabLabelActive: {
    color: colors.primary,
    fontWeight: "700",
  },
});


