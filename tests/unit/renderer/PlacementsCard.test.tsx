// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PlacementsCard } from '../../../src/renderer/components/patrimoine/PlacementsCard';
import type { QuoteSettings, WrapperWithSupports, Performance } from '@shared/types/investment';

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
  absoluteReturn: 0.05,
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
  absoluteReturn: 0.05,
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
        currentValueSource: 'declared',
        perf: fullYear,
        needsValuation: false,
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
        currentValueSource: 'declared',
        perf: shortHist,
        needsValuation: false,
      },
    ],
  },
];

const noop = (): void => undefined;
const asyncNoop = (): Promise<void> => Promise.resolve();

const disabledQuoteSettings: QuoteSettings = { enabled: false, lastRefreshAt: null };
const getQuoteSettingsDisabled = () => Promise.resolve(disabledQuoteSettings);
const refreshQuotes = () =>
  Promise.resolve({ refreshed: 0, skipped: 0, failed: 0, lastRefreshAt: null });

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
      getQuoteSettings={getQuoteSettingsDisabled}
      refreshQuotes={refreshQuotes}
      onSetSupportIsin={asyncNoop}
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
      getQuoteSettings={getQuoteSettingsDisabled}
      refreshQuotes={refreshQuotes}
      onSetSupportIsin={asyncNoop}
    />,
  );
  expect(screen.getByText(/aucune enveloppe|aucun placement/i)).toBeInTheDocument();
});

it('renders "cours auto" marker for a support with currentValueSource === "quote" when quotes are enabled', async () => {
  const enabledSettings: QuoteSettings = { enabled: true, lastRefreshAt: null };
  const getQuoteSettingsEnabled = () => Promise.resolve(enabledSettings);

  const wrappersWithQuote: WrapperWithSupports[] = [
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
          name: 'MSCI World',
          isin: 'LU0274208692',
          classId: null,
          currency: 'EUR',
          sortOrder: 0,
          currentValue: 5300,
          currentValueSource: 'quote',
          perf: fullYear,
          needsValuation: false,
        },
      ],
    },
  ];

  render(
    <PlacementsCard
      wrappers={wrappersWithQuote}
      onAddWrapper={noop}
      onAddSupport={noop}
      onUpdateSupport={noop}
      onOpenDetail={noop}
      onDeleteWrapper={noop}
      onDeleteSupport={noop}
      onImport={noop}
      getQuoteSettings={getQuoteSettingsEnabled}
      refreshQuotes={refreshQuotes}
      onSetSupportIsin={asyncNoop}
    />,
  );

  // Wait for the getQuoteSettings effect to resolve and re-render
  expect(await screen.findByText('cours auto')).toBeInTheDocument();
});

it('offers inline ISIN entry on an open support when the feed is enabled', async () => {
  const setIsin = vi.fn(() => Promise.resolve());
  const wrappers: WrapperWithSupports[] = [
    {
      id: 'w1',
      name: 'PEA',
      type: 'pea',
      sortOrder: 0,
      perf: shortHist,
      supports: [
        {
          id: 's1',
          wrapperId: 'w1',
          name: 'MSCI World',
          isin: null,
          classId: null,
          currency: 'EUR',
          sortOrder: 0,
          currentValue: 0,
          currentValueSource: null,
          perf: shortHist,
          needsValuation: true,
        },
      ],
    },
  ];

  const { default: userEvent } = await import('@testing-library/user-event');
  const user = userEvent.setup();
  render(
    <PlacementsCard
      wrappers={wrappers}
      onAddWrapper={noop}
      onAddSupport={noop}
      onUpdateSupport={noop}
      onOpenDetail={noop}
      onDeleteWrapper={noop}
      onDeleteSupport={noop}
      onImport={noop}
      getQuoteSettings={() => Promise.resolve({ enabled: true, lastRefreshAt: null })}
      refreshQuotes={refreshQuotes}
      onSetSupportIsin={setIsin}
    />,
  );

  const input = await screen.findByLabelText('ISIN MSCI World');
  await user.type(input, 'ie00b4l5y983');
  await user.click(screen.getByRole('button', { name: 'Valoriser' }));
  expect(setIsin).toHaveBeenCalledWith('s1', 'IE00B4L5Y983'); // normalised to uppercase
});
