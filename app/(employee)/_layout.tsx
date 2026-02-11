import React, { useEffect } from "react";
import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image, Platform, StyleSheet, View } from "react-native";
import { Image as ExpoImage } from "expo-image";

import { colors } from "@/constants/colors";
import { useUserStore } from "@/store/userStore";
import { useLayoutStore } from "@/store/layoutStore";
import AppHeader from "@/components/AppHeader";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getAppHeaderTotalHeight } from "@/components/AppHeader";

function ProfileTabIcon({ focused }: { focused: boolean }) {
  const avatarUrl = useUserStore((s) => s.userData?.avatar_url);

  return (
    <View style={[styles.iconContainer, focused && styles.activeIconContainer]}>
      {avatarUrl ? (
        <ExpoImage
          key={avatarUrl}
          source={{ uri: avatarUrl }}
          style={[
            styles.tabAvatar,
            { borderColor: focused ? colors.white : "rgba(0,0,0,0.14)" },
          ]}
          contentFit="cover"
          cachePolicy="none"
          transition={0}
        />
      ) : (
        <Ionicons
          name="person-circle"
          size={24}
          color={focused ? colors.white : colors.gray[500]}
        />
      )}
    </View>
  );
}

export default function EmployeeTabsLayout() {
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
      router.replace("/login");
      return;
    }
    if (userType === "admin") {
      router.replace("/(admin)/admin-events");
      return;
    }
    if (userType !== "employee") {
      router.replace("/(couple)");
    }
  }, [isLoggedIn, userType, loading, router]);

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
            onPressNotifications={() => router.push("/notifications")}
          />
        ),
        tabBarShowLabel: false,
        tabBarStyle: {
          position: "absolute",
          bottom: Platform.OS === "ios" ? 30 : 20,
          left: 15,
          right: 15,
          height: 65,
          backgroundColor: colors.white,
          borderRadius: 35,
          paddingHorizontal: 15,
          paddingVertical: 8,
          paddingTop: 12,
          shadowColor: colors.richBlack,
          shadowOffset: { width: 0, height: -10 },
          shadowOpacity: 0.25,
          shadowRadius: 30,
          elevation: 25,
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: "rgba(0,0,0,0.08)",
          display: isTabBarVisible ? "flex" : "none",
        },
        tabBarItemStyle: {
          marginHorizontal: 3,
          paddingVertical: 6,
          paddingHorizontal: 8,
          height: 30,
          justifyContent: "center",
          alignItems: "center",
        },
        tabBarIconStyle: {
          marginRight: 0,
          marginLeft: 0,
        },
      }}
    >
      <Tabs.Screen
        name="employee-events"
        options={{
          title: "אירועים",
          tabBarIcon: ({ focused }) => (
            <View style={[styles.iconContainer, focused && styles.activeIconContainer]}>
              <Ionicons
                name="calendar-outline"
                size={24}
                color={focused ? colors.white : colors.gray[500]}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="employee-profile"
        options={{
          title: "פרופיל",
          tabBarIcon: ({ focused }) => <ProfileTabIcon focused={focused} />,
        }}
      />

      {/* Hidden employee internal routes */}
      <Tabs.Screen name="employee-event-details" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="employee-seating-map" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="employee-guest-checkin" options={{ href: null, headerShown: false }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  activeIconContainer: {
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.secondary,
  },
  tabAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    backgroundColor: colors.gray[100],
  },
});

