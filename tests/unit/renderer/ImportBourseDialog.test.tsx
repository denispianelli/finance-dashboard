// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ImportBourseDialog } from '../../../src/renderer/components/patrimoine/ImportBourseDialog';
import type { WrapperWithSupports, Performance } from '@shared/types/investment';

vi.mock('electron', () => ({}));

afterEach(() => {
  cleanup();
});

const perf: Performance = {
  startDate: '2024-01-01',
  endDate: '2024-06-01',
  currentValue: 1000,
  netInvested: 1000,
  absoluteGain: 0,
  absoluteReturn: 0.05,
  ttworrCumulative: 0,
  ttworrAnnual: null,
  triAnnual: null,
  hasFullYear: false,
};

const WRAPPERS: WrapperWithSupports[] = [
  {
    id: 'w1',
    name: 'PEA Test',
    type: 'pea',
    sortOrder: 0,
    perf,
    supports: [],
  },
];

it('renders the «Choisir un fichier CSV» button when open', () => {
  render(
    <ImportBourseDialog
      open={true}
      onOpenChange={vi.fn()}
      wrappers={WRAPPERS}
      onPickFile={vi.fn().mockResolvedValue({ cancelled: true })}
      onCreateWrapper={vi.fn().mockResolvedValue({ id: 'new-w' })}
      onImport={vi.fn().mockResolvedValue({
        operationsImported: 0,
        alreadyPresent: 0,
        skippedRows: 0,
        createdSupports: [],
        supportsTouched: 0,
      })}
    />,
  );

  expect(screen.getByText(/Choisir un fichier CSV/i)).toBeInTheDocument();
  expect(screen.getByText(/Importer un relevé d'opérations/i)).toBeInTheDocument();
});
