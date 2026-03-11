import React, { FC } from "react";
import { Text } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

// shopify-tabs-shared-header-animation 🔽

export const ProfileTab: FC = () => {
  return (
    <Animated.View
      /* Simple 150ms fade keeps tab header transitions consistent.
       * Using Animated.View ensures the effect runs on the UI thread via
       * createAnimatedComponent for jank-free entrance. */
      entering={FadeIn.duration(150)}
    >
      <Text className="text-2xl font-bold text-white">Profile</Text>
    </Animated.View>
  );
};

// shopify-tabs-shared-header-animation 🔼
