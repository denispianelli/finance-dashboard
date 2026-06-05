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
        categoryId: null,
        tier: null,
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

beforeEach(() => {
  mockInvoke.mockReset();
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
