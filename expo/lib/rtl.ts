import { I18nManager } from 'react-native';

/**
 * Use these constants instead of hard-coding `row-reverse` for RTL layouts.
 *
 * Why: when `I18nManager.isRTL` is true (as in production builds with forced RTL),
 * React Native mirrors layouts automatically. Hard-coding `row-reverse` can cause
 * a "double mirror" where the UI looks LTR in release but RTL in Expo.
 */
export const IS_RTL = Boolean(I18nManager.isRTL);

export const ROW_DIR = (I18nManager.isRTL ? 'row' : 'row-reverse') as const;
export const ROW_REVERSE_DIR = (I18nManager.isRTL ? 'row-reverse' : 'row') as const;

// Visual alignment helpers (horizontal).
// In RTL, Yoga flips "start/end", so `flex-end` can mean "left".
// Use these when you want consistent *visual* alignment regardless of RTL.
export const ALIGN_RIGHT = (I18nManager.isRTL ? 'flex-start' : 'flex-end') as const;
export const ALIGN_LEFT = (I18nManager.isRTL ? 'flex-end' : 'flex-start') as const;

// Text alignment mirrors too: once the app runs with forced RTL (release builds),
// `textAlign: 'right'` resolves to `end`, which is the physical LEFT. Use these
// when you mean a *visual* side, the same way ALIGN_RIGHT works for layout.
export const TEXT_RIGHT = (I18nManager.isRTL ? 'left' : 'right') as 'left' | 'right';
export const TEXT_LEFT = (I18nManager.isRTL ? 'right' : 'left') as 'left' | 'right';

// Unicode RTL mark to force correct text direction for edge-cases
// (e.g. multi-line titles, mixed punctuation, or when RN text layout guesses wrong).
export const RTL_MARK = '\u200F' as const;

export function rtlText(value: string) {
  const s = String(value ?? '');
  return I18nManager.isRTL ? `${RTL_MARK}${s}` : s;
}

