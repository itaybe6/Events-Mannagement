import { useEffect, useMemo, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

/**
 * Single source of truth for web layout decisions.
 *
 * Before this module every screen invented its own width check (900 / 980 / 1024 /
 * 1040 / 1360 ...), which left the iPad in a dead zone: portrait (768-834pt) fell
 * into the phone layout and landscape (1024-1194pt) got a desktop layout tuned for
 * 1280px+ with hover-only affordances and mouse-sized hit areas.
 *
 * The tiers below are anchored on real iPad CSS viewports:
 *   iPad mini      744 x 1133   /  1133 x 744
 *   iPad 10.9"     820 x 1180   /  1180 x 820
 *   iPad Pro 11"   834 x 1194   /  1194 x 834
 *   iPad Pro 13"  1024 x 1366   /  1366 x 1024
 */

export const BREAKPOINTS = {
  /** Below this we render the phone layout. */
  phone: 700,
  /** iPad portrait band starts here. */
  tabletPortrait: 700,
  /** iPad landscape (and small laptops) start here. */
  tabletLandscape: 1024,
  /** True desktop: wider than the largest iPad landscape viewport. */
  desktop: 1367,
  /**
   * Shorter-side cutoff separating a phone from a tablet on touch devices.
   * A landscape iPhone is ~844x390 — wide enough to look like a tablet by width
   * alone, but its 390pt height is not. The largest phone short side is 430
   * (Pro Max); the smallest iPad short side is 744 (mini).
   */
  phoneShortSide: 500,
} as const;

export type DeviceClass = 'phone' | 'tabletPortrait' | 'tabletLandscape' | 'desktop';
export type Orientation = 'portrait' | 'landscape';

/** Apple HIG minimum comfortable touch target. */
export const TOUCH_TARGET = 44;

function readViewportWidth(): number | null {
  if (typeof window === 'undefined') return null;
  const visual = window.visualViewport?.width;
  if (typeof visual === 'number' && visual > 0) return Math.round(visual);
  return Math.round(window.innerWidth);
}

function readViewportHeight(): number | null {
  if (typeof window === 'undefined') return null;
  const visual = window.visualViewport?.height;
  if (typeof visual === 'number' && visual > 0) return Math.round(visual);
  return Math.round(window.innerHeight);
}

/**
 * Coarse pointer means finger/pencil rather than mouse. This is what decides
 * whether hover affordances are usable and whether hit areas must grow.
 */
export function detectCoarsePointer(): boolean {
  if (Platform.OS !== 'web') return true;
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
}

/**
 * iPadOS 13+ reports itself as "Macintosh" in the UA string, so the touch-point
 * count is the only reliable signal that a "desktop Safari" is really an iPad.
 */
export function detectIpad(): boolean {
  if (Platform.OS !== 'web') return false;
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad/i.test(ua)) return true;
  const maxTouch = (navigator as any).maxTouchPoints ?? 0;
  return /Macintosh/i.test(ua) && maxTouch > 1;
}

export function classifyDevice(width: number, height: number, isTouch: boolean): DeviceClass {
  if (width < BREAKPOINTS.phone) return 'phone';
  // A landscape phone is wide but short. Judge touch devices by their shorter
  // side so an 844x390 iPhone does not get served the tablet layout.
  if (isTouch && height > 0 && Math.min(width, height) < BREAKPOINTS.phoneShortSide) {
    return 'phone';
  }
  if (width >= BREAKPOINTS.desktop) return 'desktop';
  if (width >= BREAKPOINTS.tabletLandscape) {
    // 1024-1366 is both "iPad landscape" and "small laptop". A coarse pointer
    // (or a portrait iPad Pro 13", which is exactly 1024 wide) means tablet.
    if (isTouch) return height > width ? 'tabletPortrait' : 'tabletLandscape';
    return 'desktop';
  }
  return height > width ? 'tabletPortrait' : 'tabletLandscape';
}

export type ResponsiveLayout = {
  width: number;
  height: number;
  deviceClass: DeviceClass;
  orientation: Orientation;
  /** Finger/pencil input — hover cannot be relied on, hit areas must be >= 44pt. */
  isTouch: boolean;
  isIpad: boolean;
  isPhone: boolean;
  isTablet: boolean;
  isTabletPortrait: boolean;
  isTabletLandscape: boolean;
  isDesktop: boolean;
  /** Tablet or true touch desktop — the "design for fingers" switch. */
  isTouchLayout: boolean;
  /** Outer page padding. */
  gutter: number;
  /** Gap between cards/sections. */
  gap: number;
  /** Height for primary buttons, inputs, pills, list rows. */
  controlHeight: number;
  /** Corner radius for cards at this size. */
  cardRadius: number;
  /** Width of the persistent nav rail. */
  sidebarWidth: number;
  /** `rail` shows icons only — the full 270px sidebar starves content on a portrait iPad. */
  sidebarMode: 'hidden' | 'rail' | 'full';
  /** Max width for the main content column. */
  contentMaxWidth: number | undefined;
};

