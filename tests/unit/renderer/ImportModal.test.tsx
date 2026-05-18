// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';

vi.mock('@renderer/hooks/useImport');
vi.mock('sonner', () => ({ toast: vi.fn() }));

import { useImport } from '@renderer/hooks/useImport';
import { toast } from 'sonner';
import { ImportModal } from '@renderer/components/ImportModal';
import type { UseImport, ImportState } from '@renderer/hooks/useImport';
import type { StatementExtraction } from '@shared/types/import';

afterEach(() => {
  cleanup();
});

const mockUseImport = vi.mocked(useImport);
const mockToast = vi.mocked(toast);

function makeHook(state: ImportState, overrides: Partial<UseImport> = {}): UseImport {
  return {
    state,
    pickAndExtract: vi.fn(),
    toggleTx: vi.fn(),
    toggleAll: vi.fn(),
    setAcknowledgedCannotVerify: vi.fn(),
    confirm: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  };
}

function makeReviewExtraction(over: Partial<StatementExtraction> = {}): StatementExtraction {
  return {
    transactions: [
      {
        tx_hash: 'h1',
        date: '2026-01-01',
        label: 'Alpha',
        amount: -10,
        fitid: null,
        isDuplicate: false,
      },
    ],
    arithmetic: {
      status: 'passed',
      openingBalance: 100,
      closingBalance: 90,
      computedClosing: 90,
      delta: 0,
    },
    periodOverlap: { hasOverlap: false, overlappingImports: [] },
    newCount: 1,
    duplicateCount: 0,
    fileHash: 'abc',
    alreadyImported: false,
    dateRangeStart: '2026-01-01',
    dateRangeEnd: '2026-01-31',
    sourceType: 'ofx',
    ...over,
  };
}

beforeEach(() => {
  mockUseImport.mockReset();
  mockToast.mockReset();
});

describe('ImportModal — pick state', () => {
  it('renders Parcourir button when idle', () => {
    mockUseImport.mockReturnValue(makeHook({ step: 'idle' }));
    render(<ImportModal open={true} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /parcourir/i })).toBeInTheDocument();
    expect(screen.getByText(/OFX recommandé/i)).toBeInTheDocument();
  });

  it('shows loading state while picking', () => {
    mockUseImport.mockReturnValue(makeHook({ step: 'picking' }));
    render(<ImportModal open={true} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /chargement/i })).toBeDisabled();
  });

  it('calls pickAndExtract when Parcourir is clicked', async () => {
    const hook = makeHook({ step: 'idle' });
    mockUseImport.mockReturnValue(hook);
    render(<ImportModal open={true} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /parcourir/i }));
    expect(hook.pickAndExtract).toHaveBeenCalled();
  });
});

