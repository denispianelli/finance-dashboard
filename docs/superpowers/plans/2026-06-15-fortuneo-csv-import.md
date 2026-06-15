# Fortuneo bourse-CSV import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import a Fortuneo "Historique des opérations bourse" CSV → auto-create the wrapper's
supports + every buy/sell flow + share counts, idempotently. Removes manual flow entry; valuations
stay declared (or Phase B feed).

**Architecture:** A pure parser (`parseBourseCsv`) → `ParsedOp[]`; an import step
(`importBourseCsv`) that resolves/creates supports (by `import_label`), dedups by `op_hash`, and
writes `support_operations` + derived `support_flows` (+ opening/closing 0-valuations). The perf
math is unchanged except one tweak (opening-date-flow exclusion only when opening value ≠ 0).

**Tech Stack:** Electron + `node:sqlite`, TS strict, Vitest 4, React + shadcn/ui, Playwright-Electron.

**Spec:** `docs/superpowers/specs/2026-06-15-fortuneo-csv-import-design.md`. **ADR:** ADR-009 Amd 3.

**Conventions (CLAUDE.md):** TS strict, **no `!` non-null assertions**, `noUncheckedIndexedAccess`;
rows `as unknown as Row[]`; money via `lib/euro`/`<Money>`; modals `ui/dialog`; mutating IPC tagged;
a unit test importing a handler that pulls `electron` must `vi.mock('electron', …)`; branch+PR,
self-merge once green, UI validated in-app before merge. Real CSV → `spike-fixtures/` (gitignored);
tests use synthetic CSVs.

---

## File Structure

- Create `src/main/db/migrations/026_investment_operations.sql`; register in `migrate.ts`.
- Modify `src/shared/types/investment.ts` (operation + import types).
- Create `src/main/investment/parseBourseCsv.ts` (pure) + `importBourseCsv.ts` (persistence).
- Modify `src/main/investment/performance.ts` (opening-flow tweak) + its test.
- Modify `src/main/investment/investmentRepo.ts` (listOperations) — or add to importBourseCsv.
- IPC: `channels.ts`, `handlers/investment.ts`, `register.ts`, `src/shared/types/ipc.ts`.
- Renderer: `hooks/usePlacements.ts`; `components/patrimoine/ImportBourseDialog.tsx`;
  `PlacementsCard.tsx` (import button), `SupportDetailDialog.tsx` (operations table).
- Tests under `tests/unit/…`, `tests/integration/investment/…`, `tests/e2e/…`.

---

## Task 1: Migration 026 + types

**Files:** create `src/main/db/migrations/026_investment_operations.sql`; modify `migrate.ts`,
`src/shared/types/investment.ts`.

- [ ] **Step 1: Migration SQL** `026_investment_operations.sql`:

```sql
-- Imported brokerage operations (audit + shares + the source imported flows derive from).
CREATE TABLE support_operations (
  id          TEXT PRIMARY KEY,
  support_id  TEXT NOT NULL REFERENCES investment_supports(id) ON DELETE CASCADE,
  op_date     TEXT NOT NULL,
  kind        TEXT NOT NULL,                 -- 'buy' | 'sell'
  quantity    REAL NOT NULL,
  unit_price  REAL,
  gross       REAL,
  fees        REAL,
  net         REAL NOT NULL,                 -- signed: buy < 0, sell > 0
  currency    TEXT NOT NULL DEFAULT 'EUR',
  raw_label   TEXT NOT NULL,
  op_hash     TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'fortuneo_csv',
  imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_support_operations_hash ON support_operations(op_hash);

ALTER TABLE support_flows ADD COLUMN operation_id TEXT REFERENCES support_operations(id) ON DELETE CASCADE;
ALTER TABLE investment_supports ADD COLUMN import_label TEXT;
```

- [ ] **Step 2: Register** in `migrate.ts`: `import sql026 from './migrations/026_investment_operations.sql?raw';` after sql025, and `{ version: 26, sql: sql026 },` after version 25.

- [ ] **Step 3: Types** — append to `src/shared/types/investment.ts`:

