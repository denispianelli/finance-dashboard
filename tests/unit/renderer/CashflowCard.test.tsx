// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { CashflowCard } from '@renderer/components/dashboard/CashflowCard';
import type { CashflowPoint } from '@shared/types/dashboard';

afterEach(() => {
  cleanup();
});

const series: CashflowPoint[] = [
  { period: '2026-04', income: 2000, expense: -300, net: 1700 },
  { period: '2026-05', income: 1800, expense: -2300, net: -500 },
];

/** Compact a cell's text, dropping every kind of whitespace (incl. the French
 *  narrow no-break thousands separator) so number assertions stay robust. */
function compact(t: string): string {
  return t.replace(/\s/g, '');
}

const noop = (): void => undefined;

describe('CashflowCard', () => {
  it('renders a French month label and the net for each period', () => {
    render(<CashflowCard series={series} granularity="month" onGranularityChange={noop} />);
    expect(screen.getByText(/avril 2026/i)).toBeTruthy();
    expect(screen.getByText(/mai 2026/i)).toBeTruthy();
    expect(screen.getByText((t) => compact(t).includes('+1700,00'))).toBeTruthy();
    // The net of -500 is shown with a typographic minus + sign in the net column.
    expect(screen.getByText((t) => /^[−-]500,00€$/.test(compact(t)))).toBeTruthy();
  });

  it('shows the raw year as the label in year granularity', () => {
    render(
      <CashflowCard
        series={[{ period: '2026', income: 9000, expense: -4000, net: 5000 }]}
        granularity="year"
        onGranularityChange={noop}
      />,
    );
    expect(screen.getByText('2026')).toBeTruthy();
  });

  it('calls onGranularityChange when the Année toggle is clicked', () => {
    let picked = '';
    render(
      <CashflowCard
        series={series}
        granularity="month"
        onGranularityChange={(g) => {
          picked = g;
        }}
      />,
    );
    fireEvent.click(screen.getByText('Année'));
    expect(picked).toBe('year');
  });

  it('shows an empty state with no data', () => {
    render(<CashflowCard series={[]} granularity="month" onGranularityChange={noop} />);
    expect(screen.getByText(/importez un relevé/i)).toBeTruthy();
  });
});
