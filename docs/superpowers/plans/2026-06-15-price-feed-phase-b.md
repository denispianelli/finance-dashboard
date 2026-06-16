# Price Feed (Investment Phase B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in, off-by-default market-price feed that auto-values open securities (`value = net shares × latest EUR quote`) by ISIN, writing `quote`-sourced valuations that feed the existing TRI/TTWROR math.

**Architecture:** Main-process only. Two keyless public hosts (verified live 2026-06-15): `api.portfolio-performance.info/v1/search` resolves ISIN→EUR ticker (cached per support), `query1.finance.yahoo.com/v8/finance/chart` returns the latest EUR price. An orchestrator iterates quotable supports, upserting one `quote` valuation per support per day; a declared value on the same date is never shadowed. Renderer triggers a non-blocking refresh on mount when enabled, plus a manual button. Settings store an opt-in flag in `app_settings`.

**Tech Stack:** TypeScript strict, Electron main, `node:sqlite` DatabaseSync, global `fetch` + `AbortController` (no HTTP lib), Vitest 4 (node + jsdom), React + shadcn/Tailwind.

**Spec:** `docs/superpowers/specs/2026-06-15-price-feed-phase-b-design.md`. Read it before starting.

**Conventions (all tasks):**

- Lint is strict: **no `any`, no `!` non-null assertion, no unsafe member access**, `noUncheckedIndexedAccess` is on (array access is `T | undefined`). Narrow JSON with explicit guards; never cast through `any`.
- Money is REAL euros; round to the cent with `Math.round(x * 100) / 100`.
- Run a single test file with: `npx vitest run <path>`. Typecheck with `npm run typecheck`. Lint with `npm run lint`.
- Commit after each task (husky pre-commit reformats staged files — re-`git add` and retry if it amends).

---

## File Structure

**Create:**

- `src/main/db/migrations/028_quote_feed.sql` — `quote_symbol` column.
- `src/main/investment/quoteProvider.ts` — network client (`resolveSymbol`, `fetchLatestQuote`).
- `src/main/investment/quoteState.ts` — opt-in flag + last-refresh timestamp in `app_settings`.
- `src/main/investment/refreshQuotes.ts` — orchestrator over quotable supports.
- `src/renderer/components/patrimoine/QuoteSettingsSection.tsx` — opt-in settings UI.
- Tests: `tests/unit/investment/quoteProvider.test.ts`, `tests/unit/investment/quoteState.test.ts`, `tests/integration/investment/refreshQuotes.test.ts`, `tests/unit/investment/quoteValuation.test.ts`.

**Modify:**

- `src/main/db/migrate.ts` — register migration 28.
- `src/shared/types/investment.ts` — `'quote'` source, `currentValueSource`, `QuoteSettings`, `RefreshResult`, `QuotableSupport`.
- `src/shared/types/ipc.ts` + `src/main/ipc/channels.ts` — 3 new channels.
- `src/main/investment/investmentRepo.ts` — `listQuotableSupports`, `setQuoteSymbol`, `writeQuoteValuation`, `currentValueSource` in `listSupportRows`.
- `src/main/ipc/handlers/investment.ts` + `src/main/ipc/register.ts` — 3 handlers.
- `src/renderer/hooks/usePlacements.ts` — quote methods + on-mount auto-refresh.
- `src/renderer/components/patrimoine/PlacementsCard.tsx` — refresh button, timestamp, "cours auto" marker.
- `src/renderer/pages/SettingsPage.tsx` — mount the new section.
- `docs/adr/018-network-policy-price-feed.md`, `README.md` — provider addendum + privacy copy.

---

## Task 1: Migration 028 — `quote_symbol` column

**Files:**

- Create: `src/main/db/migrations/028_quote_feed.sql`
- Modify: `src/main/db/migrate.ts`
- Test: `tests/integration/investment/refreshQuotes.test.ts` (created in Task 6 exercises the column; no standalone test here)

- [ ] **Step 1: Write the migration**

`src/main/db/migrations/028_quote_feed.sql`:

```sql
-- Phase B price feed: cache the resolved EUR exchange ticker per support so a refresh only
-- needs the quote host. `support_valuations.source` (migration 027) gains a third value
-- 'quote' written by the feed; no schema change needed for that.
ALTER TABLE investment_supports ADD COLUMN quote_symbol TEXT;
```

- [ ] **Step 2: Register it in `migrate.ts`**

Add the import next to the others (after line importing `sql027`):

```ts
import sql028 from './migrations/028_quote_feed.sql?raw';
```

Add to the `MIGRATIONS` array after `{ version: 27, sql: sql027 }`:

```ts
  { version: 28, sql: sql028 },
```

- [ ] **Step 3: Verify migrations still apply**