```ts
export type OperationKind = 'buy' | 'sell';

/** One parsed CSV operation (before persistence). */
export interface ParsedOp {
  opDate: string; // ISO yyyy-mm-dd
  kind: OperationKind;
  quantity: number; // > 0
  unitPrice: number | null;
  gross: number | null;
  fees: number | null;
  net: number; // signed: buy < 0, sell > 0
  currency: string;
  rawLabel: string;
}

export interface SkippedRow {
  line: number; // 1-based line number in the file
  raw: string;
  reason: string;
}

export interface ParseBourseResult {
  ops: ParsedOp[];
  skipped: SkippedRow[];
}

/** A persisted operation (for the support detail audit table). */
export interface OperationDTO extends ParsedOp {
  id: string;
  supportId: string;
}

export interface ImportBourseResult {
  operationsImported: number;
  alreadyPresent: number;
  skippedRows: number;
  createdSupports: SupportDTO[];
  supportsTouched: number;
}
```

- [ ] **Step 4:** `npm run typecheck` clean. **Step 5:** commit `feat(investment): migration 026 operations + import types`.

---

## Task 2: `performance.ts` opening-flow tweak (TDD)

**Files:** modify `src/main/investment/performance.ts`; `tests/unit/investment/performance.test.ts`.

- [ ] **Step 1: Add a failing test** for the imported-from-zero case:

```ts
it('opening valuation of 0 ⇒ a same-date flow DOES count (imported-from-zero case)', () => {
  // First operation on day 0 from a fresh (0-value) support: the buy is a real contribution.
  const vals: DatedValue[] = [
    { date: '2023-01-01', value: 0 }, // opening sentinel
    { date: '2024-01-01', value: 1100 },
  ];
  const perf = computePerformance(vals, [{ date: '2023-01-01', amount: 1000 }]);
  expect(perf.netInvested).toBeCloseTo(1000, 6); // the day-0 buy counts (opening value is 0)
  expect(perf.absoluteGain).toBeCloseTo(100, 6);
  expect(perf.triAnnual).toBeCloseTo(0.1, 2);
});
```

Run → this FAILS today (the day-0 flow is excluded because the opening date matches, giving
netInvested 0 / gain 1100).

- [ ] **Step 2: Implement the tweak.** In `computePerformance`, the contributions filter currently
      excludes flows dated `> openingDate`. Change it to keep opening-date flows when the opening value
      is zero:

```ts
const openingIsZero = openingValue === 0;
const contributions =
  openingDate === null
    ? flows
    : flows.filter((f) => f.date > openingDate || (openingIsZero && f.date === openingDate));
```

(The existing manual test — opening 5000 with a same-day 5000 flow → still excluded because
`openingIsZero` is false.)

- [ ] **Step 3:** run `npx vitest run tests/unit/investment/performance.test.ts` → all PASS
      (old + new). **Step 4:** typecheck + lint. **Step 5:** commit
      `fix(investment): count opening-date flow when opening value is zero`.

---

## Task 3: `parseBourseCsv` (pure parser, TDD)

**Files:** create `src/main/investment/parseBourseCsv.ts`; `tests/unit/investment/parseBourseCsv.test.ts`.

- [ ] **Step 1: Failing test** (synthetic CSV string — NOT real data):

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { parseBourseCsv } from '../../../src/main/investment/parseBourseCsv';

const HEADER =
  "libellé;Opération;Place;Date;Qté;Prix d'éxé;Montant brut;Courtage/Prélèvement;Montant net;Devise;";
const csv = [
  HEADER,
  'WORLD ETF ACC;Achat Comptant;Euronext Paris;05/05/2026;96.0;5.72;-549.12;-2.74;-551.86;EUR;',
  'WORLD ETF ACC;Vente comptant;Euronext Paris;06/06/2026;10;6.00;60.00;-1.00;59.00;EUR;',
  'WORLD ETF ACC;Coupon;Euronext Paris;07/06/2026;0;0;0;0;1.23;EUR;', // unknown type → skipped
  '', // blank
].join('\r\n');

describe('parseBourseCsv', () => {
  it('parses buys/sells and skips unknown operation types', () => {
    const res = parseBourseCsv(csv);
    expect(res.ops).toHaveLength(2);
    const buy = res.ops[0];
    expect(buy?.kind).toBe('buy');
    expect(buy?.opDate).toBe('2026-05-05');
    expect(buy?.quantity).toBe(96);
    expect(buy?.net).toBeCloseTo(-551.86, 2);
    expect(buy?.rawLabel).toBe('WORLD ETF ACC');
    expect(res.ops[1]?.kind).toBe('sell');
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0]?.reason).toMatch(/type/i);
  });
});
```

- [ ] **Step 2: Implement** `parseBourseCsv(text: string): ParseBourseResult`:

```ts
import type {
  ParseBourseResult,
  ParsedOp,
  SkippedRow,
  OperationKind,
} from '@shared/types/investment';

