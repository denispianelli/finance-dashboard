// @vitest-environment jsdom
import { renderHook, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@renderer/ipc/client', () => ({ ipc: { invoke: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ipc } from '@renderer/ipc/client';
import { toast } from 'sonner';
import { useDashboard } from '@renderer/hooks/useDashboard';

const mockInvoke = vi.mocked(ipc.invoke);

beforeEach(() => {
  mockInvoke.mockReset();
  // Generic resolutions for the mount-time fetches (accounts, categories, …).
  mockInvoke.mockResolvedValue({
    accounts: [],
    categories: [],
    transactions: [],
    balance: 0,
    series: [],
  });
  vi.mocked(toast.success).mockReset();
});

afterEach(() => {
  cleanup();
});

describe('useDashboard reassign → rule proposal', () => {
  it('offers a "Créer une règle" toast action when the label is provided', async () => {
    const onProposeRule = vi.fn();
    const { result } = renderHook(() => useDashboard(0, { onProposeRule }));

    await act(async () => {
      await result.current.reassign('t1', 'cat-alimentation', 'CB CARREFOUR MARKET');
    });

    const call = vi
      .mocked(toast.success)
      .mock.calls.find(([msg]) => msg === 'Transaction reclassée');
    expect(call).toBeDefined();
    const opts = call?.[1] as { action?: { label: string; onClick: () => void } } | undefined;
    expect(opts?.action?.label).toBe('Créer une règle');

    opts?.action?.onClick();
    expect(onProposeRule).toHaveBeenCalledWith({
      labelClean: 'CB CARREFOUR MARKET',
      categoryId: 'cat-alimentation',
    });
  });

  it('keeps the plain toast when no label is provided', async () => {
    const { result } = renderHook(() => useDashboard(0, { onProposeRule: vi.fn() }));

    await act(async () => {
      await result.current.reassign('t1', 'cat-alimentation');
    });

    const call = vi
      .mocked(toast.success)
      .mock.calls.find(([msg]) => msg === 'Transaction reclassée');
    expect(call?.[1]).toBeUndefined();
  });
});
