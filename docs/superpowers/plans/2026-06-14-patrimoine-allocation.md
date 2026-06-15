# Patrimoine — Allocation by asset class — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the maintainer's net patrimoine split across user-defined asset classes, with a
target % per class and the gap to target, on the Patrimoine page.

**Architecture:** A new `asset_classes` table (CRUD + target) and a `class_id` foreign key on
`accounts`, `assets`, `loans` (`ON DELETE SET NULL`). A pure read-model `getAllocation(db)` sums
net-worth contributions per class and reconciles to the cent with `getNetWorth().total`. Typed
IPC exposes the read-model + class CRUD + holding assignment. The renderer gets an "Allocation"
card (donut by class via the existing `DonutCard`, per-class rows, class CRUD dialog, holding
assignment list).

**Tech Stack:** Electron + `node:sqlite` (DatabaseSync), TypeScript strict, Vitest 4
(`// @vitest-environment` per file + explicit `afterEach(cleanup)`), React + shadcn/ui +
Tailwind, Playwright-Electron E2E.

**Spec:** `docs/superpowers/specs/2026-06-14-patrimoine-allocation-design.md`.

**Conventions to honour (CLAUDE.md):**

- TS strict; `no-explicit-any`, `no-unsafe-*`, `noUncheckedIndexedAccess` are errors.
- SQLite rows read as `db.prepare(...).get/all() as unknown as Row[]`.
- Money is REAL euros; renderer formats via `lib/euro` / `<Money>` — never `Intl.NumberFormat`
  (lint-blocked). Modals use `components/ui/dialog` — never `fixed inset-0` (audit grep clean).
- Mutating IPC channels are tagged in the contract exactly like `patrimoine:detectPayments`.
- A unit test that imports a main IPC handler pulling in `electron` must
  `vi.mock('electron', () => ({ dialog: { showOpenDialog: vi.fn() } }));` (macOS CI flake — see
  `reference-mock-electron-in-unit-tests`).
- Branch + PR, self-merge once CI green. UI validated in-app by the maintainer before merge.

---

## File Structure

- **Create** `src/main/db/migrations/023_asset_classes.sql` — new table + `class_id` columns.
- **Modify** `src/main/db/migrate.ts` — register migration 023.
- **Modify** `src/shared/types/patrimoine.ts` — `AssetClass`, `UpsertAssetClassInput`,
  `AllocationSlice`, `Allocation`, `ClassifiableHolding`; widen `AssetDTO.kind` /
  `UpsertAssetInput.kind` to `string`.
- **Create** `src/main/patrimoine/assetClassRepo.ts` — class CRUD + `assignClass` + `listHoldings`.
- **Create** `src/main/patrimoine/allocation.ts` — `getAllocation(db)` read-model.
- **Modify** `src/main/patrimoine/assetRepo.ts` — return stored `kind`; expose `class_id`.
- **Modify** `src/main/ipc/channels.ts`, `src/main/ipc/handlers/patrimoine.ts`,
  `src/main/ipc/register.ts`, `src/shared/types/ipc.ts` — new channels.
- **Modify** `src/renderer/hooks/usePatrimoine.ts` — allocation/classes/holdings state + actions.
- **Create** `src/renderer/components/patrimoine/AllocationCard.tsx`,
  `ClassManagerDialog.tsx`, `HoldingAssignmentList.tsx`.
- **Modify** `src/renderer/pages/PatrimoinePage.tsx` — mount the Allocation card; turn the single
  PropertyCard into a declared-assets list with an "Ajouter un actif" flow.
- **Tests** under `tests/unit/...` and `tests/e2e/...`.

---

## Task 1: Migration 023 + shared types

**Files:**

- Create: `src/main/db/migrations/023_asset_classes.sql`
- Modify: `src/main/db/migrate.ts`
- Modify: `src/shared/types/patrimoine.ts`

- [ ] **Step 1: Write the migration SQL**

`src/main/db/migrations/023_asset_classes.sql`:

