import { Bell } from "lucide-react-native";
import React, { FC } from "react";
import { View, Text, Pressable } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

// shopify-tabs-shared-header-animation 🔽

const simulatePress = () => {};

export const Home: FC = () => {
  return (
    <Animated.View
      /* Enter animation for tab header content.
       * Why 150ms: quick enough to feel responsive without lingering; matches other
       * header parts for consistent rhythm across tabs.
       * Animated.View is required so Reanimated can run the entering animation on
       * the UI thread via createAnimatedComponent (no JS thread jank).
       */
      entering={FadeIn.duration(150)}
      className="flex-row items-center justify-between"
    >
      <Pressable className="flex-row items-center gap-2" onPress={simulatePress}>
        <View className="size-8 items-center justify-center rounded-lg bg-green-500">
          <Text className="text-black text-sm font-medium">MS</Text>
        </View>
        <Text className="font-semibold text-white">My Store</Text>
      </Pressable>
      <View className="flex-row items-center gap-4">
        <Pressable
          className="size-9 items-center justify-center rounded-full"
          onPress={simulatePress}
        >
          <Bell size={20} color="white" />
        </Pressable>
        <Pressable
          className="size-8 items-center justify-center rounded-full bg-fuchsia-600"
          onPress={simulatePress}
        >
          <Text className="text-white text-sm font-medium">VS</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
};

// shopify-tabs-shared-header-animation 🔼
