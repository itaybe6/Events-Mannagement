import React, { useEffect } from "react";
import { Tabs, useRouter } from "expo-router";
import { colors } from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { Platform, StyleSheet, View, TouchableOpacity } from "react-native";
import { useLayoutStore } from '@/store/layoutStore';

export default function CoupleTabsLayout() {
  const router = useRouter();
  const { isTabBarVisible, setTabBarVisible } = useLayoutStore();

  useEffect(() => {
    setTabBarVisible(true);
  }, [setTabBarVisible]);

  const headerRight = () => (
    <TouchableOpacity
      style={styles.notificationButton}
      onPress={() => router.push('/notifications')}
    >
      <Ionicons name="notifications" size={24} color={colors.primary} />
    </TouchableOpacity>
  );

  return (
    <Tabs
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
          shadowColor: '#000',
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
          title: "הגדרות",
          tabBarIcon: ({ focused }) => (
            <View style={[styles.iconContainer, focused && styles.activeIconContainer] }>
              <Ionicons name="settings" size={24} color={focused ? colors.white : colors.gray[500]} />
            </View>
          ),
        }}
      />

      {/* Hidden couple internal routes */}
      <Tabs.Screen name="TablesList" options={{ href: null }} />
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
    backgroundColor: '#e8a7a8',
    borderWidth: 2,
    borderColor: '#d4969a',
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