const num = (s: string | undefined): number => {
  const n = Number((s ?? '').trim());
  return Number.isFinite(n) ? n : NaN;
};
const numOrNull = (s: string | undefined): number | null => {
  const n = num(s);
  return Number.isFinite(n) ? n : null;
};
function isoDate(ddmmyyyy: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(ddmmyyyy.trim());
  if (m === null) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}
function kindOf(op: string): OperationKind | null {
  const t = op.trim();
  if (t.startsWith('Achat')) return 'buy';
  if (t.startsWith('Vente')) return 'sell';
  return null;
}

export function parseBourseCsv(text: string): ParseBourseResult {
  const lines = text.split(/\r?\n/);
  const ops: ParsedOp[] = [];
  const skipped: SkippedRow[] = [];
  lines.forEach((line, i) => {
    if (i === 0) return; // header
    if (line.trim() === '') return; // blank
    const c = line.split(';');
    const kind = kindOf(c[1] ?? '');
    const opDate = isoDate(c[3] ?? '');
    const net = num(c[8]);
    if (kind === null) {
      skipped.push({
        line: i + 1,
        raw: line,
        reason: `type d'opération non géré: ${(c[1] ?? '').trim()}`,
      });
      return;
    }
    if (opDate === null || !Number.isFinite(net)) {
      skipped.push({ line: i + 1, raw: line, reason: 'date ou montant net illisible' });
      return;
    }
    ops.push({
      opDate,
      kind,
      quantity: Math.abs(num(c[4])) || 0,
      unitPrice: numOrNull(c[5]),
      gross: numOrNull(c[6]),
      fees: numOrNull(c[7]),
      net,
      currency: (c[9] ?? '').trim() || 'EUR',
      rawLabel: (c[0] ?? '').trim(),
    });
  });
  return { ops, skipped };
}
```

- [ ] **Step 3:** test PASS; typecheck + lint. **Step 4:** commit `feat(investment): Fortuneo bourse CSV parser`.

---

## Task 4: `importBourseCsv` (persistence + dedup, TDD integration)

**Files:** create `src/main/investment/importBourseCsv.ts`;
`tests/integration/investment/importBourse.test.ts`.

- [ ] **Step 1: Failing integration test** (in-memory DB; create a wrapper via the repo; import a
      parsed op list twice; assert idempotency + flows + opening/closing valuations):

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import {
  createWrapper,
  listSupportRows,
  getSupportHistory,
} from '../../../src/main/investment/investmentRepo';
import { importBourseCsv } from '../../../src/main/investment/importBourseCsv';
import type { ParsedOp } from '@shared/types/investment';

const ops: ParsedOp[] = [
  {
    opDate: '2024-01-01',
    kind: 'buy',
    quantity: 100,
    unitPrice: 5,
    gross: -500,
    fees: -2,
    net: -502,
    currency: 'EUR',
    rawLabel: 'WORLD ETF',
  },
  {
    opDate: '2024-06-01',
    kind: 'buy',
    quantity: 50,
    unitPrice: 6,
    gross: -300,
    fees: -2,
    net: -302,
    currency: 'EUR',
    rawLabel: 'WORLD ETF',
  },
  {
    opDate: '2024-09-01',
    kind: 'sell',
    quantity: 150,
    unitPrice: 7,
    gross: 1050,
    fees: -3,
    net: 1047,
    currency: 'EUR',
    rawLabel: 'WORLD ETF',
  },
];

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  return db;
}

describe('importBourseCsv', () => {
  it('creates a support, writes flows from operations, and is idempotent on re-import', () => {
    const db = freshDb();
    const w = createWrapper(db, { name: 'PEA', type: 'pea' });

    const r1 = importBourseCsv(db, w.id, ops);
    expect(r1.operationsImported).toBe(3);
    expect(r1.alreadyPresent).toBe(0);
    expect(r1.createdSupports).toHaveLength(1);

    const support = listSupportRows(db, w.id)[0];
    expect(support?.name).toBe('WORLD ETF');
    const hist = getSupportHistory(db, support?.id ?? '');
    // flows = −net of each op: +502, +302, −1047
    expect(hist.flows.map((f) => Math.round(f.amount))).toEqual([502, 302, -1047]);
    // closed (100+50−150 = 0 shares) ⇒ opening 0 at 2024-01-01 AND closing 0 at 2024-09-01
    expect(hist.valuations.find((v) => v.date === '2024-01-01')?.value).toBe(0);
    expect(hist.valuations.find((v) => v.date === '2024-09-01')?.value).toBe(0);

    // Re-import the same ops → nothing new.
    const r2 = importBourseCsv(db, w.id, ops);
    expect(r2.operationsImported).toBe(0);
    expect(r2.alreadyPresent).toBe(3);
  });
});
```

