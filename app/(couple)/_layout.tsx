import React, { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { Tabs, useRouter } from "expo-router";
import { colors } from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Image as ExpoImage } from 'expo-image';

import { useLayoutStore } from '@/store/layoutStore';
import { useUserStore } from '@/store/userStore';
import AppHeader, { APP_HEADER_HEIGHT_COMPACT, getAppHeaderTotalHeight } from "@/components/AppHeader";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type TabIconProps = {
  iconName: React.ComponentProps<typeof Ionicons>['name'];
  iconNameActive: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  focused: boolean;
};

function TabIcon({ iconName, iconNameActive, label, focused }: TabIconProps) {
  return (
    <View style={styles.tabItem}>
      <View style={[styles.iconCircle, focused && styles.iconCircleActive]}>
        <LinearGradient
          pointerEvents="none"
          colors={["rgba(255,255,255,0.55)", "rgba(255,255,255,0.16)", "rgba(255,255,255,0)"]}
          locations={[0, 0.6, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.iconGloss}
        />
        <Ionicons
          name={focused ? iconNameActive : iconName}
          size={22}
          color={focused ? colors.white : "rgba(0,0,0,0.55)"}
        />
      </View>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.65}
        style={[styles.tabLabel, focused && styles.tabLabelActive]}
      >
        {label}
      </Text>
    </View>
  );
}

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
      router.replace('/login');
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
              onPressBack={() => navigation.goBack()}
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
            bottom: Platform.OS === 'ios' ? Math.max(16, insets.bottom + 8) : Math.max(12, insets.bottom + 6),
            left: 16,
            right: 16,
            height: 76,
            backgroundColor: 'transparent',
            borderRadius: 32,
            paddingHorizontal: 8,
            paddingTop: 12,
            paddingBottom: 8,
            overflow: 'visible',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.10,
            shadowRadius: 20,
            elevation: 16,
            borderTopWidth: 0,
            borderWidth: 0,
            display: isTabBarVisible ? 'flex' : 'none',
          },
          tabBarItemStyle: {
            flex: 1,
            height: 56,
            paddingVertical: 0,
            paddingHorizontal: 0,
            justifyContent: 'center',
            alignItems: 'center',
            overflow: 'visible',
          },
          tabBarIconStyle: {
            margin: 0,
            padding: 0,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "בית",
            tabBarIcon: ({ focused }) => (
              <TabIcon
                iconName="home-outline"
                iconNameActive="home"
                label="בית"
                focused={focused}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="guests"
          options={{
            title: "אורחים",
            tabBarIcon: ({ focused }) => (
              <TabIcon
                iconName="people-outline"
                iconNameActive="people"
                label="אורחים"
                focused={focused}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="BrideGroomSeating"
          options={{
            title: "הושבה",
            headerShown: false,
            tabBarIcon: ({ focused }) => (
              <TabIcon
                iconName="grid-outline"
                iconNameActive="grid"
                label="הושבה"
                focused={focused}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="TablesList"
          options={{
            title: "שולחנות",
            tabBarIcon: ({ focused }) => (
              <TabIcon
                iconName="list-outline"
                iconNameActive="list"
                label="שולחנות"
                focused={focused}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="brideGroomProfile"
          options={{
            title: "פרופיל",
            href: null,
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
          name="automatic-notifications"
          options={{
            title: "הודעות",
            tabBarIcon: ({ focused }) => (
              <TabIcon
                iconName="chatbubble-ellipses-outline"
                iconNameActive="chatbubble-ellipses"
                label="הודעות"
                focused={focused}
              />
            ),
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
    width: 350,
    height: 80,
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

  // ─── Tab bar background ────────────────────────────────────
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

  // ─── Tab icons ─────────────────────────────────────────────
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
    fontWeight: "700",
    color: "rgba(0,0,0,0.42)",
    textAlign: "center",
    writingDirection: "rtl",
    includeFontPadding: false,
    width: "100%",
  },
  tabLabelActive: {
    color: colors.primary,
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
});
