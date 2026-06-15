// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { computePerformance, irr } from '../../../src/main/investment/performance';
import type { DatedValue } from '@shared/types/investment';

describe('performance', () => {
  it('lump sum, no flows: TRI annual = CAGR, and TRI≈TTWROR', () => {
    const vals: DatedValue[] = [
      { date: '2022-01-01', value: 10000 },
      { date: '2024-01-01', value: 12100 }, // +21% over 2 years → 10%/yr
    ];
    const perf = computePerformance(vals, []);
    expect(perf.triAnnual).toBeCloseTo(0.1, 2);
    expect(perf.ttworrAnnual).toBeCloseTo(0.1, 2);
    expect(perf.ttworrCumulative).toBeCloseTo(0.21, 3);
    expect(perf.hasFullYear).toBe(true);
  });

  it('flat (value = invested): returns are ~0', () => {
    // 1000 start + 1000 contributed mid-period = 2000 end, no gain
    const vals: DatedValue[] = [
      { date: '2022-01-01', value: 1000 },
      { date: '2023-06-01', value: 2000 },
    ];
    const perf = computePerformance(vals, [{ date: '2022-07-01', amount: 1000 }]);
    expect(perf.absoluteGain).toBeCloseTo(0, 6);
    expect(perf.ttworrCumulative).toBeCloseTo(0, 6);
  });

  it('short history (< 1 year): annualised null, cumulative present', () => {
    const vals: DatedValue[] = [
      { date: '2024-01-01', value: 1000 },
      { date: '2024-03-01', value: 1050 },
    ];
    const perf = computePerformance(vals, []);
    expect(perf.hasFullYear).toBe(false);
    expect(perf.ttworrAnnual).toBeNull();
    expect(perf.triAnnual).toBeNull();
    expect(perf.ttworrCumulative).toBeCloseTo(0.05, 4);
  });

  it('irr solves a simple two-flow case (~10%)', () => {
    const r = irr([
      { date: '2023-01-01', amount: -1000 },
      { date: '2024-01-01', amount: 1100 },
    ]);
    expect(r).not.toBeNull();
    if (r === null) throw new Error('expected non-null IRR');
    expect(r).toBeCloseTo(0.1, 2);
  });

  it('null perf fields when fewer than 2 valuations', () => {
    const perf = computePerformance([{ date: '2024-01-01', value: 1000 }], []);
    expect(perf.ttworrCumulative).toBeNull();
    expect(perf.triAnnual).toBeNull();
    expect(perf.currentValue).toBe(1000);
  });
});
