import React, { useEffect } from "react";
import { Tabs, useRouter } from "expo-router";
import { colors } from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { Platform, StyleSheet, View, TouchableOpacity } from "react-native";
import { useUserStore } from "@/store/userStore";

export default function TabLayout() {
  const router = useRouter();
  const { userType, isLoggedIn, userData } = useUserStore();

  useEffect(() => {
    console.log('🔍 TabLayout Effect - userType changed:', {
      userType,
      isLoggedIn,
      userData
    });
  }, [userType, isLoggedIn, userData]);

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
  console.log('🔄 TabLayout rendering with key:', tabKey);

  return (
    <Tabs
      key={tabKey}
      screenOptions={{
        tabBarActiveTintColor: '#fff',
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
          bottom: 20,
          left: 15,
          right: 15,
          height: 80,
          backgroundColor: '#e8a7a8',
          borderRadius: 40,
          paddingHorizontal: 24,
          paddingVertical: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.15,
          shadowRadius: 20,
          elevation: 20,
          borderTopWidth: 0,
          borderWidth: 0,
        },
        tabBarItemStyle: {
          marginHorizontal: 6,
          paddingVertical: 8,
          paddingHorizontal: 10,
          borderRadius: 20,
          backgroundColor: 'transparent',
        },
        tabBarIconStyle: {
          marginRight: 0,
          marginLeft: 0,
        },
      }}
    >
      {/* All existing screens with conditional visibility */}
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
        name="planning"
        options={{
          href: userType === 'couple' ? undefined : null,
          title: "תכנון",
          tabBarIcon: ({ focused }) => (
            <View style={[
              styles.iconContainer,
              focused && styles.activeIconContainer
            ]}>
              <Ionicons
                name="calendar"
                size={24}
                color={focused ? colors.white : colors.gray[500]}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="admin-events-create"
        options={{
          href: null
     
        }}
      />

      <Tabs.Screen
        name="gifts"
        options={{
          href: userType === 'couple' ? undefined : null,
          title: "מתנות",
          tabBarIcon: ({ focused }) => (
            <View style={[
              styles.iconContainer,
              focused && styles.activeIconContainer
            ]}>
              <Ionicons
                name="gift"
                size={24}
                color={focused ? colors.white : colors.gray[500]}
              />
            </View>
          ),
        }}
      />

      <Tabs.Screen
        name="clients"
        options={{
          href: userType === 'admin' ? undefined : null,
          title: "לקוחות",
          tabBarIcon: ({ focused }) => (
            <View style={[
              styles.iconContainer,
              focused && styles.activeIconContainer
            ]}>
              <Ionicons
                name="business"
                size={24}
                color={focused ? colors.white : colors.gray[500]}
              />
            </View>
          ),
        }}
      />

      {/* טאב חדש: אירועים למנהל */}
      <Tabs.Screen
        name="admin-events"
        options={{
          href: userType === 'admin' ? undefined : null,
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

      <Tabs.Screen
        name="settings"
        options={{
          title: "הגדרות",
          tabBarIcon: ({ focused }) => (
            <View style={[
              styles.iconContainer,
              focused && styles.activeIconContainer
            ]}>
              <Ionicons
                name={userType === 'admin' ? "cog" : "person-circle"}
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
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  activeIconContainer: {
    backgroundColor: '#d4969a',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  notificationButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
});