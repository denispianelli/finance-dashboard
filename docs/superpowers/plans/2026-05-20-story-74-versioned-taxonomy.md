# Versioned Category Taxonomy — Implementation Plan (Story #74)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Make multi-year retrospective aggregation honest by versioning the
category taxonomy. See full design in
`docs/superpowers/specs/2026-05-20-versioned-taxonomy-design.md` and the
rationale in `docs/adr/010-versioned-category-taxonomy.md`.

**Tech stack:** TypeScript (strict), `node:sqlite` (`DatabaseSync`), Vitest,
Electron IPC. Pure backend story — no UI.

**Story:** #74 — Stable versioned category taxonomy
**Parent epic:** #23 — Import Pipeline
**Tasks:** T0 #80 → T1 #81 → T2 #82 → T3 #83 → T4 #84 → T5 #85 (strictly
sequential — each task references the previous one's outputs).

---

## File structure

| File                                                                | Task    | Responsibility                                                             |
| ------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------- |
| `docs/superpowers/specs/2026-05-20-versioned-taxonomy-design.md`    | T0      | Full design contract. Lands in this commit.                                |
| `docs/adr/010-versioned-category-taxonomy.md`                       | T0 → T5 | ADR; **Proposed** at T0, flipped to **Accepted** at T5.                    |
| `docs/superpowers/plans/2026-05-20-story-74-versioned-taxonomy.md`  | T0      | This file. Lands in this commit (Task-1 style per CLAUDE.md).              |
| `src/main/db/migrations/005_versioned_taxonomy.sql`                 | T1      | NEW — `taxonomy_events` table + `deprecated_at` / `replaced_by_event_id`.  |
| `src/main/db/migrate.ts`                                            | T1      | MODIFIED — register migration 005.                                         |
| `src/main/taxonomy/renameCategory.ts`                               | T2      | NEW — pure op.                                                             |
| `src/main/taxonomy/splitCategory.ts`                                | T2      | NEW — pure op + exhaustive-rule invariant.                                 |
| `src/main/taxonomy/mergeCategories.ts`                              | T2      | NEW — pure op.                                                             |
| `src/main/taxonomy/resolve.ts`                                      | T3      | NEW — `resolveCategoryAsOf` + `aggregateByCategory`.                       |
| `src/shared/types/taxonomy.ts`                                      | T4      | NEW — `Category`, `TaxonomyEvent`, `ResolvedCategory`, IPC payload shapes. |
| `src/shared/types/ipc.ts`                                           | T4      | MODIFIED — 3 new `IpcContract` entries.                                    |
| `src/main/ipc/channels.ts`                                          | T4      | MODIFIED — 3 new channel constants.                                        |
| `src/main/ipc/handlers/taxonomyList.ts`                             | T4      | NEW — `taxonomy:list` handler.                                             |
| `src/main/ipc/handlers/taxonomyHistory.ts`                          | T4      | NEW — `taxonomy:history` handler.                                          |
| `src/main/ipc/handlers/taxonomyEvents.ts`                           | T4      | NEW — `taxonomy:events` handler.                                           |
| `src/main/ipc/register.ts`                                          | T4      | MODIFIED — register 3 handlers.                                            |
| `tests/unit/taxonomy/*.test.ts`                                     | T2 / T3 | Unit tests per spec §8.                                                    |
| `tests/integration/taxonomy/*.test.ts`                              | T3      | Multi-year integration scenarios.                                          |
| `docs/superpowers/specs/2026-05-14-finance-dashboard-design.md` §10 | T5      | MODIFIED — schema update + `as_of_period` / `as_of_now` paragraph.         |

**Conventions** (from the codebase, mirrored from the
`2026-05-17-epic-2-story-31a-import-pipeline-backend.md` plan):

- Path aliases `@main/*`, `@shared/*` in `tsconfig.json` +
  `electron.vite.config.ts` + vitest config.
- DB unit tests: `new DatabaseSync(':memory:')` then `runMigrations(db)`
  then `db.close()`.
- `db.prepare(...).all()/.get()` results cast `as unknown as T`.
- Migrations: add the `.sql` file, `import sqlNNN from './migrations/NNN.sql?raw'`,
  append `{ version: N, sql: sqlNNN }` to `MIGRATIONS`. `*.sql?raw` is typed by
  `src/shared/types/sql.d.ts`.
- Unit tests under `tests/unit/...`, integration tests under `tests/integration/...`.
- Commit messages: imperative present, reference the issue (e.g. `Closes #81`).
- Branches: `<type>/<issue-number>-<short-slug>` per CONTRIBUTING.md.

---

## Tasks

### Task T0 — Design spec + ADR-010 + this plan (#80) — done in this commit

Ships:

- [x] `docs/superpowers/specs/2026-05-20-versioned-taxonomy-design.md`
- [x] `docs/adr/010-versioned-category-taxonomy.md` (Proposed)
- [x] this plan file

No production code. No schema change. No tests.

### Task T1 — Schema migration (#81)

Files: `005_versioned_taxonomy.sql`, `migrate.ts` register, migration runner
unit test. Additive migration — see spec §7.

### Task T2 — Backend operations (#82)

Files: `src/main/taxonomy/{rename,split,merge}.ts` + unit tests.
All invariants from spec §3.3 and §4 enforced at construction time.

### Task T3 — Resolver + as-of aggregation (#83)

Files: `src/main/taxonomy/resolve.ts` + unit + integration tests. Covers the
matrix in spec §8. Cross-check that `as_of_period` and `as_of_now` agree on a
no-change window.

### Task T4 — IPC + shared types (#84)

Files: `src/shared/types/taxonomy.ts`, 3 channel handlers, register.
Read-only — no write channels in this story (write ops are available
in-process to other backend code via T2).

### Task T5 — Docs (#85)

Promote ADR-010 to **Accepted** with a brief Consequences delta if needed.
Update design spec §10 to reflect the new schema and add a paragraph on
`as_of_period` vs `as_of_now`.
