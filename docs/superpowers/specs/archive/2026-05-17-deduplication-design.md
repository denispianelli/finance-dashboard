# Deduplication (3 Levels) — Design Spec

**Date:** 2026-05-17
**Status:** Validated, pending implementation plan
**Story:** [#28 — Deduplication (3 levels)](https://github.com/denispianelli/finance-dashboard/issues/28)
**Parent:** Epic — Import Pipeline (#23)

---

## 1. Goal

Implement the three deduplication layers defined in the Finance Dashboard design spec
(§6), so the import pipeline can detect re-imported files, overlapping statement
periods, and duplicate transactions before any `INSERT`.

Level 1 (file hash) already exists (`hashFile.ts`, `duplicateCheck.ts`). This story
adds Level 2 (period overlap) and Level 3 (transaction semantic hash).

## 2. Scope

In scope:

- `txHash.ts` — pure functions: `normalizeLabel`, `computeTxHash`, `assignTxHashes`
- `periodOverlap.ts` — DB query: `checkPeriodOverlap`
- Unit tests for both

Out of scope (handled by later stories):

- Pipeline orchestration / IPC wiring
- Re-import of a cancelled import (import management — separate story)
- The user-facing Review page that surfaces the period-overlap alert
- Persisting `label_clean` (belongs to the INSERT-mapping story)

## 3. Architecture

Two new files, nothing existing modified. Same pattern as the existing
pure-vs-DB split (`hashFile.ts` pure / `duplicateCheck.ts` DB):

```
src/main/import/
  hashFile.ts          existing (Level 1, pure)
  duplicateCheck.ts    existing (Level 1, DB)
  txHash.ts            NEW      (Level 3, pure)
  periodOverlap.ts     NEW      (Level 2, DB)

tests/unit/import/
  txHash.test.ts       NEW
  periodOverlap.test.ts NEW
```

## 4. Level 1 — File (already implemented)

For reference only — not modified by this story.

- `hashFile(content: Buffer): string` → SHA-256 hex
- `isAlreadyImported(db, hash): boolean` → checks `imports.file_hash`

Decision (this session): a re-imported file is **blocked** with a clear message.
Re-import of a `cancelled` import is deliberately deferred to a later
import-management story.

## 5. Level 2 — Period Overlap

Non-blocking detection. The function reports; the caller decides.

```typescript
interface OverlappingImport {
  id: string;
  date_range_start: string;
  date_range_end: string;
  status: string;
}

interface PeriodOverlapResult {
  hasOverlap: boolean;
  overlappingImports: OverlappingImport[];
}

/**
 * Pre-insert contract: call BEFORE inserting the new import row, so the
 * new import never matches itself. Compares against imports that are
 * 'validated' or 'pending_review' for the same account. 'cancelled'
 * imports are ignored.
 */
function checkPeriodOverlap(
  db: DatabaseSync,
  accountId: string,
  newStart: string,
  newEnd: string,
): PeriodOverlapResult;
```

SQL:

```sql
SELECT id, date_range_start, date_range_end, status
FROM imports
WHERE account_id = ?
  AND status IN ('validated', 'pending_review')
  AND date_range_start <= ?   -- newEnd
  AND date_range_end   >= ?   -- newStart
```

`hasOverlap = overlappingImports.length > 0`.

Boundaries are **inclusive**: a statement ending `2025-01-31` and another
starting `2025-01-31` overlap (the same day appears in both — intentional).
ISO `YYYY-MM-DD` strings compare lexicographically == chronologically.

## 6. Level 3 — Transaction Semantic Hash

### 6.1 Label normalization

```typescript
function normalizeLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // strip accents
    .toUpperCase()
    .replace(/\s+/g, ' ') // collapse spaces/tabs/newlines
    .trim();
}
```

### 6.2 Hash computation

```typescript
function computeTxHash(
  accountId: string,
  date: string,
  amount: number,
  labelRaw: string,
  orderInImport: number,
): string;
```

Hash input (SHA-256, hex):

```
accountId | date | amount.toFixed(2) | normalizeLabel(labelRaw) | orderInImport
```

Two design decisions, validated this session:

1. **`amount.toFixed(2)`** canonicalizes the amount. `1.1` and `1.10` both
   become `"1.10"`, eliminating float-representation drift. This matters
   because Level 3's entire purpose is matching the _same_ transaction
   across two statements.

2. **`orderInImport` is always included** (never optional). The spec's
   "only add it on collision" variant has an inherent cross-import flaw:
   a transaction appearing once in statement A (no order) and as part of a
   within-batch duplicate in overlapping statement B (order 0/1) would
   never match → double-counted. Always including a deterministic
   positional index makes the common case correct (A→0, B→0 matches and
   dedupes; B's genuine second purchase →1 is correctly seen as new).

Perfect cross-statement transaction dedup is **mathematically impossible**
from statement data alone (two identical same-day purchases are
indistinguishable from a duplicate). The real backstop remains the Level 2
overlap alert + mandatory user Review + arithmetic check (main design spec
§5). This story documents the limitation rather than over-engineering it.

### 6.3 Assigning hashes to a batch

```typescript
interface TransactionWithHash {
  date: string;
  label: string;
  amount: number;
  tx_hash: string;
}

function assignTxHashes(
  accountId: string,
  transactions: ExtractedTransaction[], // from extractTransactions.ts
): TransactionWithHash[];
```

Algorithm:

1. Iterate transactions in statement order (the order produced by
   `extractTransactions`).
2. Base key per transaction = `accountId | date | amount.toFixed(2) | normalizeLabel(label)`.
3. Maintain a per-base-key counter → `orderInImport` = 0, 1, 2, …
   (deterministic position within the batch).
4. `tx_hash = computeTxHash(accountId, date, amount, label, orderInImport)`.
5. Return each transaction unchanged plus its `tx_hash`.

## 7. Testing

Vitest. Level 2 uses an in-memory `node:sqlite` DB with `runMigrations`.

`normalizeLabel`:

- removes accents (`Crédit` → `CREDIT`)
- uppercases
- collapses multiple spaces, tabs, newlines to a single space
- trims leading/trailing whitespace

`computeTxHash`:

- deterministic (same inputs → same hash)
- `toFixed(2)` canonicalization (amount `1.1` and `1.10` → same hash)
- sensitive to each field (changing accountId / date / amount / label /
  orderInImport changes the hash)

`assignTxHashes`:

- nominal case: all-distinct transactions get distinct hashes, all
  `orderInImport` = 0
- within-batch duplicate (two identical "CARREFOUR 50.00" same day →
  order 0 then 1, distinct hashes)
- cross-import scenario from §6.2: a single occurrence in batch A and the
  first occurrence in batch B (which also has a second) produce the **same**
  hash (both order 0)

`checkPeriodOverlap`:

- no overlap → `hasOverlap: false`, empty list
- partial overlap → flagged
- inclusive boundary (end == start) → flagged
- `cancelled` import in range → ignored
- overlap on a different account → ignored

## 8. Self-Review

- Placeholders: none.
- Internal consistency: file structure (§3) matches the function
  definitions (§5, §6) and tests (§7).
- Scope: single focused implementation plan; no decomposition needed.
- Ambiguity: hash input field order and separator are explicit (§6.2);
  overlap boundary semantics explicit (§5).
