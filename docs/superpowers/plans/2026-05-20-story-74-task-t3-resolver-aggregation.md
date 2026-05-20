# Story #74 — Task T3 (Resolver + As-Of Aggregation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `resolveCategoryAsOf(db, id, mode, date?)` and `aggregateByCategory(db, { from, to, mode })` per spec §5 + §6. These are the honesty guarantee of Story #74 — multi-year aggregation must explicitly pick a taxonomy view and never silently lie.

**Architecture:** Pure functions in `src/main/taxonomy/resolve.ts`. Two-mode resolver walks `taxonomy_events` filtered by category id, ordered by `(occurred_at, event_seq)`. `as_of_period` looks backward from a date through `rename` events. `as_of_now` walks forward; collapses through `rename` and `merge` recursively, surfaces `split` as ONE level of `splitInto` (terminal `{id, name}` entries). Aggregation reads `transactions` in `[from, to]`, calls the resolver per transaction, applies split mapping rule (`payload`) on `label_clean` when `as_of_now` returns `splitInto`, walks further events if the chosen target is itself non-terminal. No optimization layer for v1 (per-tx queries acceptable at personal scale).

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), `node:sqlite` (`DatabaseSync`) — uses `json_extract` and `json_each` for source/target id filtering, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-20-versioned-taxonomy-design.md` §5 (resolver), §6 (aggregation).
**Parent plan:** `docs/superpowers/plans/2026-05-20-story-74-versioned-taxonomy.md`.

---

## File Structure

| File                                            | Responsibility                                                                                      |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `src/shared/types/taxonomy.ts`                  | MODIFIED — add `ResolvedCategory` type + `AggregationMode` + `AggregationBucket`.                   |
| `src/main/taxonomy/resolve.ts`                  | NEW — exports `resolveCategoryAsOf` + `aggregateByCategory`. ~150 lines incl. SQL.                  |
| `tests/unit/taxonomy/resolve.test.ts`           | NEW — resolver matrix (no events, rename, split, merge, chained) + aggregation per-mode.            |
| `tests/integration/taxonomy/multi-year.test.ts` | NEW — end-to-end multi-year scenario: seed categories + transactions across years + rename + split. |

**Reused (no change):** `src/shared/types/taxonomy.ts` exports `MappingRule`, `RenamePayload`. `src/main/taxonomy/{rename,split,merge}*.ts` produce the events.

**Conventions:** see T2 plan (`tests/unit/taxonomy/*.test.ts` use `freshDb()` helper with `PRAGMA foreign_keys = ON`, `seedCategory(db, id, name)`). Integration tests live under `tests/integration/...` per the import-pipeline convention.

---

## Task 1 — Types + skeleton + identity passthrough

**Files:** `src/shared/types/taxonomy.ts` (modify), `src/main/taxonomy/resolve.ts` (new), `tests/unit/taxonomy/resolve.test.ts` (new).

- [ ] Step 1: Add types to `src/shared/types/taxonomy.ts`:

```ts
export type ResolvedCategory =
  | { readonly id: string; readonly name: string }
  | {
      readonly id: string;
      readonly name: string;
      readonly splitInto: ReadonlyArray<{ readonly id: string; readonly name: string }>;
    };

export type AggregationMode = 'as_of_period' | 'as_of_now';

export interface AggregationBucket {
  readonly categoryId: string;
  readonly name: string;
  readonly total: number;
  readonly count: number;
}
```

- [ ] Step 2: Write failing test in `resolve.test.ts` — `resolveCategoryAsOf` returns `{id, name}` from `categories.name` when no events exist.
- [ ] Step 3: Verify red.
- [ ] Step 4: Implement minimal `resolveCategoryAsOf` in `resolve.ts` — dispatch on mode; both modes for now just SELECT name FROM categories.
- [ ] Step 5: Verify green.
- [ ] Step 6: Commit: `feat(taxonomy): add resolveCategoryAsOf skeleton (identity passthrough)`

---

## Task 2 — `as_of_period` with renames

- [ ] Step 1: Add tests:
  - `as_of_period` requires `date` arg → throws if missing.
  - One rename event before `date` → returns old name (from `payload.new_name` of the rename BEFORE that one, or original `categories.name`-equivalent reconstructed by walking backwards).
  - **Important reread of spec §5.2:** the resolver returns the name the category had AT `date`. Most recent rename ≤ date → return that event's `payload.new_name`. If no rename ≤ date → return current `categories.name` (never renamed before `date`).
  - Multiple renames in sequence → returns the name effective at `date`.
- [ ] Step 2: Verify red.
- [ ] Step 3: Implement `as_of_period` path. Key query:

```sql
SELECT payload FROM taxonomy_events
WHERE kind = 'rename'
  AND json_extract(source_ids, '$[0]') = ?
  AND occurred_at <= ?
ORDER BY occurred_at DESC, event_seq DESC
LIMIT 1
```

If row exists → parse payload, return `{id, name: payload.new_name}`. Else → return `{id, name: categories.name}`.

- [ ] Step 4: Verify green.
- [ ] Step 5: Commit: `feat(taxonomy): implement as_of_period resolution with rename walk`

---

## Task 3 — `as_of_now` with chained renames (no split/merge yet)

- [ ] Step 1: Add tests:
  - No events → `{id, name}` from `categories.name`.
  - One rename → returns current name (categories.name already updated by the rename op).
  - Two renames → returns latest name (categories.name always reflects most recent rename).
- [ ] Step 2: Verify red.
- [ ] Step 3: Implement `as_of_now` initial branch. Categories.name IS the current name (renames update in place per T2). The non-trivial walks come in Tasks 4–5.
- [ ] Step 4: Verify green.
- [ ] Step 5: Commit: `feat(taxonomy): implement as_of_now base case (current categories.name)`

---

## Task 4 — `as_of_now` source-of-merge (recurse to target)

- [ ] Step 1: Add tests:
  - A merged into B → `as_of_now(A)` returns `{id: B, name: B-name}`.
  - A merged into B, B renamed → `as_of_now(A)` returns `{id: B, name: B-renamed-name}`.
  - Chained merges (A → B, then B → C) → `as_of_now(A)` returns `{id: C, name: C-name}`.
  - Throws on cycle (defensive; shouldn't happen by construction since deprecated cats can't be sources).
- [ ] Step 2: Verify red.
- [ ] Step 3: Implement merge recursion in `as_of_now`. Find earliest event with id in `source_ids`:

```sql
SELECT id AS event_id, kind, target_ids FROM taxonomy_events
WHERE (kind = 'split' OR kind = 'merge')
  AND EXISTS (SELECT 1 FROM json_each(source_ids) WHERE value = ?)
ORDER BY occurred_at ASC, event_seq ASC
LIMIT 1
```

If `kind = 'merge'` → recurse on `JSON.parse(target_ids)[0]` with a `visited: Set<string>` to detect cycles.

- [ ] Step 4: Verify green.
- [ ] Step 5: Commit: `feat(taxonomy): walk through merge chains in as_of_now`

---

## Task 5 — `as_of_now` source-of-split (splitInto, one level deep)

- [ ] Step 1: Add tests:
  - A split into [B, C] → returns `{id: A, name: A-pre-split, splitInto: [{id: B, name: B}, {id: C, name: C}]}`.
  - A split into [B, C] then B renamed → splitInto contains `{id: B, name: B-renamed}`.
  - **Chained split**: A → [B, C], then C → [D, E]. `as_of_now(A)` returns splitInto = `[{id: B, name: B}, {id: C, name: C-pre-second-split}]`. The C entry is terminal `{id, name}` — caller must call `resolveAsOfNow(C)` to walk further. NO nested splitInto.
- [ ] Step 2: Verify red.
- [ ] Step 3: Extend `as_of_now`. When the earliest source-event is `split`:

```ts
const targetIds: string[] = JSON.parse(event.target_ids);
const splitInto = targetIds.map((tid) => {
  const r = resolveNow(db, tid, new Set(visited));
  return { id: r.id, name: r.name }; // drop any nested splitInto by design
});
return { id, name: cat.name, splitInto };
```

- [ ] Step 4: Verify green.
- [ ] Step 5: Commit: `feat(taxonomy): surface split as one-level splitInto in as_of_now`

---

## Task 6 — `aggregateByCategory` skeleton + `as_of_period`

- [ ] Step 1: Add tests:
  - Empty window → empty array.
  - Single tx, never any taxonomy events → one bucket with `{categoryId, name, total: tx.amount, count: 1}`.
  - Two txs same category, span a rename mid-period → TWO buckets keyed by `${id}::${name}` (honest historical view per spec §6.1).
  - `mode` is required: omitting throws.
- [ ] Step 2: Verify red.
- [ ] Step 3: Implement:

```ts
export function aggregateByCategory(
  db: DatabaseSync,
  options: { from: string; to: string; mode: AggregationMode },
): AggregationBucket[] {
  if (options.mode !== 'as_of_period' && options.mode !== 'as_of_now') {
    throw new Error('aggregateByCategory: mode is required');
  }
  const txs = db
    .prepare(
      'SELECT id, date, amount, label_clean, category_id FROM transactions WHERE date >= ? AND date <= ? AND category_id IS NOT NULL',
    )
    .all(options.from, options.to) as unknown as Array<{
    id: string;
    date: string;
    amount: number;
    label_clean: string;
    category_id: string;
  }>;
  const buckets = new Map<string, AggregationBucket>();
  for (const tx of txs) {
    const r = routeTransaction(db, tx, options.mode);
    const key = `${r.id}::${r.name}`;
    const prev = buckets.get(key) ?? { categoryId: r.id, name: r.name, total: 0, count: 0 };
    buckets.set(key, { ...prev, total: prev.total + tx.amount, count: prev.count + 1 });
  }
  return [...buckets.values()];
}
```

`routeTransaction` for `as_of_period`: just `resolveCategoryAsOf(db, tx.category_id, 'as_of_period', tx.date)` → returns `{id, name}` (never splitInto in this mode). `as_of_now` is Task 7.

- [ ] Step 4: Verify green.
- [ ] Step 5: Commit: `feat(taxonomy): add aggregateByCategory with as_of_period routing`

---

## Task 7 — `aggregateByCategory` `as_of_now` with split routing

- [ ] Step 1: Add tests:
  - A split into [B, C] with mapping rule `[{pattern: "(?i)uber", target_id: B}, {pattern: ".*", target_id: C}]`. Two txs: one labelled "UBER X" → bucket B. One labelled "X" → bucket C.
  - **Chained split routing**: A split → [B, C] (rule routes "uber" → B, else C). C split → [D, E] (rule routes "lunch" → D, else E). Tx labelled "lunch at X" → A→C→D (routes through both rules). Tx labelled "X" → A→C→E. Tx labelled "uber X" → A→B (terminal).
  - Merge chain in `as_of_now`: A merged to B, B merged to C. Tx originally on A → bucket C.
- [ ] Step 2: Verify red.
- [ ] Step 3: Implement `routeTransaction` `as_of_now` branch:

```ts
function routeTransaction(db, tx, mode): { id: string; name: string } {
  if (mode === 'as_of_period') {
    return resolveCategoryAsOf(db, tx.category_id, 'as_of_period', tx.date) as {
      id: string;
      name: string;
    };
  }
  // as_of_now — walk through chained splits per §6.2
  let resolved = resolveCategoryAsOf(db, tx.category_id, 'as_of_now');
  let currentId = tx.category_id;
  while ('splitInto' in resolved) {
    const splitEvent = db
      .prepare(
        "SELECT payload FROM taxonomy_events WHERE kind = 'split' AND json_extract(source_ids, '$[0]') = ? LIMIT 1",
      )
      .get(currentId) as unknown as { payload: string } | undefined;
    if (!splitEvent) throw new Error(`aggregateByCategory: missing split event for ${currentId}`);
    const rule = JSON.parse(splitEvent.payload) as MappingRule;
    const target = rule.rules.find((r) => new RegExp(r.pattern).test(tx.label_clean));
    if (!target) throw new Error('exhaustive-rule invariant violated');
    currentId = target.target_id;
    resolved = resolveCategoryAsOf(db, currentId, 'as_of_now');
  }
  return { id: resolved.id, name: resolved.name };
}
```

- [ ] Step 4: Verify green.
- [ ] Step 5: Commit: `feat(taxonomy): route through split mapping rules in as_of_now aggregation`

---

## Task 8 — Cross-check + integration tests

- [ ] Step 1: Cross-check unit test in `resolve.test.ts`:
  - Seed 3 categories + several txs across a year. NO taxonomy events. Assert: `aggregateByCategory(..., 'as_of_period')` and `aggregateByCategory(..., 'as_of_now')` return IDENTICAL buckets (same ids, names, totals, counts).
- [ ] Step 2: Integration test in `tests/integration/taxonomy/multi-year.test.ts`:
  - Year 1: seed categories ["Restaurants", "Transport"], seed 6 txs split across the two categories spanning Jan–Dec.
  - Year 2: rename "Restaurants" → "Food", seed 4 more txs spanning Jan–Dec.
  - Year 3: split "Food" into ["Restaurants only", "Food delivery"] with rule `[{pattern: "(?i)uber|deliveroo", target_id: "food-delivery"}, {pattern: ".*", target_id: "restaurants-only"}]`. Seed 5 more txs across the year (some "Uber Eats", some "Bistro X").
  - Assert: `aggregateByCategory({from: year1-jan, to: year3-dec, mode: 'as_of_period'})` produces buckets keyed by historical names ("Restaurants", "Food", "Food delivery", "Restaurants only", "Transport") with correct totals per period.
  - Assert: same range with `mode: 'as_of_now'` produces buckets only by current names ("Restaurants only", "Food delivery", "Transport"), with year-1/year-2 "Restaurants/Food" txs re-routed via the split mapping rule (Uber txs → Food delivery, others → Restaurants only).
- [ ] Step 3: Verify green.
- [ ] Step 4: Commit: `test(taxonomy): cross-check + multi-year integration for resolver/aggregation`

---

## Task 9 — Verify suite + review + push + PR

- [ ] Step 1: Full unit suite + integration: `npx vitest run`. Expect 156 + ~20 new resolver tests + ~3 integration ≈ 179+ green.
- [ ] Step 2: Typecheck: `npm run typecheck` → exit 0.
- [ ] Step 3: Apply `superpowers:verification-before-completion`.
- [ ] Step 4: Apply `superpowers:requesting-code-review` (dispatch `pr-review-toolkit:code-reviewer`).
- [ ] Step 5: `superpowers:finishing-a-development-branch` → push + PR. Title: `feat(taxonomy): add resolver + as-of aggregation (T3 of #74)`. Closes #83.

---

## Self-Review

**Spec coverage (§5 + §6):**

- §5.1 signature → Task 1.
- §5.2 `as_of_period` (rename walk, deprecation edge case) → Task 2 (note: spec's last bullet about querying a deprecated category at a date AFTER deprecation is not in T3 AC explicitly; covered implicitly since aggregation groups by tx date which is always before any future deprecation of the original category).
- §5.3 `as_of_now` (no events, rename, merge recursion, split surface) → Tasks 3–5.
- §6.1 `as_of_period` aggregation (per-tx) → Task 6.
- §6.2 `as_of_now` aggregation (chained split via mapping rule walk) → Task 7.
- Cross-check + integration → Task 8.

**Placeholder scan:** No TBDs. Each step has either concrete test ideas + key SQL, or signature-level impl.

**Type consistency:** `ResolvedCategory`, `AggregationMode`, `AggregationBucket` defined once in `src/shared/types/taxonomy.ts` (Task 1), used unchanged in resolve.ts (Tasks 2–7).

**Anti-over-engineering check:** No helper class (resolve.ts has top-level `resolveCategoryAsOf` + `aggregateByCategory` + private `routeTransaction`). No caching layer. No query batching. Direct SQL per call — perf is fine for personal scale, can revisit if/when actual usage shows hot spots.

**Genuine open question — RESOLVED before plan:** `splitInto` is ONE LEVEL DEEP. Type forces it (`Array<{id, name}>` not recursive). Caller walks chained splits via the mapping-rule loop in aggregation (Task 7). This matches spec §6.2 step 4 verbatim.

---

## Execution Handoff

Plan saved. Two execution options:

1. **Subagent-Driven (recommended for T3 — 9 tasks)** — fresh subagent per task, review between tasks.
2. **Inline Execution** — execute all tasks in this session using `superpowers:executing-plans`.

Which approach?
