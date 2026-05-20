import { useSyncExternalStore } from 'react';

export type Breakpoint = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

const BREAKPOINT_PX: Record<Breakpoint, number> = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
};

function query(breakpoint: Breakpoint): string {
  return `(min-width: ${String(BREAKPOINT_PX[breakpoint])}px)`;
}

function subscribe(mediaQuery: string, onChange: () => void): () => void {
  const mql = window.matchMedia(mediaQuery);
  mql.addEventListener('change', onChange);
  return () => {
    mql.removeEventListener('change', onChange);
  };
}

function getSnapshot(mediaQuery: string): boolean {
  return window.matchMedia(mediaQuery).matches;
}

export function useBreakpoint(breakpoint: Breakpoint): boolean {
  const mediaQuery = query(breakpoint);
  return useSyncExternalStore(
    (onChange) => subscribe(mediaQuery, onChange),
    () => getSnapshot(mediaQuery),
    () => false,
  );
}
