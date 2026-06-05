// @vitest-environment jsdom
// tests/unit/renderer/useBackgroundCategorization.test.ts
import { renderHook, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@renderer/ipc/client', () => ({
  ipc: { invoke: vi.fn() },
}));

import { ipc } from '@renderer/ipc/client';
import { useBackgroundCategorization } from '@renderer/hooks/useBackgroundCategorization';
import type { CategorizeItem } from '@shared/types/import';

const mockInvoke = vi.mocked(ipc.invoke);

function items(n: number): CategorizeItem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${String(i)}`,
    label: `Label ${String(i)}`,
  }));
}

function batchCalls(): unknown[] {
  return mockInvoke.mock.calls.filter(([channel]) => channel === 'categorize:batch');
}

beforeEach(() => {
  mockInvoke.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('useBackgroundCategorization', () => {
  it('loops batches, calls onApplied after an applied batch, and ends idle', async () => {
    mockInvoke.mockImplementation((channel) => {
      if (channel === 'categorize:pending') {
        return Promise.resolve({ items: items(3) });
      }
      return Promise.resolve({ ok: true as const, applied: 3 });
    });
    const onApplied = vi.fn();
    const { result } = renderHook(() => useBackgroundCategorization({ onApplied }));

    await act(async () => {
      await result.current.run();
    });

    expect(mockInvoke).toHaveBeenCalledWith('categorize:pending', {});
    expect(batchCalls()).toHaveLength(1); // 3 items, one batch
    expect(onApplied).toHaveBeenCalledTimes(1);
    expect(result.current.running).toBe(false);
    expect(result.current.remaining).toBe(0);
  });

  it('does nothing when pending is empty', async () => {
    mockInvoke.mockResolvedValueOnce({ items: [] });
    const onApplied = vi.fn();
    const { result } = renderHook(() => useBackgroundCategorization({ onApplied }));

    await act(async () => {
      await result.current.run();
    });

    expect(batchCalls()).toHaveLength(0);
    expect(onApplied).not.toHaveBeenCalled();
    expect(result.current.running).toBe(false);
  });

  it('stops the whole loop on model_unavailable', async () => {
    mockInvoke.mockImplementation((channel) => {
      if (channel === 'categorize:pending') {
        return Promise.resolve({ items: items(20) }); // would be 2 batches
      }
      return Promise.resolve({ ok: false as const, error: 'model_unavailable' as const });
    });
    const onApplied = vi.fn();
    const { result } = renderHook(() => useBackgroundCategorization({ onApplied }));

    await act(async () => {
      await result.current.run();
    });

    expect(batchCalls()).toHaveLength(1); // stopped after the first batch
    expect(onApplied).not.toHaveBeenCalled();
    expect(result.current.running).toBe(false);
  });

  it('continues past inference_failed without calling onApplied', async () => {
    let batch = 0;
    mockInvoke.mockImplementation((channel) => {
      if (channel === 'categorize:pending') {
        return Promise.resolve({ items: items(24) }); // 2 batches
      }
      batch += 1;
      if (batch === 1) {
        return Promise.resolve({ ok: false as const, error: 'inference_failed' as const });
      }
      return Promise.resolve({ ok: true as const, applied: 12 });
    });
    const onApplied = vi.fn();
    const { result } = renderHook(() => useBackgroundCategorization({ onApplied }));

    await act(async () => {
      await result.current.run();
    });

    expect(batchCalls()).toHaveLength(2);
    expect(onApplied).toHaveBeenCalledTimes(1); // only the second (applied) batch
  });

  it('is idempotent: a concurrent second run() is a no-op', async () => {
    mockInvoke.mockImplementation((channel) => {
      if (channel === 'categorize:pending') {
        return Promise.resolve({ items: items(3) });
      }
      return Promise.resolve({ ok: true as const, applied: 3 });
    });
    const onApplied = vi.fn();
    const { result } = renderHook(() => useBackgroundCategorization({ onApplied }));

    await act(async () => {
      // Kick off two passes before the first awaits resolve.
      await Promise.all([result.current.run(), result.current.run()]);
    });

    const pendingCalls = mockInvoke.mock.calls.filter(([c]) => c === 'categorize:pending');
    expect(pendingCalls).toHaveLength(1);
  });

  it('splits >12 items into two batches', async () => {
    mockInvoke.mockImplementation((channel) => {
      if (channel === 'categorize:pending') {
        return Promise.resolve({ items: items(13) });
      }
      return Promise.resolve({ ok: true as const, applied: 1 });
    });
    const onApplied = vi.fn();
    const { result } = renderHook(() => useBackgroundCategorization({ onApplied }));

    await act(async () => {
      await result.current.run();
    });

    expect(batchCalls()).toHaveLength(2);
  });
});
