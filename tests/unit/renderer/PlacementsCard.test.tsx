// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PlacementsCard } from '../../../src/renderer/components/patrimoine/PlacementsCard';
import type { WrapperWithSupports, Performance } from '@shared/types/investment';

vi.mock('electron', () => ({}));

afterEach(() => {
  cleanup();
});

const fullYear: Performance = {
  startDate: '2022-01-01',
  endDate: '2024-01-01',
  currentValue: 5300,
  netInvested: 5000,
  absoluteGain: 300,
  ttworrCumulative: 0.06,
  ttworrAnnual: 0.03,
  triAnnual: 0.031,
  hasFullYear: true,
};
const shortHist: Performance = {
  startDate: '2024-01-01',
  endDate: '2024-03-01',
  currentValue: 1050,
  netInvested: 1000,
  absoluteGain: 50,
  ttworrCumulative: 0.05,
  ttworrAnnual: null,
  triAnnual: null,
  hasFullYear: false,
};
const WRAPPERS: WrapperWithSupports[] = [
  {
    id: 'w1',
    name: 'PEA',
    type: 'pea',
    sortOrder: 0,
    perf: fullYear,
    supports: [
      {
        id: 's1',
        wrapperId: 'w1',
        name: 'World ETF',
        isin: null,
        classId: null,
        currency: 'EUR',
        sortOrder: 0,
        currentValue: 5300,
        perf: fullYear,
      },
    ],
  },
  {
    id: 'w2',
    name: 'AV',
    type: 'av',
    sortOrder: 1,
    perf: shortHist,
    supports: [
      {
        id: 's2',
        wrapperId: 'w2',
        name: 'Fonds €',
        isin: null,
        classId: null,
        currency: 'EUR',
        sortOrder: 0,
        currentValue: 1050,
        perf: shortHist,
      },
    ],
  },
];

const noop = (): void => undefined;

it('renders wrappers + supports; annualised when ≥1y, cumulative "depuis l\'origine" when short', () => {
  render(
    <PlacementsCard
      wrappers={WRAPPERS}
      onAddWrapper={noop}
      onAddSupport={noop}
      onUpdateSupport={noop}
      onOpenDetail={noop}
      onDeleteWrapper={noop}
      onDeleteSupport={noop}
      onImport={noop}
    />,
  );
  expect(screen.getByText('PEA')).toBeInTheDocument();
  expect(screen.getByText('World ETF')).toBeInTheDocument();
  expect(screen.getAllByText(/\/an/).length).toBeGreaterThan(0); // annualised shown for s1
  expect(screen.getByText(/depuis l'origine/i)).toBeInTheDocument(); // cumulative for s2
});

it('renders an empty state when there are no wrappers', () => {
  render(
    <PlacementsCard
      wrappers={[]}
      onAddWrapper={noop}
      onAddSupport={noop}
      onUpdateSupport={noop}
      onOpenDetail={noop}
      onDeleteWrapper={noop}
      onDeleteSupport={noop}
      onImport={noop}
    />,
  );
  expect(screen.getByText(/aucune enveloppe|aucun placement/i)).toBeInTheDocument();
});