describe('ImportModal — review state', () => {
  it('shows passed arithmetic badge in green', () => {
    const state: ImportState = {
      step: 'review',
      extraction: makeReviewExtraction({
        arithmetic: {
          status: 'passed',
          openingBalance: 100,
          closingBalance: 90,
          computedClosing: 90,
          delta: 0,
        },
      }),
      filePath: '/tmp/test.ofx',
      selected: new Set(['h1']),
      acknowledgedCannotVerify: false,
    };
    mockUseImport.mockReturnValue(makeHook(state));
    render(<ImportModal open={true} onClose={vi.fn()} />);
    expect(screen.getByText(/solde vérifié/i)).toBeInTheDocument();
  });

  it('shows PDF cannot_verify badge with acknowledgement checkbox', () => {
    const state: ImportState = {
      step: 'review',
      extraction: makeReviewExtraction({
        sourceType: 'pdf',
        arithmetic: {
          status: 'cannot_verify',
          openingBalance: null,
          closingBalance: null,
          computedClosing: null,
          delta: null,
        },
      }),
      filePath: '/tmp/test.pdf',
      selected: new Set(['h1']),
      acknowledgedCannotVerify: false,
    };
    mockUseImport.mockReturnValue(makeHook(state));
    render(<ImportModal open={true} onClose={vi.fn()} />);
    expect(screen.getByText(/non vérifiable/i)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /confirme l'import/i })).toBeInTheDocument();
  });

  it('does not show cannot_verify badge for OFX (auto-handled)', () => {
    const state: ImportState = {
      step: 'review',
      extraction: makeReviewExtraction({
        sourceType: 'ofx',
        arithmetic: {
          status: 'cannot_verify',
          openingBalance: null,
          closingBalance: null,
          computedClosing: null,
          delta: null,
        },
      }),
      filePath: '/tmp/test.ofx',
      selected: new Set(['h1']),
      acknowledgedCannotVerify: false,
    };
    mockUseImport.mockReturnValue(makeHook(state));
    render(<ImportModal open={true} onClose={vi.fn()} />);
    expect(screen.queryByText(/non vérifiable/i)).not.toBeInTheDocument();
  });

  it('shows failed arithmetic badge and disables confirm', () => {
    const state: ImportState = {
      step: 'review',
      extraction: makeReviewExtraction({
        arithmetic: {
          status: 'failed',
          openingBalance: 100,
          closingBalance: 90,
          computedClosing: 85,
          delta: -5,
        },
      }),
      filePath: '/tmp/test.ofx',
      selected: new Set(['h1']),
      acknowledgedCannotVerify: false,
    };
    mockUseImport.mockReturnValue(makeHook(state));
    render(<ImportModal open={true} onClose={vi.fn()} />);
    expect(screen.getByText(/écart/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /importer/i })).toBeDisabled();
  });

  it('disables confirm when 0 transactions selected', () => {
    const state: ImportState = {
      step: 'review',
      extraction: makeReviewExtraction(),
      filePath: '/tmp/test.ofx',
      selected: new Set(),
      acknowledgedCannotVerify: false,
    };
    mockUseImport.mockReturnValue(makeHook(state));
    render(<ImportModal open={true} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /importer/i })).toBeDisabled();
  });

  it('disables confirm for PDF cannot_verify when not acknowledged', () => {
    const state: ImportState = {
      step: 'review',
      extraction: makeReviewExtraction({
        sourceType: 'pdf',
        arithmetic: {
          status: 'cannot_verify',
          openingBalance: null,
          closingBalance: null,
          computedClosing: null,
          delta: null,
        },
      }),
      filePath: '/tmp/test.pdf',
      selected: new Set(['h1']),
      acknowledgedCannotVerify: false,
    };
    mockUseImport.mockReturnValue(makeHook(state));
    render(<ImportModal open={true} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /importer/i })).toBeDisabled();
  });

  it('enables confirm for PDF cannot_verify after acknowledgement', () => {
    const state: ImportState = {
      step: 'review',
      extraction: makeReviewExtraction({
        sourceType: 'pdf',
        arithmetic: {
          status: 'cannot_verify',
          openingBalance: null,
          closingBalance: null,
          computedClosing: null,
          delta: null,
        },
      }),
      filePath: '/tmp/test.pdf',
      selected: new Set(['h1']),
      acknowledgedCannotVerify: true,
    };
    mockUseImport.mockReturnValue(makeHook(state));
    render(<ImportModal open={true} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /importer/i })).not.toBeDisabled();
  });

  it('shows period overlap banner when hasOverlap is true', () => {
    const state: ImportState = {
      step: 'review',
      extraction: makeReviewExtraction({
        periodOverlap: {
          hasOverlap: true,
          overlappingImports: [
            {
              id: 'imp-1',
              date_range_start: '2026-01-01',
              date_range_end: '2026-01-31',
              status: 'validated',
            },
          ],
        },
      }),
      filePath: '/tmp/test.ofx',
      selected: new Set(['h1']),
      acknowledgedCannotVerify: false,
    };
    mockUseImport.mockReturnValue(makeHook(state));
    render(<ImportModal open={true} onClose={vi.fn()} />);
    expect(screen.getByText(/chevauche/i)).toBeInTheDocument();
  });

  it('calls confirm when Importer is clicked', async () => {
    const hook = makeHook({
      step: 'review',
      extraction: makeReviewExtraction(),
      filePath: '/tmp/test.ofx',
      selected: new Set(['h1']),
      acknowledgedCannotVerify: false,
    });
    mockUseImport.mockReturnValue(hook);
    render(<ImportModal open={true} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /importer/i }));
    expect(hook.confirm).toHaveBeenCalled();
  });
});

describe('ImportModal — done state', () => {
  it('calls toast and onClose when done', () => {
    const onClose = vi.fn();
    const reset = vi.fn();
    mockUseImport.mockReturnValue(makeHook({ step: 'done', insertedCount: 3 }, { reset }));
    render(<ImportModal open={true} onClose={onClose} />);
    expect(mockToast).toHaveBeenCalledWith('3 transactions importées', expect.any(Object));
    expect(onClose).toHaveBeenCalled();
    expect(reset).toHaveBeenCalled();
  });
});

describe('ImportModal — error state', () => {
  it('renders the error message with a Fermer button', () => {
    mockUseImport.mockReturnValue(
      makeHook({ step: 'error', message: 'Fichier OFX invalide ou corrompu.' }),
    );
    render(<ImportModal open={true} onClose={vi.fn()} />);
    expect(screen.getByText('Fichier OFX invalide ou corrompu.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /fermer/i })).toBeInTheDocument();
  });

  it('Fermer button calls reset and onClose', async () => {
    const onClose = vi.fn();
    const reset = vi.fn();
    mockUseImport.mockReturnValue(makeHook({ step: 'error', message: 'Erreur.' }, { reset }));
    render(<ImportModal open={true} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: /fermer/i }));
    expect(reset).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
