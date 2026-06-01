import React, { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { Tabs, useRouter } from "expo-router";
import { colors } from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Image as ExpoImage } from 'expo-image';
import { CoupleTabBar } from "@/components/animations/shopifytabs/couple-tab-bar";

import { useLayoutStore } from '@/store/layoutStore';
import { useUserStore } from '@/store/userStore';
import AppHeader, { APP_HEADER_HEIGHT_COMPACT, getAppHeaderTotalHeight } from "@/components/AppHeader";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function CoupleTabsLayout() {
  const router = useRouter();
  const { isTabBarVisible, setTabBarVisible } = useLayoutStore();
  const { userType, isLoggedIn, loading } = useUserStore();
  const insets = useSafeAreaInsets();
  const headerTotalHeight = getAppHeaderTotalHeight(insets.top, APP_HEADER_HEIGHT_COMPACT);
  const avatarUrl = useUserStore(s => s.userData?.avatar_url);

  useEffect(() => {
    setTabBarVisible(true);
  }, [setTabBarVisible]);

  useEffect(() => {
    if (loading) return;
    if (!isLoggedIn) {
      // Keep consistent with root auth-guard (logged-out default is onboarding).
      router.replace('/onboarding');
      return;
    }
    if (userType === 'admin') {
      router.replace('/(admin)/admin-events');
      return;
    }
    if (userType === 'employee') {
      router.replace('/(employee)/employee-events');
    }
  }, [isLoggedIn, userType, loading, router]);

  return (
    <>
      <StatusBar style="dark" backgroundColor="#FFFFFF" />

      <Tabs
        initialRouteName="index"
        tabBar={(props) => (isTabBarVisible ? <CoupleTabBar {...props} /> : null)}
        screenOptions={{
          tabBarActiveTintColor: colors.white,
          tabBarInactiveTintColor: colors.gray[500],
          headerShown: true,
          headerStyle: {
            height: headerTotalHeight,
            backgroundColor: "#FFFFFF",
          },
          headerShadowVisible: false,
          header: ({ navigation, route }) => (
            <AppHeader
              variant="compact"
              canGoBack={navigation.canGoBack()}
              onPressBack={() => {
                if (navigation.canGoBack()) navigation.goBack();
              }}
              logoOffsetX={route?.name === "index" ? -12 : 0}
              logoStyle={route?.name === "index" ? styles.homeLogoTweaks : undefined}
              rightContent={(
                <Pressable
                  onPress={() => router.push('/(couple)/brideGroomProfile')}
                  accessibilityRole="button"
                  accessibilityLabel="פרופיל"
                  style={({ pressed }) => [
                    styles.userHeaderBtn,
                    pressed ? { opacity: 0.85 } : null,
                  ]}
                >
                  {avatarUrl ? (
                    <ExpoImage
                      key={avatarUrl}
                      source={{ uri: avatarUrl }}
                      style={[styles.userHeaderAvatarBase, styles.userHeaderAvatarSize]}
                      contentFit="cover"
                      cachePolicy="none"
                      transition={0}
                    />
                  ) : (
                    <View style={[styles.userHeaderAvatarFallbackBase, styles.userHeaderAvatarSize]}>
                      <Ionicons name="person" size={20} color={colors.primary} />
                    </View>
                  )}
                </Pressable>
              )}
            />
          ),
          tabBarShowLabel: false,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "בית",
            headerShown: Platform.OS === "web",
          }}
        />
        <Tabs.Screen
          name="guests"
          options={{
            title: "אורחים",
            headerShown: Platform.OS === "web",
          }}
        />
        <Tabs.Screen
          name="BrideGroomSeating"
          options={{
            title: "הושבה",
            headerShown: false,
          }}
        />
        <Tabs.Screen
          name="TablesList"
          options={{
            title: "שולחנות",
            headerShown: false,
          }}
        />
        <Tabs.Screen
          name="brideGroomProfile"
          options={{
            title: "פרופיל",
            headerShown: false,
          }}
        />
        <Tabs.Screen
          name="automatic-notifications"
          options={{
            title: "הודעות",
            headerShown: false,
          }}
        />

        {/* Hidden couple internal routes */}
        <Tabs.Screen
          name="edit-category"
          options={{
            href: null,
            headerShown: false,
          }}
        />
        <Tabs.Screen
          name="select-category"
          options={{
            href: null,
            headerShown: false,
          }}
        />
        <Tabs.Screen
          name="notification-editor"
          options={{
            href: null,
            headerShown: false,
          }}
        />
      </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  homeLogoTweaks: {
    width: 400,
    height: 92,
    marginTop: -6,
  },

  // ─── Header ────────────────────────────────────────────────
  userHeaderBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 14,
  },
  userHeaderAvatarBase: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: "#FFFFFF",
  },
  userHeaderAvatarFallbackBase: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  userHeaderAvatarSize: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
});
