// @vitest-environment jsdom
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import { it, expect, vi, afterEach } from 'vitest';
import type { ModelStatusResponse } from '@shared/types/ipc';

let progressCb: ((s: ModelStatusResponse) => void) | null = null;
vi.mock('@renderer/ipc/client', () => ({
  ipc: {
    invoke: vi.fn(() => Promise.resolve({ state: 'absent' } as ModelStatusResponse)),
    onModelProgress: (cb: (s: ModelStatusResponse) => void) => {
      progressCb = cb;
      return () => (progressCb = null);
    },
  },
}));

import { useModelStatus } from '@renderer/hooks/useModelStatus';

afterEach(() => {
  cleanup();
  progressCb = null;
});

it('loads the initial status then applies pushed progress', async () => {
  const { result } = renderHook(() => useModelStatus());
  await waitFor(() => {
    expect(result.current.state).toBe('absent');
  });
  act(() => progressCb?.({ state: 'downloading', receivedBytes: 5, totalBytes: 10 }));
  expect(result.current).toMatchObject({ state: 'downloading', receivedBytes: 5, totalBytes: 10 });
});
