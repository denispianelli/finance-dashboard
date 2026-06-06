// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { VerdictRow } from '@renderer/components/reports/VerdictRow';
import type { PeriodVerdict } from '@renderer/lib/reports';

afterEach(() => {
  cleanup();
});

function compact(t: string): string {
  return t.replace(/\s/g, '');
}

describe('VerdictRow', () => {
  it('shows the three pastilles and a positive verdict with vs-N-1 and savings', () => {
    const v: PeriodVerdict = {
      income: 2000,
      expense: -1500,
      net: 500,
      positive: true,
      savingsRate: 25,
      deltaPct: 400,
    };
    render(<VerdictRow verdict={v} periodLabel="2023" />);
    expect(screen.getByText('Entrées')).toBeTruthy();
    expect(screen.getByText('Sorties')).toBeTruthy();
    expect(screen.getByText('Résultat')).toBeTruthy();
    expect(screen.getByText((t) => compact(t).includes('+500,00'))).toBeTruthy();
    expect(screen.getByText(/positif/)).toBeTruthy();
    expect(screen.getByText(/\+400\s?% vs N-1/)).toBeTruthy();
    expect(screen.getByText(/épargne 25\s?%/)).toBeTruthy();
  });

  it('labels a negative result as négatif', () => {
    const v: PeriodVerdict = {
      income: 100,
      expense: -400,
      net: -300,
      positive: false,
      savingsRate: null,
      deltaPct: null,
    };
    render(<VerdictRow verdict={v} periodLabel="juin 2024" />);
    expect(screen.getByText(/négatif/)).toBeTruthy();
    expect(screen.getByText((t) => compact(t).includes('−300,00'))).toBeTruthy();
  });
});
