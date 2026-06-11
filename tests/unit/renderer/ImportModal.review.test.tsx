// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ArithmeticCheckResult, StatementExtraction } from '@shared/types/import';

vi.mock('@renderer/ipc/client', () => ({
  ipc: {
    invoke: vi.fn().mockResolvedValue({
      accounts: [
        {
          id: 'acc-a',
          name: 'LCL Courant',
          type: 'checking',
          bankId: 'lcl',
          currency: 'EUR',
          balance: 0,
          txCount: 0,
        },
      ],
    }),
  },
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

vi.mock('@renderer/hooks/useImport', () => ({ useImport: vi.fn() }));

import { useImport } from '@renderer/hooks/useImport';
import { ImportModal } from '@renderer/components/ImportModal';

const mockedUseImport = vi.mocked(useImport);

function makeExtraction(
  arithmetic: ArithmeticCheckResult,
  overrides: Partial<StatementExtraction> = {},
): StatementExtraction {
  return {
    transactions: [
      {
        tx_hash: 'h1',
        isDuplicate: false,
        date: '2026-01-15',
        label: 'Alpha',
        amount: -10,
        fitid: null,
      },
    ],
    arithmetic,
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
    ...overrides,
  };
}

interface ReviewArgs {
  extraction: StatementExtraction;
  selected: Set<string>;
  acknowledgedCannotVerify: boolean;
  acknowledgedArithmeticFailed?: boolean;
  autoRouted: boolean;
}

function hookInReview(args: ReviewArgs): ReturnType<typeof useImport> {
  return {
    state: {
      step: 'queue',
      files: [{ path: '/x/a.ofx', fileName: 'a.ofx' }],
      index: 0,
      results: [],
      sub: {
        step: 'review',
        extraction: args.extraction,
        accountId: 'acc-a',
        selected: args.selected,
        acknowledgedCannotVerify: args.acknowledgedCannotVerify,
        acknowledgedArithmeticFailed: args.acknowledgedArithmeticFailed ?? false,
        autoRouted: args.autoRouted,
      },
    },
    pickFiles: vi.fn(),
    startFromPaths: vi.fn(),
    chooseAccount: vi.fn(),
    learnBank: vi.fn(),
    toggleTx: vi.fn(),
    toggleAll: vi.fn(),
    setAcknowledgedCannotVerify: vi.fn(),
    setAcknowledgedArithmeticFailed: vi.fn(),
    confirm: vi.fn(),
    skipFile: vi.fn(),
    reset: vi.fn(),
  };
}

const PASSED: ArithmeticCheckResult = {
  status: 'passed',
  openingBalance: 0,
  closingBalance: 10,
  computedClosing: 10,
  delta: null,
};

function confirmButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: /Importer .* transaction/ });
}

afterEach(() => {
  cleanup();
});