- [ ] **Step 2: Implement** `importBourseCsv(db, wrapperId, ops): ImportBourseResult`. Key logic:

```ts
import { randomUUID, createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { ParsedOp, ImportBourseResult, SupportDTO } from '@shared/types/investment';
import { listSupportRows } from './investmentRepo';

const opHash = (wrapperId: string, o: ParsedOp): string =>
  createHash('sha256')
    .update([wrapperId, o.rawLabel, o.opDate, o.kind, o.quantity, o.net].join('|'))
    .digest('hex');

export function importBourseCsv(
  db: DatabaseSync,
  wrapperId: string,
  ops: ParsedOp[],
): ImportBourseResult {
  db.exec('PRAGMA foreign_keys = ON');
  const created: SupportDTO[] = [];
  const touched = new Set<string>();
  let imported = 0;
  let already = 0;

  const findSupport = db.prepare(
    'SELECT id FROM investment_supports WHERE wrapper_id = ? AND import_label = ?',
  );
  const nextSort = db.prepare(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM investment_supports WHERE wrapper_id = ?',
  );
  const hashExists = db.prepare('SELECT 1 FROM support_operations WHERE op_hash = ?');

  for (const o of ops) {
    // resolve / create support by import_label
    let supportId = (findSupport.get(wrapperId, o.rawLabel) as { id: string } | undefined)?.id;
    if (supportId === undefined) {
      supportId = randomUUID();
      const sort = (nextSort.get(wrapperId) as { n: number } | undefined)?.n ?? 0;
      db.prepare(
        `INSERT INTO investment_supports (id, wrapper_id, name, isin, valuation_mode, class_id, currency, sort_order, import_label)
         VALUES (?, ?, ?, NULL, 'declared', NULL, ?, ?, ?)`,
      ).run(supportId, wrapperId, o.rawLabel, o.currency, sort, o.rawLabel);
      const dto = listSupportRows(db, wrapperId).find((s) => s.id === supportId);
      if (dto) created.push(dto);
    }
    touched.add(supportId);

    const hash = opHash(wrapperId, o);
    if (hashExists.get(hash) !== undefined) {
      already += 1;
      continue;
    }
    const opId = randomUUID();
    db.prepare(
      `INSERT INTO support_operations (id, support_id, op_date, kind, quantity, unit_price, gross, fees, net, currency, raw_label, op_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      opId,
      supportId,
      o.opDate,
      o.kind,
      o.quantity,
      o.unitPrice,
      o.gross,
      o.fees,
      o.net,
      o.currency,
      o.rawLabel,
      hash,
    );
    db.prepare(
      `INSERT INTO support_flows (id, support_id, flow_date, amount, note, operation_id)
       VALUES (?, ?, ?, ?, NULL, ?)`,
    ).run(randomUUID(), supportId, o.opDate, -o.net, opId);
    imported += 1;
  }

  // opening/closing 0-valuations per touched support
  for (const supportId of touched) ensureBoundaryValuations(db, supportId);

  return {
    operationsImported: imported,
    alreadyPresent: already,
    skippedRows: 0, // filled by the handler from the parse result
    createdSupports: created,
    supportsTouched: touched.size,
  };
}

