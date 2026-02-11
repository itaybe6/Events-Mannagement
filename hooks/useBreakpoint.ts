import { useWindowDimensions } from 'react-native';

export type Breakpoint = 'mobile' | 'tablet' | 'desktop' | 'wide';

export function useBreakpoint() {
  const { width, height } = useWindowDimensions();

  const breakpoint: Breakpoint =
    width >= 1440 ? 'wide' : width >= 1024 ? 'desktop' : width >= 768 ? 'tablet' : 'mobile';

  const isDesktop = breakpoint === 'desktop' || breakpoint === 'wide';
  const isWide = breakpoint === 'wide';

  // Keep a consistent readable line-length on desktop.
  const contentMaxWidth = isWide ? 1320 : isDesktop ? 1200 : undefined;

  return {
    width,
    height,
    breakpoint,
    isDesktop,
    isWide,
    contentMaxWidth,
  };
}

