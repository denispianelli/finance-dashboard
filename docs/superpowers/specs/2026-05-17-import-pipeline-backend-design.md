# Import Pipeline (Backend) — Design Spec

**Date:** 2026-05-17
**Status:** Validated, pending implementation plan
**Story:** #31a — Import pipeline backend (sub-story of [#31 — Review page + atomic INSERT](https://github.com/denispianelli/finance-dashboard/issues/31))
**Parent:** Epic — Import Pipeline (#23)
**References:** ADR-003 (deterministic extraction), ADR-005 (mandatory human review), ADR-006 (multi-level deduplication), arithmetic-verification-design (#30)

---

## 1. Goal

Build the backend half of the mandatory-review import flow: a stateless
extraction orchestrator and an atomic INSERT, exposed over two IPC channels.
The renderer-side Review page is the sibling sub-story #31b and consumes the
types defined here.

This story produces no UI. It is fully unit- and integration-testable on its
own.

## 2. Scope

In scope:

- Migration `003_seed_default_account.sql` — one default LCL account
- `detectBank.ts` — bank-signature detection → column mapping
- `extractStatement.ts` — extraction orchestrator (read-only, no DB writes)
- `insertStatement.ts` — atomic INSERT (re-extracts, guards, writes)
- IPC channels `import:extract` and `import:confirm` + handlers + contract types
- Unit + integration tests

Out of scope (deferred):

- The Review page UI → sub-story #31b (consumes the contract from §4)
- PDF viewer (deferred per design discussion — arithmetic check is the real
  guard, not visual cross-check)
- Inline editing of transactions → later story (this flow is read-only)
- Multi-account management / account creation UI → later story (one seeded
  default account is used)
- LLM categorization → not wired _in this story_. The deterministic cascade
  (rule → history) runs at **insert** (unchanged). The LLM tier-3 shipped later as
  an **async background pass after import** (not in this Review flow): it
  categorizes the residual (`category_id IS NULL`) rows and surfaces them in the
  Transactions/dashboard views. The `confidence` column was dropped; there is no
  Review-time category signal. See **ADR-013 (amended)** and
  `specs/2026-06-05-llm-batch-categorization-design.md` §11.

## 3. Architecture

Backend only, stateless, same pure-vs-DB split as the rest of the epic.

```
src/main/db/migrations/
  003_seed_default_account.sql   NEW

src/main/import/
  detectBank.ts                  NEW (DB read)
  extractStatement.ts            NEW (orchestrator, DB read)
  insertStatement.ts             NEW (orchestrator, DB write, atomic)

src/main/ipc/handlers/
  importExtract.ts               NEW
  importConfirm.ts               NEW

src/shared/types/
  import.ts                      NEW (shared result types)

src/main/ipc/channels.ts         MODIFIED (+2 channels)
src/main/ipc/register.ts         MODIFIED (+2 handlers)
src/shared/types/ipc.ts          MODIFIED (+2 contract entries)
src/main/import/verifyArithmetic.ts  MODIFIED (re-export ArithmeticCheckResult from @shared)
src/main/import/periodOverlap.ts     MODIFIED (re-export PeriodOverlapResult/OverlappingImport from @shared)
```

**Layering fix.** `src/shared/` must not import from `@main` (the renderer
consumes `@shared` and would transitively pull main code). So
`ArithmeticCheckResult`, `PeriodOverlapResult` and `OverlappingImport` move
to `src/shared/types/import.ts`. `verifyArithmetic.ts` and `periodOverlap.ts`
import them from `@shared/types/import` and re-export under the same names —
every existing import path (tests, callers) keeps working unchanged. This is
a small, justified boundary improvement made while working in the area.

Consumes existing modules otherwise unchanged: `extractPdfText`
(pdf/extract), `extractTransactions` (pdf/extractTransactions),
`assignTxHashes` + `normalizeLabel` (txHash), `verifyArithmetic`
(verifyArithmetic), `checkPeriodOverlap` (periodOverlap), `hashFile` +
`isAlreadyImported` (hashFile / duplicateCheck), `getDb` (db).

`imports.status` is written directly as `'validated'`: nothing is inserted
until the user has validated on the Review page (ADR-005), so no
`pending_review` row exists in this flow. `checkPeriodOverlap` matches
`status IN ('validated','pending_review')`, so validated rows are correctly
considered for future overlap checks.

## 4. Types & IPC contract

`src/shared/types/import.ts` (NEW) — owns the result types, no `@main`
dependency:

```typescript
// Moved here from verifyArithmetic.ts (re-exported there for back-compat)
export interface ArithmeticCheckResult {
  status: 'passed' | 'failed' | 'cannot_verify';
  openingBalance: number | null;
  closingBalance: number | null;
  computedClosing: number | null;
  /** computedClosing − statedClosing; negative means transactions sum to less than stated closing */
  delta: number | null;
}

// Moved here from periodOverlap.ts (re-exported there for back-compat)
export interface OverlappingImport {
  id: string;
  date_range_start: string;
  date_range_end: string;
  status: 'validated' | 'pending_review';
}

export interface PeriodOverlapResult {
  hasOverlap: boolean;
  overlappingImports: OverlappingImport[];
}

export interface ReviewTransaction {
  date: string;
  label: string;
  amount: number;
  tx_hash: string;
  isDuplicate: boolean; // already in DB for this account (Level 3)
}

export interface StatementExtraction {
  transactions: ReviewTransaction[];
  arithmetic: ArithmeticCheckResult;
  periodOverlap: PeriodOverlapResult;
  newCount: number;
  duplicateCount: number;
  fileHash: string;
  alreadyImported: boolean; // Level 1
  dateRangeStart: string;
  dateRangeEnd: string;
}
```

`verifyArithmetic.ts` becomes:
`import type { ArithmeticCheckResult } from '@shared/types/import';
export type { ArithmeticCheckResult };` (function body unchanged).
`periodOverlap.ts` likewise re-exports `PeriodOverlapResult` /
`OverlappingImport` from `@shared/types/import`.

Added to `src/shared/types/ipc.ts` (imports the above from
`@shared/types/import`):

```typescript
export type ExtractPayload = { path: string; accountId: string };
export type ExtractResponse =
  | { ok: true; extraction: StatementExtraction }
  | { ok: false; error: 'unknown_bank' | 'no_text' | 'not_pdf' };

export type ConfirmPayload = {
  path: string;
  accountId: string;
  acknowledgedCannotVerify?: boolean;
};
export type ConfirmResponse =
  | { ok: true; importId: string; insertedCount: number; skippedCount: number }
  | {
      ok: false;
      error:
        | 'arithmetic_failed'
        | 'cannot_verify_unacknowledged'
        | 'already_imported'
        | 'unknown_bank'
        | 'no_text'
        | 'not_pdf';
    };
```

Added to the `IpcContract` interface:

```typescript
'import:extract': { payload: ExtractPayload; response: ExtractResponse };
'import:confirm': { payload: ConfirmPayload; response: ConfirmResponse };
```

Decisions:

- **Discriminated `{ ok: true | false }` results**, not exceptions crossing
  IPC. The renderer (#31b) pattern-matches on `error`. Genuinely unexpected
  exceptions still surface as a rejected promise.
- `ArithmeticCheckResult` / `PeriodOverlapResult` / `OverlappingImport`
  live in `@shared/types/import`; the main modules re-export them so
  `@shared` never depends on `@main` (see §3 layering fix).
- `ReviewTransaction` originally carried no category. Since updated (ADR-013):
  it carries `categoryId` + `tier` (the deterministic cascade result computed at
  extract), and the LLM fills the residual in the Review. The `confidence` column
  no longer exists — uncertainty is the ephemeral cascade tier (see ADR-005).

## 5. Logic

### 5.1 `detectBank(db, pages)`

Concatenate the text of all pages. For each row of `banks` with a non-null
`detected_signature`, test whether the concatenated text contains that
signature (case-sensitive — signatures are stored uppercase, PDF bank
headers are uppercase). On the first match, load the column mapping from
`bank_column_mappings` for that `bank_id` (`format_version = 'v1'`). Return
`{ bankId, mapping } | null`.

### 5.2 `extractStatement(db, accountId, content)` → `StatementExtraction`

Read-only. No DB writes.

1. `fileHash = hashFile(content)`
2. `alreadyImported = isAlreadyImported(db, fileHash)`
3. `{ pages } = await extractPdfText(content)` — if no text → throw `no_text`
4. `bank = detectBank(db, pages)` — if `null` → throw `unknown_bank`
5. `extracted = extractTransactions(pages, bank.mapping)`
6. `withHashes = assignTxHashes(accountId, extracted.transactions)`
7. `arithmetic = verifyArithmetic(extracted.transactions, extracted.openingBalance, extracted.closingBalance)`
8. `periodOverlap = checkPeriodOverlap(db, accountId, extracted.openingDate, extracted.closingDate)`
9. Query existing hashes:
   `SELECT tx_hash FROM transactions WHERE account_id = ?` → a `Set`. For
   each transaction, `isDuplicate = set.has(tx_hash)`.
10. `newCount` = count of `!isDuplicate`; `duplicateCount` = count of
    `isDuplicate`.
11. Return the assembled `StatementExtraction` with
    `dateRangeStart = extracted.openingDate`,
    `dateRangeEnd = extracted.closingDate`.

`not_pdf` / `no_text` are distinguished by `extractPdfText`'s behaviour: a
non-PDF buffer fails to parse (→ `not_pdf`); a PDF that parses but yields no
text items (→ `no_text`).

### 5.3 `insertStatement(db, accountId, content, opts)` → InsertResult

`opts: { acknowledgedCannotVerify?: boolean }`. Re-extraction is the single
source of truth (Approach A).

1. `extraction = extractStatement(db, accountId, content)` (re-runs the full
   pipeline; same throws propagate as `unknown_bank` / `no_text` / `not_pdf`)
2. Guards (each → throw a tagged error the handler maps to `{ ok:false }`):
   - `extraction.alreadyImported` → `already_imported`
   - `extraction.arithmetic.status === 'failed'` → `arithmetic_failed`
   - `extraction.arithmetic.status === 'cannot_verify'
&& !opts.acknowledgedCannotVerify` → `cannot_verify_unacknowledged`
3. Atomic write:
   ```
   db.exec('BEGIN');
   try {
     importId = randomUUID();
     INSERT INTO imports
       (id, account_id, file_hash, source_type, date_range_start,
        date_range_end, status)
       VALUES (importId, accountId, extraction.fileHash, 'pdf',
               extraction.dateRangeStart, extraction.dateRangeEnd,
               'validated');
     for (tx of extraction.transactions where !tx.isDuplicate) {
       INSERT INTO transactions
         (id, account_id, import_id, tx_hash, date, amount,
          label_raw, label_clean, category_id,
          is_internal_transfer, user_modified)
         VALUES (randomUUID(), accountId, importId, tx.tx_hash, tx.date,
                 tx.amount, tx.label, normalizeLabel(tx.label),
                 NULL, 0, 0);
     }
     db.exec('COMMIT');
   } catch (e) {
     db.exec('ROLLBACK');
     throw e;
   }
   ```
4. Return `{ importId, insertedCount: newCount, skippedCount: duplicateCount }`.

Duplicates are skipped explicitly before the INSERT (already counted at
extract). The `UNIQUE(account_id, tx_hash)` constraint remains the safety
net.

### 5.4 IPC handlers

`importExtract.ts`: read file at `payload.path`, call `extractStatement`,
return `{ ok:true, extraction }`. Catch the tagged extraction errors and
return `{ ok:false, error }`.

`importConfirm.ts`: read file at `payload.path`, call `insertStatement`.
Return `{ ok:true, importId, insertedCount, skippedCount }`. Catch tagged
errors → `{ ok:false, error }`. Unexpected exceptions (e.g. DB failure after
rollback) propagate as a rejected promise.

## 6. Error handling

| Case                       | `import:extract`                                           | `import:confirm`                                                                                     |
| -------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Not a readable PDF         | `{ ok:false, error:'not_pdf' }`                            | same                                                                                                 |
| PDF without a text layer   | `{ ok:false, error:'no_text' }`                            | same                                                                                                 |
| No known bank signature    | `{ ok:false, error:'unknown_bank' }`                       | same                                                                                                 |
| File already imported (L1) | `{ ok:true, extraction:{ alreadyImported:true … } }`       | `{ ok:false, error:'already_imported' }`                                                             |
| Arithmetic `failed`        | `{ ok:true, extraction:{ arithmetic.status:'failed' … } }` | `{ ok:false, error:'arithmetic_failed' }`                                                            |
| Arithmetic `cannot_verify` | `{ ok:true, … }`                                           | refuse unless `acknowledgedCannotVerify` → else `{ ok:false, error:'cannot_verify_unacknowledged' }` |
| DB exception mid-INSERT    | n/a                                                        | `ROLLBACK`, exception rejects the promise (a bug, not a business case)                               |

Principle: `extract` is **permissive and informative** — it succeeds and
describes problems via fields so the Review page can surface them.
`confirm` is **strict** — it refuses anything unsound regardless of what the
UI displayed. The asymmetry is intentional: the UI informs, the backend
guards.

## 7. Testing

Vitest. Unit tests (in-memory `node:sqlite` + synthetic pages) in
`tests/unit/import/`; integration tests (real LCL fixture) in
`tests/integration/import/`.

**`detectBank` (unit, in-memory DB + synthetic pages):**

- text containing `CREDIT LYONNAIS` → `{ bankId:'lcl', mapping }` with the
  seeded mapping
- text without any known signature → `null`

**`extractStatement` (integration, real LCL fixture):**

- fresh DB: `newCount === 46`, `duplicateCount === 0`,
  `arithmetic.status === 'passed'`, `periodOverlap.hasOverlap === false`,
  `alreadyImported === false`, every tx has a `tx_hash`, all
  `isDuplicate === false`
- after a prior `insertStatement` of the same statement:
  `duplicateCount === 46`, `periodOverlap.hasOverlap === true`

**`insertStatement` (unit + integration, in-memory DB):**

- healthy statement → 1 `imports` row (status `validated`), 46
  `transactions`, `insertedCount === 46`, `skippedCount === 0`
- re-import of an overlapping statement → only new ones inserted, duplicates
  skipped, `skippedCount` correct, `UNIQUE` never violated
- `label_clean === normalizeLabel(label)`, `category_id` NULL, `import_id`
  correct
- arithmetic `failed` (synthetic unbalanced pages) → refuses, **no** rows
  written
- `cannot_verify` without ack → refuses; with
  `acknowledgedCannotVerify:true` → inserts
- already-imported file → refuses `already_imported`
- atomicity: simulated exception mid-INSERT → `ROLLBACK`, `transactions`
  and `imports` empty

**IPC handlers:** lightweight test that `import:extract` / `import:confirm`
wire the orchestrator and return the expected `{ ok }` shape (business cases
are covered at the orchestrator level, not duplicated here).

## 8. Self-Review

- **Placeholders:** none.
- **Internal consistency:** file structure (§3) matches the logic (§5) and
  the contract (§4); the seven error cases (§6) are produced by exactly the
  throws in §5.2/§5.3; tests (§7) cover each branch. The shared/main
  layering fix (§3, §4) is consistent: types live in
  `@shared/types/import`, main modules re-export them under unchanged names
  so no existing import path breaks.
- **Scope:** single backend sub-story; the UI is explicitly deferred to
  #31b which consumes the §4 contract. No further decomposition needed.
- **Ambiguity:** the extract/confirm asymmetry is explicit (§6); Approach A
  (re-extract on confirm) is explicit (§5.3); the three arithmetic states
  map to explicit confirm outcomes (§6); duplicate skipping is explicit
  (§5.3).
