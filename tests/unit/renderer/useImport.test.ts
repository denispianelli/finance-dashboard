// @vitest-environment jsdom
// tests/unit/renderer/useImport.test.ts
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@renderer/ipc/client', () => ({
  ipc: { invoke: vi.fn() },
}));

import { ipc } from '@renderer/ipc/client';
import { useImport } from '@renderer/hooks/useImport';
import type { StatementExtraction } from '@shared/types/import';

const mockInvoke = vi.mocked(ipc.invoke);

function makeExtraction(over: Partial<StatementExtraction> = {}): StatementExtraction {
  return {
    transactions: [
      {
        tx_hash: 'h1',
        date: '2026-01-01',
        label: 'Alpha',
        amount: -10,
        fitid: 'F1',
        isDuplicate: false,
        // Non-residual by default (deterministic tier) so existing tests trigger
        // no LLM categorize call. Loop tests override with residual rows.
        categoryId: 'cat-default',
        tier: 'rule',
      },
      {
        tx_hash: 'h2',
        date: '2026-01-02',
        label: 'Beta',
        amount: -5,
        fitid: 'F2',
        isDuplicate: true,
        categoryId: null,
        tier: null,
      },
    ],
    arithmetic: {
      status: 'cannot_verify',
      openingBalance: null,
      closingBalance: null,
      computedClosing: null,
      delta: null,
    },
    periodOverlap: { hasOverlap: false, overlappingImports: [] },
    newCount: 1,
    duplicateCount: 1,
    fileHash: 'abc',
    alreadyImported: false,
    dateRangeStart: '2026-01-01',
    dateRangeEnd: '2026-01-31',
    sourceType: 'ofx',
    ...over,
  };
}

function pickOk(path = '/tmp/test.ofx', type: 'ofx' | 'pdf' = 'ofx') {
  return { cancelled: false as const, path, type, hash: 'abc', size: 100, alreadyImported: false };
}

/** A residual (LLM-eligible) transaction: non-duplicate, tier null. */
function residualTx(hash: string, label: string): StatementExtraction['transactions'][number] {
  return {
    tx_hash: hash,
    date: '2026-01-01',
    label,
    amount: -10,
    fitid: null,
    isDuplicate: false,
    categoryId: null,
    tier: null,
  };
}

/**
 * Drive the fire-and-forget categorization loop forward deterministically.
 * Each batch is a single awaited promise; flushing the microtask queue a few
 * times inside `act` lets every queued `import:categorize` resolution apply.
 * No real timers — purely microtask flushing.
 */
async function flushLoop(times = 10): Promise<void> {
  await act(async () => {
    for (let i = 0; i < times; i++) {
      await Promise.resolve();
    }
  });
}

interface CategorizeOk {
  ok: true;
  results: { tx_hash: string; categoryId: string }[];
}

/** A categorize response that stays pending until `resolve()` is called. */
function makeHeldCategorize(): {
  promise: Promise<CategorizeOk>;
  resolve: (v: CategorizeOk) => void;
} {
  let resolve: (v: CategorizeOk) => void = noop;
  const promise = new Promise<CategorizeOk>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function noop(): void {
  /* placeholder until the real resolver is assigned */
}

// The progressive categorization loop fires a fire-and-forget `import:categorize`
// call. Existing tests use the default `makeExtraction()`, whose rows are now
// non-residual (tier set), so they trigger no categorize call and their positional
// `mockResolvedValueOnce` chains stay in order. Loop tests build residual rows via
// `residualTx` and drive `import:categorize` explicitly. As a safety net, any
// unexpected categorize call resolves to `model_unavailable`, which stops the loop.
beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue({ ok: false, error: 'model_unavailable' });
});

