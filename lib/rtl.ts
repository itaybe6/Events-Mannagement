import { I18nManager } from 'react-native';

/**
 * Use these constants instead of hard-coding `row-reverse` for RTL layouts.
 *
 * Why: when `I18nManager.isRTL` is true (as in production builds with forced RTL),
 * React Native mirrors layouts automatically. Hard-coding `row-reverse` can cause
 * a "double mirror" where the UI looks LTR in release but RTL in Expo.
 */
export const ROW_DIR = (I18nManager.isRTL ? 'row' : 'row-reverse') as const;
export const ROW_REVERSE_DIR = (I18nManager.isRTL ? 'row-reverse' : 'row') as const;

// Visual alignment helpers (horizontal).
// In RTL, Yoga flips "start/end", so `flex-end` can mean "left".
// Use these when you want consistent *visual* alignment regardless of RTL.
export const ALIGN_RIGHT = (I18nManager.isRTL ? 'flex-start' : 'flex-end') as const;
export const ALIGN_LEFT = (I18nManager.isRTL ? 'flex-end' : 'flex-start') as const;

// Unicode RTL mark to force correct text direction for edge-cases
// (e.g. multi-line titles, mixed punctuation, or when RN text layout guesses wrong).
export const RTL_MARK = '\u200F' as const;
export const RTL_EMBED = '\u202B' as const; // Right-to-Left Embedding
export const RTL_POP = '\u202C' as const; // Pop Directional Formatting

export function rtlText(value: string) {
  const s = String(value ?? '');
  if (!I18nManager.isRTL) return s;
  // Apply mark after each newline as well, so multi-line strings keep RTL base direction.
  return `${RTL_MARK}${s.replace(/\n/g, `\n${RTL_MARK}`)}`;
}

export function rtlParagraph(value: string) {
  const s = String(value ?? '');
  if (!I18nManager.isRTL) return s;
  // Stronger than rtlText(): wraps EACH line in RTL embedding to avoid bidi edge-cases
  // where React Native decides a line's base direction as LTR (common in titles).
  return s
    .split('\n')
    .map((line) => `${RTL_EMBED}${line}${RTL_POP}`)
    .join('\n');
}

