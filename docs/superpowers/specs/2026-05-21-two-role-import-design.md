# Two-Role Import Model — Design Spec

**Date:** 2026-05-21
**Status:** Draft, pending implementation (T1..T5 = #101..#105)
**Story:** [#75 — PDF historical backfill (two-role import model)](https://github.com/denispianelli/finance-dashboard/issues/75)
**Parent:** Epic — Import Pipeline (#23); value prerequisite for Epic #73 (Retrospective Analytics) per ADR-009
**Related ADR:** [ADR-011 — Two-role import model and cross-source backfill clipping](../../adr/011-two-role-import-model.md) (Proposed)
**References:** ADR-008 (OFX primary / PDF backfill, frozen identity contract), ADR-003 (deterministic extraction + arithmetic guard), ADR-009 (north star), OFX import design spec (`2026-05-18-ofx-import-primary-design.md`)

---

## 1. Goal

Make PDF statements usable as historical backfill behind the OFX rolling
window, without ever double-counting a transaction that OFX already covers.
This is the channel for the maintainer's primary value — multi-year
retrospective analysis — so it must be honest by construction.

## 2. Scope

**In scope:**

- Backfill role semantics for the existing PDF import path.
- Cross-source overlap clipping: a PDF transaction whose date falls inside an
  OFX-covered period is not persisted.
- An import report stating what was imported and what was skipped.
- LCL only — deterministic extraction (#27) + seeded LCL column mapping
  (migration 002).

**Out of scope:**

- New PDF extraction work — the pipeline already exists (#24–#31a).
- Multi-bank backfill — blocked on LLM column mapping (#32), deferred.
- LLM categorization of backfilled transactions — Story #29.
- Taxonomy resolution of old transactions — Story #74 owns it.

## 3. The two roles

The role is derived from file format, not chosen:

- **OFX — primary ongoing flux.** Structured, bank-assigned `FITID`, the
  reliable spine. Imported continuously.
- **PDF — historical backfill.** The only source for transactions older than
  the ~3-month OFX window. Imported once per old statement.

## 4. Cross-source overlap clipping

### Where it sits

`extractStatement` already runs, in order: `detectType` → dispatch to
`extractPdf` / `extractOfx` → `assignTxHash` → `verifyArithmetic` →
`checkPeriodOverlap` → `findExistingHashes`. The clip is a new marking step for
the PDF path, applied **after `verifyArithmetic`** and alongside
`findExistingHashes`:

1. Arithmetic is verified on the **full** extracted statement — it proves the
   PDF was extracted faithfully. Unchanged.
2. The clip computes the set of OFX-covered date ranges for the account, then
   marks every transaction whose date falls inside one as `coveredByOfx`.
3. `findExistingHashes` continues to mark same-hash duplicates.
4. The Review/backfill UI shows imported vs skipped; `confirm` persists only
   transactions that are neither `coveredByOfx` nor an existing-hash duplicate.

### Computing OFX-covered ranges

The clip needs the date ranges of OFX-sourced imports for the account. **T1
(#101) decides how import source becomes queryable** — either a `source`
column on `imports` (migration) or derived from the non-null `fitid` of an
import's transactions. Either way the result is a list of `[start, end]`
ranges; a transaction is covered if its date lies within any of them
(inclusive boundaries, matching `checkPeriodOverlap`).

### The three cases

| Situation                                        | Result                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| No transaction in an OFX-covered range           | All imported.                                                       |
| Some transactions covered (straddling statement) | Pre-OFX portion imported, the rest skipped.                         |
| All transactions covered                         | Nothing imported; report says the period is already covered by OFX. |

Same-source overlap (PDF↔PDF, OFX↔OFX) is **not** clipped — the
`UNIQUE (account_id, tx_hash)` constraint already deduplicates it.

### Relationship to `checkPeriodOverlap`

`checkPeriodOverlap` already runs in the pipeline and reports — non-blocking —
any existing import whose period overlaps the new one, regardless of source. On
the PDF backfill path the clip supersedes it as the user-facing overlap
mechanism: the clip report (what was skipped, and that OFX already covers it),
together with the existing `findExistingHashes` duplicate report, tells the
user everything. `checkPeriodOverlap`'s coarser "overlaps import X" warning is
therefore **not surfaced for PDF imports** — showing both would be confusing
double-signalling. It is unchanged for OFX imports, which have no clip. Whether
`checkPeriodOverlap` is skipped entirely on the PDF path or simply computed and
not surfaced is a wiring detail for T1/T2.

## 5. The import report

Every PDF import surfaces a report (French, sentence case, `1 234,56 €`
formatting). Indicative copy — final wording lands with the UI in T3:

- Partial: « 142 transactions importées (01/01/2026–16/02/2026). 38 ignorées
  (17/02/2026–28/02/2026) — déjà couvertes par tes données OFX. »
- Fully covered: « Rien à importer — cette période est déjà couverte par tes
  données OFX. »
- No overlap: the existing import confirmation, unchanged.

## 6. Identity and dedup contract

Reused from ADR-008 unchanged. `UNIQUE (account_id, tx_hash)` is the dedup
engine; `tx_hash` is source-specific (`sha256(accountId | 'ofx' | fitid)` for
OFX, content+order hash for PDF); no cross-source hash equality is attempted.
The clip operates on **dates**, never on cross-source hashes.

## 7. Error handling

No new `ImportError` code. A fully-covered statement is a normal zero-import
outcome reported to the user, not an error. Existing extract-time errors
(`unsupported_format`, `unknown_bank`, `arithmetic_failed`, …) are unchanged.

## 8. Testing strategy

- **Unit — clip filter:** no overlap → all kept; partial straddle → correct
  split at the OFX boundary; fully covered → all skipped; inclusive-boundary
  edge (transaction dated exactly on the OFX start).
- **Unit — OFX-covered range computation:** single range, multiple
  non-contiguous ranges (gaps), no OFX import → empty.
- **Integration:** real gitignored LCL fixtures (`it.skipIf(!existsSync)`,
  existing pattern) — import an OFX export, then a straddling PDF statement;
  assert the overlap is skipped, the pre-OFX portion persists, no double count,
  arithmetic verified on the full statement.

## 9. Task breakdown

| Task | Issue | Deliverable                                                                                                  |
| ---- | ----- | ------------------------------------------------------------------------------------------------------------ |
| T0   | #100  | This spec, ADR-011 (Proposed), the implementation plan.                                                      |
| T1   | #101  | Period-level cross-source overlap detection: import source becomes queryable; OFX-covered range computation. |
| T2   | #102  | Backfill import flow (backend): the clip marking step wired into `extractStatement`, the report data.        |
| T3   | #103  | Backfill UI affordance: imported-vs-skipped report in the import/Review surface.                             |
| T4   | #104  | E2E backfill scenario.                                                                                       |
| T5   | #105  | Promote ADR-011 to Accepted, update the master design spec.                                                  |

## 10. Definition of Done (Story #75)

- A PDF statement straddling the OFX window imports its pre-OFX portion and
  skips the rest, with a clear report.
- A fully-covered PDF reports zero import without error.
- No double count: a transaction present in both an OFX export and a PDF
  statement persists exactly once.
- Arithmetic verification still runs on the full statement.
- ADR-011 promoted to Accepted; master design spec updated.