function tokensFor(deviceClass: DeviceClass, isTouch: boolean) {
  switch (deviceClass) {
    case 'phone':
      return {
        gutter: 16,
        gap: 12,
        controlHeight: 48,
        cardRadius: 18,
        sidebarWidth: 0,
        sidebarMode: 'hidden' as const,
        contentMaxWidth: undefined,
      };
    case 'tabletPortrait':
      // A 270px sidebar on an 820px viewport leaves 530px of content — too tight.
      // Portrait iPads get an icon rail so the content keeps ~730px.
      return {
        gutter: 20,
        gap: 16,
        controlHeight: 52,
        cardRadius: 22,
        sidebarWidth: 84,
        sidebarMode: 'rail' as const,
        contentMaxWidth: undefined,
      };
    case 'tabletLandscape':
      return {
        gutter: 24,
        gap: 18,
        controlHeight: 50,
        cardRadius: 22,
        sidebarWidth: 224,
        sidebarMode: 'full' as const,
        contentMaxWidth: undefined,
      };
    case 'desktop':
    default:
      return {
        gutter: 32,
        gap: 20,
        controlHeight: isTouch ? TOUCH_TARGET : 42,
        cardRadius: 24,
        sidebarWidth: 270,
        sidebarMode: 'full' as const,
        contentMaxWidth: 1600,
      };
  }
}

/**
 * Live viewport info. Listens to `visualViewport` so iPad rotation, Split View and
 * Slide Over all report the real drawable width rather than the outer window.
 */
export function useResponsive(): ResponsiveLayout {
  const { width: rnWidth, height: rnHeight } = useWindowDimensions();

  const [viewport, setViewport] = useState<{ width: number | null; height: number | null }>(() =>
    Platform.OS === 'web' ? { width: readViewportWidth(), height: readViewportHeight() } : { width: null, height: null }
  );
  const [isTouch, setIsTouch] = useState<boolean>(() => detectCoarsePointer());
  const [isIpad, setIsIpad] = useState<boolean>(() => detectIpad());

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const sync = () => {
      setViewport({ width: readViewportWidth(), height: readViewportHeight() });
      setIsTouch(detectCoarsePointer());
    };

    sync();
    setIsIpad(detectIpad());

    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    window.visualViewport?.addEventListener('resize', sync);
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
      window.visualViewport?.removeEventListener('resize', sync);
    };
  }, []);

  return useMemo(() => {
    const width = viewport.width ?? rnWidth;
    const height = viewport.height ?? rnHeight;
    const touch = isTouch || isIpad;
    const deviceClass = classifyDevice(width, height, touch);
    const orientation: Orientation = height > width ? 'portrait' : 'landscape';
    const tokens = tokensFor(deviceClass, touch);

    const isTablet = deviceClass === 'tabletPortrait' || deviceClass === 'tabletLandscape';

    return {
      width,
      height,
      deviceClass,
      orientation,
      isTouch: touch,
      isIpad,
      isPhone: deviceClass === 'phone',
      isTablet,
      isTabletPortrait: deviceClass === 'tabletPortrait',
      isTabletLandscape: deviceClass === 'tabletLandscape',
      isDesktop: deviceClass === 'desktop',
      isTouchLayout: isTablet || touch,
      ...tokens,
    };
  }, [viewport.width, viewport.height, rnWidth, rnHeight, isTouch, isIpad]);
}

/**
 * Column count for a card grid, derived from the width actually available to the
 * grid rather than the window. Screens that sit next to a sidebar were picking
 * 3-4 columns off the window width and then cramming them into ~900px.
 */
export function gridColumns(availableWidth: number, minCardWidth: number, maxColumns = 4): number {
  if (!Number.isFinite(availableWidth) || availableWidth <= 0) return 1;
  const fit = Math.floor(availableWidth / minCardWidth);
  return Math.max(1, Math.min(maxColumns, fit));
}

/**
 * Hit-area padding to add around a control that is visually smaller than the
 * 44pt minimum. Returns a `hitSlop` object, or undefined when not needed.
 */
export function touchHitSlop(visualSize: number, isTouch: boolean) {
  if (!isTouch || visualSize >= TOUCH_TARGET) return undefined;
  const pad = Math.ceil((TOUCH_TARGET - visualSize) / 2);
  return { top: pad, bottom: pad, left: pad, right: pad };
}