```sql
-- Asset classes for the allocation view (user-defined; no seed rows).
CREATE TABLE IF NOT EXISTS asset_classes (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL,
  target_pct  REAL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Tag every net-worth contributor with its class. ON DELETE SET NULL so removing
-- a class drops its holdings to the "Non classé" bucket rather than erroring.
ALTER TABLE accounts ADD COLUMN class_id TEXT REFERENCES asset_classes(id) ON DELETE SET NULL;
ALTER TABLE assets   ADD COLUMN class_id TEXT REFERENCES asset_classes(id) ON DELETE SET NULL;
ALTER TABLE loans    ADD COLUMN class_id TEXT REFERENCES asset_classes(id) ON DELETE SET NULL;
```

- [ ] **Step 2: Register the migration**

In `src/main/db/migrate.ts`, add the import after `sql022` and the entry after version 22:

```ts
import sql023 from './migrations/023_asset_classes.sql?raw';
```

```ts
  { version: 23, sql: sql023 },
```

(No `rebuildsTables` — these are additive `CREATE`/`ALTER ADD COLUMN`.)

- [ ] **Step 3: Add the shared types**

In `src/shared/types/patrimoine.ts`, widen the asset kind and append the allocation types:

```ts
// Replace the two `kind: 'property'` occurrences:
export interface AssetDTO {
  id: string;
  name: string;
  kind: string; // display label: 'property' | 'av' | 'pea' | 'autre' | …
  declaredValue: number;
  share: number;
  valuedAt: string;
  notes: string | null;
  classId: string | null;
}

export interface UpsertAssetInput {
  id?: string;
  name: string;
  kind: string;
  declaredValue: number;
  share: number;
  valuedAt: string;
  classId?: string | null;
}

export interface AssetClass {
  id: string;
  name: string;
  color: string;
  targetPct: number | null;
  sortOrder: number;
}

export interface UpsertAssetClassInput {
  id?: string;
  name: string;
  color: string;
  targetPct: number | null;
}

export interface AllocationSlice {
  classId: string | null; // null = « Non classé » bucket
  name: string;
  color: string;
  value: number; // euros, net of CRD for the class
  pct: number; // value / total (can be < 0)
  targetPct: number | null; // 0..1 or null
  gap: number | null; // pct − targetPct, null when no target
}

export interface Allocation {
  total: number; // reconciles with getNetWorth().total
  slices: AllocationSlice[]; // sorted by sortOrder, « Non classé » last
}

export interface ClassifiableHolding {
  id: string;
  kind: 'account' | 'asset' | 'loan';
  name: string;
  signedValue: number; // contribution to net worth (loans negative)
  classId: string | null;
}
```

- [ ] **Step 4: Typecheck + build the migration list**

Run: `npm run typecheck`
Expected: PASS (any `assetRepo`/handler breakage from the `kind`/`classId` change is fixed in
Task 4 — if it fails only there, proceed; otherwise fix the type error here).
Note: `assetRepo.toDto` must now return `classId` — see Task 4. If typecheck fails on
`assetRepo.ts` for the missing `classId`, do the minimal `assetRepo` read change here so the
build is green.

- [ ] **Step 5: Commit**

```bash
git add src/main/db/migrations/023_asset_classes.sql src/main/db/migrate.ts src/shared/types/patrimoine.ts
git commit -m "feat(patrimoine): migration 023 asset_classes + class_id + allocation types"
```

---

## Task 2: `assetClassRepo` — class CRUD, assignment, holdings list

**Files:**

- Create: `src/main/patrimoine/assetClassRepo.ts`
- Test: `tests/unit/patrimoine/assetClassRepo.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/patrimoine/assetClassRepo.test.ts` (mirror the existing patrimoine repo tests for
DB setup — open `tests/unit/patrimoine/loanRepo.test.ts` for the in-memory `DatabaseSync` +
`migrate` bootstrap and copy it):

