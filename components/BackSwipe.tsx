import React, { useMemo } from 'react';
import { Dimensions, I18nManager, PanResponder, Platform, View, ViewProps } from 'react-native';
import { useRouter } from 'expo-router';

/**
 * Simple wrapper that enables an "edge swipe to go back" gesture on native.
 * - On RTL: swipe from the right edge towards left
 * - On LTR: swipe from the left edge towards right
 *
 * Safe fallback: on web / unsupported platforms it behaves like a plain <View>.
 */
export default function BackSwipe({
  children,
  style,
  ...rest
}: ViewProps & { children: React.ReactNode }) {
  const router = useRouter();

  const panResponder = useMemo(() => {
    if (Platform.OS === 'web') return null;

    const EDGE = 24;
    const { width } = Dimensions.get('window');
    const isRTL = I18nManager.isRTL;

    const isFromEdge = (x0: number) => (isRTL ? x0 >= width - EDGE : x0 <= EDGE);
    const isBackSwipe = (dx: number) => (isRTL ? dx < -60 : dx > 60);

    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gesture) => {
        if (gesture.numberActiveTouches !== 1) return false;
        if (!isFromEdge(gesture.x0)) return false;
        const horizontal = Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2;
        return horizontal && Math.abs(gesture.dx) > 10;
      },
      onPanResponderRelease: (_, gesture) => {
        if (!isFromEdge(gesture.x0)) return;
        if (!isBackSwipe(gesture.dx)) return;
        try {
          // expo-router has canGoBack in newer versions; guard to avoid crashes.
          const canGoBack = typeof (router as any).canGoBack === 'function' ? (router as any).canGoBack() : true;
          if (canGoBack) router.back();
        } catch {
          // ignore
        }
      },
    });
  }, [router]);

  return (
    <View {...rest} style={style} {...(panResponder ? panResponder.panHandlers : null)}>
      {children}
    </View>
  );
}

