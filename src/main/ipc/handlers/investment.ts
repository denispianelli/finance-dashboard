import { readFileSync } from 'node:fs';
import { dialog } from 'electron';
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
  ImportBourseResult,
  OperationDTO,
  QuoteSettings,
  RefreshResult,
} from '@shared/types/investment';
import {
  getQuotesEnabled,
  setQuotesEnabled,
  getLastQuoteRefreshAt,
} from '../../investment/quoteState';
import { refreshAllQuotes } from '../../investment/refreshQuotes';
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
import { parseBourseCsv } from '../../investment/parseBourseCsv';
import { importBourseCsv, listOperations } from '../../investment/importBourseCsv';

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
    let anyDeclared = false;
    for (const h of histories) {
      // Latest valuation of this support with date <= d (carry-forward).
      // Valuations are sorted ascending from getSupportHistory.
      let last: DatedValue | undefined;
      for (const v of h.valuations) {
        if (v.date <= d) last = v;
        else break;
      }
      if (last !== undefined) {
        value += last.value;
        if (last.source !== 'auto') anyDeclared = true;
      }
    }
    // A combined point is 'declared' only if a real declared valuation backs it; otherwise it's
    // an auto sentinel and must not drive the aggregate TTWROR.
    return { date: d, value, source: anyDeclared ? 'declared' : 'auto' };
  });
  return computePerformance(combined, allFlows);
}

export function handleInvestmentListWrappers(): { wrappers: WrapperWithSupports[] } {
  const db = getDb();
  const wrappers = listWrapperRows(db);
  const sharesStmt = db.prepare(
    "SELECT COALESCE(SUM(CASE WHEN kind = 'buy' THEN quantity ELSE -quantity END), 0) AS shares FROM support_operations WHERE support_id = ?",
  );
  const result: WrapperWithSupports[] = wrappers.map((w) => {
    const supports = listSupportRows(db, w.id);
    const histories = supports.map((s) => getSupportHistory(db, s.id));
    const withPerf: SupportWithPerf[] = supports.map((s, i) => {
      const hist = histories[i] ?? { valuations: [], flows: [] };
      const declaredCount = hist.valuations.filter((v) => v.source !== 'auto').length;
      const shares = (sharesStmt.get(s.id) as { shares: number } | undefined)?.shares ?? 0;
      return {
        ...s,
        perf: computePerformance(hist.valuations, hist.flows),
        // Open position (shares > 0) with no real declared value yet → prompt, don't show 0/garbage.
        needsValuation: shares > 1e-6 && declaredCount === 0,
      };
    });
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

export async function handleInvestmentPickBourseCsv(): Promise<
  { cancelled: true } | { cancelled: false; path: string }
> {
  const r = await dialog.showOpenDialog({
    title: "Sélectionner un relevé d'opérations (CSV)",
    properties: ['openFile'],
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  });
  if (r.canceled || r.filePaths.length === 0) return { cancelled: true };
  return { cancelled: false, path: r.filePaths[0] ?? '' };
}

export function handleInvestmentImportBourseCsv(payload: { path: string; wrapperId: string }): {
  result: ImportBourseResult;
} {
  const text = readFileSync(payload.path, 'latin1'); // Fortuneo CSV is ISO-8859-1
  const parsed = parseBourseCsv(text);
  const result = importBourseCsv(getDb(), payload.wrapperId, parsed.ops);
  return { result: { ...result, skippedRows: parsed.skipped.length } };
}

export function handleInvestmentListOperations(payload: { supportId: string }): {
  operations: OperationDTO[];
} {
  return { operations: listOperations(getDb(), payload.supportId) };
}

export function handleInvestmentGetQuoteSettings(): QuoteSettings {
  return { enabled: getQuotesEnabled(), lastRefreshAt: getLastQuoteRefreshAt() };
}

export function handleInvestmentSetQuotesEnabled(payload: { enabled: boolean }): { ok: true } {
  setQuotesEnabled(payload.enabled);
  return { ok: true };
}

export async function handleInvestmentRefreshQuotes(): Promise<{ result: RefreshResult }> {
  // ADR-018: never touch the network while the feed is off.
  if (!getQuotesEnabled()) {
    return {
      result: { refreshed: 0, skipped: 0, failed: 0, lastRefreshAt: getLastQuoteRefreshAt() },
    };
  }
  return { result: await refreshAllQuotes(getDb()) };
}