```ts
// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import {
  listClasses,
  upsertClass,
  deleteClass,
  assignClass,
  listHoldings,
} from '../../../src/main/patrimoine/assetClassRepo';

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db); // use whatever the existing tests call to apply migrations
  return db;
}

describe('assetClassRepo', () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = freshDb();
  });

  it('creates, renames and lists classes by sort order', () => {
    const a = upsertClass(db, { name: 'Actions', color: '#D4B062', targetPct: 0.25 });
    upsertClass(db, { name: 'Immo', color: '#7C9A8E', targetPct: 0.55 });
    const renamed = upsertClass(db, {
      id: a.id,
      name: 'Actions monde',
      color: a.color,
      targetPct: 0.3,
    });
    expect(renamed.name).toBe('Actions monde');
    expect(renamed.targetPct).toBe(0.3);
    expect(listClasses(db).map((c) => c.name)).toContain('Immo');
  });

  it('assigns a holding and drops it to NULL when the class is deleted', () => {
    const c = upsertClass(db, { name: 'Cash', color: '#888888', targetPct: null });
    // a default account 'acc-lcl-default' exists from migration 003
    assignClass(db, { kind: 'account', id: 'acc-lcl-default', classId: c.id });
    expect(listHoldings(db).find((h) => h.id === 'acc-lcl-default')?.classId).toBe(c.id);
    deleteClass(db, c.id);
    expect(listHoldings(db).find((h) => h.id === 'acc-lcl-default')?.classId).toBeNull();
    expect(listClasses(db)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/patrimoine/assetClassRepo.test.ts`
Expected: FAIL — module `assetClassRepo` not found.

- [ ] **Step 3: Implement the repo**

`src/main/patrimoine/assetClassRepo.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  AssetClass,
  UpsertAssetClassInput,
  ClassifiableHolding,
} from '@shared/types/patrimoine';

interface ClassRow {
  id: string;
  name: string;
  color: string;
  target_pct: number | null;
  sort_order: number;
}

function toClass(r: ClassRow): AssetClass {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    targetPct: r.target_pct,
    sortOrder: r.sort_order,
  };
}

export function listClasses(db: DatabaseSync): AssetClass[] {
  const rows = db
    .prepare(
      'SELECT id, name, color, target_pct, sort_order FROM asset_classes ORDER BY sort_order ASC, created_at ASC',
    )
    .all() as unknown as ClassRow[];
  return rows.map(toClass);
}

export function upsertClass(db: DatabaseSync, input: UpsertAssetClassInput): AssetClass {
  const id = input.id ?? randomUUID();
  // New classes go to the end; existing ones keep their order.
  const nextOrder =
    (
      db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM asset_classes').get() as
        | { n: number }
        | undefined
    )?.n ?? 0;
  db.prepare(
    `INSERT INTO asset_classes (id, name, color, target_pct, sort_order)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       color = excluded.color,
       target_pct = excluded.target_pct`,
  ).run(id, input.name, input.color, input.targetPct, nextOrder);
  const row = db
    .prepare('SELECT id, name, color, target_pct, sort_order FROM asset_classes WHERE id = ?')
    .get(id) as unknown as ClassRow;
  return toClass(row);
}

export function deleteClass(db: DatabaseSync, id: string): void {
  // ON DELETE SET NULL needs foreign_keys ON (the app enables it at open; ensure it here too).
  db.exec('PRAGMA foreign_keys = ON');
  db.prepare('DELETE FROM asset_classes WHERE id = ?').run(id);
}

export function reorderClass(db: DatabaseSync, id: string, sortOrder: number): void {
  db.prepare('UPDATE asset_classes SET sort_order = ? WHERE id = ?').run(sortOrder, id);
}

const TABLE_BY_KIND = { account: 'accounts', asset: 'assets', loan: 'loans' } as const;

export function assignClass(
  db: DatabaseSync,
  args: { kind: 'account' | 'asset' | 'loan'; id: string; classId: string | null },
): void {
  const table = TABLE_BY_KIND[args.kind];
  db.prepare(`UPDATE ${table} SET class_id = ? WHERE id = ?`).run(args.classId, args.id);
}

export function listHoldings(db: DatabaseSync): ClassifiableHolding[] {
  const accounts = db
    .prepare('SELECT id, name, class_id FROM accounts ORDER BY name')
    .all() as unknown as { id: string; name: string; class_id: string | null }[];
  const assets = db
    .prepare('SELECT id, name, declared_value, share, class_id FROM assets ORDER BY name')
    .all() as unknown as {
    id: string;
    name: string;
    declared_value: number;
    share: number;
    class_id: string | null;
  }[];
  const loans = db
    .prepare('SELECT id, name, share, class_id FROM loans ORDER BY name')
    .all() as unknown as { id: string; name: string; share: number; class_id: string | null }[];

  return [
    ...accounts.map((a) => ({
      id: a.id,
      kind: 'account' as const,
      name: a.name,
      signedValue: 0, // balance is statement-derived; the assignment list shows class, not value, for accounts
      classId: a.class_id,
    })),
    ...assets.map((a) => ({
      id: a.id,
      kind: 'asset' as const,
      name: a.name,
      signedValue: Math.round(a.declared_value * a.share * 100) / 100,
      classId: a.class_id,
    })),
    ...loans.map((l) => ({
      id: l.id,
      kind: 'loan' as const,
      name: l.name,
      signedValue: 0, // CRD is computed in allocation.ts; not needed for the picker
      classId: l.class_id,
    })),
  ];
}
```

