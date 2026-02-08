import React, { useEffect } from "react";
import { Tabs, useRouter } from "expo-router";
import { colors } from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { Image, Platform, StyleSheet, View, TouchableOpacity } from "react-native";
import { Image as ExpoImage } from 'expo-image';

import { useLayoutStore } from '@/store/layoutStore';
import { useUserStore } from '@/store/userStore';

function ProfileTabIcon({ focused }: { focused: boolean }) {
  const avatarUrl = useUserStore(s => s.userData?.avatar_url);

  return (
    <View style={[styles.iconContainer, focused && styles.activeIconContainer]}>
      {avatarUrl ? (
        <ExpoImage
          key={avatarUrl}
          source={{ uri: avatarUrl }}
          style={[styles.tabAvatar, { borderColor: focused ? colors.white : 'rgba(0,0,0,0.14)' }]}
          contentFit="cover"
          cachePolicy="none"
          transition={0}
        />
      ) : (
        <Ionicons name="person-circle" size={24} color={focused ? colors.white : colors.gray[500]} />
      )}
    </View>
  );
}

export default function CoupleTabsLayout() {
  const router = useRouter();
  const { isTabBarVisible, setTabBarVisible } = useLayoutStore();
  const { userType, isLoggedIn, loading, userData } = useUserStore();

  useEffect(() => {
    setTabBarVisible(true);
  }, [setTabBarVisible]);

  useEffect(() => {
    if (loading) return;
    if (!isLoggedIn) {
      router.replace('/login');
      return;
    }
    if (userType === 'admin' || userType === 'employee') {
      router.replace('/(admin)/admin-events');
    }
  }, [isLoggedIn, userType, loading, router]);

  const headerRight = () => (
    <TouchableOpacity
      style={styles.notificationButton}
      onPress={() => router.push('/notifications')}
    >
      <Ionicons name="notifications" size={24} color={colors.primary} />
    </TouchableOpacity>
  );

  const headerTitle = () => (
    <Image
      source={require('../../assets/images/logo-moon.png')}
      style={styles.logoHeader}
      resizeMode="contain"
    />
  );

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.white,
        tabBarInactiveTintColor: colors.gray[500],
        headerShown: true,
        headerTitle: headerTitle,
        headerTitleAlign: "center",
        headerTitleContainerStyle: {
          width: "100%",
          alignItems: "center",
        },
        headerStyle: {
          backgroundColor: '#FFFFFF',
          height: 90,
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: 0,
        },
        headerRight: headerRight,
        tabBarShowLabel: false,
        tabBarStyle: {
          position: 'absolute',
          bottom: Platform.OS === 'ios' ? 30 : 20,
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
          borderColor: 'rgba(0,0,0,0.08)',
          display: isTabBarVisible ? 'flex' : 'none',
        },
        tabBarItemStyle: {
          marginHorizontal: 3,
          paddingVertical: 6,
          paddingHorizontal: 8,
          height: 30,
          justifyContent: 'center',
          alignItems: 'center',
        },
        tabBarIconStyle: {
          marginRight: 0,
          marginLeft: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "בית",
          tabBarIcon: ({ focused }) => (
            <View style={[styles.iconContainer, focused && styles.activeIconContainer] }>
              <Ionicons name="home" size={24} color={focused ? colors.white : colors.gray[500]} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="guests"
        options={{
          title: "אורחים",
          tabBarIcon: ({ focused }) => (
            <View style={[styles.iconContainer, focused && styles.activeIconContainer] }>
              <Ionicons name="people" size={24} color={focused ? colors.white : colors.gray[500]} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="BrideGroomSeating"
        options={{
          title: "הושבה",
          tabBarIcon: ({ focused }) => (
            <View style={[styles.iconContainer, focused && styles.activeIconContainer] }>
              <Ionicons name="grid" size={24} color={focused ? colors.white : colors.gray[500]} />
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
        name="TablesList"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="notification-editor"
        options={{
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="edit-category"
        options={{
          href: null,
          headerShown: false,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeIconContainer: {
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.secondary,
  },
  notificationButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
    shadowColor: colors.richBlack,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
  },
  logoHeader: {
    width: 320,
    height: 80,
  },
  tabAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    backgroundColor: colors.gray[100],
  },
});


