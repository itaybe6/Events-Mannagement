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
  if (focused) {
    return (
      <View style={styles.tabPill}>
        <Ionicons name={iconNameActive} size={15} color="#fff" />
        <Text style={styles.tabPillText} numberOfLines={1}>{label}</Text>
      </View>
    );
  }
  return (
    <View style={styles.tabIconWrap}>
      <Ionicons name={iconName} size={22} color="rgba(0,0,0,0.36)" />
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
              <BlurView intensity={60} tint="light" style={styles.tabBarBlur} />
              <View style={styles.tabBarFrame} />
              <LinearGradient
                pointerEvents="none"
                colors={["rgba(255,255,255,0.55)", "rgba(255,255,255,0)"]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.tabBarShine}
              />
            </View>
          ),
          tabBarStyle: {
            position: 'absolute',
            bottom: Platform.OS === 'ios' ? 24 : 14,
            left: 16,
            right: 16,
            height: 66,
            backgroundColor: 'transparent',
            borderRadius: 26,
            paddingHorizontal: 4,
            paddingTop: 0,
            paddingBottom: 0,
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
            height: 66,
            paddingVertical: 0,
            paddingHorizontal: 0,
            justifyContent: 'center',
            alignItems: 'center',
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
    borderRadius: 26,
    overflow: "hidden",
  },
  tabBarFrame: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.70)",
    backgroundColor: "rgba(255,255,255,0.74)",
  },
  tabBarShine: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 26,
  },

  // ─── Tab icons ─────────────────────────────────────────────
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primary,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 999,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.32,
    shadowRadius: 8,
    elevation: 6,
  },
  tabPillText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.1,
    writingDirection: 'rtl',
    includeFontPadding: false,
  },
  tabIconWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
