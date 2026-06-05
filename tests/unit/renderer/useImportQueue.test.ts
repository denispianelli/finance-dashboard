// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@renderer/ipc/client', () => ({ ipc: { invoke: vi.fn() } }));

import { ipc } from '@renderer/ipc/client';
import { useImport } from '@renderer/hooks/useImport';
import type { StatementExtraction } from '@shared/types/import';

const mockInvoke = vi.mocked(ipc.invoke);

function extraction(): StatementExtraction {
  return {
    transactions: [
      {
        tx_hash: 'h1',
        isDuplicate: false,
        date: '2026-01-15',
        label: 'Alpha',
        amount: -10,
        fitid: null,
        // Non-residual (deterministic tier) so the queue tests trigger no
        // import:categorize call and their positional mock chains stay aligned.
        categoryId: 'cat-default',
        tier: 'rule',
      },
    ],
    arithmetic: {
      status: 'passed',
      openingBalance: 0,
      closingBalance: 10,
      computedClosing: 10,
      delta: null,
    },
    periodOverlap: { hasOverlap: false, overlappingImports: [] },
    newCount: 1,
    duplicateCount: 0,
    fileHash: 'fh',
    alreadyImported: false,
    dateRangeStart: '2026-01-01',
    dateRangeEnd: '2026-01-31',
    closingBalance: 10,
    closingBalanceDate: '2026-01-31',
    sourceType: 'ofx',
  };
}

beforeEach(() => {
  mockInvoke.mockReset();
});

