import { useEffect, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

export const MOBILE_WEB_LAYOUT_MAX_WIDTH = 900;

function readWebViewportWidth(): number | null {
  if (typeof window === 'undefined') return null;
  const visual = window.visualViewport?.width;
  if (typeof visual === 'number' && visual > 0) return Math.round(visual);
  return Math.round(window.innerWidth);
}

/**
 * Prefer the native mobile screen on web when the visible viewport is narrow.
 * Uses visualViewport when available so DevTools device mode and mobile browsers
 * are detected reliably (useWindowDimensions alone can report the outer window).
 */
export function useMobileWebLayout() {
  const { width: rnWidth } = useWindowDimensions();
  const [viewportWidth, setViewportWidth] = useState<number | null>(() =>
    Platform.OS === 'web' ? readWebViewportWidth() : null
  );

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const sync = () => setViewportWidth(readWebViewportWidth());
    sync();
    window.addEventListener('resize', sync);
    window.visualViewport?.addEventListener('resize', sync);
    return () => {
      window.removeEventListener('resize', sync);
      window.visualViewport?.removeEventListener('resize', sync);
    };
  }, []);

  if (Platform.OS !== 'web') {
    return { width: rnWidth, preferNativeMobileLayout: false };
  }

  const width = viewportWidth ?? rnWidth;
  return {
    width,
    preferNativeMobileLayout: width < MOBILE_WEB_LAYOUT_MAX_WIDTH,
  };
}
