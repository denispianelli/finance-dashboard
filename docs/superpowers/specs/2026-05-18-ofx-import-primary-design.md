# OFX Ingestion as Primary Import Path — Design Spec

**Story:** #58 — OFX ingestion as primary import path
**Epic:** #23 — Import Pipeline (this story corrects a false premise of the Epic)
**Date:** 2026-05-18
**Status:** Approved — ready for implementation planning

---

## 1. Context and premise correction

Epic #23 asserts: _"PDF is the only usable format (LCL no longer offers CSV export)."_
This is **false**. LCL exports OFX, CSV and QIF, limited to a rolling window of
roughly three months, alongside a ten-year archive of PDF statements.

This changes the import strategy into a **two-role model**:

- **OFX — ongoing flux courant.** Structured, carries a bank-assigned `<FITID>`
  per transaction, requires no column mapping. The reliable spine, used
  continuously. This story.
- **PDF — historical backfill.** The only source for transactions older than the
  ~3-month export window. One-time per old statement, not a recurring
  dependency. A separate later story; the already-merged PDF pipeline
  (#31a) serves it without rework, guaranteed by the frozen identity contract
  (§6).

A pivot ADR documenting this premise correction and the frozen identity
contract is a deliverable of the implementation plan (Task 1).

## 2. Goal

Add OFX 1.x ingestion as the primary import path, reusing the entire
format-agnostic downstream pipeline. No regression of the PDF path. Transaction
identity based on `<FITID>`.

## 3. Scope

**In scope:**

- OFX 1.x (SGML) ingestion as the primary path.
- Hand-rolled minimal OFX SGML parser — no third-party dependency
  (privacy-first, AGPL, no supply chain to audit).
- Format-pluggable extraction refactor.
- Frozen transaction-identity contract across sources.
- `004_add_fitid.sql` migration (nullable `fitid` column).
- New `ImportError` codes: `unsupported_format`, `malformed_ofx`.

**Non-Goals (deliberate, with rationale):**

- **CSV / QIF** — OFX is strictly superior for the same source and window
  (FITID, no column mapping). Maintaining a second fragile parser for a format
  we would not use is the complexity tax this project explicitly avoids.
  Revisit only if a future bank lacks OFX.
- **PDF 10-year backfill** — separate story (sequencing decision: OFX first,
  dogfood on real data, backfill later). The frozen identity contract
  guarantees no rework.
- **LLM column mapping (#32)** — unnecessary for structured OFX. Deferred
  indefinitely for the LCL use case.
- **Multi-account / OFX `ACCTID` resolution** — single seeded account
  (`acc-lcl-default`) for now. The IPC already passes `accountId` explicitly.
- **Review UI (#31b)** — unchanged, still later.

## 4. Architecture — format-pluggable extraction

`extractStatement.ts` is currently PDF-hardcoded. Introduce a clean boundary:
extraction is selected by file type, everything downstream is unchanged.

`extractStatement`'s signature is **unchanged** (`db, accountId, content`):
OFX is detected by its content header (`OFXHEADER` / `<OFX>`) and PDF by magic
bytes (`%PDF-`), so the in-scope formats need no filename. `detectType` keeps
its current signature; filename is immaterial for PDF/OFX classification.
Callers (`importExtract`, `importConfirm`, `insertStatement`) are unaffected.

```
extractStatement(db, accountId, content)
  ├─ hashFile + isAlreadyImported            [agnostic, unchanged]
  ├─ detectType(content, ...)                 → 'pdf' | 'ofx' | null
  ├─ dispatch:
  │     'pdf' → extractPdf(db, content)   ─┐
  │     'ofx' → extractOfx(db, content)   ─┤→ NormalizedStatement
  │     null  → throw ImportError('unsupported_format')
  ├─ assignTxHash(accountId, NormalizedStatement)   [frozen identity contract]
  ├─ verifyArithmetic                          [agnostic, unchanged]
  ├─ checkPeriodOverlap                         [agnostic, unchanged]
  ├─ findExistingHashes                         [agnostic, unchanged]
  └─ → StatementExtraction                      [unchanged shape]
```

### Normalized intermediate

```ts
interface NormalizedTx {
  date: string; // ISO yyyy-mm-dd
  label: string; // raw label (NAME, falling back to MEMO for OFX)
  amount: number; // signed; debit negative, credit positive
  fitid: string | null; // OFX bank-assigned id; null for PDF
}

interface NormalizedStatement {
  transactions: NormalizedTx[];
  openingBalance: number | null;
  closingBalance: number | null;
  openingDate: string; // ISO yyyy-mm-dd
  closingDate: string; // ISO yyyy-mm-dd
  bankId: string;
}
```

Both extractors produce this exact shape. Everything after `assignTxHash` is
untouched.

## 5. Components and file structure

| File                                             | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main/import/ofx/parseOfx.ts` (new)          | Minimal OFX 1.x SGML parser. Subset only: `<STMTTRN>` (`DTPOSTED`, `TRNAMT`, `FITID`, `NAME`, `MEMO`), `<BANKACCTFROM>` (`BANKID`, `ACCTID`), `<LEDGERBAL>` (`BALAMT`, `DTASOF`), `<ORG>`. Handles the pre-`<OFX>` header block, unclosed SGML tags, SGML entities, OFX dates `YYYYMMDD[HHMMSS][.XXX][tz]`.                                                                                                                                                    |
| `src/main/import/ofx/extractOfx.ts` (new)        | Adapts `parseOfx` output → `NormalizedStatement`. Resolves `bankId` by matching OFX `<BANKID>`/`<ORG>` against the `banks` table; throws `ImportError('unknown_bank')` on no match. Opening/closing dates from min/max `DTPOSTED`; closing balance from `<LEDGERBAL>` `BALAMT`; opening balance derived as `closing − Σ amounts` is **not** done here — opening balance is left `null` when OFX provides no opening figure, yielding `cannot_verify` (see §7). |
| `src/main/import/extractPdf.ts` (refactor)       | The current PDF extraction logic (loadPages + detectBank + extractTransactions) lifted out of `extractStatement.ts` into a `NormalizedStatement`-returning function. Behaviour identical to today.                                                                                                                                                                                                                                                             |
| `src/main/import/extractStatement.ts` (refactor) | Becomes the dispatcher orchestrator above.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `src/main/import/txHash.ts` (modified)           | `computeTxHash` takes a discriminated input. The frozen identity contract lives and is tested here.                                                                                                                                                                                                                                                                                                                                                            |
| `src/main/db/migrations/004_add_fitid.sql` (new) | `ALTER TABLE transactions ADD COLUMN fitid TEXT;`                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/main/db/migrate.ts` (modified)              | Register migration version 4.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/main/import/insertStatement.ts` (modified)  | Persist `fitid` when present (NULL for PDF).                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/shared/types/import.ts` (modified)          | Add `NormalizedTx`, `NormalizedStatement`; extend `ImportErrorCode`.                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/shared/types/ipc.ts` (modified)             | Extend `ExtractResponse` / `ConfirmResponse` error literals.                                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/main/import/importError.ts` (modified)      | Add `unsupported_format`, `malformed_ofx`.                                                                                                                                                                                                                                                                                                                                                                                                                     |

## 6. Transaction identity and dedup contract (FROZEN)

The `UNIQUE (account_id, tx_hash)` constraint on `transactions` is the dedup
engine. Identity is whatever goes into `tx_hash`. One column cannot match
cross-source by content **and** distinguish true same-day duplicates, so we do
not attempt cross-source hash equality.

`computeTxHash` becomes discriminated:

```ts
type TxHashInput =
  | { kind: 'ofx'; accountId: string; fitid: string }
  | { kind: 'pdf'; accountId: string; date: string; amount: number; label: string; order: number };
```

- **OFX:** `tx_hash = sha256(accountId | 'ofx' | fitid)`. Two genuinely
  identical same-day transactions have distinct FITIDs → distinct rows.
  Re-importing the same OFX dedups perfectly via the UNIQUE constraint.
- **PDF:** unchanged content+order hash (existing behaviour, existing tests).
- **Cross-source PDF↔OFX:** **not** matched by hash. Double-import across the
  overlap window is prevented by (a) the existing `checkPeriodOverlap` warning,
  and (b) procedure — backfill PDF only for the pre-OFX era. This contract is
  recorded in the pivot ADR; the future PDF-backfill story conforms to it
  without rework.

`fitid` is also stored in its own nullable column for traceability and
debugging, even though identity flows through `tx_hash`.

## 7. Error handling

`ImportError` codes (shared type → `import.ts`, surfaced via `ipc.ts`,
consistent with the recent layering cleanup):

| Code                           | Trigger                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `unsupported_format`           | `detectType` returns `null` (not PDF, not OFX; CSV/QIF deliberately unsupported)                                                      |
| `malformed_ofx`                | `detectType` says OFX but `parseOfx` fails                                                                                            |
| `unknown_bank`                 | OFX `BANKID`/`ORG` matches no row in `banks`                                                                                          |
| `arithmetic_failed`            | existing — reused                                                                                                                     |
| `cannot_verify_unacknowledged` | existing — reused; OFX with no opening balance → `verifyArithmetic` returns `cannot_verify` (closing balance from `<LEDGERBAL>` only) |
| `already_imported`             | existing — file hash already imported                                                                                                 |
| `not_pdf`, `no_text`           | PDF path only — cannot fire on the OFX path                                                                                           |

## 8. Testing strategy

- **Unit — `parseOfx`:** hand-crafted OFX 1.0.2 SGML fixture strings (inline,
  zero real data, privacy-safe). Cover: FITID extraction; `TRNAMT` sign;
  `DTPOSTED` date parsing incl. timezone suffix; `NAME` present vs `MEMO`
  fallback; missing `<LEDGERBAL>` → opening/closing handling; pre-`<OFX>`
  SGML header; unclosed tags; SGML entities (`&amp;` etc.).
- **Unit — `txHash`:** discriminated contract. OFX hash stable and distinct for
  differing FITIDs with identical content; PDF hash byte-for-byte unchanged
  (regression guard).
- **Unit — `extractStatement` dispatch:** `detectType` → correct extractor;
  `null` → `unsupported_format`; OFX parse failure → `malformed_ofx`.
- **Integration:** real LCL OFX fixture (gitignored, `it.skipIf(!existsSync)`,
  same pattern as the PDF fixture). Full `extractStatement`: transaction
  count, arithmetic status, `fitid` populated, re-import → all duplicates,
  period-overlap flag.

## 9. Pre-implementation risk spike

Before writing any implementation code, verify on a **real** LCL OFX export
that `<FITID>` values are **unique within a statement** and **stable across two
exports of overlapping periods**. The entire identity model depends on this. If
LCL emits unstable or non-unique FITIDs, the identity model is reassessed
before implementation. Estimated effort: ~10 minutes against a real export.

## 10. Definition of Done

- An LCL OFX export imports end-to-end: pick file → extract → dedup →
  arithmetic check → atomic INSERT, reusing the existing downstream pipeline.
- Re-importing the same OFX yields zero new transactions (FITID dedup).
- PDF path behaviour and tests unchanged (regression guard green).
- `fitid` column present and populated for OFX rows, `NULL` for PDF rows.
- Pivot ADR written and referenced from Epic #23.
- New error codes surfaced through the IPC contract.
- Risk spike (§9) completed and its outcome recorded.
