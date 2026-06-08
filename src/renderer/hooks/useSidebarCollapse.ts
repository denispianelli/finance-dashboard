import { useState } from 'react';
import { useBreakpoint } from './useBreakpoint';

const STORAGE_KEY = 'sidebar:collapsed';

function readStoredCollapse(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export interface SidebarCollapse {
  collapsed: boolean;
  toggle: () => void;
}

/**
 * Sidebar collapse state: the user's persisted preference, OR forced collapsed when
 * the window is narrower than `xl` (so the rail never crowds a small window). The
 * Topbar trigger flips the preference and is only shown at `xl`+, where the
 * preference actually drives the rendering.
 */
export function useSidebarCollapse(): SidebarCollapse {
  const expanded = useBreakpoint('xl');
  const [userCollapsed, setUserCollapsed] = useState<boolean>(readStoredCollapse);

  const collapsed = !expanded || userCollapsed;

  const toggle = (): void => {
    setUserCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        // persistence is best-effort; ignore storage failures
      }
      return next;
    });
  };

  return { collapsed, toggle };
}
