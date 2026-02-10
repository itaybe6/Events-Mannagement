import React, { useCallback, useMemo } from 'react';
import { Dimensions, I18nManager, PanResponder, Platform, StyleSheet, View, ViewProps } from 'react-native';
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
  // Optional fallback route if there is no back stack.
  fallbackHref,
  // Optional override for back action (used by swipe gesture).
  onBack,
  ...rest
}: ViewProps & { children: React.ReactNode; fallbackHref?: string; onBack?: () => void }) {
  const router = useRouter();

  const safeBack = useCallback(() => {
    if (onBack) {
      onBack();
      return;
    }
    const canGoBackFn = (router as any)?.canGoBack;
    if (typeof canGoBackFn === 'function') {
      if (canGoBackFn()) router.back();
      else if (fallbackHref) router.replace(fallbackHref as any);
      return;
    }
    // If canGoBack isn't available, avoid triggering a dev warning.
    if (fallbackHref) router.replace(fallbackHref as any);
  }, [fallbackHref, onBack, router]);

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
        safeBack();
      },
    });
  }, [safeBack]);

  return (
    <View
      {...rest}
      style={[styles.root, style]}
      // Never spread null/undefined into props (can crash on web).
      {...(panResponder ? panResponder.panHandlers : {})}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

