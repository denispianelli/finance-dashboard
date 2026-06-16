// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import {
  createWrapper,
  createSupport,
  getSupportHistory,
} from '../../../src/main/investment/investmentRepo';

const db = new DatabaseSync(':memory:');
vi.mock('../../../src/main/db', () => ({ getDb: () => db }));

import { refreshAllQuotes } from '../../../src/main/investment/refreshQuotes';

function seed(isin: string | null, shares: number): string {
  const w = createWrapper(db, { name: 'PEA', type: 'pea' });
  const s = createSupport(db, { wrapperId: w.id, name: 'World', isin, classId: null });
  if (shares > 0) {
    db.prepare(
      "INSERT INTO support_operations (id, support_id, op_date, kind, quantity, net, raw_label, op_hash, source) VALUES (?,?,?,?,?,?,?,?,'fortuneo_csv')",
    ).run(`op-${s.id}`, s.id, '2026-01-10', 'buy', shares, -100 * shares, 'WORLD', `h-${s.id}`);
  }
  return s.id;
}

beforeEach(() => {
  runMigrations(db);
  db.exec(
    'DELETE FROM support_valuations; DELETE FROM support_operations; DELETE FROM investment_supports; DELETE FROM investment_wrappers',
  );
});

const provider = {
  resolveSymbol: vi.fn((isin: string) =>
    Promise.resolve(isin === 'IE00B4L5Y983' ? 'EUNL.DE' : null),
  ),
  fetchLatestQuote: vi.fn((symbol: string) =>
    Promise.resolve(symbol === 'EUNL.DE' ? { price: 124.27, asOf: '2026-06-15' } : null),
  ),
};

beforeEach(() => {
  provider.resolveSymbol.mockClear();
  provider.fetchLatestQuote.mockClear();
});

describe('refreshAllQuotes', () => {
  it('resolves, fetches, and writes value = shares × price', async () => {
    const id = seed('IE00B4L5Y983', 3);
    const r = await refreshAllQuotes(db, provider);
    expect(r.refreshed).toBe(1);
    const quote = getSupportHistory(db, id).valuations.find((v) => v.source === 'quote');
    expect(quote?.value).toBe(372.81); // 3 × 124.27
    expect(r.lastRefreshAt).not.toBeNull();
  });

  it('caches the resolved symbol so a second pass does not re-resolve', async () => {
    seed('IE00B4L5Y983', 3);
    await refreshAllQuotes(db, provider);
    await refreshAllQuotes(db, provider);
    expect(provider.resolveSymbol).toHaveBeenCalledTimes(1);
  });

  it('skips a support whose ISIN has no EUR ticker', async () => {
    seed('UNKNOWN_ISIN', 3);
    const r = await refreshAllQuotes(db, provider);
    expect(r.skipped).toBe(1);
    expect(r.refreshed).toBe(0);
  });

  it('reports a fetch failure without aborting the batch', async () => {
    provider.fetchLatestQuote.mockResolvedValueOnce(null);
    seed('IE00B4L5Y983', 3);
    const r = await refreshAllQuotes(db, provider);
    expect(r.failed).toBe(1);
  });

  it('does not shadow a same-day declared value', async () => {
    const id = seed('IE00B4L5Y983', 3);
    db.prepare(
      "INSERT INTO support_valuations (id, support_id, as_of, value, source) VALUES (?,?,?,?,'declared')",
    ).run('dv', id, '2026-06-15', 999);
    const r = await refreshAllQuotes(db, provider);
    expect(r.skipped).toBe(1);
    const quotes = getSupportHistory(db, id).valuations.filter((v) => v.source === 'quote');
    expect(quotes).toHaveLength(0);
  });
});