Run: `npx vitest run tests/integration/investment/importBourse.test.ts`
Expected: PASS (existing test runs all migrations including 28 on a fresh in-memory DB).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/main/db/migrations/028_quote_feed.sql src/main/db/migrate.ts
git commit -m "feat(investment): migration 028 — quote_symbol on supports"
```

---

## Task 2: Shared types + IPC channels (wiring only)

**Files:**

- Modify: `src/shared/types/investment.ts`
- Modify: `src/shared/types/ipc.ts`
- Modify: `src/main/ipc/channels.ts`

- [ ] **Step 1: Extend investment types**

In `src/shared/types/investment.ts`:

Change the `DatedValue.source` union to include `'quote'`:

```ts
  /** 'declared' = user-entered; 'auto' = system sentinel (CSV import open/close 0);
   *  'quote' = price-feed valuation (shares × market price). Only 'auto' is excluded from
   *  TTWROR. Absent ⇒ treated as declared (manual entries). */
  source?: 'declared' | 'auto' | 'quote';
```

Add `currentValueSource` to `SupportDTO` (after `currentValue`):

```ts
/** Source of the latest valuation backing `currentValue` (for honest "cours auto" labelling).
 *  null when the support has no valuation yet. */
currentValueSource: 'declared' | 'auto' | 'quote' | null;
```

Append these new interfaces at the end of the file:

```ts
/** A support eligible for an auto quote: has an ISIN and a positive net share count. */
export interface QuotableSupport {
  id: string;
  isin: string;
  quoteSymbol: string | null;
  shares: number;
}

/** Opt-in price-feed settings surfaced to the renderer. */
export interface QuoteSettings {
  enabled: boolean;
  lastRefreshAt: string | null; // ISO
}

/** Outcome of one refresh pass over all quotable supports. */
export interface RefreshResult {
  refreshed: number; // quote valuations written/updated
  skipped: number; // no EUR ticker, or a declared value already covers today
  failed: number; // network/parse failure for that support
  lastRefreshAt: string | null; // ISO of this pass (null only if feed was disabled)
}
```

- [ ] **Step 2: Add the IPC contract entries**

In `src/shared/types/ipc.ts`, add to the import from `./investment` (the `QuoteSettings`, `RefreshResult` types) and add these entries to the `IpcContract` interface after `'investment:listOperations'`:

```ts
  'investment:getQuoteSettings': {
    payload: Record<string, never>;
    response: QuoteSettings;
  };
  'investment:setQuotesEnabled': {
    payload: { enabled: boolean };
    response: { ok: true };
  };
  'investment:refreshQuotes': {
    payload: Record<string, never>;
    response: { result: RefreshResult };
  };
```

Make sure `QuoteSettings` and `RefreshResult` are added to the existing `import type { … } from './investment';` block near the top of the file.

- [ ] **Step 3: Add the channel names**

In `src/main/ipc/channels.ts`, after `investmentListOperations: 'investment:listOperations',`:

```ts
  investmentGetQuoteSettings: 'investment:getQuoteSettings',
  investmentSetQuotesEnabled: 'investment:setQuotesEnabled',
  investmentRefreshQuotes: 'investment:refreshQuotes',
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: errors only about missing handlers will NOT appear yet (handlers are registered in Task 7); the types compile. If `listSupportRows`/`toSupport` now error because `currentValueSource` is required on `SupportDTO`, that's expected — fixed in Task 4. To keep this task self-contained, temporarily it's fine for `npm run typecheck` to flag `toSupport`; proceed to Step 5 (the next task fixes it). If you prefer green between tasks, do Task 4 Step 3 (the `toSupport`/query change) now.

> **Note:** Because `SupportDTO.currentValueSource` is newly required, `toSupport` in `investmentRepo.ts` won't compile until Task 4. Tasks 2 and 4 are tightly coupled on this field. Acceptable to commit Task 2 with a known transient typecheck error noted, OR fold Task 4's Step 3 into this commit. Recommended: **fold** — do Task 4 Step 3 here so the tree stays green.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/investment.ts src/shared/types/ipc.ts src/main/ipc/channels.ts
git commit -m "feat(investment): types + IPC channels for the quote feed"
```

---

## Task 3: Quote provider (network client)

**Files:**

- Create: `src/main/investment/quoteProvider.ts`
- Test: `tests/unit/investment/quoteProvider.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/unit/investment/quoteProvider.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveSymbol, fetchLatestQuote } from '../../../src/main/investment/quoteProvider';

const SEARCH = [
  {
    description: 'ISHARES CORE MSCI WORLD',
    isin: 'IE00B4L5Y983',
    markets: [
      { currency: 'USD', exchange: 'XLON', symbol: 'IWDA.L' },
      { currency: 'EUR', exchange: 'XAMS', symbol: 'IWDA.AS' },
      { currency: 'EUR', exchange: 'XETR', symbol: 'EUNL.DE' },
    ],
    provider: 'PP',
    type: 'ETP',
  },
];

const CHART = {
  chart: {
    result: [
      {
        meta: {
          currency: 'EUR',
          symbol: 'EUNL.DE',
          regularMarketPrice: 124.27,
          regularMarketTime: 1781537751,
        },
      },
    ],
    error: null,
  },
};

