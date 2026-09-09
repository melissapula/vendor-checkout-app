import { useWindowDimensions } from 'react-native';

// Standard web breakpoints. Everything below `tablet` is "mobile" — no
// breakpoint-specific behavior beyond that split is needed yet, since the
// survey behind this file found every screen is either a full-width form or
// a full-width row list, both of which just need a centered max-width
// column once there's room to spare (tablet/laptop), and look fine full-
// bleed on anything narrower.
export const BREAKPOINTS = { tablet: 600, laptop: 1024 };

export type Breakpoint = 'mobile' | 'tablet' | 'laptop';

export function useBreakpoint() {
  const { width } = useWindowDimensions();
  const breakpoint: Breakpoint =
    width >= BREAKPOINTS.laptop ? 'laptop' : width >= BREAKPOINTS.tablet ? 'tablet' : 'mobile';
  return { width, breakpoint, isMobile: breakpoint === 'mobile', isTabletUp: breakpoint !== 'mobile' };
}

// Centers full-bleed screen content in a fixed-width column once there's
// room to spare — a no-op on mobile, where content should stay full-width.
export function centeredColumn(isTabletUp: boolean, maxWidth: number) {
  return isTabletUp ? { alignSelf: 'center' as const, width: '100%' as const, maxWidth } : undefined;
}

// `narrow` for single-column forms (auth, Settings, Deal/Piece forms),
// `wide` for row-list/summary screens (Inventory, Deals, Reports, Cart).
export const CONTENT_WIDTH = { narrow: 480, wide: 760 };
