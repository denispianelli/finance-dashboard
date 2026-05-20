import { useMemo, useSyncExternalStore } from 'react';

export type Breakpoint = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

const BREAKPOINT_PX: Record<Breakpoint, number> = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
};

interface MediaQueryStore {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => boolean;
}

function createMediaQueryStore(mediaQuery: string): MediaQueryStore {
  return {
    subscribe: (onChange) => {
      const mql = window.matchMedia(mediaQuery);
      mql.addEventListener('change', onChange);
      return () => {
        mql.removeEventListener('change', onChange);
      };
    },
    getSnapshot: () => window.matchMedia(mediaQuery).matches,
  };
}

export function useBreakpoint(breakpoint: Breakpoint): boolean {
  const mediaQuery = `(min-width: ${String(BREAKPOINT_PX[breakpoint])}px)`;
  const store = useMemo(() => createMediaQueryStore(mediaQuery), [mediaQuery]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => false);
}