function mockFetch(body: unknown, ok = true): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response)),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('resolveSymbol', () => {
  it('prefers the XETR EUR market', async () => {
    mockFetch(SEARCH);
    expect(await resolveSymbol('IE00B4L5Y983')).toBe('EUNL.DE');
  });

  it('falls back to the first EUR market when no XETR', async () => {
    mockFetch([
      {
        isin: 'X',
        markets: [
          { currency: 'USD', exchange: 'XLON', symbol: 'A.L' },
          { currency: 'EUR', exchange: 'XAMS', symbol: 'B.AS' },
        ],
      },
    ]);
    expect(await resolveSymbol('X')).toBe('B.AS');
  });

  it('returns null when there is no EUR market', async () => {
    mockFetch([{ isin: 'X', markets: [{ currency: 'USD', exchange: 'XLON', symbol: 'A.L' }] }]);
    expect(await resolveSymbol('X')).toBeNull();
  });

  it('returns null on a non-ok response', async () => {
    mockFetch(SEARCH, false);
    expect(await resolveSymbol('IE00B4L5Y983')).toBeNull();
  });
});

describe('fetchLatestQuote', () => {
  it('returns price + asOf date from regularMarketTime', async () => {
    mockFetch(CHART);
    const q = await fetchLatestQuote('EUNL.DE');
    expect(q).toEqual({ price: 124.27, asOf: '2026-06-15' });
  });

  it('returns null when currency is not EUR', async () => {
    mockFetch({
      chart: {
        result: [
          { meta: { currency: 'USD', regularMarketPrice: 100, regularMarketTime: 1781537751 } },
        ],
        error: null,
      },
    });
    expect(await fetchLatestQuote('IWDA.L')).toBeNull();
  });

  it('returns null on a chart error', async () => {
    mockFetch({ chart: { result: null, error: { code: 'Not Found' } } });
    expect(await fetchLatestQuote('NOPE')).toBeNull();
  });
});
```

> The epoch `1781537751` → `2026-06-15` (UTC). If your local check shows a different date, recompute `new Date(1781537751 * 1000).toISOString().slice(0,10)` and use that value in the assertion.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/investment/quoteProvider.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the provider**

`src/main/investment/quoteProvider.ts`:

```ts
const SEARCH_URL = 'https://api.portfolio-performance.info/v1/search';
const QUOTE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
const TIMEOUT_MS = 15_000;
// A browser-like UA: Yahoo rejects some non-browser agents. Only the UA + IP leave the machine.
const UA = 'Mozilla/5.0 (finance-dashboard; opt-in price feed)';

async function getJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': UA } });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null; // offline, timeout, abort, malformed — caller treats null as failure
  } finally {
    clearTimeout(timer);
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** ISIN → EUR exchange ticker (prefer XETR), or null when unresolvable. */
export async function resolveSymbol(isin: string): Promise<string | null> {
  const body = await getJson(`${SEARCH_URL}?q=${encodeURIComponent(isin)}`);
  if (!Array.isArray(body)) return null;
  const hit = body.find((h): h is Record<string, unknown> => isRecord(h) && h.isin === isin);
  if (hit === undefined || !Array.isArray(hit.markets)) return null;
  const eur = hit.markets.filter(
    (m): m is { currency: string; exchange: string; symbol: string } =>
      isRecord(m) &&
      m.currency === 'EUR' &&
      typeof m.symbol === 'string' &&
      typeof m.exchange === 'string',
  );
  if (eur.length === 0) return null;
  const xetr = eur.find((m) => m.exchange === 'XETR');
  return (xetr ?? eur[0])?.symbol ?? null;
}

/** Latest EUR quote for a ticker, or null on any failure / non-EUR currency. */
export async function fetchLatestQuote(
  symbol: string,
): Promise<{ price: number; asOf: string } | null> {
  const body = await getJson(`${QUOTE_URL}/${encodeURIComponent(symbol)}?range=5d&interval=1d`);
  if (!isRecord(body)) return null;
  const chart = body.chart;
  if (!isRecord(chart) || !Array.isArray(chart.result)) return null;
  const first = chart.result[0];
  if (!isRecord(first) || !isRecord(first.meta)) return null;
  const meta = first.meta;
  if (meta.currency !== 'EUR') return null;
  if (typeof meta.regularMarketPrice !== 'number' || typeof meta.regularMarketTime !== 'number')
    return null;
  const asOf = new Date(meta.regularMarketTime * 1000).toISOString().slice(0, 10);
  return { price: meta.regularMarketPrice, asOf };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/investment/quoteProvider.test.ts`
Expected: PASS (all 7).

- [ ] **Step 5: Lint + commit**

```bash
npm run lint -- src/main/investment/quoteProvider.ts
git add src/main/investment/quoteProvider.ts tests/unit/investment/quoteProvider.test.ts
git commit -m "feat(investment): quote provider (ISIN→ticker, ticker→EUR price)"
```

---

## Task 4: Repo helpers + `currentValueSource`

**Files:**

- Modify: `src/main/investment/investmentRepo.ts`
- Test: `tests/unit/investment/quoteValuation.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/unit/investment/quoteValuation.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import {
  createWrapper,
  createSupport,
  listSupportRows,
  getSupportHistory,
} from '../../../src/main/investment/investmentRepo';
import {
  setQuoteSymbol,
  writeQuoteValuation,
  listQuotableSupports,
} from '../../../src/main/investment/investmentRepo';

function seedSupport(db: DatabaseSync): string {
  const w = createWrapper(db, { name: 'PEA', type: 'pea' });
  const s = createSupport(db, {
    wrapperId: w.id,
    name: 'World',
    isin: 'IE00B4L5Y983',
    classId: null,
  });
  // two buys → 3 shares
  db.prepare(
    "INSERT INTO support_operations (id, support_id, op_date, kind, quantity, net, raw_label, op_hash, source) VALUES (?,?,?,?,?,?,?,?,'fortuneo_csv')",
  ).run('op1', s.id, '2026-01-10', 'buy', 2, -200, 'WORLD', 'h1');
  db.prepare(
    "INSERT INTO support_operations (id, support_id, op_date, kind, quantity, net, raw_label, op_hash, source) VALUES (?,?,?,?,?,?,?,?,'fortuneo_csv')",
  ).run('op2', s.id, '2026-02-10', 'buy', 1, -110, 'WORLD', 'h2');
  return s.id;
}

let db: DatabaseSync;
beforeEach(() => {
  db = new DatabaseSync(':memory:');
  runMigrations(db);
});

describe('listQuotableSupports', () => {
  it('lists supports with an ISIN and positive net shares', () => {
    const id = seedSupport(db);
    const q = listQuotableSupports(db);
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ id, isin: 'IE00B4L5Y983', quoteSymbol: null, shares: 3 });
  });
});

