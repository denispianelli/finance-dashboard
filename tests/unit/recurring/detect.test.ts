import { describe, it, expect } from 'vitest';
import { detectRecurring } from '../../../src/main/recurring/detect';
import type { RecurringInput } from '@shared/types/recurring';

function monthly(label: string, amount: number, months: string[]): RecurringInput[] {
  return months.map((m) => ({ date: `${m}-15`, amount, label }));
}

describe('detectRecurring', () => {
  it('detects a monthly subscription with cadence, monthly-equivalent and next due', () => {
    const txns = monthly('NETFLIX', -13.49, ['2026-01', '2026-02', '2026-03', '2026-04']);
    const [sub] = detectRecurring(txns);
    expect(sub).toMatchObject({
      label: 'NETFLIX',
      amount: 13.49,
      cadence: 'monthly',
      monthlyEquivalent: 13.49,
      occurrences: 4,
      lastDate: '2026-04-15',
      nextDueDate: '2026-05-15',
    });
  });

  it('detects an annual subscription (monthly-equivalent = amount / 12)', () => {
    const txns: RecurringInput[] = [
      { date: '2024-03-01', amount: -120, label: 'ASSURANCE' },
      { date: '2025-03-01', amount: -120, label: 'ASSURANCE' },
      { date: '2026-03-01', amount: -120, label: 'ASSURANCE' },
    ];
    const [sub] = detectRecurring(txns);
    expect(sub).toMatchObject({ label: 'ASSURANCE', cadence: 'annual', occurrences: 3 });
    expect(sub?.monthlyEquivalent).toBeCloseTo(10, 5);
    expect(sub?.nextDueDate).toBe('2027-03-01');
  });

  it('clamps the next due date for a month-end anchor instead of overflowing', () => {
    // Charges on the 30th/31st: the next due after Jan 31 must be Feb 28, not
    // the overflowed Mar 3 the old setUTCMonth(+1) produced.
    const txns: RecurringInput[] = [
      { date: '2025-11-30', amount: -20, label: 'LOYER' },
      { date: '2025-12-31', amount: -20, label: 'LOYER' },
      { date: '2026-01-31', amount: -20, label: 'LOYER' },
    ];
    const [sub] = detectRecurring(txns);
    expect(sub?.cadence).toBe('monthly');
    expect(sub?.lastDate).toBe('2026-01-31');
    expect(sub?.nextDueDate).toBe('2026-02-28');
  });

  it('ignores one-off charges and fewer than three occurrences', () => {
    const txns: RecurringInput[] = [
      { date: '2026-01-10', amount: -50, label: 'GARAGE' },
      { date: '2026-02-10', amount: -50, label: 'GARAGE' },
    ];
    expect(detectRecurring(txns)).toEqual([]);
  });

  it('rejects a group whose amount is not stable', () => {
    const txns: RecurringInput[] = [
      { date: '2026-01-15', amount: -10, label: 'VAR' },
      { date: '2026-02-15', amount: -40, label: 'VAR' },
      { date: '2026-03-15', amount: -90, label: 'VAR' },
    ];
    expect(detectRecurring(txns)).toEqual([]);
  });

  it('ignores income and sorts results by monthly-equivalent desc', () => {
    const txns: RecurringInput[] = [
      ...monthly('SPOTIFY', -10, ['2026-01', '2026-02', '2026-03']),
      ...monthly('RENT', -800, ['2026-01', '2026-02', '2026-03']),
      ...monthly('SALARY', 2500, ['2026-01', '2026-02', '2026-03']),
    ];
    const subs = detectRecurring(txns);
    expect(subs.map((s) => s.label)).toEqual(['RENT', 'SPOTIFY']);
  });
});
