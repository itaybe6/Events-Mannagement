import { Platform } from 'react-native';

/**
 * Floating shopify-style tab bars (admin / couple / employee) are positioned at:
 *   bottom: safeAreaInsets.bottom + 12
 *
 * Use this for scroll `contentContainerStyle.paddingBottom` (and/or AppKeyboardAware
 * which turns that padding into a real spacer View on Android).
 */
const TAB_BAR_SCREEN_OFFSET = 12;
const TAB_BAR_PILL_HEIGHT = 68;
const CONTENT_GAP_ABOVE_BAR = 36;
/** When Android under-reports the system nav / gesture inset. */
const ANDROID_NAV_FALLBACK = 48;
const ANDROID_EXTRA = 28;

export function getFloatingTabBarContentPadding(
  bottomInset: number,
  options?: { webFallback?: number }
): number {
  if (Platform.OS === 'web') return options?.webFallback ?? 40;

  const safeBottom = Math.max(0, bottomInset);
  const androidNav =
    Platform.OS === 'android' && safeBottom < 16 ? ANDROID_NAV_FALLBACK : 0;

  return (
    safeBottom +
    androidNav +
    TAB_BAR_SCREEN_OFFSET +
    TAB_BAR_PILL_HEIGHT +
    CONTENT_GAP_ABOVE_BAR +
    (Platform.OS === 'android' ? ANDROID_EXTRA : 0)
  );
}
