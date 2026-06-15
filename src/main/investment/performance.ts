import type { DatedValue, DatedFlow, Performance } from '@shared/types/investment';

const MS_PER_DAY = 86_400_000;
const days = (a: string, b: string): number => (Date.parse(b) - Date.parse(a)) / MS_PER_DAY;
const years = (a: string, b: string): number => days(a, b) / 365;

export interface Cashflow {
  date: string;
  amount: number;
}

/** Internal rate of return (annualised), or null if unsolvable. Newton-Raphson with a
 *  bisection fallback on [-0.9999, 10]. Cashflows: investor perspective (invest negative). */
export function irr(cfs: Cashflow[]): number | null {
  if (cfs.length < 2) return null;
  const first = cfs[0];
  if (first === undefined) return null;
  const t0 = first.date;
  const npv = (r: number): number =>
    cfs.reduce((s, cf) => s + cf.amount / Math.pow(1 + r, years(t0, cf.date)), 0);
  const dnpv = (r: number): number =>
    cfs.reduce((s, cf) => {
      const y = years(t0, cf.date);
      return s - (y * cf.amount) / Math.pow(1 + r, y + 1);
    }, 0);

  let r = 0.1;
  for (let i = 0; i < 100; i++) {
    const f = npv(r);
    if (Math.abs(f) < 1e-7) return r;
    const d = dnpv(r);
    if (d === 0) break;
    const next = r - f / d;
    if (!Number.isFinite(next)) break;
    r = Math.max(next, -0.9999);
  }
  let lo = -0.9999;
  let hi = 10;
  let flo = npv(lo);
  const fhi = npv(hi);
  if (flo * fhi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fmid = npv(mid);
    if (Math.abs(fmid) < 1e-7) return mid;
    if (flo * fmid < 0) hi = mid;
    else {
      lo = mid;
      flo = fmid;
    }
  }
  return (lo + hi) / 2;
}

/** Compute TRI + TTWROR + gains from a support's (declared) valuation and flow series. */
export function computePerformance(
  valuationsRaw: DatedValue[],
  flowsRaw: DatedFlow[],
): Performance {
  const valuations = [...valuationsRaw].sort((a, b) => a.date.localeCompare(b.date));
  const flows = [...flowsRaw].sort((a, b) => a.date.localeCompare(b.date));

  const currentValue = valuations.at(-1)?.value ?? 0;
  const openingValue = valuations[0]?.value ?? 0;
  const openingDate = valuations[0]?.date ?? null;
  // The opening valuation already embodies any capital present at the start, including a
  // flow recorded on that same date (the typical first monthly update enters value AND
  // flow together). So "added capital" is only the flows strictly AFTER the opening date —
  // consistent with TTWROR, whose sub-periods count flows `> v0.date`. Counting an
  // opening-date flow again would double-invest it and wreck netInvested / gain / TRI.
  //
  // Exception: when the opening value is 0 (imported support starting from zero), the
  // opening valuation embodies NO prior capital, so a same-date flow is the genuine first
  // contribution and must be included. A non-zero opening still excludes same-date flows.
  const openingIsZero = openingValue === 0;
  const contributions =
    openingDate === null
      ? flows
      : flows.filter((f) => f.date > openingDate || (openingIsZero && f.date === openingDate));
  const flowSum = contributions.reduce((s, f) => s + f.amount, 0);
  const netInvested = openingValue + flowSum;
  const absoluteGain = currentValue - netInvested;

  const base: Performance = {
    startDate: valuations[0]?.date ?? null,
    endDate: valuations.at(-1)?.date ?? null,
    currentValue,
    netInvested,
    absoluteGain,
    ttworrCumulative: null,
    ttworrAnnual: null,
    triAnnual: null,
    hasFullYear: false,
  };
  if (valuations.length < 2) return base;

  // Safe: length >= 2 is guaranteed above; use at() to avoid non-null assertions.
  const firstVal = valuations.at(0);
  const lastVal = valuations.at(-1);
  if (firstVal === undefined || lastVal === undefined) return base;
  const startDate = firstVal.date;
  const endDate = lastVal.date;
  const totalDays = days(startDate, endDate);
  const hasFullYear = totalDays >= 365;

  // TTWROR — time-weighted, linked Modified Dietz, computed ONLY over user-DECLARED
  // valuations. The CSV-import sentinels (source 'auto', the open/close 0-valuations) are
  // excluded: a time-weighted return needs real value points, and chaining over 0-sentinels
  // makes it explode (e.g. a fully-sold line shows a nonsense 261%). With < 2 declared
  // valuations TTWROR is simply not available (null) — show TRI + realized gain instead.
  const declared = valuations.filter((v) => v.source !== 'auto');
  let ttworrCumulative: number | null = null;
  let ttworrAnnual: number | null = null;
  if (declared.length >= 2) {
    let product = 1;
    for (let k = 1; k < declared.length; k++) {
      const v0 = declared[k - 1];
      const v1 = declared[k];
      if (v0 === undefined || v1 === undefined) continue;
      const span = days(v0.date, v1.date);
      if (span <= 0) continue;
      const sub = flows.filter((f) => f.date > v0.date && f.date <= v1.date);
      const netFlow = sub.reduce((s, f) => s + f.amount, 0);
      const weighted = sub.reduce((s, f) => s + f.amount * (days(f.date, v1.date) / span), 0);
      const denom = v0.value + weighted;
      const r = denom === 0 ? 0 : (v1.value - v0.value - netFlow) / denom;
      product *= 1 + r;
    }
    ttworrCumulative = product - 1;
    const dStart = declared[0]?.date;
    const dEnd = declared[declared.length - 1]?.date;
    if (dStart !== undefined && dEnd !== undefined) {
      const dDays = days(dStart, dEnd);
      ttworrAnnual = dDays >= 365 ? Math.pow(product, 365 / dDays) - 1 : null;
    }
  }

  const cfs: Cashflow[] = [
    { date: startDate, amount: -openingValue },
    ...contributions.map((f) => ({ date: f.date, amount: -f.amount })),
    { date: endDate, amount: currentValue },
  ].filter((cf) => cf.amount !== 0);
  const triAnnual = hasFullYear ? irr(cfs) : null;

  return {
    startDate,
    endDate,
    currentValue,
    netInvested,
    absoluteGain,
    ttworrCumulative,
    ttworrAnnual,
    triAnnual,
    hasFullYear,
  };
}
