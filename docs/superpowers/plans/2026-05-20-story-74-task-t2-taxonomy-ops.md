# Story #74 — Task T2 (Taxonomy Ops) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement three pure backend operations — `renameCategory`, `splitCategory`, `mergeCategories` — that mutate `categories` and append a `taxonomy_events` row atomically. Each enforces the preconditions from the design spec §4 at construction time.

**Architecture:** Pure functions in `src/main/taxonomy/*.ts`. Each takes a `DatabaseSync` and a typed payload, returns the created `event_id` (string). Each runs in a single transaction (BEGIN / COMMIT / ROLLBACK on throw). Invariants are enforced by reading from `categories` + validating the payload **inside** the transaction so the precondition check and the write are atomic. Errors surface as thrown `Error`s with precise messages — T4 (IPC) will translate to discriminated results later if needed; anti-over-engineering says don't introduce a `TaxonomyError` class until there's a second caller.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), `node:sqlite` (`DatabaseSync`), `node:crypto` (`randomUUID`), Vitest.

**Spec:** `docs/superpowers/specs/2026-05-20-versioned-taxonomy-design.md` (§3 data model + §4 ops semantics).

**Parent plan:** `docs/superpowers/plans/2026-05-20-story-74-versioned-taxonomy.md`.

---

## File Structure

| File                                          | Responsibility                                                                                     |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `src/shared/types/taxonomy.ts`                | NEW — `MappingRule`, `RenamePayload`, `SplitPayload`, `MergePayload` JSON shapes (no `@main` dep). |
| `src/main/taxonomy/renameCategory.ts`         | NEW — rename op + event log entry. Throws on missing/deprecated source.                            |
| `src/main/taxonomy/splitCategory.ts`          | NEW — split op + event log + source deprecation. Throws on invariant violations.                   |
| `src/main/taxonomy/mergeCategories.ts`        | NEW — merge op + event log + source deprecations.                                                  |
| `tests/unit/taxonomy/renameCategory.test.ts`  | NEW — happy path + precondition violations.                                                        |
| `tests/unit/taxonomy/splitCategory.test.ts`   | NEW — happy path + each precondition violation.                                                    |
| `tests/unit/taxonomy/mergeCategories.test.ts` | NEW — happy path + each precondition violation.                                                    |

**Conventions** (already in the codebase):

- IDs: `randomUUID()` from `node:crypto`.
- DB unit tests: helper `freshDb()` → `new DatabaseSync(':memory:')` + `runMigrations(db)`. See `tests/unit/import/insertStatement.test.ts` for the pattern.
- `db.prepare(...).all() / .get()` results cast `as unknown as T`.
- Path aliases `@shared/*` and `@main/*` exist (`tsconfig.json` + `electron.vite.config.ts` + vitest config).
- `event_seq` assignment: inside the same transaction, `SELECT COALESCE(MAX(event_seq), 0) + 1 FROM taxonomy_events`.

---

## Tasks (TDD ordering)

Task 1 — Shared types (`src/shared/types/taxonomy.ts`).
Task 2 — `renameCategory` (test → impl → commit).
Task 3 — `splitCategory` (test → impl → commit; 7 tests covering each precondition).
Task 4 — `mergeCategories` (test → impl → commit; 5 tests covering each precondition).
Task 5 — Verify suite together: `npx vitest run tests/unit/`, `npm run typecheck`, apply `superpowers:verification-before-completion`, apply `superpowers:requesting-code-review` on diff, push + PR.

Each op's transactional skeleton:

```
BEGIN
  read source row from categories; throw if missing or deprecated
  for split/merge: read each target row; throw on missing/deprecated
  compute nextSeq = COALESCE(MAX(event_seq), 0) + 1
  INSERT INTO taxonomy_events (...)
  for split/merge: UPDATE categories SET deprecated_at, replaced_by_event_id WHERE source
  for rename: UPDATE categories SET name WHERE id
COMMIT  (ROLLBACK on any throw)
return event_id
```

**Mapping rule exhaustiveness invariant** (split): last rule's `pattern` MUST equal the literal `.*`. Stricter than "matches any input" but decidable and matches the spec example verbatim. Plus: every `target_id` referenced by a rule MUST be in `targetIds`.

**See spec §4** for full per-op preconditions and effects.

---

## Self-Review

**Spec coverage (§4):** rename, split (all 5 preconditions), merge (all 4 preconditions) all mapped to tasks. §4.4 chaining is T3's responsibility (resolver), not T2.

**Anti-over-engineering check:** No `TaxonomyError` class. No discriminated result wrapper at this layer (throws are fine for internal pure functions; T4 IPC can wrap). No retries, no logging side effects.

**Type consistency:** `MappingRule` defined in Task 1, used identically in Task 3 test scaffold + impl.

---

## Execution Handoff

Plan saved. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.
2. **Inline Execution** — execute tasks in this session using `superpowers:executing-plans`.

Which approach?
