# Patrimoine — Allocation by asset class (with targets)

**Date:** 2026-06-14
**Status:** Approved (maintainer, 2026-06-14)
**Scope anchor:** ADR-009 Amendment 2 (patrimoine in scope: allocation with targets).
**Privacy:** unchanged — 100% local, no I/O in renderer, no data leaves the machine (ADR-002).
All examples below use synthetic figures.

## Goal

Let the maintainer see how their **net** patrimoine splits across **user-defined asset
classes**, set a **target percentage** per class, and read the **gap to target** — to steer a
passive DCA. This is the next patrimoine brick after the mortgage module (#227) and its
reports split (#228).

## Why this shape

- The app already computes net worth (`getNetWorth`, `src/main/dashboard/consolidated.ts`) from
  accounts + declared assets − loan CRD, all at the maintainer's quote-part, and already renders
  a per-**account** donut (`NetWorthDonut` + `DonutCard` in Reports). Allocation is the same
  total re-grouped by **class** instead of by account, plus targets. We reuse `DonutCard`.
- The maintainer is a single passive DCA investor who updates balances monthly. Classes are
  **user-defined** (CRUD) because no fixed taxonomy fits everyone; targets are **soft** (a hint,
  never a blocker) because real allocations rarely sum to exactly 100%.
- A French AV holding both fonds € and unités de compte is modelled as **two declared assets**
  (one per class), not an intra-holding split — no split-within-a-holding code.

## Data model (migration 023)

### New table `asset_classes`

```sql
CREATE TABLE asset_classes (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL,            -- a design token hex, e.g. '#D4B062'
  target_pct  REAL,                     -- NULL = no target set; else 0..100
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

No rows are seeded — the maintainer creates their own classes.

### Class tag on every net-worth contributor

```sql
ALTER TABLE accounts ADD COLUMN class_id TEXT REFERENCES asset_classes(id) ON DELETE SET NULL;
ALTER TABLE assets   ADD COLUMN class_id TEXT REFERENCES asset_classes(id) ON DELETE SET NULL;
ALTER TABLE loans    ADD COLUMN class_id TEXT REFERENCES asset_classes(id) ON DELETE SET NULL;
```

Deleting a class sets its holdings' `class_id` to NULL (they fall back to the **« Non classé »**
bucket) — never an error, never data loss.

### Declared assets extended beyond property

Today `assets.kind` is effectively pinned to `'property'` (the repo only ever writes
`'property'` and `assetRepo.toDto` hard-codes `kind: 'property'`). For allocation we allow
**multiple declared assets of arbitrary kind** (RP, AV, PEA-tracked-by-hand, UC, livret…), each
carrying its own `class_id` and a hand-updated `declared_value` / `valued_at`. Concretely:

- `AssetDTO.kind` and `UpsertAssetInput.kind` become `string` (free-text label, e.g.
  `'property'`, `'av'`, `'pea'`, `'autre'`), and `assetRepo.toDto` returns the stored kind
  instead of the literal `'property'`.
- The asset section on the Patrimoine page becomes a **list** of declared assets with an
  "Ajouter un actif" flow, not the single `assets[0]` PropertyCard. The existing property entry
  keeps working (it is just an asset with `kind='property'`).

The classification used by allocation comes from `class_id`, **not** from `kind` — `kind` is a
display label only.

## Computation — `getAllocation(db): Allocation` (main process)

New module `src/main/patrimoine/allocation.ts`. For each class (plus a synthetic
« Non classé » bucket for holdings with `class_id IS NULL`):

```
classValue =   Σ account.balance            (accounts in the class; null balance counts as 0)
             + Σ asset.declaredValue * share (declared assets in the class)
             − Σ loan.crd * share            (loans in the class, CRD computed today)
```

- `total` = Σ all class values = the **same** net worth as `getNetWorth().total` (a unit test
  asserts reconciliation to the cent).
- Per class: `value`, `pct = value / total` (0 when total ≤ 0), `targetPct` (from the table,
  may be null), `gap = pct − (targetPct ?? 0)` (null when no target).
- The « Non classé » bucket is omitted when empty; it never has a target.
- A class with no holdings shows `value: 0`. A class whose loans exceed its assets shows a
  **negative** value and pct — displayed as-is (rare, but truthful).

Types (in `src/shared/types/patrimoine.ts`):

```ts
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
  pct: number; // value / total, 0..1 (can be <0)
  targetPct: number | null; // 0..1 or null
  gap: number | null; // pct − targetPct, null when no target
}
export interface Allocation {
  total: number; // reconciles with getNetWorth().total
  slices: AllocationSlice[]; // sorted by sortOrder, « Non classé » last
}

/** One holding (account | asset | loan) and its current class, for the assignment UI. */
export interface ClassifiableHolding {
  id: string;
  kind: 'account' | 'asset' | 'loan';
  name: string;
  signedValue: number; // contribution to net worth (loans negative)
  classId: string | null;
}
```

## IPC surface

`src/shared/types/ipc.ts` + `channels.ts` + handlers + `register.ts`:

| Channel                    | Mutating | Returns                                                  |
| -------------------------- | -------- | -------------------------------------------------------- |
| `patrimoine:getAllocation` | no       | `Allocation`                                             |
| `patrimoine:listClasses`   | no       | `AssetClass[]`                                           |
| `patrimoine:listHoldings`  | no       | `ClassifiableHolding[]`                                  |
| `patrimoine:upsertClass`   | **yes**  | `AssetClass`                                             |
| `patrimoine:deleteClass`   | **yes**  | `void`                                                   |
| `patrimoine:assignClass`   | **yes**  | `void` — args `{ kind, id, classId }` (classId nullable) |

Repository: `src/main/patrimoine/assetClassRepo.ts` (CRUD + `assignClass` dispatching to the
right table by `kind`).

## UI — page Patrimoine

A new **« Allocation »** card (overline `— II`, the Prêts card stays `— I`; the assets section
follows). Built only from existing primitives (`Card`, `DonutCard`, `Dialog`, `Button`,
`Overline`, `Money`, shared input classes) — **no** `fixed inset-0`, **no** `Intl.NumberFormat`
(both lint-guarded; the audit grep stays clean).

1. **Donut by class** via `DonutCard`: one segment per class (its `color`), centre = net total.
2. **Per-class rows**: name swatch · bar (current vs target marker) · value `<Money>` · `pct`
   · `targetPct` · `gap` coloured (sage when under target / coral when over — under-allocated to
   a class you want more of reads as "to top up"; we use sage=under, coral=over and label it).
   A footer hint « cibles = 95 % » appears when Σ targets ≠ 100% (informative, never blocks).
3. **Gestion des classes**: a `Dialog` to add / rename / delete / set target % / reorder
   (sort_order via up/down). Delete asks confirmation (reuse the dialog pattern from LoanCard).
4. **Affectation**: a sub-section (or the same dialog, a second tab) listing every holding from
   `listHoldings` with a class `<select>`; unassigned holdings sorted first so they're obvious.

Renderer hook `src/renderer/hooks/usePatrimoine.ts` gains `allocation`, `classes`, `holdings`
state + `reloadAllocation`, `upsertClass`, `deleteClass`, `assignClass`; all mutations call
`notifyDataChanged()` so the sidebar net worth and Reports donut stay in sync.

## Verification path (CLAUDE.md north star)

Every figure is recomputable to the cent:

- Each holding row shows its value and its class → a class's value is the visible sum of its
  holdings (assets at quote-part, minus loan CRD at quote-part).
- `pct = classValue / total`, `total` equals the sidebar net worth.
- `gap = pct − target`; targets are the maintainer's own input.
  No figure is shown that the maintainer cannot check against the holding values.

## Testing

- **Unit (`allocation.ts`)**: immo net of CRD when RP+loan share a class; quote-part applied to
  assets and loans; « Non classé » bucket; empty class = 0; negative class value; **`total`
  reconciles with `getNetWorth().total`** on the same fixture.
- **Unit (`assetClassRepo.ts`)**: upsert/rename/delete; `ON DELETE SET NULL` drops holdings to
  « Non classé »; `assignClass` routes to the correct table per `kind`. Mock electron per
  `reference-mock-electron-in-unit-tests` if the handler import pulls it in.
- **Unit (renderer, jsdom + explicit `afterEach(cleanup)`)**: allocation card renders slices,
  target hint appears only when Σ ≠ 100%, gap colour matches sign.
- **E2E (`xvfb-run npm run test:e2e`, Linux)**: create a class, assign a holding to it, assert
  the class's % is non-zero and the donut shows the segment.

## Out of scope (YAGNI / deferred)

- Intra-holding splits (handled by creating multiple declared assets).
- Auto-classifying accounts by inferred type (accounts are tagged manually).
- Rebalancing suggestions / order generation, market price feeds (ADR-018 reserved; not now).
- Historical allocation over time — this brick is a point-in-time snapshot.

## Decomposition note

One spec, but the plan splits it into tasks: (1) migration 023 + types, (2) `assetClassRepo`

- allocation read-model + unit tests, (3) IPC wiring, (4) extend declared assets to multi/kind,
  (5) renderer hook + allocation card + class CRUD + assignment UI, (6) E2E. Each task produces
  working, tested software.