describe('useImport — queue', () => {
  it('auto-routes one file, asks for the second, and reports a summary', async () => {
    // Mandatory review (ADR-005) means EVERY file — even an auto-routed one —
    // pauses at review until confirm() is called. The sequence below mirrors
    // that: resolve → extract → (user confirm) per file.
    mockInvoke
      .mockResolvedValueOnce({
        ok: true,
        identifier: 'ofx:1:1',
        matchedAccountId: 'acc-a',
        sourceType: 'ofx',
        detectedBank: 'LCL',
      }) // file 1 resolve → matched
      .mockResolvedValueOnce({ ok: true, extraction: extraction() }) // file 1 extract
      .mockResolvedValueOnce({ ok: true, importId: 'i1', insertedCount: 1, skippedCount: 0 }) // file 1 confirm
      .mockResolvedValueOnce({
        ok: true,
        identifier: 'ofx:1:2',
        matchedAccountId: null,
        sourceType: 'ofx',
        detectedBank: 'LCL',
      }) // file 2 resolve → no match
      .mockResolvedValueOnce({ ok: true, extraction: extraction() }) // file 2 extract
      .mockResolvedValueOnce({ ok: true, importId: 'i2', insertedCount: 1, skippedCount: 0 }); // file 2 confirm

    const { result } = renderHook(() => useImport());

    // file 1 auto-routed, paused at review
    await act(async () => {
      await result.current.startFromPaths(['/x/a.ofx', '/x/b.ofx']);
    });
    expect(result.current.state).toMatchObject({
      step: 'queue',
      index: 0,
      sub: { step: 'review', autoRouted: true },
    });

    // confirm file 1 → advances → file 2 resolve has no match → choose account
    await act(async () => {
      await result.current.confirm();
    });
    expect(result.current.state).toMatchObject({
      step: 'queue',
      index: 1,
      sub: { step: 'chooseAccount', identifier: 'ofx:1:2' },
    });

    // choose account for file 2 → extract → review, then confirm → summary
    await act(async () => {
      await result.current.chooseAccount('acc-b');
    });
    await act(async () => {
      await result.current.confirm();
    });

    expect(result.current.state.step).toBe('summary');
    const summary = result.current.state as { step: 'summary'; results: unknown[] };
    expect(summary.results).toEqual([
      {
        fileName: 'a.ofx',
        status: 'imported',
        accountId: 'acc-a',
        insertedCount: 1,
        autoRouted: true,
      },
      {
        fileName: 'b.ofx',
        status: 'imported',
        accountId: 'acc-b',
        insertedCount: 1,
        autoRouted: false,
      },
    ]);
  });

  it('confirm sends ack=true for OFX and only the selected hashes', async () => {
    mockInvoke
      .mockResolvedValueOnce({
        ok: true,
        identifier: 'ofx:1:1',
        matchedAccountId: 'acc-a',
        sourceType: 'ofx',
        detectedBank: 'LCL',
      }) // resolve → matched
      .mockResolvedValueOnce({ ok: true, extraction: extraction() }) // extract
      .mockResolvedValueOnce({ ok: true, importId: 'i1', insertedCount: 1, skippedCount: 0 }); // confirm

    const { result } = renderHook(() => useImport());

    await act(async () => {
      await result.current.startFromPaths(['/x/a.ofx']);
    });
    await act(async () => {
      await result.current.confirm();
    });

    const confirmCall = mockInvoke.mock.calls.find((c) => c[0] === 'import:confirm');
    expect(confirmCall?.[1]).toMatchObject({
      acknowledgedCannotVerify: true,
      selectedHashes: ['h1'],
    });
  });

  it('toggleAll clears then reselects', async () => {
    mockInvoke
      .mockResolvedValueOnce({
        ok: true,
        identifier: 'ofx:1:1',
        matchedAccountId: 'acc-a',
        sourceType: 'ofx',
        detectedBank: 'LCL',
      }) // resolve → matched
      .mockResolvedValueOnce({ ok: true, extraction: extraction() }); // extract → review

    const { result } = renderHook(() => useImport());

    await act(async () => {
      await result.current.startFromPaths(['/x/a.ofx']);
    });

    const reviewSelected = (): Set<string> => {
      const s = result.current.state;
      if (s.step !== 'queue' || s.sub.step !== 'review') {
        throw new Error('expected review sub-state');
      }
      return s.sub.selected;
    };

    expect(reviewSelected().size).toBe(1);

    act(() => {
      result.current.toggleAll();
    });
    expect(reviewSelected().size).toBe(0);

    act(() => {
      result.current.toggleAll();
    });
    expect(reviewSelected().size).toBe(1);
  });

  it('isolates an IPC rejection to the failing file and still finishes the batch', async () => {
    // File 1's resolve rejects (main threw unexpectedly). That must mark only
    // file 1 as failed and never wedge the batch — file 2 imports normally.
    mockInvoke
      .mockRejectedValueOnce(new Error('boom')) // file 1 resolve → throws
      .mockResolvedValueOnce({
        ok: true,
        identifier: 'ofx:1:2',
        matchedAccountId: 'acc-b',
        sourceType: 'ofx',
        detectedBank: 'LCL',
      }) // file 2 resolve → matched
      .mockResolvedValueOnce({ ok: true, extraction: extraction() }) // file 2 extract
      .mockResolvedValueOnce({ ok: true, importId: 'i2', insertedCount: 1, skippedCount: 0 }); // file 2 confirm

    const { result } = renderHook(() => useImport());

    // file 1 fails at resolve → batch advances → file 2 paused at review
    await act(async () => {
      await result.current.startFromPaths(['/x/a.ofx', '/x/b.ofx']);
    });
    expect(result.current.state).toMatchObject({
      step: 'queue',
      index: 1,
      sub: { step: 'review' },
    });

    await act(async () => {
      await result.current.confirm();
    });

    expect(result.current.state.step).toBe('summary');
    const summary = result.current.state as { step: 'summary'; results: unknown[] };
    expect(summary.results).toEqual([
      { fileName: 'a.ofx', status: 'failed', error: 'Erreur inattendue' },
      {
        fileName: 'b.ofx',
        status: 'imported',
        accountId: 'acc-b',
        insertedCount: 1,
        autoRouted: true,
      },
    ]);
  });

  it('marks an invalid extension as failed without calling resolve', async () => {
    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.startFromPaths(['/x/notes.txt']);
    });
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(result.current.state).toMatchObject({
      step: 'summary',
      results: [{ fileName: 'notes.txt', status: 'failed' }],
    });
  });

  it('progressively categorizes a file’s residual rows and sends them on confirm', async () => {
    // A residual row (tier null) drives the per-file LLM categorize loop inside
    // the queue’s review; the suggestion lands in the review sub-state, then
    // flows to import:confirm.
    const residual = {
      ...extraction(),
      transactions: [
        {
          tx_hash: 'r1',
          isDuplicate: false,
          date: '2026-01-15',
          label: 'MYSTERY MERCHANT',
          amount: -10,
          fitid: null,
          categoryId: null,
          tier: null,
        },
      ],
    };
    mockInvoke
      .mockResolvedValueOnce({
        ok: true,
        identifier: 'ofx:1:1',
        matchedAccountId: 'acc-a',
        sourceType: 'ofx',
        detectedBank: 'LCL',
      }) // resolve → matched
      .mockResolvedValueOnce({ ok: true, extraction: residual }) // extract
      .mockResolvedValueOnce({ ok: true, results: [{ tx_hash: 'r1', categoryId: 'cat-food' }] }) // categorize batch
      .mockResolvedValueOnce({ ok: true, importId: 'i1', insertedCount: 1, skippedCount: 0 }); // confirm

    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.startFromPaths(['/x/a.ofx']);
      // Let the fire-and-forget categorize batch resolve and apply.
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });

    const s = result.current.state;
    expect(s.step === 'queue' && s.sub.step === 'review').toBe(true);
    if (s.step === 'queue' && s.sub.step === 'review') {
      expect(s.sub.categories.get('r1')?.categoryId).toBe('cat-food');
      expect(s.sub.suggested.has('r1')).toBe(true);
    }

    await act(async () => {
      await result.current.confirm();
    });
    const confirmCall = mockInvoke.mock.calls.find((c) => c[0] === 'import:confirm');
    expect(confirmCall?.[1]).toMatchObject({
      categories: [{ tx_hash: 'r1', categoryId: 'cat-food', userModified: false }],
    });
  });
});
