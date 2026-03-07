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

