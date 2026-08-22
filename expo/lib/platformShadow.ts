import { Platform, type ViewStyle } from 'react-native';

type SoftShadowOptions = {
  color?: string;
  opacity?: number;
  radius?: number;
  y?: number;
  /**
   * Android elevation for translucent/light tiles. Default 0 — elevation on
   * semi-transparent surfaces paints a heavy dark slab that iOS shadows don't.
   */
  androidElevation?: number;
};

/**
 * Soft card/tile shadow that stays subtle on Android.
 * Prefer borders + this helper over raw `elevation` on frosted/white tiles.
 */
export function softTileShadow(options: SoftShadowOptions = {}): ViewStyle {
  const {
    color = '#000000',
    opacity = 0.04,
    radius = 12,
    y = 6,
    androidElevation = 0,
  } = options;

  if (Platform.OS === 'android') {
    return { elevation: androidElevation };
  }

  return {
    shadowColor: color,
    shadowOpacity: opacity,
    shadowRadius: radius,
    shadowOffset: { width: 0, height: y },
  };
}

/** Solid fill on Android so translucent cards don't show muddy elevation halos. */
export function tileSurface(translucent: string, solid = '#FFFFFF'): string {
  return Platform.OS === 'android' ? solid : translucent;
}
