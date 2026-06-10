// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useSidebarCollapse } from '@renderer/hooks/useSidebarCollapse';

/** Stub matchMedia so `useBreakpoint('xl')` resolves against a fixed viewport width. */
function setViewport(minPx: number): void {
  window.matchMedia = (query: string): MediaQueryList => {
    const match = /min-width:\s*(\d+)px/.exec(query);
    const target = match ? Number(match[1]) : 0;
    return {
      matches: minPx >= target,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    } as MediaQueryList;
  };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

beforeEach(() => {
  localStorage.clear();
  setViewport(1920);
});

describe('useSidebarCollapse', () => {
  it('defaults to expanded at xl+ and toggles + persists the preference', () => {
    const { result } = renderHook(() => useSidebarCollapse());
    expect(result.current.collapsed).toBe(false);

    act(() => {
      result.current.toggle();
    });
    expect(result.current.collapsed).toBe(true);
    expect(localStorage.getItem('sidebar:collapsed')).toBe('1');

    act(() => {
      result.current.toggle();
    });
    expect(result.current.collapsed).toBe(false);
    expect(localStorage.getItem('sidebar:collapsed')).toBe('0');
  });

  it('reads the persisted preference on mount', () => {
    localStorage.setItem('sidebar:collapsed', '1');
    const { result } = renderHook(() => useSidebarCollapse());
    expect(result.current.collapsed).toBe(true);
  });

  it('forces collapsed below xl regardless of the stored preference', () => {
    setViewport(1024);
    const { result } = renderHook(() => useSidebarCollapse());
    expect(result.current.collapsed).toBe(true);
  });
});
