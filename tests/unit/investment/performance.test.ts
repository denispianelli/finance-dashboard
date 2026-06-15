// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { computePerformance, irr } from '../../../src/main/investment/performance';
import type { DatedValue } from '@shared/types/investment';

describe('performance', () => {
  it('first update entering value AND a same-date flow does not double-count the opening capital', () => {
    // The typical first monthly update: "it's worth 5000, of which I contributed 5000".
    // A flow on the opening date must NOT be added on top of the opening valuation.
    const vals: DatedValue[] = [
      { date: '2023-01-01', value: 5000 },
      { date: '2024-01-01', value: 5300 }, // +6% over 1 year, no further contribution
    ];
    const perf = computePerformance(vals, [{ date: '2023-01-01', amount: 5000 }]);
    expect(perf.netInvested).toBeCloseTo(5000, 6); // not 10000
    expect(perf.absoluteGain).toBeCloseTo(300, 6); // not -4700
    expect(perf.triAnnual).toBeCloseTo(0.06, 2); // ~+6%/yr, not -44%
    expect(perf.ttworrAnnual).toBeCloseTo(0.06, 2); // no flow after opening ⇒ TRI ≈ TTWROR
  });

  it('a genuine mid-period contribution still counts toward invested capital', () => {
    const vals: DatedValue[] = [
      { date: '2023-01-01', value: 1000 },
      { date: '2024-01-01', value: 2200 },
    ];
    // opening 1000 (with its same-date 1000 flow, excluded) + a real +1000 mid-year.
    const perf = computePerformance(vals, [
      { date: '2023-01-01', amount: 1000 },
      { date: '2023-07-01', amount: 1000 },
    ]);
    expect(perf.netInvested).toBeCloseTo(2000, 6); // 1000 opening + 1000 mid-year
    expect(perf.absoluteGain).toBeCloseTo(200, 6);
  });

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