function ensureBoundaryValuations(db: DatabaseSync, supportId: string): void {
  const agg = db
    .prepare(
      `SELECT MIN(op_date) AS first, MAX(op_date) AS last,
              SUM(CASE WHEN kind = 'buy' THEN quantity ELSE -quantity END) AS shares
       FROM support_operations WHERE support_id = ?`,
    )
    .get(supportId) as
    | { first: string | null; last: string | null; shares: number | null }
    | undefined;
  if (agg?.first == null) return;

  const hasAt = (d: string): boolean =>
    db
      .prepare('SELECT 1 FROM support_valuations WHERE support_id = ? AND as_of = ?')
      .get(supportId, d) !== undefined;
  const insert0 = (d: string): void => {
    if (hasAt(d)) return;
    db.prepare(
      'INSERT INTO support_valuations (id, support_id, as_of, value) VALUES (?, ?, ?, 0)',
    ).run(randomUUID(), supportId, d);
  };
  insert0(agg.first); // opening sentinel (value 0 before the first buy)
  if (agg.last != null && Math.abs(agg.shares ?? 0) < 1e-6) insert0(agg.last); // closed ⇒ final 0
}

export function listOperations(db: DatabaseSync, supportId: string) {
  return db
    .prepare(
      `SELECT id, support_id, op_date, kind, quantity, unit_price, gross, fees, net, currency, raw_label
       FROM support_operations WHERE support_id = ? ORDER BY op_date, imported_at`,
    )
    .all(supportId) as unknown as Record<string, unknown>[]; // map to OperationDTO (snake→camel)
}
```

Map `listOperations` rows to `OperationDTO[]` (snake→camel) — write the mapper explicitly with the
DTO type, no `any`.

- [ ] **Step 3:** test PASS (incl. re-import idempotency + boundary valuations); typecheck + lint.
      **Step 4:** commit `feat(investment): import Fortuneo operations into supports/flows`.

---

## Task 5: IPC

**Files:** `channels.ts`, `handlers/investment.ts`, `register.ts`, `src/shared/types/ipc.ts`;
test `tests/unit/ipc/investmentImport.test.ts`.

- [ ] **Step 1: Channels + contract** (mirror the patrimoine loan-file pattern):

| channel                      | payload                               | response                                                    | mutating |
| ---------------------------- | ------------------------------------- | ----------------------------------------------------------- | -------- |
| `investment:pickBourseCsv`   | `Record<string, never>`               | `{ cancelled: true } \| { cancelled: false; path: string }` | no       |
| `investment:importBourseCsv` | `{ path: string; wrapperId: string }` | `{ result: ImportBourseResult }`                            | **yes**  |
| `investment:listOperations`  | `{ supportId: string }`               | `{ operations: OperationDTO[] }`                            | no       |

- [ ] **Step 2: Handlers** in `handlers/investment.ts`:

```ts
import { readFileSync } from 'node:fs';
import { dialog } from 'electron';
import { parseBourseCsv } from '../../investment/parseBourseCsv';
import { importBourseCsv, listOperations } from '../../investment/importBourseCsv';

export async function handleInvestmentPickBourseCsv() {
  const r = await dialog.showOpenDialog({
    title: 'Sélectionner un relevé d’opérations (CSV)',
    properties: ['openFile'],
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  });
  if (r.canceled || r.filePaths.length === 0) return { cancelled: true as const };
  return { cancelled: false as const, path: r.filePaths[0] ?? '' };
}

export function handleInvestmentImportBourseCsv(payload: { path: string; wrapperId: string }) {
  const text = readFileSync(payload.path, 'latin1'); // Fortuneo CSV is ISO-8859-1
  const parsed = parseBourseCsv(text);
  const result = importBourseCsv(getDb(), payload.wrapperId, parsed.ops);
  return { result: { ...result, skippedRows: parsed.skipped.length } };
}

