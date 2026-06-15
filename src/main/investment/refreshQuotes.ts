import type { DatabaseSync } from 'node:sqlite';
import type { RefreshResult } from '@shared/types/investment';
import { listQuotableSupports, setQuoteSymbol, writeQuoteValuation } from './investmentRepo';
import { resolveSymbol, fetchLatestQuote } from './quoteProvider';
import { setLastQuoteRefreshAt } from './quoteState';

export interface QuoteProvider {
  resolveSymbol(isin: string): Promise<string | null>;
  fetchLatestQuote(symbol: string): Promise<{ price: number; asOf: string } | null>;
}

const realProvider: QuoteProvider = { resolveSymbol, fetchLatestQuote };

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** One refresh pass over every quotable support. Per-support failures are caught and counted —
 *  a single dead ticker never aborts the batch. Records the refresh timestamp on completion. */
export async function refreshAllQuotes(
  db: DatabaseSync,
  provider: QuoteProvider = realProvider,
): Promise<RefreshResult> {
  let refreshed = 0;
  let skipped = 0;
  let failed = 0;
  for (const s of listQuotableSupports(db)) {
    try {
      let symbol = s.quoteSymbol;
      if (symbol === null) {
        symbol = await provider.resolveSymbol(s.isin);
        if (symbol === null) {
          skipped++;
          continue;
        }
        setQuoteSymbol(db, s.id, symbol);
      }
      const quote = await provider.fetchLatestQuote(symbol);
      if (quote === null) {
        failed++;
        continue;
      }
      const outcome = writeQuoteValuation(db, s.id, quote.asOf, round2(s.shares * quote.price));
      if (outcome === 'written') refreshed++;
      else skipped++;
    } catch {
      failed++;
    }
  }
  const lastRefreshAt = new Date().toISOString();
  setLastQuoteRefreshAt(lastRefreshAt);
  return { refreshed, skipped, failed, lastRefreshAt };
}
