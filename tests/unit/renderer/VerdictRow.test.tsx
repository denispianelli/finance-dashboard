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
  it('shows the three pastilles with income, expense and the signed result', () => {
    const v: PeriodVerdict = {
      income: 2000,
      expense: -1500,
      net: 500,
      positive: true,
      savingsRate: 25,
      deltaPct: 400,
    };
    render(<VerdictRow verdict={v} />);
    expect(screen.getByText('Entrées')).toBeTruthy();
    expect(screen.getByText('Sorties')).toBeTruthy();
    expect(screen.getByText('Résultat')).toBeTruthy();
    expect(screen.getByText((t) => compact(t).includes('2000,00'))).toBeTruthy();
    expect(screen.getByText((t) => compact(t).includes('1500,00'))).toBeTruthy();
    expect(screen.getByText((t) => compact(t).includes('+500,00'))).toBeTruthy();
  });

  it('renders a negative result with the true minus sign', () => {
    const v: PeriodVerdict = {
      income: 100,
      expense: -400,
      net: -300,
      positive: false,
      savingsRate: null,
      deltaPct: null,
    };
    render(<VerdictRow verdict={v} />);
    expect(screen.getByText((t) => compact(t).includes('−300,00'))).toBeTruthy();
  });
});
