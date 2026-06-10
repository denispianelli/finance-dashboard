// @vitest-environment jsdom
import { renderHook, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@renderer/ipc/client', () => ({
  ipc: { invoke: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { ipc } from '@renderer/ipc/client';
import { toast } from 'sonner';
import { useBackgroundCategorization } from '@renderer/hooks/useBackgroundCategorization';
import type { PendingGroup } from '@shared/types/import';

const mockInvoke = vi.mocked(ipc.invoke);

function groups(n: number): PendingGroup[] {
  return Array.from({ length: n }, (_, i) => ({
    key: `K${String(i)}`,
    label: `Label ${String(i)}`,
    count: 1,
  }));
}

function batchCalls(): unknown[] {
  return mockInvoke.mock.calls.filter(([channel]) => channel === 'categorize:batch');
}

beforeEach(() => {
  mockInvoke.mockReset();
  vi.mocked(toast.error).mockReset();
});

afterEach(() => {
  cleanup();
});

describe('useBackgroundCategorization', () => {
  it('makes one call per distinct label, calls onApplied per applied label, ends idle', async () => {
    mockInvoke.mockImplementation((channel) => {
      if (channel === 'categorize:pending') return Promise.resolve({ groups: groups(3) });
      return Promise.resolve({ ok: true as const, applied: 2, residual: 0 });
    });
    const onApplied = vi.fn();
    const { result } = renderHook(() => useBackgroundCategorization({ onApplied }));

    await act(async () => {
      await result.current.run();
    });

    expect(mockInvoke).toHaveBeenCalledWith('categorize:pending', {});
    expect(batchCalls()).toHaveLength(3); // one call per distinct label
    expect(onApplied).toHaveBeenCalledTimes(3);
    expect(result.current.running).toBe(false);
    expect(result.current.remaining).toBe(0);
  });

  it('does nothing when there are no groups', async () => {
    mockInvoke.mockResolvedValue({ groups: [] });
    const onApplied = vi.fn();
    const { result } = renderHook(() => useBackgroundCategorization({ onApplied }));

    await act(async () => {
      await result.current.run();
    });

    expect(batchCalls()).toHaveLength(0);
    expect(onApplied).not.toHaveBeenCalled();
    expect(result.current.running).toBe(false);
  });

  it('stops the whole pass on model_unavailable', async () => {
    mockInvoke.mockImplementation((channel) => {
      if (channel === 'categorize:pending') return Promise.resolve({ groups: groups(3) });
      return Promise.resolve({ ok: false as const, error: 'model_unavailable' as const });
    });
    const onApplied = vi.fn();
    const { result } = renderHook(() => useBackgroundCategorization({ onApplied }));

    await act(async () => {
      await result.current.run();
    });

    expect(batchCalls()).toHaveLength(1); // stopped after the first label
    expect(onApplied).not.toHaveBeenCalled();
    // The user is told why nothing happened, instead of a silent flash-and-reset.
    expect(vi.mocked(toast.error)).toHaveBeenCalledTimes(1);
  });

  it('continues past inference_failed without calling onApplied for it', async () => {
    let call = 0;
    mockInvoke.mockImplementation((channel) => {
      if (channel === 'categorize:pending') return Promise.resolve({ groups: groups(2) });
      call += 1;
      if (call === 1)
        return Promise.resolve({ ok: false as const, error: 'inference_failed' as const });
      return Promise.resolve({ ok: true as const, applied: 1, residual: 0 });
    });
    const onApplied = vi.fn();
    const { result } = renderHook(() => useBackgroundCategorization({ onApplied }));

    await act(async () => {
      await result.current.run();
    });

    expect(batchCalls()).toHaveLength(2);
    expect(onApplied).toHaveBeenCalledTimes(1);
  });

  it('is idempotent: a concurrent second run() is a no-op', async () => {
    mockInvoke.mockImplementation((channel) => {
      if (channel === 'categorize:pending') return Promise.resolve({ groups: groups(3) });
      return Promise.resolve({ ok: true as const, applied: 1, residual: 0 });
    });
    const onApplied = vi.fn();
    const { result } = renderHook(() => useBackgroundCategorization({ onApplied }));

    await act(async () => {
      await Promise.all([result.current.run(), result.current.run()]);
    });

    expect(batchCalls()).toHaveLength(3); // one pass of 3 labels, not two
  });

  it('refresh() sets pending to the total transaction count (Σ group counts)', async () => {
    mockInvoke.mockResolvedValue({
      groups: [
        { key: 'A', label: 'A', count: 3 },
        { key: 'B', label: 'B', count: 2 },
      ],
    });
    const onApplied = vi.fn();
    const { result } = renderHook(() => useBackgroundCategorization({ onApplied }));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.pending).toBe(5);
    expect(batchCalls()).toHaveLength(0);
  });
});