export function handleInvestmentListOperations(payload: { supportId: string }) {
  return { operations: listOperations(getDb(), payload.supportId) };
}
```

(`dialog` import means the IPC unit test MUST `vi.mock('electron', …)`.)

- [ ] **Step 3:** register (pick + listOperations as reads; importBourseCsv in the mutating set).
- [ ] **Step 4: Test** `tests/unit/ipc/investmentImport.test.ts` (mock electron + getDb): write a
      synthetic CSV to a temp file (`os.tmpdir()`), create a wrapper, call
      `handleInvestmentImportBourseCsv({ path, wrapperId })`, assert `result.operationsImported > 0` and
      `listOperations` returns rows.
- [ ] **Step 5:** typecheck + `npx vitest run tests/unit/ipc/`. **Step 6:** commit
      `feat(investment): IPC for Fortuneo CSV import`.

---

## Task 6: Renderer — import button, wrapper picker, review, operations table

**Files:** `hooks/usePlacements.ts`; create `components/patrimoine/ImportBourseDialog.tsx`;
modify `PlacementsCard.tsx`, `SupportDetailDialog.tsx`; test
`tests/unit/renderer/ImportBourseDialog.test.tsx`.

- [ ] **Step 1: Hook** — add to `usePlacements`: `pickBourseCsv()` →
      `ipc.invoke('investment:pickBourseCsv', {})`; `importBourseCsv(path, wrapperId)` →
      invoke then `reload()`, return the result; `listOperations(supportId)` → returns rows.

- [ ] **Step 2: `ImportBourseDialog`** (`ui/dialog`): triggered from PlacementsCard's
      "Importer un relevé (CSV)" button. Flow: call `pickBourseCsv()`; if a path comes back, show a
      **target-wrapper** selector (existing wrappers list + a "Nouvelle enveloppe" option with name +
      type) ; on confirm, call `importBourseCsv(path, wrapperId)` (creating the wrapper first if "new"),
      then display the **review summary** (« N importées · M ignorées · P déjà présentes · K supports »)
      and a "Fermer" that reloads. French copy, `ui/*` only, no banned patterns.

- [ ] **Step 3: PlacementsCard** — add an "Importer un relevé (CSV)" secondary button in the header
      (next to "Ajouter une enveloppe") wired to open the dialog (a new `onImport` prop).

- [ ] **Step 4: SupportDetailDialog** — add an **« Opérations »** table (date, type, qté, prix,
      frais, net via `<Money>`) loaded from `listOperations(support.id)`, above/below the existing
      valuations + flows tables.

- [ ] **Step 5: Render test** for `ImportBourseDialog` (jsdom + cleanup): given a stubbed
      `onImport` returning a fixture `ImportBourseResult`, assert the review summary text renders.

- [ ] **Step 6:** typecheck + lint + `npx vitest run tests/unit/renderer/` + drift grep clean.
      **Step 7:** commit `feat(investment): CSV import UI (dialog, review, operations table)`.

---

## Task 7: E2E + docs + gate

**Files:** create `tests/e2e/investment-import.test.ts`; modify `README.md`.

- [ ] **Step 1: E2E** (mirror `tests/e2e/investment-flow.test.ts`): write a synthetic Fortuneo CSV
      to a temp path; create a wrapper via IPC; call `investment:importBourseCsv` via `ipcInvoke`; assert
      the support appears on the Placements page and `listOperations` returns rows. Synthetic data only.
- [ ] **Step 2:** `xvfb-run -a npm run test:e2e -- investment-import`.
- [ ] **Step 3: README** — add a bullet: import a Fortuneo bourse CSV to auto-populate
      operations/flows/shares (100% local; valuations declared or Phase B feed).
- [ ] **Step 4: Full gate** — `npm run lint && npm run typecheck && npm test && npm run build`.
- [ ] **Step 5:** commit `test(investment): e2e for CSV import; document it`.

---

## Definition of done

Lint/tsc clean, unit + integration + E2E green, build OK, drift grep clean. **UI validated in-app
before merge** (visual brick): import your real Fortuneo CSV (kept in `spike-fixtures/`), verify the
created supports + flows match the file, that a closed line reads 0 and an open one prompts for its
current value, and that net worth/allocation update.

## Validation script (maintainer, in-app)

1. Placements → « Importer un relevé (CSV) » → choisis ton export Fortuneo → enveloppe « PEA ».
2. Vérifie le bandeau : N opérations importées (3 achats + 1 vente attendus), 0 ignorées.
3. Le support **S&P 500** (soldé) affiche une perf complète (valeur 0) ; le **World** te demande sa
   **valeur actuelle** → saisis-la → TRI/TTWROR apparaissent.
4. Ouvre le détail : la table **Opérations** liste tes lignes ; chaque flux = `−Montant net`.
5. Ré-importe le même fichier → « 0 importées · 4 déjà présentes », aucun doublon.
