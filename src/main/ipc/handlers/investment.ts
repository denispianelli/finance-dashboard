import { getDb } from '../../db';
import type {
  CreateWrapperInput,
  CreateSupportInput,
  SupportUpdateInput,
  WrapperWithSupports,
  SupportWithPerf,
  Performance,
  DatedValue,
  DatedFlow,
} from '@shared/types/investment';
import {
  createWrapper,
  listWrapperRows,
  deleteWrapper,
  createSupport,
  deleteSupport,
  listSupportRows,
  applyUpdate,
  getSupportHistory,
} from '../../investment/investmentRepo';
import { computePerformance } from '../../investment/performance';

/** Aggregate a set of supports' histories into one combined (valuations, flows) series.
 *  The wrapper-level valuation on a date = Σ each support's most-recent value as-of that date
 *  (carry-forward); flows are concatenated. Then run the same performance math. */
function aggregatePerformance(
  histories: { valuations: DatedValue[]; flows: DatedFlow[] }[],
): Performance {
  const allFlows: DatedFlow[] = histories.flatMap((h) => h.flows);
  const dateSet = new Set<string>();
  for (const h of histories) for (const v of h.valuations) dateSet.add(v.date);
  const dates = [...dateSet].sort((a, b) => a.localeCompare(b));
  const combined: DatedValue[] = dates.map((d) => {
    let value = 0;
    for (const h of histories) {
      // Latest valuation of this support with date <= d (carry-forward).
      // Valuations are sorted ascending from getSupportHistory.
      let last: number | undefined;
      for (const v of h.valuations) {
        if (v.date <= d) last = v.value;
        else break;
      }
      if (last !== undefined) value += last;
    }
    return { date: d, value };
  });
  return computePerformance(combined, allFlows);
}

export function handleInvestmentListWrappers(): { wrappers: WrapperWithSupports[] } {
  const db = getDb();
  const wrappers = listWrapperRows(db);
  const result: WrapperWithSupports[] = wrappers.map((w) => {
    const supports = listSupportRows(db, w.id);
    const histories = supports.map((s) => getSupportHistory(db, s.id));
    const withPerf: SupportWithPerf[] = supports.map((s, i) => ({
      ...s,
      perf: computePerformance(histories[i]?.valuations ?? [], histories[i]?.flows ?? []),
    }));
    return { ...w, supports: withPerf, perf: aggregatePerformance(histories) };
  });
  return { wrappers: result };
}

export function handleInvestmentGetSupportHistory(payload: { supportId: string }): {
  history: ReturnType<typeof getSupportHistory>;
} {
  return { history: getSupportHistory(getDb(), payload.supportId) };
}

export function handleInvestmentCreateWrapper(payload: CreateWrapperInput) {
  return { wrapper: createWrapper(getDb(), payload) };
}

export function handleInvestmentDeleteWrapper(payload: { id: string }): { ok: true } {
  deleteWrapper(getDb(), payload.id);
  return { ok: true };
}

export function handleInvestmentCreateSupport(payload: CreateSupportInput) {
  return { support: createSupport(getDb(), payload) };
}

export function handleInvestmentDeleteSupport(payload: { id: string }): { ok: true } {
  deleteSupport(getDb(), payload.id);
  return { ok: true };
}

export function handleInvestmentUpdateSupport(payload: SupportUpdateInput): { ok: true } {
  applyUpdate(getDb(), payload);
  return { ok: true };
}
