# PDF Historical Backfill (Two-Role Import Model) — Implementation Plan (Story #75)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PDF statements usable as historical backfill behind the OFX
rolling window, with no double-counting of transactions OFX already covers.

**Architecture:** The PDF import pipeline already exists (#24–#31a). This story
adds a persistence-time **clip**: a PDF transaction whose date falls inside an
OFX-covered period is marked `coveredByOfx` and not persisted, while the rest
import normally. Arithmetic verification still runs on the full statement; the
clip sits alongside the existing hash-dedup filter. Every PDF import reports
what was imported and what was skipped.

**Tech stack:** TypeScript (strict), `node:sqlite` (`DatabaseSync`), Electron
IPC, Vitest, Playwright. Backend-heavy story — one small UI affordance (T3).

**Story:** #75 — PDF historical backfill (two-role import model)
**Parent epic:** #23 — Import Pipeline
**Tasks:** T0 #100 → T1 #101 → T2 #102 → T3 #103 → T4 #104 → T5 #105
(strictly sequential — each task references the previous one's outputs).

Full design contract: `docs/superpowers/specs/2026-05-21-two-role-import-design.md`.
Decision rationale: `docs/adr/011-two-role-import-model.md`.

---

## File structure

| File                                                            | Task    | Responsibility                                                                   |
| --------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------- |
| `docs/superpowers/specs/2026-05-21-two-role-import-design.md`   | T0      | Design contract. Lands in this commit.                                           |
| `docs/adr/011-two-role-import-model.md`                         | T0 → T5 | ADR; **Proposed** at T0, flipped to **Accepted** at T5.                          |
| `docs/superpowers/plans/2026-05-21-story-75-pdf-backfill.md`    | T0      | This file. Lands in this commit (Task-1 style per `CLAUDE.md`).                  |
| `src/main/db/migrations/006_*.sql`                              | T1      | NEW _if_ T1 picks the schema route — `source` column on `imports`. See T1.       |
| `src/main/import/ofxCoverage.ts`                                | T1      | NEW — compute the list of OFX-covered `[start, end]` date ranges for an account. |
| `src/main/import/clipCoveredTransactions.ts`                    | T2      | NEW — pure function: mark each transaction `coveredByOfx` against the ranges.    |
| `src/main/import/extractStatement.ts`                           | T2      | MODIFIED — wire the clip into the PDF path, after `verifyArithmetic`.            |
| `src/main/import/insertStatement.ts`                            | T2      | MODIFIED — persist only non-covered, non-duplicate transactions.                 |
| `src/shared/types/import.ts`                                    | T1 / T2 | MODIFIED — `coveredByOfx` flag, OFX-coverage range type, import-report shape.    |
| `src/main/ipc/handlers/importExtract.ts` / `importConfirm.ts`   | T2      | MODIFIED — carry the import report through the IPC contract.                     |
| Renderer import / Review surface                                | T3      | MODIFIED — show the imported-vs-skipped report. Files scoped in T3's own plan.   |
| `tests/e2e/` backfill scenario                                  | T4      | NEW — straddling-statement E2E.                                                  |
| `docs/superpowers/specs/2026-05-14-finance-dashboard-design.md` | T5      | MODIFIED — import section reflects the two-role model.                           |

---

## T0 — Design + ADR + plan (#100)

**Status:** in progress (this commit).

Deliverables, all landing in one commit:

- [ ] `docs/superpowers/specs/2026-05-21-two-role-import-design.md` — design spec.
- [ ] `docs/adr/011-two-role-import-model.md` — ADR, Status **Proposed**.
- [ ] `docs/superpowers/plans/2026-05-21-story-75-pdf-backfill.md` — this plan.
- [ ] No code changes.

## T1 — Period-level cross-source overlap detection (#101)

Make import source queryable and compute OFX-covered date ranges.

- **Open decision for T1's detailed plan:** how import source becomes
  queryable. Option A — add a `source TEXT` column to `imports` via migration
  006 and backfill existing rows. Option B — derive source from whether an
  import's transactions carry a non-null `fitid`. Option A is explicit and
  cheaper to query; Option B avoids a migration. Decide in T1's plan.
- New `ofxCoverage.ts`: given `db` and `accountId`, return the OFX-sourced
  imports' `[date_range_start, date_range_end]` ranges (status `validated` or
  `pending_review`, mirroring `checkPeriodOverlap`).
- Types in `import.ts` for the coverage ranges.
- Unit tests: single range, multiple non-contiguous ranges, no OFX import → empty.

## T2 — Backfill import flow, backend (#102)

Wire the clip into extraction and persistence.

- New `clipCoveredTransactions.ts`: pure function taking the verified
  transactions + the OFX-covered ranges, returning each transaction marked
  `coveredByOfx` (date inside any range, inclusive boundaries).
- `extractStatement.ts`: for the PDF path, after `verifyArithmetic`, call
  `ofxCoverage` + `clipCoveredTransactions`; carry the result and a report
  (imported count + range, skipped count + range) in `StatementExtraction`.
- `insertStatement.ts`: persist only transactions that are neither
  `coveredByOfx` nor an existing-hash duplicate.
- IPC handlers carry the report.
- Unit tests: no overlap → all kept; partial straddle → correct split; fully
  covered → all skipped; transaction dated exactly on the OFX start (inclusive).

## T3 — Backfill UI affordance (#103)

Surface the imported-vs-skipped report in the import / Review surface. French
copy per the design spec §5. Detailed UI files and layout land in T3's own plan
(per-Story UI is designed at the task's T0, not up front).

## T4 — E2E backfill scenario (#104)

Playwright E2E using gitignored real LCL fixtures (`it.skipIf(!existsSync)`):
import an OFX export, then a straddling PDF statement; assert the overlap is
skipped, the pre-OFX portion persists, no double count, and the report renders.

## T5 — Docs: promote ADR-011, update design spec (#105)

- Flip `docs/adr/011-two-role-import-model.md` Status to **Accepted**.
- Update the import section of `docs/superpowers/specs/2026-05-14-finance-dashboard-design.md`
  to reflect the two-role model and the clip.

---

## Conventions (from the codebase)

- Path aliases `@main/*`, `@shared/*` — declared in `tsconfig.json`,
  `electron.vite.config.ts` and the vitest config.
- DB unit tests: `new DatabaseSync(':memory:')` → `runMigrations(db)` →
  `db.close()`.
- `tx_hash` identity contract is **frozen** (ADR-008): source-specific hashes,
  no cross-source hash equality. The clip operates on dates, never on hashes.
- Pure functions where possible; one responsibility per file.
- TDD: failing test first, minimal implementation, commit per step.
- Each task is its own issue, branch and PR; the maintainer merges.