describe('useImport', () => {
  it('starts in idle state', () => {
    const { result } = renderHook(() => useImport());
    expect(result.current.state.step).toBe('idle');
  });

  it('pick cancellation returns to idle', async () => {
    mockInvoke.mockResolvedValueOnce({ cancelled: true });
    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.pickAndExtract('acc-lcl-default');
    });
    expect(result.current.state.step).toBe('idle');
  });

  it('happy path: transitions to review with only non-duplicate hashes pre-selected', async () => {
    mockInvoke
      .mockResolvedValueOnce(pickOk())
      .mockResolvedValueOnce({ ok: true, extraction: makeExtraction() });

    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.pickAndExtract('acc-lcl-default');
    });

    expect(result.current.state.step).toBe('review');
    if (result.current.state.step === 'review') {
      expect(result.current.state.selected).toEqual(new Set(['h1']));
      expect(result.current.state.acknowledgedCannotVerify).toBe(false);
    }
  });

  it('extract error transitions to error with translated message', async () => {
    mockInvoke
      .mockResolvedValueOnce(pickOk('/tmp/x.xyz'))
      .mockResolvedValueOnce({ ok: false, error: 'unsupported_format' });

    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.pickAndExtract('acc-lcl-default');
    });

    expect(result.current.state.step).toBe('error');
    if (result.current.state.step === 'error') {
      expect(result.current.state.message).toBe(
        'Format non reconnu. Utilisez un fichier OFX ou PDF.',
      );
    }
  });

  it('toggleTx deselects a selected hash', async () => {
    mockInvoke
      .mockResolvedValueOnce(pickOk())
      .mockResolvedValueOnce({ ok: true, extraction: makeExtraction() });

    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.pickAndExtract('acc-lcl-default');
    });
    act(() => {
      result.current.toggleTx('h1');
    });

    if (result.current.state.step === 'review') {
      expect(result.current.state.selected.has('h1')).toBe(false);
    }
  });

  it('toggleTx re-selects a deselected hash', async () => {
    mockInvoke
      .mockResolvedValueOnce(pickOk())
      .mockResolvedValueOnce({ ok: true, extraction: makeExtraction() });

    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.pickAndExtract('acc-lcl-default');
    });
    act(() => {
      result.current.toggleTx('h1');
    }); // deselect
    act(() => {
      result.current.toggleTx('h1');
    }); // re-select

    if (result.current.state.step === 'review') {
      expect(result.current.state.selected.has('h1')).toBe(true);
    }
  });

  it('toggleAll deselects all when all non-duplicates are selected', async () => {
    mockInvoke
      .mockResolvedValueOnce(pickOk())
      .mockResolvedValueOnce({ ok: true, extraction: makeExtraction() });

    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.pickAndExtract('acc-lcl-default');
    });
    act(() => {
      result.current.toggleAll();
    });

    if (result.current.state.step === 'review') {
      expect(result.current.state.selected.size).toBe(0);
    }
  });

  it('toggleAll selects all non-duplicates when none are selected', async () => {
    mockInvoke
      .mockResolvedValueOnce(pickOk())
      .mockResolvedValueOnce({ ok: true, extraction: makeExtraction() });

    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.pickAndExtract('acc-lcl-default');
    });
    act(() => {
      result.current.toggleAll();
    }); // deselect all
    act(() => {
      result.current.toggleAll();
    }); // select all

    if (result.current.state.step === 'review') {
      expect(result.current.state.selected).toEqual(new Set(['h1']));
    }
  });

  it('setAcknowledgedCannotVerify updates the flag', async () => {
    mockInvoke
      .mockResolvedValueOnce(pickOk())
      .mockResolvedValueOnce({ ok: true, extraction: makeExtraction() });

    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.pickAndExtract('acc-lcl-default');
    });
    act(() => {
      result.current.setAcknowledgedCannotVerify(true);
    });

    if (result.current.state.step === 'review') {
      expect(result.current.state.acknowledgedCannotVerify).toBe(true);
    }
  });

  it('confirm success transitions to done with insertedCount', async () => {
    mockInvoke
      .mockResolvedValueOnce(pickOk())
      .mockResolvedValueOnce({ ok: true, extraction: makeExtraction() })
      .mockResolvedValueOnce({ ok: true, importId: 'imp-1', insertedCount: 1, skippedCount: 1 });

    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.pickAndExtract('acc-lcl-default');
    });
    await act(async () => {
      await result.current.confirm();
    });

    expect(result.current.state.step).toBe('done');
    if (result.current.state.step === 'done') {
      expect(result.current.state.insertedCount).toBe(1);
    }
  });

  it('OFX confirm auto-passes acknowledgedCannotVerify: true', async () => {
    mockInvoke
      .mockResolvedValueOnce(pickOk('/tmp/x.ofx', 'ofx'))
      .mockResolvedValueOnce({ ok: true, extraction: makeExtraction({ sourceType: 'ofx' }) })
      .mockResolvedValueOnce({ ok: true, importId: 'imp-1', insertedCount: 1, skippedCount: 0 });

    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.pickAndExtract('acc-lcl-default');
    });
    await act(async () => {
      await result.current.confirm();
    });

    const confirmCall = mockInvoke.mock.calls[2];
    expect(confirmCall).toBeDefined();
    if (confirmCall) {
      expect(confirmCall[1]).toMatchObject({ acknowledgedCannotVerify: true });
    }
  });

  it('PDF confirm uses the user-set acknowledgedCannotVerify', async () => {
    mockInvoke
      .mockResolvedValueOnce(pickOk('/tmp/x.pdf', 'pdf'))
      .mockResolvedValueOnce({
        ok: true,
        extraction: makeExtraction({
          sourceType: 'pdf',
          arithmetic: {
            status: 'cannot_verify',
            openingBalance: null,
            closingBalance: null,
            computedClosing: null,
            delta: null,
          },
        }),
      })
      .mockResolvedValueOnce({ ok: true, importId: 'imp-1', insertedCount: 1, skippedCount: 0 });

    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.pickAndExtract('acc-lcl-default');
    });
    act(() => {
      result.current.setAcknowledgedCannotVerify(true);
    });
    await act(async () => {
      await result.current.confirm();
    });

    const confirmCall = mockInvoke.mock.calls[2];
    expect(confirmCall).toBeDefined();
    if (confirmCall) {
      expect(confirmCall[1]).toMatchObject({ acknowledgedCannotVerify: true });
    }
  });

  it('confirm passes only selected hashes', async () => {
    mockInvoke
      .mockResolvedValueOnce(pickOk())
      .mockResolvedValueOnce({ ok: true, extraction: makeExtraction() })
      .mockResolvedValueOnce({ ok: true, importId: 'imp-1', insertedCount: 1, skippedCount: 0 });

    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.pickAndExtract('acc-lcl-default');
    });
    await act(async () => {
      await result.current.confirm();
    });

    const confirmCall = mockInvoke.mock.calls[2];
    expect(confirmCall).toBeDefined();
    if (confirmCall) {
      expect(confirmCall[1]).toMatchObject({ selectedHashes: ['h1'] });
    }
  });

  it('confirm error transitions to error state', async () => {
    mockInvoke
      .mockResolvedValueOnce(pickOk())
      .mockResolvedValueOnce({ ok: true, extraction: makeExtraction() })
      .mockResolvedValueOnce({ ok: false, error: 'already_imported' });

    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.pickAndExtract('acc-lcl-default');
    });
    await act(async () => {
      await result.current.confirm();
    });

    expect(result.current.state.step).toBe('error');
    if (result.current.state.step === 'error') {
      expect(result.current.state.message).toBe('Ce fichier a déjà été importé.');
    }
  });

  it('seeds the review categories map from the extraction (non-duplicates only)', async () => {
    mockInvoke
      .mockResolvedValueOnce(pickOk())
      .mockResolvedValueOnce({
        ok: true,
        extraction: makeExtraction({
          transactions: [
            { ...residualTx('h1', 'Alpha'), categoryId: 'cat-seed', tier: 'rule' },
            { ...residualTx('h2', 'Beta'), isDuplicate: true },
          ],
        }),
      })
      // h1 is deterministic (tier !== null) → no residual → no categorize call
      .mockResolvedValue({ ok: false, error: 'model_unavailable' });

    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.pickAndExtract('acc-lcl-default');
    });

    if (result.current.state.step === 'review') {
      expect(result.current.state.categories.get('h1')).toEqual({
        categoryId: 'cat-seed',
        userModified: false,
      });
      // duplicates are not in the picker/confirm path
      expect(result.current.state.categories.has('h2')).toBe(false);
      expect(result.current.state.pending.size).toBe(0);
      expect(result.current.state.suggested.size).toBe(0);
    }
  });

  it('progressive loop fills residual categories and toggles pending → suggested', async () => {
    mockInvoke
      .mockResolvedValueOnce(pickOk())
      .mockResolvedValueOnce({
        ok: true,
        extraction: makeExtraction({
          transactions: [
            residualTx('h1', 'Alpha'),
            { ...residualTx('hDet', 'Deterministic'), categoryId: 'cat-det', tier: 'history' },
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: true, results: [{ tx_hash: 'h1', categoryId: 'cat-llm' }] });

    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.pickAndExtract('acc-lcl-default');
    });
    await flushLoop();

    expect(mockInvoke).toHaveBeenCalledWith('import:categorize', {
      items: [{ tx_hash: 'h1', label: 'Alpha' }],
    });
    if (result.current.state.step === 'review') {
      expect(result.current.state.categories.get('h1')).toEqual({
        categoryId: 'cat-llm',
        userModified: false,
      });
      expect(result.current.state.suggested.has('h1')).toBe(true);
      expect(result.current.state.pending.size).toBe(0);
      // deterministic row is untouched by the LLM
      expect(result.current.state.categories.get('hDet')).toEqual({
        categoryId: 'cat-det',
        userModified: false,
      });
      expect(result.current.state.suggested.has('hDet')).toBe(false);
    }
  });

  it('chunks residual into multiple batches and merges each', async () => {
    const many = Array.from({ length: 13 }, (_, i) =>
      residualTx(`h${String(i)}`, `Label ${String(i)}`),
    );
    mockInvoke
      .mockResolvedValueOnce(pickOk())
      .mockResolvedValueOnce({ ok: true, extraction: makeExtraction({ transactions: many }) })
      .mockResolvedValueOnce({ ok: true, results: [{ tx_hash: 'h0', categoryId: 'cat-a' }] })
      .mockResolvedValueOnce({ ok: true, results: [{ tx_hash: 'h12', categoryId: 'cat-b' }] });

    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.pickAndExtract('acc-lcl-default');
    });
    await flushLoop();

    const categorizeCalls = mockInvoke.mock.calls.filter((c) => c[0] === 'import:categorize');
    expect(categorizeCalls).toHaveLength(2);
    if (result.current.state.step === 'review') {
      expect(result.current.state.categories.get('h0')?.categoryId).toBe('cat-a');
      expect(result.current.state.categories.get('h12')?.categoryId).toBe('cat-b');
      expect(result.current.state.pending.size).toBe(0);
    }
  });

  it('model_unavailable on the first batch stops the loop, no second call', async () => {
    const many = Array.from({ length: 13 }, (_, i) =>
      residualTx(`h${String(i)}`, `Label ${String(i)}`),
    );
    mockInvoke
      .mockResolvedValueOnce(pickOk())
      .mockResolvedValueOnce({ ok: true, extraction: makeExtraction({ transactions: many }) })
      .mockResolvedValueOnce({ ok: false, error: 'model_unavailable' });

    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.pickAndExtract('acc-lcl-default');
    });
    await flushLoop();

    const categorizeCalls = mockInvoke.mock.calls.filter((c) => c[0] === 'import:categorize');
    expect(categorizeCalls).toHaveLength(1);
    if (result.current.state.step === 'review') {
      expect(result.current.state.pending.size).toBe(0);
      expect(result.current.state.suggested.size).toBe(0);
      expect(result.current.state.categories.get('h0')?.categoryId).toBeNull();
    }
  });

  it('inference_failed on a batch leaves it residual and continues to the next batch', async () => {
    const many = Array.from({ length: 13 }, (_, i) =>
      residualTx(`h${String(i)}`, `Label ${String(i)}`),
    );
    mockInvoke
      .mockResolvedValueOnce(pickOk())
      .mockResolvedValueOnce({ ok: true, extraction: makeExtraction({ transactions: many }) })
      .mockResolvedValueOnce({ ok: false, error: 'inference_failed' })
      .mockResolvedValueOnce({ ok: true, results: [{ tx_hash: 'h12', categoryId: 'cat-b' }] });

    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.pickAndExtract('acc-lcl-default');
    });
    await flushLoop();

    const categorizeCalls = mockInvoke.mock.calls.filter((c) => c[0] === 'import:categorize');
    expect(categorizeCalls).toHaveLength(2);
    if (result.current.state.step === 'review') {
      // first batch stayed residual
      expect(result.current.state.categories.get('h0')?.categoryId).toBeNull();
      expect(result.current.state.suggested.has('h0')).toBe(false);
      // second batch merged
      expect(result.current.state.categories.get('h12')?.categoryId).toBe('cat-b');
      expect(result.current.state.pending.size).toBe(0);
    }
  });

  it('pickCategory sets userModified and clears suggested; LLM does not overwrite it', async () => {
    mockInvoke.mockResolvedValueOnce(pickOk()).mockResolvedValueOnce({
      ok: true,
      extraction: makeExtraction({ transactions: [residualTx('h1', 'Alpha')] }),
    });

    // Hold the categorize result until after the user picks, so the loop is
    // mid-flight when pickCategory runs.
    const held = makeHeldCategorize();
    mockInvoke.mockReturnValueOnce(held.promise);

    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.pickAndExtract('acc-lcl-default');
    });

    act(() => {
      result.current.pickCategory('h1', 'cat-user');
    });
    if (result.current.state.step === 'review') {
      expect(result.current.state.categories.get('h1')).toEqual({
        categoryId: 'cat-user',
        userModified: true,
      });
      expect(result.current.state.suggested.has('h1')).toBe(false);
    }

    // Now the LLM resolves for the same hash — must NOT overwrite the user's pick.
    await act(async () => {
      held.resolve({ ok: true, results: [{ tx_hash: 'h1', categoryId: 'cat-llm' }] });
      await held.promise;
    });
    await flushLoop();

    if (result.current.state.step === 'review') {
      expect(result.current.state.categories.get('h1')).toEqual({
        categoryId: 'cat-user',
        userModified: true,
      });
      expect(result.current.state.suggested.has('h1')).toBe(false);
    }
  });

  it('confirm serializes selected non-duplicate categories into the payload', async () => {
    mockInvoke
      .mockResolvedValueOnce(pickOk())
      .mockResolvedValueOnce({
        ok: true,
        extraction: makeExtraction({
          transactions: [
            { ...residualTx('h1', 'Alpha'), categoryId: 'cat-seed', tier: 'rule' },
            { ...residualTx('h2', 'Beta'), isDuplicate: true },
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: true, importId: 'imp-1', insertedCount: 1, skippedCount: 0 });

    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.pickAndExtract('acc-lcl-default');
    });
    act(() => {
      result.current.pickCategory('h1', 'cat-user');
    });
    await act(async () => {
      await result.current.confirm();
    });

    const confirmCall = mockInvoke.mock.calls.find((c) => c[0] === 'import:confirm');
    expect(confirmCall).toBeDefined();
    if (confirmCall) {
      expect(confirmCall[1]).toMatchObject({
        categories: [{ tx_hash: 'h1', categoryId: 'cat-user', userModified: true }],
      });
    }
  });

  it('a categorize result resolving after confirm is ignored (no throw, no state change)', async () => {
    mockInvoke.mockResolvedValueOnce(pickOk()).mockResolvedValueOnce({
      ok: true,
      extraction: makeExtraction({ transactions: [residualTx('h1', 'Alpha')] }),
    });

    const held = makeHeldCategorize();
    mockInvoke.mockReturnValueOnce(held.promise);
    // confirm response
    mockInvoke.mockResolvedValueOnce({
      ok: true,
      importId: 'imp-1',
      insertedCount: 1,
      skippedCount: 0,
    });

    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.pickAndExtract('acc-lcl-default');
    });
    await act(async () => {
      await result.current.confirm();
    });
    expect(result.current.state.step).toBe('done');

    // The in-flight batch resolves AFTER confirm — must be dropped silently.
    await act(async () => {
      held.resolve({ ok: true, results: [{ tx_hash: 'h1', categoryId: 'cat-llm' }] });
      await held.promise;
    });
    await flushLoop();

    expect(result.current.state.step).toBe('done');
  });

  it('reset returns to idle from any state', async () => {
    mockInvoke
      .mockResolvedValueOnce(pickOk())
      .mockResolvedValueOnce({ ok: true, extraction: makeExtraction() });

    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.pickAndExtract('acc-lcl-default');
    });
    act(() => {
      result.current.reset();
    });

    expect(result.current.state.step).toBe('idle');
  });
});
