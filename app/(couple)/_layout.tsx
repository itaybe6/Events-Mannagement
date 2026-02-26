import React, { useEffect } from "react";
import { Tabs, useRouter } from "expo-router";
import { colors } from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Platform, StyleSheet, View } from "react-native";
import { Image as ExpoImage } from 'expo-image';

import { useLayoutStore } from '@/store/layoutStore';
import { useUserStore } from '@/store/userStore';
import AppHeader from "@/components/AppHeader";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getAppHeaderTotalHeight } from "@/components/AppHeader";

function ProfileTabIcon({ focused }: { focused: boolean }) {
  const avatarUrl = useUserStore(s => s.userData?.avatar_url);

  return (
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
      {avatarUrl ? (
        <ExpoImage
          key={avatarUrl}
          source={{ uri: avatarUrl }}
          style={[styles.tabAvatar, { borderColor: focused ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.14)" }]}
          contentFit="cover"
          cachePolicy="none"
          transition={0}
        />
      ) : (
        <Ionicons
          name={focused ? "person" : "person-outline"}
          size={22}
          color={focused ? colors.white : colors.gray[700]}
        />
      )}
    </View>
  );
}

export default function CoupleTabsLayout() {
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
    if (userType === 'admin') {
      router.replace('/(admin)/admin-events');
      return;
    }
    if (userType === 'employee') {
      router.replace('/(employee)/employee-events');
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
          bottom: Platform.OS === 'ios' ? 28 : 22,
          left: 20,
          right: 20,
          height: 60,
          backgroundColor: 'transparent',
          borderRadius: 32,
          paddingHorizontal: 8,
          paddingVertical: 0,
          paddingTop: 0,
          paddingBottom: 0,
          overflow: 'hidden',
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
          justifyContent: 'center',
          alignItems: 'center',
        },
        tabBarIconStyle: {
          marginRight: 0,
          marginLeft: 0,
          marginTop: 10,
          marginBottom: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "בית",
          tabBarIcon: ({ focused }) => (
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
                name={focused ? "home" : "home-outline"}
                size={22}
                color={focused ? colors.white : colors.gray[700]}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="guests"
        options={{
          title: "אורחים",
          tabBarIcon: ({ focused }) => (
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
          ),
        }}
      />
      <Tabs.Screen
        name="BrideGroomSeating"
        options={{
          title: "הושבה",
          tabBarIcon: ({ focused }) => (
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
                name={focused ? "grid" : "grid-outline"}
                size={22}
                color={focused ? colors.white : colors.gray[700]}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="TablesList"
        options={{
          title: "שולחנות",
          tabBarIcon: ({ focused }) => (
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
                name={focused ? "list" : "list-outline"}
                size={22}
                color={focused ? colors.white : colors.gray[700]}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="brideGroomProfile"
        options={{
          title: "פרופיל",
          tabBarIcon: ({ focused }) => <ProfileTabIcon focused={focused} />,
        }}
      />

      {/* Hidden couple internal routes */}
      <Tabs.Screen
        name="edit-category"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="automatic-notifications"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="notification-editor"
        options={{
          href: null,
        }}
      />
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
  tabAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    backgroundColor: colors.gray[100],
  },
});


