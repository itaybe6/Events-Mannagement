import React from 'react';
import { StyleSheet, View } from 'react-native';

interface LottieAnimationProps {
  // Keep API compatible with native component.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  source: any;
  autoPlay?: boolean;
  loop?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  style?: any;
  speed?: number;
  onAnimationFinish?: () => void;
}

/**
 * Web fallback: we intentionally avoid importing `lottie-react-native` on web,
 * because its web implementation requires an extra dependency that isn't present.
 * This keeps web bundling stable while still rendering layout space.
 */
export const LottieAnimation: React.FC<LottieAnimationProps> = ({ style }) => {
  return <View accessibilityRole="img" style={[styles.placeholder, style]} />;
};

const styles = StyleSheet.create({
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});

