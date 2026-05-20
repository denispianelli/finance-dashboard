# Versioned Category Taxonomy — Design Spec

**Date:** 2026-05-20
**Status:** Draft, pending implementation (T1..T5 = #81..#85)
**Story:** [#74 — Stable versioned category taxonomy](https://github.com/denispianelli/finance-dashboard/issues/74)
**Parent:** Epic — Import Pipeline (#23); value prerequisite per ADR-009 §5
**Related ADR:** [ADR-010 — Versioned category taxonomy](../../adr/010-versioned-category-taxonomy.md) (Proposed)
**References:** ADR-009 (product scope realignment), §10 of `2026-05-14-finance-dashboard-design.md` (current `categories` schema)

---

## 1. Goal

Make multi-year category aggregations honest. Today, `categories` is a flat,
unversioned table — renaming, splitting or merging a category silently
rewrites all history. A retrospective view ("Uber Eats over 3 years",
"savings 2022 vs 2025") would lie with confidence after a single taxonomy
edit.

This story introduces a **versioned taxonomy**: every mutation is recorded as
an event, and aggregations explicitly pick between two truths — "as the
taxonomy was during that period" or "as the taxonomy is today".

## 2. Scope

In scope:

- Additive schema change: new `taxonomy_events` table + `deprecated_at` /
  `replaced_by_event_id` columns on `categories`. No data migration.
- Backend operations: `renameCategory`, `splitCategory`, `mergeCategories` —
  pure functions that mutate `categories` and append a `taxonomy_events`
  row atomically.
- Resolver `resolveCategoryAsOf(db, categoryId, mode, date?)` and aggregation
  helper `aggregateByCategory(db, { from, to, mode })`.
- Read-only IPC channels exposing taxonomy state to the renderer.

Out of scope:

- User-facing taxonomy editor UX (separate story).
- Per-transaction recategorization on import — covered by #34.
- Default category seeding — covered by #29 (will land on the new schema).
- LLM categorization cascade — covered by #29.
- Versioning of the `parent_id` hierarchy itself (see §9).

## 3. Data model

### 3.1 `categories` (modified, additive)

```sql
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  parent_id TEXT,
  name TEXT NOT NULL,
  icon TEXT,
  color TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  -- NEW in migration 005:
  deprecated_at TEXT NULL,
  replaced_by_event_id TEXT NULL REFERENCES taxonomy_events(id),
  FOREIGN KEY (parent_id) REFERENCES categories(id)
);
```

`deprecated_at` is set when a category is the source of a split or merge.
`replaced_by_event_id` points to the event that deprecated it.

A deprecated category still exists in the table.
`transactions.category_id` still points to it for historical rows. This is
the **only** way `as_of_period` can be honest.

### 3.2 `taxonomy_events` (new)

```sql
CREATE TABLE taxonomy_events (
  id TEXT PRIMARY KEY,
  event_seq INTEGER NOT NULL UNIQUE,  -- monotonic tiebreaker, assigned at insert
  kind TEXT NOT NULL CHECK (kind IN ('rename', 'split', 'merge')),
  source_ids TEXT NOT NULL,    -- JSON array of category ids
  target_ids TEXT NOT NULL,    -- JSON array of category ids
  payload TEXT,                -- JSON; shape depends on kind (see §3.3, §3.4)
  occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_taxonomy_events_seq ON taxonomy_events(event_seq);
```

`event_seq` is a strictly-monotonic integer assigned by the ops layer (T2) as
`(SELECT COALESCE(MAX(event_seq), 0) + 1 FROM taxonomy_events)` inside the
same transaction. It exists because `occurred_at` (1-second resolution) is
too coarse for a deterministic tiebreaker — the resolver walks events in
`(occurred_at, event_seq)` order so multiple events in the same second still
have a defined order.

FK references to `categories(id)` are not enforced at the DB level (JSON
columns), but every id in `source_ids` / `target_ids` MUST reference a real
category. The invariant is validated by the operations layer (T2).

### 3.3 `payload` for split events (mapping rule)

`payload` JSON, for `kind = 'split'`. Format:

```json
{
  "kind": "label-regex",
  "rules": [
    { "pattern": "(?i)uber", "target_id": "cat-transport" },
    { "pattern": "(?i)deliveroo|just eat", "target_id": "cat-restaurants" },
    { "pattern": ".*", "target_id": "cat-other" }
  ]
}
```

**Invariant: the mapping rule MUST be exhaustive.** The last rule MUST
unconditionally match (pattern `.*` or equivalent). Enforced at construction
time in T2. This guarantees `as_of_now` resolution never produces an
ambiguous or dropped transaction.

First match wins. Patterns are applied to `transactions.label_clean`.

Rationale: this uses the same conceptual shape as `categorization_rules`
(#29) — label match → category id — restricted to regex matching only for
simplicity. The rule stays machine-applicable in pure JS without needing a
DSL and is easy to inspect and debug.

### 3.4 `payload` for rename events (name change)

`payload` JSON, for `kind = 'rename'`. Format:

```json
{ "old_name": "Restaurants", "new_name": "Restaurants & food delivery" }
```

Both fields are required. The resolver (§5.2) reads `payload.old_name` to
recover the historical name; it does NOT walk back through `categories.name`
(which only ever holds the current name).

For `kind = 'merge'`, `payload` is `NULL`. Merges are unambiguous (sources
deprecated, target unchanged) and need no extra state today; the column is
reserved for future use (e.g. recording who initiated the merge).

## 4. Operations semantics

All three operations are pure functions taking a `DatabaseSync` and a
payload, returning the created `event_id`. They write to `taxonomy_events`
and update `categories.deprecated_at` / `replaced_by_event_id` in a single
transaction.

### 4.1 Rename

```ts
renameCategory(db, { id: string, newName: string }): string
```

Effect (single transaction):

- Read current `categories.name` for `id` as `oldName`.
- `UPDATE categories SET name = newName WHERE id = ?`
- `INSERT INTO taxonomy_events(kind='rename', source_ids=[id], target_ids=[id], payload={old_name: oldName, new_name: newName}, event_seq=NEXT, ...)`

No deprecation. The category keeps the same id, only the display name
changes. The previous name is recoverable by reading `payload.old_name` from
the most recent `rename` event ≤ the queried date (see §5.2).

### 4.2 Split

```ts
splitCategory(db, {
  sourceId: string,
  targetIds: string[],      // ≥ 2 ids, all existing and not deprecated
  mappingRule: MappingRule  // exhaustive
}): string
```

Preconditions:

- `sourceId` exists and is not deprecated.
- Every id in `targetIds` exists and is not deprecated.
- `targetIds.length >= 2`.
- `mappingRule` is exhaustive (§3.3).

Effect (single transaction):

- `INSERT INTO taxonomy_events(kind='split', source_ids=[sourceId], target_ids=targetIds, payload=<mapping rule JSON>, event_seq=NEXT, ...)` returning `eventId`
- `UPDATE categories SET deprecated_at = NOW(), replaced_by_event_id = eventId WHERE id = sourceId`

`transactions.category_id` is NOT rewritten. History stays anchored to the
deprecated source; the resolver re-routes at query time per mode.

### 4.3 Merge

```ts
mergeCategories(db, {
  sourceIds: string[],   // ≥ 2 ids, all existing and not deprecated
  targetId: string       // existing and not deprecated
}): string
```

Preconditions: as above.

Effect (single transaction):

- `INSERT INTO taxonomy_events(kind='merge', source_ids=sourceIds, target_ids=[targetId], payload=NULL, event_seq=NEXT, ...)` returning `eventId`
- For each `sId` in `sourceIds`: `UPDATE categories SET deprecated_at = NOW(), replaced_by_event_id = eventId WHERE id = sId`

`transactions.category_id` is NOT rewritten. Merges are unambiguous
(N → 1); no mapping rule needed.

### 4.4 Chaining

A category can be subject to multiple events over time (rename then split,
split then rename of a target, etc.). The resolver walks the event log in
`(occurred_at ASC, event_seq ASC)` order — `event_seq` is the deterministic
tiebreaker (§3.2). There is no cycle by construction: a deprecated category
cannot be the source of a new event (precondition in each op).

## 5. Resolver contract

### 5.1 Signature

```ts
type ResolvedCategory =
  | { id: string; name: string }
  | { id: string; name: string; splitInto: Array<{ id: string; name: string }> };

function resolveCategoryAsOf(
  db: DatabaseSync,
  categoryId: string,
  mode: 'as_of_period' | 'as_of_now',
  date?: string, // ISO date; required when mode === 'as_of_period'
): ResolvedCategory;
```

### 5.2 `as_of_period`

"What was this category called at this point in time?"

Walks `taxonomy_events` involving `categoryId` in
`(occurred_at, event_seq)` order to recover the state at `date`. Cases:

- No `rename` events at or before `date` → `{ id, name }` with the current
  `categories.name` (the category has never been renamed before `date`, so
  its current name is what it was called then too).
- One or more `rename` events at or before `date` → take the **most recent
  rename ≤ date** by `(occurred_at, event_seq)`, return `{ id, name }`
  where `name = that event's payload.new_name`. If the most recent rename
  is the LAST rename overall, the result matches the current
  `categories.name`; otherwise it is the historical name.
- A `split` / `merge` event with `categoryId` as source at a time strictly
  **after** `date` → the category was still active at `date`; return as
  above.
- A `split` / `merge` event with `categoryId` as source at a time **at or
  before** `date` → the category was already deprecated at `date`. Return
  its name as of just before deprecation (apply the rename rule above to
  the events strictly before the deprecation event). Aggregation (§6.1)
  typically does not hit this case since it groups by the transaction's
  own date.

Never returns `splitInto` — `as_of_period` looks at the past, where the
split hadn't happened yet from the chosen reference date.

### 5.3 `as_of_now`

"How do I describe this historical category in today's taxonomy?"

Walks `taxonomy_events` forward from the category. Cases:

- No events, or only renames → `{ id, name }` with the current name.
- Source of a `merge` → `{ id, name }` with the target category's id and
  current name (after recursing through any subsequent events on the
  target).
- Source of a `split` → `{ id, name, splitInto: [...] }` listing every
  target, each recursively resolved.

A chained category (e.g. renamed → merged → renamed-again) is walked all
the way to its current effective target.

For aggregation purposes, the caller MUST apply the split event's mapping
rule (stored in `payload`, see §3.3) to individual transactions to flatten
the `splitInto` case — see §6.

## 6. Aggregation builder

```ts
function aggregateByCategory(
  db: DatabaseSync,
  options: {
    from: string; // ISO date, inclusive
    to: string; // ISO date, inclusive
    mode: 'as_of_period' | 'as_of_now'; // REQUIRED, no default
  },
): Array<{ categoryId: string; name: string; total: number; count: number }>;
```

`mode` is **required** with no default. A defaulted mode would lie silently
when the taxonomy has changed between `from` and `to`. Callers must make
the choice explicit.

### 6.1 `as_of_period`

For each transaction in `[from, to]`, resolve its `category_id`
as_of_period for the transaction's own `date`. Group by `(resolvedId,
resolvedName)`. Sum `amount`, count rows.

This per-transaction resolution gives the user the view they would have
seen on the day each transaction landed — the most honest interpretation
of "during that period".

### 6.2 `as_of_now`

For each transaction in `[from, to]`:

1. Resolve `transactions.category_id` as_of_now.
2. If `{ id, name }` → that's the bucket.
3. If `{ id, name, splitInto }` → apply the split event's mapping rule
   (stored in `payload`, §3.3) to `transactions.label_clean` to pick a
   target. The exhaustive-rule invariant (§3.3) guarantees a match.
4. If the chosen target has itself been further split / merged / renamed,
   recurse (§5.3).

Group by the final target. Result describes the past in today's taxonomy.

## 7. Migration plan

Migration `005_versioned_taxonomy.sql` is purely additive. **Order
matters**: `taxonomy_events` must be created BEFORE the `ALTER TABLE
categories ADD COLUMN ... REFERENCES taxonomy_events(id)`, otherwise
SQLite rejects the FK declaration against a non-existent table.

```sql
CREATE TABLE taxonomy_events (
  id TEXT PRIMARY KEY,
  event_seq INTEGER NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('rename', 'split', 'merge')),
  source_ids TEXT NOT NULL,
  target_ids TEXT NOT NULL,
  payload TEXT,
  occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_taxonomy_events_seq ON taxonomy_events(event_seq);

ALTER TABLE categories ADD COLUMN deprecated_at TEXT NULL;
ALTER TABLE categories ADD COLUMN replaced_by_event_id TEXT NULL
  REFERENCES taxonomy_events(id);
```

No data rewrite. Existing `categories` rows get `deprecated_at = NULL` and
`replaced_by_event_id = NULL` — correct, they have never been deprecated.

## 8. Test plan

Unit tests live under `tests/unit/taxonomy/`:

- **Operations** (T2): each op happy path + each precondition violation
  (deprecated source, missing target, non-exhaustive rule, < 2 targets for
  split, < 2 sources for merge).
- **Resolver** (T3): identity passthrough, single rename, single split,
  single merge, chained events (rename→merge, split→rename of target,
  merge→rename), `as_of_period` vs `as_of_now` matrix.
- **Aggregation** (T3): pre/post rename → totals stable; pre/post split
  with exhaustive rule → totals re-routed correctly under `as_of_now` and
  unchanged under `as_of_period`; pre/post merge → totals collapsed
  correctly under `as_of_now`.
- **Cross-check** (T3): in a window with no taxonomy mutations,
  `as_of_period` and `as_of_now` aggregations MUST be identical.
- **IPC** (T4): happy path + empty DB for each read channel.

Integration tests with a seeded fixture DB land alongside T3 to validate
multi-year scenarios end-to-end.

## 9. Open questions / future work

- **Reverting a taxonomy event.** Out of scope for T1..T5. If needed,
  add a `taxonomy_events.reverted_by_event_id` pointer and a `revert`
  kind.
- **Versioning the `parent_id` hierarchy** (reparenting, splitting a
  sub-tree). Out of scope. The current ops treat `parent_id` as
  pass-through; a future story can add hierarchy events.
- **Bulk import of a taxonomy revision** (swap in a new default set) would
  compose existing ops — defer until there is a user need.
- **Picking a representative date for `as_of_period`** when aggregating
  pre-computed groups — the per-transaction approach (§6.1) avoids the
  question entirely; keep it that way unless a perf issue demands grouping
  optimisations.
- **UI for showing the `splitInto` ambiguity** in single-transaction
  displays is the consumer's problem — out of this story.
