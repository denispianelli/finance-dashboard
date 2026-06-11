// @vitest-environment jsdom
import { renderHook, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@renderer/ipc/client', () => ({ ipc: { invoke: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ipc } from '@renderer/ipc/client';
import { toast } from 'sonner';
import { useRules } from '@renderer/hooks/useRules';
import type { RuleDTO } from '@shared/types/rules';

const mockInvoke = vi.mocked(ipc.invoke);

const RULE: RuleDTO = {
  id: 'r1',
  matchType: 'contains',
  matchValue: 'ZZZSHOP',
  categoryId: 'cat-alimentation',
  hitCount: 3,
  createdAt: '2026-06-11 10:00:00',
};

beforeEach(() => {
  mockInvoke.mockReset();
  vi.mocked(toast.success).mockReset();
});

afterEach(() => {
  cleanup();
});

describe('useRules', () => {
  it('loads the rules on mount', async () => {
    mockInvoke.mockResolvedValue({ rules: [RULE] });
    const { result } = renderHook(() => useRules());
    await act(async () => {
      // Wait for the effect to run and load the rules.
    });
    expect(result.current.rules).toEqual([RULE]);
  });

  it('updateRule reloads and toasts with the applied count', async () => {
    mockInvoke.mockImplementation((channel) => {
      if (channel === 'rules:list') return Promise.resolve({ rules: [RULE] });
      return Promise.resolve({ ok: true as const, rule: RULE, applied: 2 });
    });
    const { result } = renderHook(() => useRules());
    await act(async () => {
      // Wait for the effect to run and load the rules.
    });

    let ok = false;
    await act(async () => {
      ok = await result.current.updateRule({
        id: 'r1',
        matchType: 'contains',
        matchValue: 'ZZZSHOP',
        categoryId: 'cat-loisirs',
      });
    });

    expect(ok).toBe(true);
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
      'Règle mise à jour — 2 transactions catégorisées',
    );
  });

  it('updateRule returns false on invalid_rule (no toast)', async () => {
    mockInvoke.mockImplementation((channel) => {
      if (channel === 'rules:list') return Promise.resolve({ rules: [RULE] });
      return Promise.resolve({ ok: false as const, error: 'invalid_rule' as const });
    });
    const { result } = renderHook(() => useRules());
    await act(async () => {
      // Wait for the effect to run and load the rules.
    });

    let ok = true;
    await act(async () => {
      ok = await result.current.updateRule({
        id: 'r1',
        matchType: 'regex',
        matchValue: '(bad',
        categoryId: 'cat-loisirs',
      });
    });

    expect(ok).toBe(false);
    expect(vi.mocked(toast.success)).not.toHaveBeenCalled();
  });

  it('deleteRule reloads and toasts', async () => {
    mockInvoke.mockImplementation((channel) => {
      if (channel === 'rules:list') return Promise.resolve({ rules: [] });
      return Promise.resolve({ ok: true as const });
    });
    const { result } = renderHook(() => useRules());
    await act(async () => {
      // Wait for the effect to run and load the rules.
    });

    await act(async () => {
      await result.current.deleteRule('r1');
    });

    expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Règle supprimée');
  });
});