(If `runMigrations` is not the exact exported name, use whatever `loanRepo.test.ts` calls to
apply migrations to an in-memory DB.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/patrimoine/assetClassRepo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/patrimoine/assetClassRepo.ts tests/unit/patrimoine/assetClassRepo.test.ts
git commit -m "feat(patrimoine): asset class repo (CRUD, assign, holdings)"
```

---

## Task 3: `getAllocation` read-model + reconciliation test

**Files:**

- Create: `src/main/patrimoine/allocation.ts`
- Test: `tests/unit/patrimoine/allocation.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/patrimoine/allocation.test.ts` — set up a DB with one class, a declared asset and a
loan in that class (immo net of CRD), an unclassified account, and assert reconciliation:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { upsertClass, assignClass } from '../../../src/main/patrimoine/assetClassRepo';
import { upsertAsset } from '../../../src/main/patrimoine/assetRepo';
import { getAllocation } from '../../../src/main/patrimoine/allocation';
import { getNetWorth } from '../../../src/main/dashboard/consolidated';

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  return db;
}

describe('getAllocation', () => {
  it('nets a loan against an asset sharing the same class', () => {
    const db = freshDb();
    const immo = upsertClass(db, { name: 'Immo', color: '#7C9A8E', targetPct: 0.6 });
    const asset = upsertAsset(db, {
      name: 'RP',
      kind: 'property',
      declaredValue: 300_000,
      share: 0.5,
      valuedAt: '2026-06-01',
      classId: immo.id,
    });
    // Seed a loan with a known CRD via the loan repo helpers used elsewhere, OR insert
    // a loans row + one loan_installments row with balance_after to define crdAt() today.
    // (Mirror loanRepo.test.ts for how it seeds a loan + installments.)
    // assignClass(db, { kind: 'loan', id: loanId, classId: immo.id });

    const alloc = getAllocation(db);
    const immoSlice = alloc.slices.find((s) => s.classId === immo.id);
    expect(immoSlice?.value).toBeCloseTo(/* assetValue*share - crd*share */ 150_000 - 0, 2);
    expect(alloc.total).toBeCloseTo(getNetWorth(db).total, 2);
  });

  it('puts unclassified holdings in the « Non classé » bucket and reconciles', () => {
    const db = freshDb();
    upsertAsset(db, {
      name: 'Or',
      kind: 'autre',
      declaredValue: 10_000,
      share: 1,
      valuedAt: '2026-06-01',
      classId: null,
    });
    const alloc = getAllocation(db);
    expect(alloc.slices.find((s) => s.classId === null)?.value).toBeCloseTo(10_000, 2);
    expect(alloc.total).toBeCloseTo(getNetWorth(db).total, 2);
  });
});
```

(Use the loan-seeding helper from `loanRepo.test.ts`; if seeding a loan is heavy, the first test
may assign the loan to immo and assert `immoSlice.value === assetShare − crdShare` using that
helper's known CRD.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/patrimoine/allocation.test.ts`
Expected: FAIL — `allocation` module not found.

- [ ] **Step 3: Implement `getAllocation`**

`src/main/patrimoine/allocation.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite';
import type { Allocation, AllocationSlice } from '@shared/types/patrimoine';
import { listClasses } from './assetClassRepo';
import { crdAt } from './loanRepo';
import { getAccountSummaries } from '../dashboard/accounts'; // same source getNetWorth uses

const round2 = (n: number): number => Math.round(n * 100) / 100;
const UNCLASSIFIED = ' unclassified'; // internal key for the null bucket

export function getAllocation(db: DatabaseSync): Allocation {
  const todayIso = new Date().toISOString().slice(0, 10);
  const classes = listClasses(db);

  // value accumulator keyed by class id (or UNCLASSIFIED)
  const values = new Map<string, number>();
  const add = (key: string | null, v: number): void => {
    const k = key ?? UNCLASSIFIED;
    values.set(k, (values.get(k) ?? 0) + v);
  };

  for (const a of getAccountSummaries(db)) {
    // getAccountSummaries does not expose class_id; read it directly.
    const row = db.prepare('SELECT class_id FROM accounts WHERE id = ?').get(a.id) as
      | { class_id: string | null }
      | undefined;
    add(row?.class_id ?? null, a.balance ?? 0);
  }

  const assets = db
    .prepare('SELECT declared_value, share, class_id FROM assets')
    .all() as unknown as { declared_value: number; share: number; class_id: string | null }[];
  for (const a of assets) add(a.class_id, a.declared_value * a.share);

  const loans = db.prepare('SELECT id, share, class_id FROM loans').all() as unknown as {
    id: string;
    share: number;
    class_id: string | null;
  }[];
  for (const l of loans) add(l.class_id, -crdAt(db, l.id, todayIso) * l.share);

  const total = round2([...values.values()].reduce((s, v) => s + v, 0));

  const slices: AllocationSlice[] = classes.map((c) => {
    const value = round2(values.get(c.id) ?? 0);
    return {
      classId: c.id,
      name: c.name,
      color: c.color,
      value,
      pct: total > 0 ? value / total : 0,
      targetPct: c.targetPct,
      gap: c.targetPct === null ? null : (total > 0 ? value / total : 0) - c.targetPct,
    };
  });

  const unclassified = values.get(UNCLASSIFIED);
  if (unclassified !== undefined && round2(unclassified) !== 0) {
    const value = round2(unclassified);
    slices.push({
      classId: null,
      name: 'Non classé',
      color: 'var(--paper-mute)',
      value,
      pct: total > 0 ? value / total : 0,
      targetPct: null,
      gap: null,
    });
  }

  return { total, slices };
}
```

(Confirm the real import path for account summaries — grep `getAccountSummaries` and import it
from the module `consolidated.ts` already imports. If `target_pct` is stored as a percent
0..100 rather than a fraction, normalise once at the type boundary — keep the **fraction 0..1**
convention used in the types/spec, so store fractions in the DB too; the dialog converts the
user's "55" to 0.55 before persisting.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/patrimoine/allocation.test.ts`
Expected: PASS, including the `alloc.total ≈ getNetWorth(db).total` reconciliation.

- [ ] **Step 5: Commit**

```bash
git add src/main/patrimoine/allocation.ts tests/unit/patrimoine/allocation.test.ts
git commit -m "feat(patrimoine): allocation read-model reconciling with net worth"
```

---

## Task 4: Extend `assetRepo` to persist kind + class_id

**Files:**

- Modify: `src/main/patrimoine/assetRepo.ts`
- Test: `tests/unit/patrimoine/assetRepo.test.ts` (create if absent)

- [ ] **Step 1: Write/extend the failing test**

Assert an asset round-trips its `kind` and `classId`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { upsertClass } from '../../../src/main/patrimoine/assetClassRepo';
import { upsertAsset, listAssets } from '../../../src/main/patrimoine/assetRepo';

it('persists kind and classId', () => {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  const c = upsertClass(db, { name: 'Fonds €', color: '#C58B5C', targetPct: 0.15 });
  const a = upsertAsset(db, {
    name: 'AV Linxea',
    kind: 'av',
    declaredValue: 18_000,
    share: 1,
    valuedAt: '2026-06-01',
    classId: c.id,
  });
  expect(a.kind).toBe('av');
  expect(a.classId).toBe(c.id);
  expect(listAssets(db)[0]?.kind).toBe('av');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/patrimoine/assetRepo.test.ts`
Expected: FAIL — `classId` missing / `kind` hard-coded to `'property'`.

- [ ] **Step 3: Update `assetRepo.ts`**

In `AssetRow` add `class_id: string | null;`. In `toDto`, return `kind: r.kind` (not the literal)
and `classId: r.class_id`. In `upsertAsset`, include `class_id` in the INSERT column list and the
`ON CONFLICT DO UPDATE SET` (`class_id = excluded.class_id`), binding `input.classId ?? null`.
Keep the `SELECT *` reads. Example `upsertAsset` body:

```ts
export function upsertAsset(db: DatabaseSync, input: UpsertAssetInput): AssetDTO {
  const id = input.id ?? randomUUID();
  db.prepare(
    `INSERT INTO assets (id, name, kind, declared_value, share, valued_at, class_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       kind = excluded.kind,
       declared_value = excluded.declared_value,
       share = excluded.share,
       valued_at = excluded.valued_at,
       class_id = excluded.class_id`,
  ).run(
    id,
    input.name,
    input.kind,
    input.declaredValue,
    input.share,
    input.valuedAt,
    input.classId ?? null,
  );
  const row = db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as unknown as AssetRow;
  return toDto(row);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/patrimoine/assetRepo.test.ts && npm run typecheck`
Expected: PASS + typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/main/patrimoine/assetRepo.ts tests/unit/patrimoine/assetRepo.test.ts
git commit -m "feat(patrimoine): persist asset kind + class_id"
```

---

## Task 5: IPC wiring (allocation, classes, holdings)

**Files:**

- Modify: `src/main/ipc/channels.ts`, `src/main/ipc/handlers/patrimoine.ts`,
  `src/main/ipc/register.ts`, `src/shared/types/ipc.ts`
- Test: `tests/unit/ipc/patrimoineAllocation.test.ts`

- [ ] **Step 1: Add channel constants**

In `channels.ts`, after `patrimoineUnlinkPayment`:

```ts
  patrimoineGetAllocation: 'patrimoine:getAllocation',
  patrimoineListClasses: 'patrimoine:listClasses',
  patrimoineListHoldings: 'patrimoine:listHoldings',
  patrimoineUpsertClass: 'patrimoine:upsertClass',
  patrimoineDeleteClass: 'patrimoine:deleteClass',
  patrimoineAssignClass: 'patrimoine:assignClass',
```

- [ ] **Step 2: Add the contract entries**

In `src/shared/types/ipc.ts`, follow the exact shape used by `patrimoine:detectPayments`
(read vs mutating tagging). Read channels: `getAllocation → Allocation`,
`listClasses → AssetClass[]`, `listHoldings → ClassifiableHolding[]`. Mutating channels:
`upsertClass(UpsertAssetClassInput) → AssetClass`, `deleteClass({ id }) → void`,
`assignClass({ kind, id, classId }) → void`. Import the new types from `@shared/types/patrimoine`.

- [ ] **Step 3: Add handlers**

In `handlers/patrimoine.ts`:

```ts
import { getAllocation } from '../../patrimoine/allocation';
import {
  listClasses,
  upsertClass,
  deleteClass,
  assignClass,
  listHoldings,
} from '../../patrimoine/assetClassRepo';
import type { UpsertAssetClassInput } from '@shared/types/patrimoine';

export function handlePatrimoineGetAllocation() {
  return { allocation: getAllocation(getDb()) };
}
export function handlePatrimoineListClasses() {
  return { classes: listClasses(getDb()) };
}
export function handlePatrimoineListHoldings() {
  return { holdings: listHoldings(getDb()) };
}
export function handlePatrimoineUpsertClass(payload: UpsertAssetClassInput) {
  return { class: upsertClass(getDb(), payload) };
}
export function handlePatrimoineDeleteClass(payload: { id: string }) {
  deleteClass(getDb(), payload.id);
  return {};
}
export function handlePatrimoineAssignClass(payload: {
  kind: 'account' | 'asset' | 'loan';
  id: string;
  classId: string | null;
}) {
  assignClass(getDb(), payload);
  return {};
}
```

(Match the **exact** return-envelope convention of the neighbouring handlers — if they return
the bare value rather than `{ key: value }`, follow that. Look at `handlePatrimoineListLoans`.)

- [ ] **Step 4: Register the handlers**

In `register.ts`, register each channel against its handler exactly like the existing
`patrimoine:*` registrations (mutating ones via the same wrapper `patrimoine:detectPayments`
uses).

- [ ] **Step 5: Add a handler unit test (mock electron)**

`tests/unit/ipc/patrimoineAllocation.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
vi.mock('electron', () => ({ dialog: { showOpenDialog: vi.fn() } }));
// import the handlers + an in-memory db bootstrap; assert getAllocation returns
// { total: 0, slices: [] } on an empty DB and that upsertClass then listClasses round-trips.
```

- [ ] **Step 6: Run tests + typecheck**

Run: `npx vitest run tests/unit/ipc/patrimoineAllocation.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/main/ipc src/shared/types/ipc.ts tests/unit/ipc/patrimoineAllocation.test.ts
git commit -m "feat(patrimoine): IPC for allocation, classes, holdings"
```

---

## Task 6: Renderer hook + Allocation card + class CRUD + assignment

**Files:**

- Modify: `src/renderer/hooks/usePatrimoine.ts`
- Create: `src/renderer/components/patrimoine/AllocationCard.tsx`,
  `ClassManagerDialog.tsx`, `HoldingAssignmentList.tsx`
- Modify: `src/renderer/pages/PatrimoinePage.tsx`
- Test: `tests/unit/renderer/AllocationCard.test.tsx`

- [ ] **Step 1: Extend the hook**

In `usePatrimoine.ts`, add `allocation: Allocation | null`, `classes: AssetClass[]`,
`holdings: ClassifiableHolding[]` state loaded alongside the existing loans/assets reload, plus
actions `reloadAllocation()`, `upsertClass(input)`, `deleteClass(id)`,
`assignClass(kind, id, classId)` — each calls the matching `ipc.invoke(...)` then re-runs the
allocation/classes/holdings loads. Mirror the existing `detectPayments` action wiring.

- [ ] **Step 2: Write the failing card render test**

`tests/unit/renderer/AllocationCard.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { AllocationCard } from '@renderer/components/patrimoine/AllocationCard';
import type { Allocation } from '@shared/types/patrimoine';

afterEach(() => {
  cleanup();
});

const ALLOC: Allocation = {
  total: 100_000,
  slices: [
    {
      classId: 'c1',
      name: 'Immo',
      color: '#7C9A8E',
      value: 62_000,
      pct: 0.62,
      targetPct: 0.55,
      gap: 0.07,
    },
    {
      classId: 'c2',
      name: 'Actions',
      color: '#D4B062',
      value: 18_000,
      pct: 0.18,
      targetPct: 0.25,
      gap: -0.07,
    },
  ],
};

it('renders a row per class with its name and shows the target-sum hint when ≠ 100%', () => {
  render(<AllocationCard allocation={ALLOC} onManage={() => {}} />);
  expect(screen.getByText('Immo')).toBeInTheDocument();
  expect(screen.getByText('Actions')).toBeInTheDocument();
  // targets sum to 80% → hint visible
  expect(screen.getByText(/cibles/i)).toBeInTheDocument();
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run tests/unit/renderer/AllocationCard.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 4: Build `AllocationCard.tsx`**

Presentational. Props `{ allocation: Allocation | null; onManage: () => void }`. Use `Card`,
`CardHeader`, `Overline` (`— II`), `CardTitle` ("Allocation"), a `DonutCard`-style ring (reuse
`DonutCard` if its props fit: segments from slices with their `color`, centre = `formatCompact`
of `allocation.total`) and a list of rows. Each row: a colour swatch (`style={{ background:
slice.color }}`), the name, a thin bar (`<div>` width `pct*100%`), `<Money value={slice.value}/>`,
`formatPercent(slice.pct)`, the target (`slice.targetPct === null ? '—' : formatPercent`), and
the gap when not null, coloured **sage** (`text-[color:var(--color-income)]`) when `gap < 0`
(under target → to top up) and **coral** (`text-[color:var(--color-expense)]`) when `gap > 0`,
with the label "écart". Footer hint: compute `sumTargets = Σ slice.targetPct ?? 0`; if
`Math.abs(sumTargets − 1) > 0.005` render `cibles = {formatPercent(sumTargets)}` in
`text-paper-mute`. Add a "Gérer les classes" `Button variant="secondary" size="sm"` calling
`onManage`. No `Intl.NumberFormat` — add a tiny `formatPercent` to `lib/euro` if none exists
(`(n) => \`\${(n \* 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %\``is allowed;
the lint rule only bans`new Intl.NumberFormat`, but prefer reusing an existing percent helper —
grep first).

- [ ] **Step 5: Build `ClassManagerDialog.tsx` and `HoldingAssignmentList.tsx`**

`ClassManagerDialog` uses `components/ui/dialog`: a list of classes each with name input, a
colour choice (a small set of design tokens — reuse the category swatch tokens `--cat-*` /
`--brass` / `--color-income` etc.), a target % number input (user types `55`, store `0.55`),
up/down reorder, and a delete button with a confirm (mirror the LoanCard delete-confirm dialog).
An "Ajouter une classe" button appends a blank class. Persist via the hook's `upsertClass` /
`deleteClass`. Embed `HoldingAssignmentList` (a second section or tab): rows from `holdings`,
each with the holding name and a native `<select>` of classes (plus "Non classé"), `onChange`
→ `assignClass(h.kind, h.id, value || null)`; sort holdings with `classId === null` first.
Both built only from shared primitives — **no** `fixed inset-0`, **no** `Intl.NumberFormat`.

- [ ] **Step 6: Mount on the page**

In `PatrimoinePage.tsx`: pull `allocation, classes, holdings, upsertClass, deleteClass,
assignClass` from the hook; render `<AllocationCard allocation={allocation} onManage={() =>
setManaging(true)} />` between the Prêts card and the assets section; render
`<ClassManagerDialog open={managing} ... />`. Also convert the single `PropertyCard` into a
declared-assets **list** with an "Ajouter un actif" button (kind + name + value + share + class),
keeping the existing property as one entry — reuse the PropertyCard form fields; the asset upsert
already accepts `kind` + `classId`. Every mutation calls `notifyDataChanged()` so the sidebar net
worth and Reports donut refresh.

- [ ] **Step 7: Run the render test + typecheck + lint**

Run: `npx vitest run tests/unit/renderer/AllocationCard.test.tsx && npm run typecheck && npm run lint`
Expected: PASS; lint clean (run `grep -rn "fixed inset-0\|Intl.NumberFormat" src/renderer` → no
new hits).

- [ ] **Step 8: Commit**

```bash
git add src/renderer tests/unit/renderer/AllocationCard.test.tsx
git commit -m "feat(patrimoine): allocation card, class manager, holding assignment"
```

---

## Task 7: E2E + docs

**Files:**

- Create: `tests/e2e/patrimoine-allocation.spec.ts` (mirror an existing patrimoine E2E spec)
- Modify: `README.md` (patrimoine bullets), and the design skill is the visual source of truth.

- [ ] **Step 1: Write the E2E**

Mirror the existing patrimoine E2E (open `tests/e2e/` for the Electron launch + page-object
pattern). Steps: launch app → go to Patrimoine → open "Gérer les classes" → add a class "Cash"
with target 100 → assign the default account to "Cash" → close → assert the Allocation card shows
"Cash" with a non-zero `%` and a donut segment. Use synthetic data only.

- [ ] **Step 2: Run it**

Run: `xvfb-run npm run test:e2e -- patrimoine-allocation`
Expected: PASS (Linux only; this is what CI runs).

- [ ] **Step 3: Update README**

Add a bullet under the patrimoine feature list: allocation by user-defined asset class with
targets and gap-to-target, net of mortgage CRD, reconciling with net worth.

- [ ] **Step 4: Full gate**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/patrimoine-allocation.spec.ts README.md
git commit -m "test(patrimoine): e2e for allocation; document the feature"
```

---

## Definition of done

Lint clean, `tsc --noEmit` clean, unit + E2E green, `npm run build` succeeds, audit grep
(`fixed inset-0` / `Intl.NumberFormat`) clean. **UI validated in-app by the maintainer before
merge** (visual brick): create a class, set a target, assign the RP + the mortgage to it, confirm
the immo line shows value **net of CRD** and `total` equals the sidebar net worth to the cent.

## Validation script (maintainer, in-app)

1. Page Patrimoine → "Gérer les classes" → créer « Immobilier » (cible 55), « Actions » (25),
   « Liquidités » (20).
2. Affecter la RP **et** le prêt à « Immobilier », le compte courant à « Liquidités ».
3. Vérifier : la ligne Immobilier = valeur RP×quote-part − CRD×quote-part (recalcul à la main) ;
   `total` de la carte = patrimoine net de la sidebar au centime ; l'écart Immobilier coloré
   selon sous/sur-cible ; hint « cibles = 100 % » absent (somme = 100), présent si tu mets 95.
4. Supprimer « Liquidités » → le compte courant repasse « Non classé », aucune erreur, total
   inchangé.
