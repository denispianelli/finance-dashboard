// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useBreakpoint } from '@renderer/hooks/useBreakpoint';

interface MockMediaQueryList {
  matches: boolean;
  media: string;
  addEventListener: (event: 'change', listener: (e: MediaQueryListEvent) => void) => void;
  removeEventListener: (event: 'change', listener: (e: MediaQueryListEvent) => void) => void;
  dispatch: (matches: boolean) => void;
}

function installMatchMedia(initialMatches: boolean): MockMediaQueryList {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const mql: MockMediaQueryList = {
    matches: initialMatches,
    media: '',
    addEventListener: (_event, listener) => {
      listeners.add(listener);
    },
    removeEventListener: (_event, listener) => {
      listeners.delete(listener);
    },
    dispatch: (matches: boolean) => {
      mql.matches = matches;
      for (const listener of listeners) {
        listener({ matches } as MediaQueryListEvent);
      }
    },
  };
  window.matchMedia = (query: string): MediaQueryList => {
    mql.media = query;
    return mql as unknown as MediaQueryList;
  };
  return mql;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useBreakpoint', () => {
  it('returns the initial match for the queried min-width', () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useBreakpoint('xl'));
    expect(result.current).toBe(true);
  });

  it('returns false when the media query does not match', () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useBreakpoint('xl'));
    expect(result.current).toBe(false);
  });

  it('updates when the media query changes', () => {
    const mql = installMatchMedia(false);
    const { result } = renderHook(() => useBreakpoint('xl'));
    expect(result.current).toBe(false);
    act(() => {
      mql.dispatch(true);
    });
    expect(result.current).toBe(true);
  });

  it('unsubscribes on unmount', () => {
    const mql = installMatchMedia(true);
    const removeSpy = vi.spyOn(mql, 'removeEventListener');
    const { unmount } = renderHook(() => useBreakpoint('xl'));
    unmount();
    expect(removeSpy).toHaveBeenCalledTimes(1);
  });

  it('queries the documented pixel width for each token', () => {
    const mql = installMatchMedia(true);
    renderHook(() => useBreakpoint('lg'));
    expect(mql.media).toBe('(min-width: 1024px)');
    renderHook(() => useBreakpoint('xl'));
    expect(mql.media).toBe('(min-width: 1280px)');
    renderHook(() => useBreakpoint('2xl'));
    expect(mql.media).toBe('(min-width: 1536px)');
  });
});
