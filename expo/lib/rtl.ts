import { I18nManager } from 'react-native';

/**
 * Layout is locked to LTR at the app root (`direction: 'ltr'` in `_layout.tsx`).
 * That makes Android and iPhone share the same Yoga direction.
 *
 * Hebrew UI is done manually (row-reverse, textAlign right) — the same approach
 * that already looks correct on iPhone when `I18nManager.isRTL` is false.
 *
 * Do NOT derive ROW_DIR / ALIGN_* from `I18nManager.isRTL`: on Android the native
 * forceRTL plugin often reports isRTL=true while iPhone does not, which mirrored
 * the whole admin UI (tab bar, event cards, etc.).
 */
export const IS_RTL = Boolean(I18nManager.isRTL);

/** Manual Hebrew row: first child ends on the visual right. */
export const ROW_DIR = 'row-reverse' as const;
/** Opposite of ROW_DIR. */
export const ROW_REVERSE_DIR = 'row' as const;

/** Visual right / left under LTR Yoga. */
export const ALIGN_RIGHT = 'flex-end' as const;
export const ALIGN_LEFT = 'flex-start' as const;

/** Physical text sides (RN does not mirror textAlign left/right). */
export const TEXT_RIGHT = 'right' as const;
export const TEXT_LEFT = 'left' as const;

export const RTL_MARK = '\u200F' as const;

export function rtlText(value: string) {
  const s = String(value ?? '');
  return `${RTL_MARK}${s}`;
}
