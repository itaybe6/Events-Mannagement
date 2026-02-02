import React, { useEffect } from "react";
import { Tabs, useRouter } from "expo-router";
import { colors } from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { Platform, StyleSheet, View, TouchableOpacity } from "react-native";
import { useUserStore } from "@/store/userStore";
import { useLayoutStore } from '@/store/layoutStore';

// NOTE: This layout will be kept for backward-compatibility but hidden once role groups exist
export default function TabLayout() {
  const router = useRouter();
  const { userType, isLoggedIn, userData } = useUserStore();
  const { isTabBarVisible, setTabBarVisible } = useLayoutStore();

  // Clean console: avoid verbose renders logging

  useEffect(() => {
    // React to userType or auth changes if needed without logging
  }, [userType, isLoggedIn, userData]);

  // Ensure tab bar is visible when entering tabs layout
  useEffect(() => {
    setTabBarVisible(true);
  }, [setTabBarVisible, userType]);

  const headerRight = () => (
    <TouchableOpacity
      style={styles.notificationButton}
      onPress={() => router.push('/notifications')}
    >
      <Ionicons name="notifications" size={24} color={colors.primary} />
    </TouchableOpacity>
  );

  // Force re-render when userType changes
  const tabKey = `tabs-${userType || 'default'}`;

  return (
    <Tabs
      key={tabKey}
      screenOptions={{
        tabBarActiveTintColor: colors.white,
        tabBarInactiveTintColor: colors.gray[500],
        headerShown: true,
        headerTitle: "",
        headerStyle: {
          backgroundColor: colors.gray[100],
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
      {/* Legacy mixed tabs (will be superseded by role-based groups) */}
      <Tabs.Screen
        name="index"
        options={{
          href: userType === 'couple' ? undefined : null,
          title: "בית",
          tabBarIcon: ({ focused }) => (
            <View style={[
              styles.iconContainer,
              focused && styles.activeIconContainer
            ]}>
              <Ionicons
                name="home"
                size={24}
                color={focused ? colors.white : colors.gray[500]}
              />
            </View>
          ),
        }}
      />

      <Tabs.Screen
        name="guests"
        options={{
          href: userType === 'couple' ? undefined : null,
          title: "אורחים",
          tabBarIcon: ({ focused }) => (
            <View style={[
              styles.iconContainer,
              focused && styles.activeIconContainer
            ]}>
              <Ionicons
                name="people"
                size={24}
                color={focused ? colors.white : colors.gray[500]}
              />
            </View>
          ),
        }}
      />

      <Tabs.Screen
        name="BrideGroomSeating"
        options={{
          href: userType === 'couple' ? undefined : null,
          title: "הושבה",
          tabBarIcon: ({ focused }) => (
            <View style={[
              styles.iconContainer,
              focused && styles.activeIconContainer
            ]}>
              <Ionicons
                name="grid"
                size={24}
                color={focused ? colors.white : colors.gray[500]}
              />
            </View>
          ),
        }}
      />

      <Tabs.Screen
        name="TablesList"
        options={{
          href: null
        }}
      />

      <Tabs.Screen
        name="admin-events-create"
        options={{
          href: null
     
        }}
      />
      <Tabs.Screen
        name="admin-event-details"
        options={{
          href: null
     
        }}
      />

      

      {/* removed clients (no route file) */}

      {/* טאב חדש: אירועים למנהל */}
      <Tabs.Screen
        name="admin-events"
        options={{
          href: userType === 'admin' || userType === 'employee' ? undefined : null,
          title: "אירועים",
          tabBarIcon: ({ focused }) => (
            <View style={[
              styles.iconContainer,
              focused && styles.activeIconContainer
            ]}>
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
        name="users"
        options={{
          href: userType === 'admin' ? undefined : null,
          title: "ניהול משתמשים",
          tabBarIcon: ({ focused }) => (
            <View style={[
              styles.iconContainer,
              focused && styles.activeIconContainer
            ]}>
              <Ionicons
                name="people-circle"
                size={24}
                color={focused ? colors.white : colors.gray[500]}
              />
            </View>
          ),
        }}
      />

      {/* removed employee-events (merged into admin-events) */}

      <Tabs.Screen
        name="brideGroomProfile"
        options={{
          href: userType === 'couple' ? undefined : null,
          title: "הגדרות",
          tabBarIcon: ({ focused }) => (
            <View style={[
              styles.iconContainer,
              focused && styles.activeIconContainer
            ]}>
              <Ionicons
                name="settings"
                size={24}
                color={focused ? colors.white : colors.gray[500]}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="admin-profile"
        options={{
          href: userType === 'admin' ? undefined : null,
          title: 'פרופיל',
          tabBarIcon: ({ focused }) => (
            <View style={[
              styles.iconContainer,
              focused && styles.activeIconContainer
            ]}>
              <Ionicons
                name="person-circle"
                size={24}
                color={focused ? colors.white : colors.gray[500]}
              />
            </View>
          ),
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
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
    shadowColor: colors.richBlack,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
});