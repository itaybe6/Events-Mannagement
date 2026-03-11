import React, { FC, PropsWithChildren } from "react";
import { useMenu } from "./lib/providers/menu-provider";
import Animated, { interpolate, useAnimatedStyle } from "react-native-reanimated";

// shopify-menu-transition-animation 🔽

export const AnimatedTabsContainer: FC<PropsWithChildren> = ({ children }) => {
  const { menuProgress } = useMenu();

  /**
   * Container transform driven by menuProgress shared value.
   * Why: When the menu opens (0→1), content should subtly move down so the
   * overlay feels layered above it.
   *
   * useAnimatedStyle runs on the UI thread; avoids JS jank while interacting
   * with the menu gesture/animation.
   */
  const rContainerStyle = useAnimatedStyle(() => {
    // Interpolation: input 0 (closed)→1 (open) maps to output 0px→20px vertical shift.
    // 20px chosen to be noticeable yet non-intrusive; keeps tabs readable while hinting depth.
    const translateY = interpolate(menuProgress.get(), [0, 1], [0, 20]);

    return {
      transform: [
        {
          translateY,
        },
      ],
    };
  });

  return (
    // Animated.View (createAnimatedComponent) is required so transform applies on UI thread.
    <Animated.View className="flex-1" style={rContainerStyle}>
      {children}
    </Animated.View>
  );
};

// shopify-menu-transition-animation 🔼
