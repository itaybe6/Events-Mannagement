import React, { useEffect } from "react";
import { Tabs, useRouter } from "expo-router";
import { colors } from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { Platform, StyleSheet, View, TouchableOpacity } from "react-native";
import { useUserStore } from "@/store/userStore";
import { useLayoutStore } from '@/store/layoutStore';

export default function TabLayout() {
  const router = useRouter();
  const { userType, isLoggedIn, userData } = useUserStore();
  const { isTabBarVisible } = useLayoutStore();

  console.log('TabLayout render:', { userType, isLoggedIn, userData });

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
        name="BrideGroomSeating"
        options={{
          href: userType === 'couple' ? '/(tabs)/BrideGroomSeating' : null,
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
        name="brideGroomProfile"
        options={{
          href: userType === 'couple' ? '/brideGroomProfile' : null,
          title: "פרופיל",
          tabBarIcon: ({ focused }) => (
            <View style={[
              styles.iconContainer,
              focused && styles.activeIconContainer
            ]}>
              <Ionicons
                name="person"
                size={24}
                color={focused ? colors.white : colors.gray[500]}
              />
            </View>
          ),
        }}
      />
{userType === 'couple' && 
  <Tabs.Screen
  name="admin-profile"
  options={{
    href: null

  }}
/>
}
      {/* Admin profile tab for admin users */}
      {userType === 'admin' ? (
        <Tabs.Screen
          name="admin-profile"
          options={{
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
      ) : (
        <Tabs.Screen
          name="settings"
          options={{
            title: 'הגדרות',
            tabBarIcon: ({ focused }) => (
              <View style={[
                styles.iconContainer,
                focused && styles.activeIconContainer
              ]}>
                <Ionicons
                  name="cog"
                  size={24}
                  color={focused ? colors.white : colors.gray[500]}
                />
              </View>
            ),
          }}
        />
      )}
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