describe('writeQuoteValuation', () => {
  it('inserts a quote valuation and upserts on the same date', () => {
    const id = seedSupport(db);
    expect(writeQuoteValuation(db, id, '2026-06-15', 372)).toBe('written');
    expect(writeQuoteValuation(db, id, '2026-06-15', 375)).toBe('written'); // upsert
    const vals = getSupportHistory(db, id).valuations.filter((v) => v.source === 'quote');
    expect(vals).toHaveLength(1);
    expect(vals[0]?.value).toBe(375);
  });

  it('skips when a declared value already covers that date', () => {
    const id = seedSupport(db);
    db.prepare(
      "INSERT INTO support_valuations (id, support_id, as_of, value, source) VALUES (?,?,?,?,'declared')",
    ).run('dv', id, '2026-06-15', 999);
    expect(writeQuoteValuation(db, id, '2026-06-15', 372)).toBe('skipped_declared');
    const quotes = getSupportHistory(db, id).valuations.filter((v) => v.source === 'quote');
    expect(quotes).toHaveLength(0);
  });
});

describe('setQuoteSymbol + currentValueSource', () => {
  it('caches the symbol and exposes the latest valuation source', () => {
    const id = seedSupport(db);
    setQuoteSymbol(db, id, 'EUNL.DE');
    writeQuoteValuation(db, id, '2026-06-15', 372);
    const support = listSupportRows(db).find((s) => s.id === id);
    expect(support?.currentValue).toBe(372);
    expect(support?.currentValueSource).toBe('quote');
    expect(listQuotableSupports(db)[0]?.quoteSymbol).toBe('EUNL.DE');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/investment/quoteValuation.test.ts`
Expected: FAIL — `setQuoteSymbol`/`writeQuoteValuation`/`listQuotableSupports` not exported.

- [ ] **Step 3: Add `currentValueSource` to the support query + `toSupport`**

In `investmentRepo.ts`, add `current_value_source` to the `SupportRow` type (find the interface; add `current_value_source: string | null;`). Update `toSupport`:

```ts
function toSupport(r: SupportRow): SupportDTO {
  return {
    id: r.id,
    wrapperId: r.wrapper_id,
    name: r.name,
    isin: r.isin,
    classId: r.class_id,
    currency: r.currency,
    sortOrder: r.sort_order,
    currentValue: r.current_value,
    currentValueSource:
      r.current_value_source === 'auto' || r.current_value_source === 'quote'
        ? r.current_value_source
        : r.current_value_source === 'declared'
          ? 'declared'
          : null,
  };
}
```

In `listSupportRows`, add the source subquery to the `base` SELECT (alongside `current_value`):

```ts
const base = `SELECT s.id, s.wrapper_id, s.name, s.isin, s.class_id, s.currency, s.sort_order,
       COALESCE(
         (SELECT v.value FROM support_valuations v
          WHERE v.support_id = s.id
          ORDER BY v.as_of DESC, v.created_at DESC LIMIT 1),
         0
       ) AS current_value,
       (SELECT v.source FROM support_valuations v
        WHERE v.support_id = s.id
        ORDER BY v.as_of DESC, v.created_at DESC LIMIT 1) AS current_value_source
  FROM investment_supports s`;
```

Also update the `createSupport` SELECT (the single-row query after INSERT) to return `current_value_source` so its `toSupport` mapping compiles — add the same subquery line and ensure `SupportRow` covers it. (The created support has no valuation yet → `current_value_source` is `null` → `currentValueSource: null`.)

- [ ] **Step 4: Add the three repo helpers**

Append to `investmentRepo.ts` (import `randomUUID` from `node:crypto` is already at top; verify):

```ts
/** Supports eligible for an auto quote: have an ISIN and a positive net share count. */
export function listQuotableSupports(db: DatabaseSync): QuotableSupport[] {
  const rows = db
    .prepare(
      `SELECT s.id, s.isin, s.quote_symbol AS quoteSymbol,
              (SELECT COALESCE(SUM(CASE WHEN o.kind = 'buy' THEN o.quantity ELSE -o.quantity END), 0)
               FROM support_operations o WHERE o.support_id = s.id) AS shares
       FROM investment_supports s
       WHERE s.isin IS NOT NULL`,
    )
    .all() as unknown as { id: string; isin: string; quoteSymbol: string | null; shares: number }[];
  return rows.filter((r) => r.shares > 1e-6);
}

/** Cache the resolved EUR ticker and mark the support as quoted. */
export function setQuoteSymbol(db: DatabaseSync, supportId: string, symbol: string): void {
  db.prepare(
    "UPDATE investment_supports SET quote_symbol = ?, valuation_mode = 'quoted' WHERE id = ?",
  ).run(symbol, supportId);
}

/** Upsert one 'quote' valuation per (support, date). A same-date declared value is never shadowed. */
export function writeQuoteValuation(
  db: DatabaseSync,
  supportId: string,
  asOf: string,
  value: number,
): 'written' | 'skipped_declared' {
  const declared = db
    .prepare(
      "SELECT 1 FROM support_valuations WHERE support_id = ? AND as_of = ? AND source = 'declared' LIMIT 1",
    )
    .get(supportId, asOf);
  if (declared !== undefined) return 'skipped_declared';
  const existing = db
    .prepare(
      "SELECT id FROM support_valuations WHERE support_id = ? AND as_of = ? AND source = 'quote' LIMIT 1",
    )
    .get(supportId, asOf) as { id: string } | undefined;
  if (existing !== undefined) {
    db.prepare('UPDATE support_valuations SET value = ? WHERE id = ?').run(value, existing.id);
  } else {
    db.prepare(
      "INSERT INTO support_valuations (id, support_id, as_of, value, source) VALUES (?, ?, ?, ?, 'quote')",
    ).run(randomUUID(), supportId, asOf, value);
  }
  return 'written';
}
```

Add `QuotableSupport` to the `import type { … } from '@shared/types/investment';` block in `investmentRepo.ts`.

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run tests/unit/investment/quoteValuation.test.ts`
Expected: PASS.
Run: `npm run typecheck`
Expected: clean (the `currentValueSource` field now flows through).

- [ ] **Step 6: Commit**

```bash
git add src/main/investment/investmentRepo.ts tests/unit/investment/quoteValuation.test.ts src/shared/types/investment.ts
git commit -m "feat(investment): repo helpers for quote valuations + currentValueSource"
```

---

## Task 5: Quote settings state

**Files:**

- Create: `src/main/investment/quoteState.ts`
- Test: `tests/unit/investment/quoteState.test.ts`

- [ ] **Step 1: Write failing test**

`tests/unit/investment/quoteState.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

const db = new DatabaseSync(':memory:');
vi.mock('../../../src/main/db', () => ({ getDb: () => db }));

import {
  getQuotesEnabled,
  setQuotesEnabled,
  getLastQuoteRefreshAt,
  setLastQuoteRefreshAt,
} from '../../../src/main/investment/quoteState';

beforeEach(() => {
  runMigrations(db);
  db.exec("DELETE FROM app_settings WHERE key LIKE 'quotes.%'");
});

describe('quoteState', () => {
  it('defaults to disabled with no timestamp', () => {
    expect(getQuotesEnabled()).toBe(false);
    expect(getLastQuoteRefreshAt()).toBeNull();
  });

  it('round-trips the enabled flag and timestamp', () => {
    setQuotesEnabled(true);
    expect(getQuotesEnabled()).toBe(true);
    setLastQuoteRefreshAt('2026-06-15T10:00:00.000Z');
    expect(getLastQuoteRefreshAt()).toBe('2026-06-15T10:00:00.000Z');
    setQuotesEnabled(false);
    expect(getQuotesEnabled()).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/investment/quoteState.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement (mirror `src/main/sync/state.ts`)**

`src/main/investment/quoteState.ts`:

```ts
import { getDb } from '../db';

const KEYS = {
  enabled: 'quotes.enabled',
  lastRefreshAt: 'quotes.lastRefreshAt',
} as const;

function read(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

function write(key: string, value: string): void {
  getDb()
    .prepare(
      'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    )
    .run(key, value);
}

export function getQuotesEnabled(): boolean {
  return read(KEYS.enabled) === '1';
}

export function setQuotesEnabled(enabled: boolean): void {
  write(KEYS.enabled, enabled ? '1' : '0');
}

export function getLastQuoteRefreshAt(): string | null {
  return read(KEYS.lastRefreshAt);
}

export function setLastQuoteRefreshAt(iso: string): void {
  write(KEYS.lastRefreshAt, iso);
}
```

- [ ] **Step 4: Run + commit**

Run: `npx vitest run tests/unit/investment/quoteState.test.ts` → PASS.

```bash
git add src/main/investment/quoteState.ts tests/unit/investment/quoteState.test.ts
git commit -m "feat(investment): opt-in quote settings state"
```

---

## Task 6: Refresh orchestrator

**Files:**

- Create: `src/main/investment/refreshQuotes.ts`
- Test: `tests/integration/investment/refreshQuotes.test.ts`

- [ ] **Step 1: Write failing integration test**

`tests/integration/investment/refreshQuotes.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/integration/investment/refreshQuotes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the orchestrator**

`src/main/investment/refreshQuotes.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/integration/investment/refreshQuotes.test.ts`
Expected: PASS (all 5). If `372.81` mismatches, recompute `round2(3 * 124.27)` and adjust.

- [ ] **Step 5: Commit**

```bash
git add src/main/investment/refreshQuotes.ts tests/integration/investment/refreshQuotes.test.ts
git commit -m "feat(investment): refresh orchestrator over quotable supports"
```

---

## Task 7: IPC handlers + registration

**Files:**

- Modify: `src/main/ipc/handlers/investment.ts`
- Modify: `src/main/ipc/register.ts`

- [ ] **Step 1: Add handlers**

In `src/main/ipc/handlers/investment.ts`, add imports:

```ts
import type { QuoteSettings, RefreshResult } from '@shared/types/investment';
import {
  getQuotesEnabled,
  setQuotesEnabled,
  getLastQuoteRefreshAt,
} from '../../investment/quoteState';
import { refreshAllQuotes } from '../../investment/refreshQuotes';
```

Append the handlers:

```ts
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
```

- [ ] **Step 2: Register the channels**

In `src/main/ipc/register.ts`, add the three handlers to the import block from `./handlers/investment` and register them after `investmentListOperations`:

```ts
register(CHANNELS.investmentGetQuoteSettings, () => handleInvestmentGetQuoteSettings());
register(CHANNELS.investmentSetQuotesEnabled, handleInvestmentSetQuotesEnabled);
register(CHANNELS.investmentRefreshQuotes, () => handleInvestmentRefreshQuotes());
```

- [ ] **Step 3: Typecheck + full test run**

Run: `npm run typecheck` → clean.
Run: `npx vitest run tests/unit/investment tests/integration/investment` → all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc/handlers/investment.ts src/main/ipc/register.ts
git commit -m "feat(investment): IPC handlers for quote settings + refresh"
```

---

## Task 8: Performance regression guard (quote drives TRI/TTWROR)

**Files:**

- Test: `tests/unit/investment/performance.test.ts` (existing file — add a case; if it doesn't exist, create it)

- [ ] **Step 1: Add a test that a 'quote' valuation is treated as real**

Add to the existing performance test file (find it: `grep -rl computePerformance tests`):

```ts
it('treats a quote valuation as a real valuation (drives TTWROR, not excluded like auto)', () => {
  const perf = computePerformance(
    [
      { date: '2025-06-15', value: 1000, source: 'quote' },
      { date: '2026-06-15', value: 1200, source: 'quote' },
    ],
    [{ date: '2025-06-15', amount: 1000 }],
  );
  expect(perf.ttworrCumulative).not.toBeNull();
  expect(perf.currentValue).toBe(1200);
});
```

- [ ] **Step 2: Run**

Run: `npx vitest run tests/unit/investment/performance.test.ts`
Expected: PASS with no production change — the `source !== 'auto'` filter already includes `'quote'`. If it fails, the filter in `performance.ts` line ~119 must be `v.source !== 'auto'` (not `v.source === 'declared'`); fix it to `!== 'auto'`.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/investment/performance.test.ts
git commit -m "test(investment): quote valuations drive TRI/TTWROR"
```

---

## Task 9: Renderer hook — quote methods + on-mount auto-refresh

**Files:**

- Modify: `src/renderer/hooks/usePlacements.ts`

- [ ] **Step 1: Add quote methods + auto-refresh effect**

In `usePlacements.ts`, add to the returned API:

```ts
const getQuoteSettings = useCallback(() => ipc.invoke('investment:getQuoteSettings', {}), []);

const setQuotesEnabled = useCallback(async (enabled: boolean) => {
  await ipc.invoke('investment:setQuotesEnabled', { enabled });
}, []);

const refreshQuotes = useCallback(async () => {
  const r = await ipc.invoke('investment:refreshQuotes', {});
  reload();
  return r.result;
}, [reload]);
```

Add a one-shot non-blocking auto-refresh effect (after the existing load effect):

```ts
// On mount, if the feed is enabled, refresh quotes in the background and reload when done.
// Never blocks the initial render (the list already shows DB values).
useEffect(() => {
  let alive = true;
  void ipc.invoke('investment:getQuoteSettings', {}).then((s) => {
    if (!alive || !s.enabled) return;
    void ipc.invoke('investment:refreshQuotes', {}).then(() => {
      if (alive) reload();
    });
  });
  return () => {
    alive = false;
  };
}, [reload]);
```

Add `getQuoteSettings`, `setQuotesEnabled`, `refreshQuotes` to the hook's returned object.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` → clean.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/hooks/usePlacements.ts
git commit -m "feat(investment): renderer quote methods + on-mount auto-refresh"
```

---

## Task 10: Renderer — refresh button, timestamp, "cours auto" marker

**Files:**

- Modify: `src/renderer/components/patrimoine/PlacementsCard.tsx`
- Test: `tests/unit/renderer/PlacementsCard.test.tsx` (existing — extend)

- [ ] **Step 1: Add the refresh affordance + marker**

In `PlacementsCard.tsx`:

- Pull `getQuoteSettings`, `refreshQuotes` from `usePlacements` (already threaded as props or via the hook — match how the card currently receives placement actions).
- Local state: `const [quoteSettings, setQuoteSettings] = useState<QuoteSettings | null>(null);` and `const [refreshing, setRefreshing] = useState(false);`. Load settings on mount via `getQuoteSettings().then(setQuoteSettings)`.
- When `quoteSettings?.enabled`, render in the card header a button:

```tsx
<Button
  variant="ghost"
  size="sm"
  disabled={refreshing}
  onClick={() => {
    setRefreshing(true);
    void refreshQuotes()
      .then(() => getQuoteSettings().then(setQuoteSettings))
      .finally(() => setRefreshing(false));
  }}
>
  <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', refreshing && 'animate-spin')} />
  Rafraîchir les cours
</Button>
```

- Under it, a muted line: `Dernière mise à jour {formatTs(quoteSettings.lastRefreshAt)}` (reuse the `formatTs` pattern from `SyncSettingsSection.tsx` — `date-fns` `format` with `fr` locale, "—" when null).
- On each support row whose `support.currentValueSource === 'quote'`, render a small muted "cours auto" chip next to the value (use the existing `Chip` primitive or a `<span className="text-[10px] uppercase tracking-wide text-paper-dim">cours auto</span>`).

Import `RefreshCw` from `lucide-react` and `QuoteSettings` from `@shared/types/investment`.

- [ ] **Step 2: Extend the renderer test**

In `tests/unit/renderer/PlacementsCard.test.tsx`, the existing fixtures build `SupportWithPerf` literals. Add `currentValueSource: 'declared'` (or `null`) to each fixture so they compile, and add one test asserting the "cours auto" marker appears when `currentValueSource: 'quote'`:

```tsx
it('marks a quoted support with "cours auto"', () => {
  // build a wrapper whose support has currentValueSource: 'quote' and quoteSettings enabled,
  // render, and assert screen.getByText(/cours auto/i) is present.
});
```

Mock `ipc.invoke('investment:getQuoteSettings', …)` to resolve `{ enabled: true, lastRefreshAt: null }` (follow the existing ipc mock in the test file).

- [ ] **Step 3: Run + typecheck**

Run: `npx vitest run tests/unit/renderer/PlacementsCard.test.tsx` → PASS.
Run: `npm run typecheck` → clean.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/patrimoine/PlacementsCard.tsx tests/unit/renderer/PlacementsCard.test.tsx
git commit -m "feat(investment): refresh button + cours auto marker on placements"
```

---

## Task 11: Settings section (opt-in toggle)

**Files:**

- Create: `src/renderer/components/patrimoine/QuoteSettingsSection.tsx`
- Modify: `src/renderer/pages/SettingsPage.tsx`

- [ ] **Step 1: Build the section (mirror `SyncSettingsSection.tsx`)**

`src/renderer/components/patrimoine/QuoteSettingsSection.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { QuoteSettings } from '@shared/types/investment';
import { ipc } from '../../ipc/client';

interface RowProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
}

function formatTs(iso: string | null): string {
  if (iso === null) return '—';
  return format(new Date(iso), "d MMM yyyy 'à' HH:mm", { locale: fr });
}

export function QuoteSettingsSection({ Row }: { Row: (p: RowProps) => React.ReactNode }) {
  const [settings, setSettings] = useState<QuoteSettings | null>(null);

  useEffect(() => {
    void ipc.invoke('investment:getQuoteSettings', {}).then(setSettings);
  }, []);

  async function toggle(enabled: boolean) {
    await ipc.invoke('investment:setQuotesEnabled', { enabled });
    setSettings((s) => (s === null ? s : { ...s, enabled }));
    toast.success(enabled ? 'Cours de marché activés' : 'Cours de marché désactivés');
  }

  const enabled = settings?.enabled ?? false;

  return (
    <>
      <Row
        label="Cours de marché (opt-in)"
        hint="Désactivé par défaut. Aucun appel réseau tant que c'est éteint."
      >
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => void toggle(!enabled)}
          className={/* reuse the toggle classes from SyncSettingsSection */ ''}
        >
          {enabled ? 'Activé' : 'Désactivé'}
        </button>
      </Row>
      <p className="px-1 text-[12px] leading-relaxed text-paper-dim">
        Quand c'est activé, l'application interroge <strong>portfolio-performance.info</strong>{' '}
        (résolution ISIN → ticker) puis <strong>Yahoo Finance</strong> (dernier cours) pour
        valoriser tes supports cotés. Seul l'identifiant de l'instrument (ISIN puis ticker) est
        transmis — <strong>jamais</strong> de montant, de quantité ni de nom de compte. La
        valorisation se rafraîchit à l'ouverture et via le bouton « Rafraîchir les cours ». Une
        valeur que tu déclares toi-même reste prioritaire.
      </p>
      {enabled ? (
        <Row label="Dernière mise à jour">{formatTs(settings?.lastRefreshAt ?? null)}</Row>
      ) : null}
    </>
  );
}
```

> Copy the actual toggle/switch markup + classes from `SyncSettingsSection.tsx` so it matches the design exactly. Keep French sentence case, no exclamation marks, Lucide only.

- [ ] **Step 2: Mount it in `SettingsPage.tsx`**

Add an import and a new section. The feed is **not** 100% local, so give it its own section (don't bury it under "Données & Sauvegarde — 100% local"):

```tsx
import { QuoteSettingsSection } from '../components/patrimoine/QuoteSettingsSection';
import { LineChart } from 'lucide-react';
```

```tsx
function QuotesSection() {
  return (
    <Section icon={LineChart} overline="— Opt-in" title="Cours de marché">
      <QuoteSettingsSection Row={Row} />
    </Section>
  );
}
```

Render `<QuotesSection />` in the page body alongside the others (e.g. after `<SyncSection />`).

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck` → clean.
Run: `npm run lint` → clean.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/patrimoine/QuoteSettingsSection.tsx src/renderer/pages/SettingsPage.tsx
git commit -m "feat(investment): opt-in market-price settings section"
```

---

## Task 12: Docs — ADR-018 addendum + README/privacy copy

**Files:**

- Modify: `docs/adr/018-network-policy-price-feed.md`
- Modify: `README.md`

- [ ] **Step 1: Append the ADR-018 addendum**

Add at the end of `docs/adr/018-network-policy-price-feed.md`:

```markdown
## Addendum (2026-06-15) — finalised providers (Phase B build)

Phase B is built. The provider choice §5 deferred to build time is now fixed:

- **ISIN → EUR ticker:** `GET https://api.portfolio-performance.info/v1/search?q={ISIN}` (keyless),
  picking the EUR market (prefer XETR). Verified live from the maintainer's machine 2026-06-15.
- **Ticker → latest price:** `GET https://query1.finance.yahoo.com/v8/finance/chart/{ticker}` (keyless),
  EUR only. Verified live (HTTP 200, EUR price) 2026-06-15.
- The originally-illustrative `api.portfolio-report.net` host is **dead** (no response from two
  networks) and is **not used**. Yahoo is the de-facto primary quote source because it is the only
  reachable keyless option; Portfolio Report stays a documented future fallback.

Each call sends only an instrument identifier (ISIN, then ticker) plus the unavoidable IP/User-Agent.
No balances, quantities, account names, or amounts transit. The feed stays opt-in and off by default;
when off, zero financial-adjacent traffic leaves the machine.
```

- [ ] **Step 2: Update the README privacy copy**

Find the README section that states the "100% local / privé par défaut" promise and the allowed outbound calls. Add the price feed alongside the version check:

```markdown
- An **opt-in, off-by-default market-price feed** (investment Phase B): when you enable it, the app
  fetches public quotes by ISIN/ticker to value your securities. It transmits **only** the
  instrument identifier — never balances, amounts, quantities, or account names — and only for
  holdings you chose to value online. Off by default; the app is fully functional offline on
  declared values. See ADR-018.
```

- [ ] **Step 3: Commit**

```bash
git add docs/adr/018-network-policy-price-feed.md README.md
git commit -m "docs: ADR-018 finalised providers + README price-feed disclosure"
```

---

## Final verification (before opening the PR)

- [ ] `npm run lint` clean.
- [ ] `npm run typecheck` clean.
- [ ] `npx vitest run` — full unit + integration suite green.
- [ ] `npm run build` succeeds.
- [ ] Manual (maintainer, in-app) per the spec's validation script: feed OFF behaves as today; enabling shows the disclosure; setting an ISIN + refresh on an open MSCI World support shows `≈ shares × ~124 €` labelled "cours auto" with a timestamp and a TRI; declaring an exact value overrides the quote and a re-refresh does not overwrite it; turning the feed OFF stops calls.

## Self-review notes (coverage check)

- Spec "verified provider chain" → Tasks 3, 12. ISIN→ticker + EUR enforcement → Task 3.
- Spec "migration 028 / quote_symbol / source 'quote'" → Tasks 1, 2, 4.
- Spec "value = shares × price, ≤1/day upsert, declared wins same-day" → Tasks 4, 6.
- Spec "quote drives TRI + TTWROR" → Task 8.
- Spec "opt-in OFF, main-only, never call when off" → Tasks 5, 7.
- Spec "auto-refresh on open (non-blocking) + manual button + timestamp" → Tasks 9, 10.
- Spec "north-star: cours auto label, declared wins" → Tasks 4, 10.
- Spec "settings states exactly what is sent" → Task 11.
- Spec "README + ADR-018 addendum same PR" → Task 12.