describe('ImportModal — review gating + arithmetic badge', () => {
  it('passed arithmetic with 1 selected shows verified badge and enables confirm', () => {
    mockedUseImport.mockReturnValue(
      hookInReview({
        extraction: makeExtraction(PASSED),
        selected: new Set(['h1']),
        acknowledgedCannotVerify: false,
        autoRouted: false,
      }),
    );
    render(<ImportModal open onClose={vi.fn()} />);
    expect(screen.getByText(/Solde vérifié/)).toBeTruthy();
    expect(confirmButton().disabled).toBe(false);
  });

  it('failed arithmetic shows the delta badge + override checkbox and disables confirm', () => {
    const failed: ArithmeticCheckResult = {
      status: 'failed',
      openingBalance: 0,
      closingBalance: 10,
      computedClosing: 5,
      delta: -5,
    };
    mockedUseImport.mockReturnValue(
      hookInReview({
        extraction: makeExtraction(failed),
        selected: new Set(['h1']),
        acknowledgedCannotVerify: false,
        autoRouted: false,
      }),
    );
    render(<ImportModal open onClose={vi.fn()} />);
    expect(screen.getByText(/Écart de/)).toBeTruthy();
    expect(screen.getByText(/Importer quand même/)).toBeTruthy();
    expect(confirmButton().disabled).toBe(true);
  });

  it('failed arithmetic with the override acknowledged enables confirm', () => {
    const failed: ArithmeticCheckResult = {
      status: 'failed',
      openingBalance: 0,
      closingBalance: 10,
      computedClosing: 5,
      delta: -5,
    };
    mockedUseImport.mockReturnValue(
      hookInReview({
        extraction: makeExtraction(failed),
        selected: new Set(['h1']),
        acknowledgedCannotVerify: false,
        acknowledgedArithmeticFailed: true,
        autoRouted: false,
      }),
    );
    render(<ImportModal open onClose={vi.fn()} />);
    expect(confirmButton().disabled).toBe(false);
  });

  it('disables confirm when nothing is selected even with passed arithmetic', () => {
    mockedUseImport.mockReturnValue(
      hookInReview({
        extraction: makeExtraction(PASSED),
        selected: new Set<string>(),
        acknowledgedCannotVerify: false,
        autoRouted: false,
      }),
    );
    render(<ImportModal open onClose={vi.fn()} />);
    expect(confirmButton().disabled).toBe(true);
  });

  it('PDF cannot_verify unacknowledged renders badge + checkbox and disables confirm', () => {
    const cannotVerify: ArithmeticCheckResult = {
      status: 'cannot_verify',
      openingBalance: null,
      closingBalance: null,
      computedClosing: null,
      delta: null,
    };
    mockedUseImport.mockReturnValue(
      hookInReview({
        extraction: makeExtraction(cannotVerify, { sourceType: 'pdf' }),
        selected: new Set(['h1']),
        acknowledgedCannotVerify: false,
        autoRouted: false,
      }),
    );
    render(<ImportModal open onClose={vi.fn()} />);
    expect(screen.getByText(/Solde non vérifiable/)).toBeTruthy();
    expect(screen.getByLabelText("Je confirme l'import sans vérification du solde")).toBeTruthy();
    expect(confirmButton().disabled).toBe(true);
  });

  it('PDF cannot_verify acknowledged with 1 selected enables confirm', () => {
    const cannotVerify: ArithmeticCheckResult = {
      status: 'cannot_verify',
      openingBalance: null,
      closingBalance: null,
      computedClosing: null,
      delta: null,
    };
    mockedUseImport.mockReturnValue(
      hookInReview({
        extraction: makeExtraction(cannotVerify, { sourceType: 'pdf' }),
        selected: new Set(['h1']),
        acknowledgedCannotVerify: true,
        autoRouted: false,
      }),
    );
    render(<ImportModal open onClose={vi.fn()} />);
    expect(confirmButton().disabled).toBe(false);
  });

  it('shows the (auto) marker in the header when autoRouted', () => {
    mockedUseImport.mockReturnValue(
      hookInReview({
        extraction: makeExtraction(PASSED),
        selected: new Set(['h1']),
        acknowledgedCannotVerify: false,
        autoRouted: true,
      }),
    );
    render(<ImportModal open onClose={vi.fn()} />);
    expect(screen.getByText(/\(auto\)/)).toBeTruthy();
  });

  it('renders the period-overlap banner when the statement overlaps an existing import', () => {
    mockedUseImport.mockReturnValue(
      hookInReview({
        extraction: makeExtraction(PASSED, {
          periodOverlap: {
            hasOverlap: true,
            overlappingImports: [
              {
                id: 'imp-1',
                date_range_start: '2026-01-05',
                date_range_end: '2026-01-20',
                status: 'validated',
              },
            ],
          },
        }),
        selected: new Set(['h1']),
        acknowledgedCannotVerify: false,
        autoRouted: false,
      }),
    );
    render(<ImportModal open onClose={vi.fn()} />);
    expect(screen.getByText(/chevauche un import existant/)).toBeTruthy();
    expect(screen.getByText(/2026-01-05/)).toBeTruthy();
  });

  it('renders an informative banner when the file was already imported', () => {
    mockedUseImport.mockReturnValue(
      hookInReview({
        extraction: makeExtraction(PASSED, { alreadyImported: true }),
        selected: new Set(['h1']),
        acknowledgedCannotVerify: false,
        autoRouted: false,
      }),
    );
    render(<ImportModal open onClose={vi.fn()} />);
    expect(screen.getByText(/fichier a déjà été importé/)).toBeTruthy();
    // Still importable: the selection drives the confirm, not the file-level flag.
    expect(confirmButton().disabled).toBe(false);
  });

  it('shows no already-imported banner for a fresh file', () => {
    mockedUseImport.mockReturnValue(
      hookInReview({
        extraction: makeExtraction(PASSED),
        selected: new Set(['h1']),
        acknowledgedCannotVerify: false,
        autoRouted: false,
      }),
    );
    render(<ImportModal open onClose={vi.fn()} />);
    expect(screen.queryByText(/fichier a déjà été importé/)).toBeNull();
  });
});
