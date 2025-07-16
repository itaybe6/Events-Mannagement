import React from "react";
import { Tabs } from "expo-router";
import { colors } from "@/constants/colors";
import { Home, Users, Gift, Calendar, Settings } from "lucide-react-native";
import { Platform } from "react-native";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.white,
        tabBarInactiveTintColor: colors.gray[600],
        headerShown: true,
        tabBarLabelPosition: 'beside-icon',
        tabBarStyle: {
          position: 'absolute',
          bottom: Platform.OS === 'ios' ? 25 : 15,
          left: 20,
          right: 20,
          height: 65,
          backgroundColor: colors.white,
          borderRadius: 35,
          paddingHorizontal: 10,
          paddingVertical: 8,
          shadowColor: colors.black,
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.15,
          shadowRadius: 20,
          elevation: 10,
          borderTopWidth: 0,
        },
        tabBarItemStyle: {
          borderRadius: 25,
          marginHorizontal: 2,
          paddingVertical: 8,
        },
        tabBarActiveBackgroundColor: colors.primary,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          marginLeft: Platform.OS === 'ios' ? 4 : 2,
        },
        tabBarIconStyle: {
          marginRight: Platform.OS === 'ios' ? 0 : 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "בית",
          tabBarIcon: ({ color, focused }) => (
            <Home 
              size={20} 
              color={focused ? colors.white : colors.gray[600]} 
            />
          ),
        }}
      />
      <Tabs.Screen
        name="guests"
        options={{
          title: "אורחים",
          tabBarIcon: ({ color, focused }) => (
            <Users 
              size={20} 
              color={focused ? colors.white : colors.gray[600]} 
            />
          ),
        }}
      />
      <Tabs.Screen
        name="gifts"
        options={{
          title: "מתנות",
          tabBarIcon: ({ color, focused }) => (
            <Gift 
              size={20} 
              color={focused ? colors.white : colors.gray[600]} 
            />
          ),
        }}
      />
      <Tabs.Screen
        name="planning"
        options={{
          title: "תכנון",
          tabBarIcon: ({ color, focused }) => (
            <Calendar 
              size={20} 
              color={focused ? colors.white : colors.gray[600]} 
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "הגדרות",
          tabBarIcon: ({ color, focused }) => (
            <Settings 
              size={20} 
              color={focused ? colors.white : colors.gray[600]} 
            />
          ),
        }}
      />
    </Tabs>
  );
}