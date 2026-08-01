import { useEffect, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

import { BREAKPOINTS, classifyDevice, detectCoarsePointer, detectIpad } from './responsive';

/**
 * Phone layout cutoff. This used to be 900, which swallowed every iPad in
 * portrait (744-834pt) and served them the phone screen on a 10-13" display.
 * It now matches `BREAKPOINTS.phone` so tablets get the full web layout.
 */
export const MOBILE_WEB_LAYOUT_MAX_WIDTH = BREAKPOINTS.phone;

function readWebViewportWidth(): number | null {
  if (typeof window === 'undefined') return null;
  const visual = window.visualViewport?.width;
  if (typeof visual === 'number' && visual > 0) return Math.round(visual);
  return Math.round(window.innerWidth);
}

function readWebViewportHeight(): number | null {
  if (typeof window === 'undefined') return null;
  const visual = window.visualViewport?.height;
  if (typeof visual === 'number' && visual > 0) return Math.round(visual);
  return Math.round(window.innerHeight);
}

function isLikelyMobileWebBrowser(): boolean {
  if (typeof window === 'undefined') return false;

  const viewportWidth = readWebViewportWidth();
  if (viewportWidth != null && viewportWidth < MOBILE_WEB_LAYOUT_MAX_WIDTH) {
    return true;
  }

  const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
  const mobileUa = /Android|iPhone|iPod|Mobile/i.test(navigator.userAgent);
  const tabletUa = /iPad|Tablet/i.test(navigator.userAgent) || detectIpad();

  return mobileUa && coarsePointer && !tabletUa;
}

/**
 * Prefer the native mobile screen on web when the visible viewport is narrow.
 * Uses visualViewport when available so DevTools device mode and mobile browsers
 * are detected reliably (useWindowDimensions alone can report the outer window).
 */
export function useMobileWebLayout() {
  const { width: rnWidth, height: rnHeight } = useWindowDimensions();
  const [viewport, setViewport] = useState<{ width: number | null; height: number | null }>(() =>
    Platform.OS === 'web'
      ? { width: readWebViewportWidth(), height: readWebViewportHeight() }
      : { width: null, height: null }
  );

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const sync = () => setViewport({ width: readWebViewportWidth(), height: readWebViewportHeight() });
    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    window.visualViewport?.addEventListener('resize', sync);
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
      window.visualViewport?.removeEventListener('resize', sync);
    };
  }, []);

  if (Platform.OS !== 'web') {
    return { width: rnWidth, preferNativeMobileLayout: false };
  }

  const width = viewport.width ?? rnWidth;
  const height = viewport.height ?? rnHeight;
  // Share the classifier with `useResponsive` so the shell and the screens inside
  // it never disagree — notably for a landscape phone, which is wide enough to
  // pass a width-only check but must still get the phone shell.
  const deviceClass = classifyDevice(width, height, detectCoarsePointer() || detectIpad());
  const preferNativeMobileLayout =
    deviceClass === 'phone' || (viewport.width == null && isLikelyMobileWebBrowser());

  return {
    width,
    preferNativeMobileLayout,
  };
}
