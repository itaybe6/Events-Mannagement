import React, { FC, ReactNode, useEffect, useRef } from "react";
import { Pressable } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { colors } from "@/constants/colors";

// shopify-custom-bottom-tab-bar-animation 🔽

const BUTTON_SCALE_DURATION = 150; // Fast enough for instant feedback, slow enough to see the animation
const BUTTON_SCALE_PRESSED = 0.9; // 10% scale reduction creates noticeable but not excessive squeeze effect
const ACTIVE_BG = colors.primary;
const INACTIVE_BG = "#FFFFFF";
const PRESSED_BG = "#F4F4F4";

interface TabButtonProps {
  focused: boolean;
  onPress: () => void;
  children: ReactNode;
}

export const TabButton: FC<TabButtonProps> = ({ focused, onPress, children }) => {
  // Independent animation values for responsive UI thread animations
  const scale = useSharedValue(1);
  const bg = useSharedValue(focused ? ACTIVE_BG : INACTIVE_BG);
  const focusedRef = useRef(focused);

  // Combined scale and background animation for press feedback
  const rStyle = useAnimatedStyle(() => ({
    // withTiming chosen over spring: deterministic 150ms press latency keeps taps feeling crisp
    transform: [{ scale: withTiming(scale.get(), { duration: BUTTON_SCALE_DURATION }) }],
    // Syncs visual state to navigation focus while avoiding overshoot; color animates with the same cadence
    backgroundColor: withTiming(bg.get(), { duration: BUTTON_SCALE_DURATION }),
  }));

  // Sync background color when focus state changes from navigation
  useEffect(() => {
    focusedRef.current = focused;
    bg.set(focused ? ACTIVE_BG : INACTIVE_BG);
  }, [focused, bg]);

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
        onPress();
      }}
      onPressIn={() => {
        if (focused) {
          scale.set(BUTTON_SCALE_PRESSED); // Quick press feedback for already active tab
          return;
        }
        scale.set(BUTTON_SCALE_PRESSED);
        bg.set(PRESSED_BG); // Temporary light hover state during press
      }}
      onPressOut={() => {
        scale.set(1); // Return to normal size
        if (focusedRef.current) {
          bg.set(ACTIVE_BG); // Restore active background if still focused
        } else {
          bg.set(INACTIVE_BG); // Return to inactive background
        }
      }}
    >
      <Animated.View className="rounded-full" style={[styles.button, rStyle]}>
        {children}
      </Animated.View>
    </Pressable>
  );
};

const styles = {
  button: {
    padding: 11,
    borderRadius: 999,
  },
};

// shopify-custom-bottom-tab-bar-animation 🔼
