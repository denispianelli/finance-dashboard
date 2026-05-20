# ADR-010 — Versioned category taxonomy

- **Status** : Accepted
- **Date** : 2026-05-20 (proposed) — 2026-05-20 (accepted)
- **Category** : Data, Product
- **Related** : ADR-009 (product scope realignment), ADR-006 (multi-level deduplication — same history-preservation philosophy)

## Context

ADR-009 elevated multi-year retrospective analysis (Epic #73) to one of the
three value pillars of the product. That pillar is only honest if categories
are stable across years.

The current `categories` table (`docs/superpowers/specs/2026-05-14-finance-dashboard-design.md` §10)
is flat and unversioned: renames overwrite the name in place, and there is
no way to record a split or merge. Any of those mutations silently rewrites
all historical aggregation. "Uber Eats sur 3 ans" or "épargne 2022 vs 2025"
would lie with confidence after a single taxonomy edit. A fix is unavoidable
before the retrospective pillar can ship.

## Decision

Adopt an **event-log model** for the taxonomy:

1. `categories.id` is the stable identity. Renames update `name` in place
   and append a `rename` event recording the change.
2. A new `taxonomy_events` table records every `rename`, `split` and `merge`,
   with JSON `source_ids` / `target_ids` and a generic `payload` JSON column
   whose shape depends on `kind` (mapping rule for split, name change for
   rename, NULL for merge). A monotonic `event_seq` column gives a
   deterministic tiebreaker when multiple events share an `occurred_at`
   second.
3. Deprecated categories (sources of split or merge) carry `deprecated_at` +
   `replaced_by_event_id` on `categories`. They are **not deleted** and
   `transactions.category_id` is **not rewritten**. History stays anchored.
4. A resolver `resolveCategoryAsOf(id, mode, date?)` walks the event log to
   return either the category as it was during the period (`as_of_period`)
   or the category in today's taxonomy (`as_of_now`).
5. Aggregations take an **explicit, required** `mode` parameter. There is
   no default — a defaulted resolution would silently lie when the taxonomy
   has moved.
6. The split's mapping rule (stored in `payload`) MUST be exhaustive (final
   pattern matches `.*`), enforced at construction time. Guarantees no
   transaction is ever dropped from `as_of_now` aggregation.

Full implementation contract:
`docs/superpowers/specs/2026-05-20-versioned-taxonomy-design.md`.

## Alternatives considered

- **SCD Type-2 versioning of `categories`** (rows with `valid_from`/
  `valid_to`, a separate `category_key` as stable identity). Rejected: more
  invasive — every existing query against `categories` would need to be
  taught about temporal validity. The event-log model gives the same
  semantic power with an additive schema migration.
- **Denormalised category snapshot on `transactions`** at insert time.
  Rejected: decouples transactions from the taxonomy in a way that breaks
  bulk recategorization (#34) and makes `as_of_now` queries impossible.

## Consequences

- Multi-year retrospective aggregation (Epic #73) becomes implementable
  honestly.
- Every taxonomy mutation has an audit trail in `taxonomy_events` — useful
  beyond display correctness (e.g. explaining "why did this category change
  shape" to the user later).
- The schema migration is additive: existing `categories` rows and
  `transactions.category_id` references are untouched. #29 (default
  categories seed) lands on the new schema without changes.
- Aggregation callers must explicitly pick `as_of_period` or `as_of_now`.
  Deliberate friction — accept the cost in exchange for never lying by
  omission.
- The split mapping rule reuses the same label-regex shape as
  `categorization_rules` (#29), keeping the model conceptually unified.

## Consequences delta (2026-05-20, on acceptance)

The model shipped as described, with no semantic deviation from the proposal.
Concrete landings:

- Schema lives in migration `005_versioned_taxonomy.sql`: `taxonomy_events`
  table + additive `deprecated_at` / `replaced_by_event_id` columns on
  `categories`. No data rewrite.
- Operations shipped in `src/main/taxonomy/{renameCategory,splitCategory,mergeCategories}.ts`,
  each a pure function taking a `DatabaseSync` and returning the created
  `event_id` in a single transaction.
- `event_seq` (monotonic integer assigned at insert) is the deterministic
  tiebreaker the resolver walks alongside `occurred_at` — confirms the
  decision point in §3.2 of the design spec.
- The exhaustive-rule invariant for split `payload` is enforced at
  construction time (T2), so `as_of_now` aggregation can never drop a
  transaction.

Resolver, aggregation builder and IPC channels (T3, T4) land in follow-up
PRs and do not invalidate this decision. The design spec
(`docs/superpowers/specs/2026-05-20-versioned-taxonomy-design.md`) remains
the implementation contract — consult it for the full operation, resolver
and aggregation semantics.
