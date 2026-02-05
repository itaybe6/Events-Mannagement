import React from 'react';
import { View } from 'react-native';

export interface LottieAnimationProps {
  source: any; // קובץ JSON של האנימציה (בשימוש רק בנייטיב)
  autoPlay?: boolean;
  loop?: boolean;
  style?: any;
  speed?: number;
  onAnimationFinish?: () => void;
}

/**
 * Web-safe fallback.
 * ב-Web אנחנו לא משתמשים ב-lottie-react-native כדי לא לגרור תלות של dotlottie.
 * עבור iOS/Android יש מימוש מלא בקובץ `LottieAnimation.native.tsx`.
 */
export const LottieAnimation: React.FC<LottieAnimationProps> = ({ style }) => {
  return <View style={style} />;
};