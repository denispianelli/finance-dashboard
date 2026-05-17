# Import Pipeline (Backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend half of the mandatory-review import flow — a stateless extraction orchestrator and an atomic INSERT — exposed over two IPC channels.

**Architecture:** `extractStatement` orchestrates the existing PDF/extraction/hash/arithmetic/overlap modules into a single read-only result. `insertStatement` re-runs that orchestrator (single source of truth, Approach A), applies strict guards, and writes `imports` + `transactions` in one DB transaction. Two IPC handlers wrap them with discriminated `{ ok }` results. Result types live in `@shared/types/import` so the renderer (sub-story #31b) never imports `@main`.

**Tech Stack:** TypeScript (strict), Electron IPC, `node:sqlite` (`DatabaseSync`), Vitest.

**Spec:** `docs/superpowers/specs/2026-05-17-import-pipeline-backend-design.md`

---

## File Structure

| File                                                  | Responsibility                                                                                                                                     |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/types/import.ts`                          | NEW — owns `ArithmeticCheckResult`, `OverlappingImport`, `PeriodOverlapResult`, `ReviewTransaction`, `StatementExtraction` (no `@main` dependency) |
| `src/main/import/verifyArithmetic.ts`                 | MODIFIED — re-export `ArithmeticCheckResult` from `@shared/types/import` (function body unchanged)                                                 |
| `src/main/import/periodOverlap.ts`                    | MODIFIED — re-export `OverlappingImport`/`PeriodOverlapResult` from `@shared/types/import` (function body unchanged)                               |
| `src/shared/types/ipc.ts`                             | MODIFIED — `ExtractPayload/Response`, `ConfirmPayload/Response`, +2 `IpcContract` entries                                                          |
| `src/main/ipc/channels.ts`                            | MODIFIED — +2 channel constants                                                                                                                    |
| `src/main/db/migrations/003_seed_default_account.sql` | NEW — one default LCL account                                                                                                                      |
| `src/main/db/migrate.ts`                              | MODIFIED — register migration 003                                                                                                                  |
| `src/main/import/detectBank.ts`                       | NEW — bank-signature detection → column mapping                                                                                                    |
| `src/main/import/importError.ts`                      | NEW — `ImportError` tagged error + `ImportErrorCode`                                                                                               |
| `src/main/import/extractStatement.ts`                 | NEW — read-only extraction orchestrator                                                                                                            |
| `src/main/import/insertStatement.ts`                  | NEW — atomic INSERT (re-extracts, guards, writes)                                                                                                  |
| `src/main/ipc/handlers/importExtract.ts`              | NEW — `import:extract` handler                                                                                                                     |
| `src/main/ipc/handlers/importConfirm.ts`              | NEW — `import:confirm` handler                                                                                                                     |
| `src/main/ipc/register.ts`                            | MODIFIED — register the two handlers                                                                                                               |

**Conventions (from the codebase):**

- Path aliases exist in `tsconfig.json` + `electron.vite.config.ts` + the vitest config: `@main/*`, `@shared/*`. Main code already imports shared via `@shared/types/...`.
- DB unit tests: `new DatabaseSync(':memory:')` then `runMigrations(db)` then `db.close()` (see `tests/unit/import/periodOverlap.test.ts`, `tests/unit/db/seed_lcl.test.ts`).
- `db.prepare(...).all()/.get()` results are cast `as unknown as T` (see `periodOverlap.ts`).
- Migrations: add the `.sql` file, `import sqlNNN from './migrations/NNN.sql?raw'`, append `{ version: N, sql: sqlNNN }` to `MIGRATIONS`. `*.sql?raw` is typed by `src/shared/types/sql.d.ts`.
- Unit tests under `tests/unit/...`, real-fixture integration tests under `tests/integration/...`. The fixture is `spike-fixtures/LCL_STATEMENT_FIXTURE.pdf`; integration tests guard with `it.skipIf(!existsSync(FIXTURE_PATH))`.
- Commit messages: imperative present, reference the issue `(#31)`.

---

### Task 1: Shared types + layering fix + contract

**Files:**

- Create: `src/shared/types/import.ts`
- Modify: `src/main/import/verifyArithmetic.ts`, `src/main/import/periodOverlap.ts`, `src/shared/types/ipc.ts`, `src/main/ipc/channels.ts`
- Also commit: `docs/superpowers/plans/2026-05-17-epic-2-story-31a-import-pipeline-backend.md`

This is a type-only refactor + additive contract. The safety net is the existing 65-test suite plus `tsc`: the re-exports must keep every existing import path working with zero behaviour change.

- [ ] **Step 1: Create `src/shared/types/import.ts`**

```typescript
export interface ArithmeticCheckResult {
  status: 'passed' | 'failed' | 'cannot_verify';
  openingBalance: number | null;
  closingBalance: number | null;
  computedClosing: number | null;
  /** computedClosing − statedClosing; negative means transactions sum to less than stated closing */
  delta: number | null;
}

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

- [ ] **Step 2: Modify `src/main/import/verifyArithmetic.ts`**

Replace the local `export interface ArithmeticCheckResult { ... }` block with an import + re-export. The file becomes exactly:

```typescript
import type { ExtractedTransaction } from './pdf/extractTransactions';
import type { ArithmeticCheckResult } from '@shared/types/import';

export type { ArithmeticCheckResult };

export function verifyArithmetic(
  transactions: ExtractedTransaction[],
  openingBalance: number | null,
  closingBalance: number | null,
): ArithmeticCheckResult {
  if (openingBalance === null || closingBalance === null) {
    return {
      status: 'cannot_verify',
      openingBalance,
      closingBalance,
      computedClosing: null,
      delta: null,
    };
  }

  const openingCents = Math.round(openingBalance * 100);
  const sumCents = transactions.reduce((acc, t) => acc + Math.round(t.amount * 100), 0);
  const computedClosingCents = openingCents + sumCents;
  const deltaCents = computedClosingCents - Math.round(closingBalance * 100);

  return {
    status: deltaCents === 0 ? 'passed' : 'failed',
    openingBalance,
    closingBalance,
    computedClosing: computedClosingCents / 100,
    delta: deltaCents / 100,
  };
}
```

- [ ] **Step 3: Modify `src/main/import/periodOverlap.ts`**

Replace the two local interface blocks with an import + re-export. The file becomes exactly:

```typescript
import type { DatabaseSync } from 'node:sqlite';
import type { OverlappingImport, PeriodOverlapResult } from '@shared/types/import';

export type { OverlappingImport, PeriodOverlapResult };

/**
 * Pre-insert contract: call BEFORE inserting the new import row, so the new
 * import never matches itself. Compares against imports with status 'validated' or 'pending_review' for the same
 * account; 'cancelled' imports are ignored. If a new terminal status is added to the
 * schema, update the SQL IN clause and this union type accordingly.
 * Boundaries are inclusive (end == start counts as an overlap). Non-blocking:
 * this only reports — the caller decides what to do.
 */
export function checkPeriodOverlap(
  db: DatabaseSync,
  accountId: string,
  newStart: string,
  newEnd: string,
): PeriodOverlapResult {
  const rows = db
    .prepare(
      `SELECT id, date_range_start, date_range_end, status
       FROM imports
       WHERE account_id = ?
         AND status IN ('validated', 'pending_review')
         AND date_range_start <= ?
         AND date_range_end   >= ?`,
    )
    .all(accountId, newEnd, newStart) as unknown as OverlappingImport[];
  return { hasOverlap: rows.length > 0, overlappingImports: rows };
}
```

- [ ] **Step 4: Modify `src/shared/types/ipc.ts`**

Add this import at the top (after the existing first line `export interface PingPayload {`-block is fine; place the import as the very first line of the file):

```typescript
import type { StatementExtraction } from './import';
```

Append before the `IpcContract` interface:

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

Add these two members inside the existing `IpcContract` interface (alongside `'app:ping'` and `'import:pickFile'`):

```typescript
  'import:extract': { payload: ExtractPayload; response: ExtractResponse };
  'import:confirm': { payload: ConfirmPayload; response: ConfirmResponse };
```

- [ ] **Step 5: Modify `src/main/ipc/channels.ts`**

The file becomes exactly:

```typescript
import type { IpcChannel } from '@shared/types/ipc';

export const CHANNELS = {
  appPing: 'app:ping',
  importPickFile: 'import:pickFile',
  importExtract: 'import:extract',
  importConfirm: 'import:confirm',
} as const satisfies Record<string, IpcChannel>;
```

- [ ] **Step 6: Typecheck, lint, full suite**

Run: `cd /home/denis/finance-dashboard && npm run typecheck && npm run lint && npm run test:all`
Expected: typecheck clean, lint clean, all 65 tests pass (no behaviour changed; re-exports preserve every existing import path).

- [ ] **Step 7: Commit (include plan file)**

```bash
cd /home/denis/finance-dashboard
git add src/shared/types/import.ts src/main/import/verifyArithmetic.ts src/main/import/periodOverlap.ts src/shared/types/ipc.ts src/main/ipc/channels.ts docs/superpowers/plans/2026-05-17-epic-2-story-31a-import-pipeline-backend.md
git commit -m "refactor: move result types to @shared, add import IPC contract (#31)"
```

---

### Task 2: Migration 003 — default LCL account

**Files:**

- Create: `src/main/db/migrations/003_seed_default_account.sql`
- Modify: `src/main/db/migrate.ts`
- Test: `tests/unit/db/seed_default_account.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/db/seed_default_account.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

describe('default account seed (migration 003)', () => {
  it('inserts the default LCL account', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get('acc-lcl-default') as
      | { id: string; name: string; type: string; bank_id: string; currency: string }
      | undefined;
    expect(row).toBeDefined();
    expect(row?.name).toBe('Compte LCL');
    expect(row?.type).toBe('checking');
    expect(row?.bank_id).toBe('lcl');
    expect(row?.currency).toBe('EUR');
    db.close();
  });

  it('records version 3 in schema_migrations', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const versions = (
      db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]
    ).map((r) => r.version);
    expect(versions).toContain(3);
    db.close();
  });

  it('is idempotent — running migrations twice keeps one account row', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    runMigrations(db);
    const row = db
      .prepare('SELECT count(*) as n FROM accounts WHERE id = ?')
      .get('acc-lcl-default') as { n: number };
    expect(row.n).toBe(1);
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/denis/finance-dashboard && npx vitest run tests/unit/db/seed_default_account.test.ts`
Expected: FAIL — no `acc-lcl-default` row (migration 003 not registered).

- [ ] **Step 3: Create the migration SQL**

Create `src/main/db/migrations/003_seed_default_account.sql`:

```sql
INSERT INTO accounts (id, name, type, bank_id, currency) VALUES
  ('acc-lcl-default', 'Compte LCL', 'checking', 'lcl', 'EUR');
```

- [ ] **Step 4: Register migration 003 in `src/main/db/migrate.ts`**

Add the import alongside the existing `sql001`/`sql002` imports:

```typescript
import sql003 from './migrations/003_seed_default_account.sql?raw';
```

Append to the `MIGRATIONS` array so it reads:

```typescript
const MIGRATIONS: Migration[] = [
  { version: 1, sql: sql001 },
  { version: 2, sql: sql002 },
  { version: 3, sql: sql003 },
];
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /home/denis/finance-dashboard && npx vitest run tests/unit/db/seed_default_account.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
cd /home/denis/finance-dashboard
git add src/main/db/migrations/003_seed_default_account.sql src/main/db/migrate.ts tests/unit/db/seed_default_account.test.ts
git commit -m "feat: seed default LCL account via migration 003 (#31)"
```

---

### Task 3: `detectBank`

**Files:**

- Create: `src/main/import/detectBank.ts`
- Test: `tests/unit/import/detectBank.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/import/detectBank.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { detectBank } from '../../../src/main/import/detectBank';
import type { PdfPage } from '../../../src/main/import/pdf/extract';

function pageWith(text: string): PdfPage {
  return { pageNumber: 1, items: [{ str: text, x: 0, y: 0, width: 0 }] };
}

describe('detectBank', () => {
  it('detects LCL from the CREDIT LYONNAIS signature and returns its mapping', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const result = detectBank(db, [pageWith('RELEVE DE COMPTE CREDIT LYONNAIS PARIS')]);
    expect(result).not.toBeNull();
    expect(result?.bankId).toBe('lcl');
    expect(result?.mapping).toEqual({
      date_col: 42,
      label_col: 75,
      debit_col: 433,
      credit_col: 504,
      balance_col: null,
    });
    db.close();
  });

  it('returns null when no known signature is present', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const result = detectBank(db, [pageWith('SOME OTHER BANK STATEMENT')]);
    expect(result).toBeNull();
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/denis/finance-dashboard && npx vitest run tests/unit/import/detectBank.test.ts`
Expected: FAIL — module not found (`detectBank` not exported).

- [ ] **Step 3: Implement `src/main/import/detectBank.ts`**

```typescript
import type { DatabaseSync } from 'node:sqlite';
import type { PdfPage } from './pdf/extract';
import type { ColumnMapping } from './pdf/extractTransactions';

export interface DetectedBank {
  bankId: string;
  mapping: ColumnMapping;
}

export function detectBank(db: DatabaseSync, pages: PdfPage[]): DetectedBank | null {
  const text = pages.map((p) => p.items.map((i) => i.str).join(' ')).join(' ');
  const banks = db
    .prepare('SELECT id, detected_signature FROM banks WHERE detected_signature IS NOT NULL')
    .all() as unknown as { id: string; detected_signature: string }[];
  for (const bank of banks) {
    if (text.includes(bank.detected_signature)) {
      const mapping = db
        .prepare(
          `SELECT date_col, label_col, debit_col, credit_col, balance_col
           FROM bank_column_mappings
           WHERE bank_id = ? AND format_version = 'v1'`,
        )
        .get(bank.id) as unknown as ColumnMapping | undefined;
      if (mapping) return { bankId: bank.id, mapping };
    }
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/denis/finance-dashboard && npx vitest run tests/unit/import/detectBank.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Lint + typecheck**

Run: `cd /home/denis/finance-dashboard && npm run lint && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /home/denis/finance-dashboard
git add src/main/import/detectBank.ts tests/unit/import/detectBank.test.ts
git commit -m "feat: add bank-signature detection (#31)"
```

---

### Task 4: `ImportError` + `extractStatement`

**Files:**

- Create: `src/main/import/importError.ts`, `src/main/import/extractStatement.ts`
- Test: `tests/unit/import/extractStatement.test.ts`, `tests/integration/import/extractStatement.test.ts`

- [ ] **Step 1: Write the failing unit test**

Create `tests/unit/import/extractStatement.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { extractStatement } from '../../../src/main/import/extractStatement';
import { ImportError } from '../../../src/main/import/importError';

describe('extractStatement — failures', () => {
  it('throws ImportError("not_pdf") for a non-PDF buffer', async () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    await expect(
      extractStatement(db, 'acc-lcl-default', Buffer.from('this is not a pdf')),
    ).rejects.toMatchObject({ name: 'ImportError', code: 'not_pdf' });
    db.close();
  });

  it('ImportError carries a code property', () => {
    const err = new ImportError('unknown_bank');
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('unknown_bank');
  });
});
```

- [ ] **Step 2: Write the failing integration test**

Create `tests/integration/import/extractStatement.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { extractStatement } from '../../../src/main/import/extractStatement';

const FIXTURE_PATH = resolve('spike-fixtures/LCL_STATEMENT_FIXTURE.pdf');

describe('extractStatement — real LCL fixture', () => {
  it.skipIf(!existsSync(FIXTURE_PATH))(
    'extracts a balanced, non-overlapping, all-new statement on a fresh DB',
    async () => {
      const db = new DatabaseSync(':memory:');
      runMigrations(db);
      const buffer = readFileSync(FIXTURE_PATH);

      const r = await extractStatement(db, 'acc-lcl-default', buffer);

      expect(r.transactions).toHaveLength(46);
      expect(r.newCount).toBe(46);
      expect(r.duplicateCount).toBe(0);
      expect(r.arithmetic.status).toBe('passed');
      expect(r.periodOverlap.hasOverlap).toBe(false);
      expect(r.alreadyImported).toBe(false);
      expect(r.dateRangeStart).toBe('2025-10-31');
      expect(r.dateRangeEnd).toBe('2025-12-02');
      for (const tx of r.transactions) {
        expect(tx.tx_hash).toMatch(/^[0-9a-f]{64}$/);
        expect(tx.isDuplicate).toBe(false);
      }
      db.close();
    },
  );
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd /home/denis/finance-dashboard && npx vitest run tests/unit/import/extractStatement.test.ts tests/integration/import/extractStatement.test.ts`
Expected: FAIL — module not found (`extractStatement` / `importError` not exported).

- [ ] **Step 4: Implement `src/main/import/importError.ts`**

```typescript
export type ImportErrorCode =
  | 'unknown_bank'
  | 'no_text'
  | 'not_pdf'
  | 'arithmetic_failed'
  | 'cannot_verify_unacknowledged'
  | 'already_imported';

export class ImportError extends Error {
  constructor(public readonly code: ImportErrorCode) {
    super(code);
    this.name = 'ImportError';
  }
}
```

- [ ] **Step 5: Implement `src/main/import/extractStatement.ts`**

```typescript
import type { DatabaseSync } from 'node:sqlite';
import type { ReviewTransaction, StatementExtraction } from '@shared/types/import';
import type { PdfPage } from './pdf/extract';
import { extractPdfText } from './pdf/extract';
import { extractTransactions } from './pdf/extractTransactions';
import { assignTxHashes } from './txHash';
import { verifyArithmetic } from './verifyArithmetic';
import { checkPeriodOverlap } from './periodOverlap';
import { hashFile } from './hashFile';
import { isAlreadyImported } from './duplicateCheck';
import { detectBank } from './detectBank';
import { ImportError } from './importError';

async function loadPages(content: Buffer): Promise<PdfPage[]> {
  let res;
  try {
    res = await extractPdfText(content);
  } catch {
    throw new ImportError('not_pdf');
  }
  if (!res.hasText) throw new ImportError('no_text');
  return res.pages;
}

export async function extractStatement(
  db: DatabaseSync,
  accountId: string,
  content: Buffer,
): Promise<StatementExtraction> {
  const fileHash = hashFile(content);
  const alreadyImported = isAlreadyImported(db, fileHash);

  const pages = await loadPages(content);

  const bank = detectBank(db, pages);
  if (bank === null) throw new ImportError('unknown_bank');

  const extracted = extractTransactions(pages, bank.mapping);
  const withHashes = assignTxHashes(accountId, extracted.transactions);
  const arithmetic = verifyArithmetic(
    extracted.transactions,
    extracted.openingBalance,
    extracted.closingBalance,
  );
  const periodOverlap = checkPeriodOverlap(
    db,
    accountId,
    extracted.openingDate,
    extracted.closingDate,
  );

  const existing = new Set(
    (
      db
        .prepare('SELECT tx_hash FROM transactions WHERE account_id = ?')
        .all(accountId) as unknown as { tx_hash: string }[]
    ).map((row) => row.tx_hash),
  );

  const transactions: ReviewTransaction[] = withHashes.map((t) => ({
    date: t.date,
    label: t.label,
    amount: t.amount,
    tx_hash: t.tx_hash,
    isDuplicate: existing.has(t.tx_hash),
  }));

  const duplicateCount = transactions.filter((t) => t.isDuplicate).length;
  const newCount = transactions.length - duplicateCount;

  return {
    transactions,
    arithmetic,
    periodOverlap,
    newCount,
    duplicateCount,
    fileHash,
    alreadyImported,
    dateRangeStart: extracted.openingDate,
    dateRangeEnd: extracted.closingDate,
  };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd /home/denis/finance-dashboard && npx vitest run tests/unit/import/extractStatement.test.ts tests/integration/import/extractStatement.test.ts`
Expected: PASS (unit 2 + integration 1).

- [ ] **Step 7: Lint + typecheck**

Run: `cd /home/denis/finance-dashboard && npm run lint && npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
cd /home/denis/finance-dashboard
git add src/main/import/importError.ts src/main/import/extractStatement.ts tests/unit/import/extractStatement.test.ts tests/integration/import/extractStatement.test.ts
git commit -m "feat: add extraction orchestrator with tagged errors (#31)"
```

---

### Task 5: `insertStatement`

**Files:**

- Create: `src/main/import/insertStatement.ts`
- Test: `tests/unit/import/insertStatement.test.ts`, `tests/integration/import/insertStatement.test.ts`

- [ ] **Step 1: Write the failing unit test**

Create `tests/unit/import/insertStatement.test.ts`. These tests mock `extractStatement` to isolate the guard branches and atomicity (no PDF needed):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import type { StatementExtraction } from '@shared/types/import';

const extractMock = vi.fn();
vi.mock('../../../src/main/import/extractStatement', () => ({
  extractStatement: (...args: unknown[]) => extractMock(...args) as unknown,
}));

// Imported after vi.mock so the mock is in place.
const { insertStatement } = await import('../../../src/main/import/insertStatement');

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  return db;
}

function baseExtraction(over: Partial<StatementExtraction> = {}): StatementExtraction {
  return {
    transactions: [
      { date: '2025-11-01', label: 'A', amount: -10, tx_hash: 'h1', isDuplicate: false },
      { date: '2025-11-02', label: 'B', amount: 20, tx_hash: 'h2', isDuplicate: false },
    ],
    arithmetic: {
      status: 'passed',
      openingBalance: 0,
      closingBalance: 10,
      computedClosing: 10,
      delta: 0,
    },
    periodOverlap: { hasOverlap: false, overlappingImports: [] },
    newCount: 2,
    duplicateCount: 0,
    fileHash: 'file-hash-1',
    alreadyImported: false,
    dateRangeStart: '2025-11-01',
    dateRangeEnd: '2025-11-02',
    ...over,
  };
}

beforeEach(() => {
  extractMock.mockReset();
});

describe('insertStatement — guards', () => {
  it('refuses an already-imported file and writes nothing', async () => {
    const db = freshDb();
    extractMock.mockResolvedValue(baseExtraction({ alreadyImported: true }));
    await expect(insertStatement(db, 'acc-lcl-default', Buffer.from('x'))).rejects.toMatchObject({
      code: 'already_imported',
    });
    expect(db.prepare('SELECT count(*) n FROM imports').get()).toMatchObject({ n: 0 });
    expect(db.prepare('SELECT count(*) n FROM transactions').get()).toMatchObject({ n: 0 });
    db.close();
  });

  it('refuses when arithmetic failed and writes nothing', async () => {
    const db = freshDb();
    extractMock.mockResolvedValue(
      baseExtraction({
        arithmetic: {
          status: 'failed',
          openingBalance: 0,
          closingBalance: 999,
          computedClosing: 10,
          delta: -989,
        },
      }),
    );
    await expect(insertStatement(db, 'acc-lcl-default', Buffer.from('x'))).rejects.toMatchObject({
      code: 'arithmetic_failed',
    });
    expect(db.prepare('SELECT count(*) n FROM transactions').get()).toMatchObject({ n: 0 });
    db.close();
  });

  it('refuses cannot_verify without acknowledgement', async () => {
    const db = freshDb();
    extractMock.mockResolvedValue(
      baseExtraction({
        arithmetic: {
          status: 'cannot_verify',
          openingBalance: null,
          closingBalance: 10,
          computedClosing: null,
          delta: null,
        },
      }),
    );
    await expect(insertStatement(db, 'acc-lcl-default', Buffer.from('x'))).rejects.toMatchObject({
      code: 'cannot_verify_unacknowledged',
    });
    db.close();
  });

  it('inserts cannot_verify when acknowledged', async () => {
    const db = freshDb();
    extractMock.mockResolvedValue(
      baseExtraction({
        arithmetic: {
          status: 'cannot_verify',
          openingBalance: null,
          closingBalance: 10,
          computedClosing: null,
          delta: null,
        },
      }),
    );
    const r = await insertStatement(db, 'acc-lcl-default', Buffer.from('x'), {
      acknowledgedCannotVerify: true,
    });
    expect(r.insertedCount).toBe(2);
    expect(db.prepare('SELECT count(*) n FROM transactions').get()).toMatchObject({ n: 2 });
    db.close();
  });
});

describe('insertStatement — atomicity', () => {
  it('rolls back fully when a transaction insert violates UNIQUE mid-batch', async () => {
    const db = freshDb();
    extractMock.mockResolvedValue(
      baseExtraction({
        transactions: [
          { date: '2025-11-01', label: 'A', amount: -10, tx_hash: 'dup', isDuplicate: false },
          { date: '2025-11-02', label: 'B', amount: 20, tx_hash: 'dup', isDuplicate: false },
        ],
      }),
    );
    await expect(insertStatement(db, 'acc-lcl-default', Buffer.from('x'))).rejects.toThrow();
    expect(db.prepare('SELECT count(*) n FROM imports').get()).toMatchObject({ n: 0 });
    expect(db.prepare('SELECT count(*) n FROM transactions').get()).toMatchObject({ n: 0 });
    db.close();
  });
});

describe('insertStatement — happy path', () => {
  it('inserts one validated import and the non-duplicate transactions', async () => {
    const db = freshDb();
    extractMock.mockResolvedValue(
      baseExtraction({
        transactions: [
          { date: '2025-11-01', label: 'Café', amount: -10, tx_hash: 'h1', isDuplicate: false },
          { date: '2025-11-02', label: 'Salaire', amount: 20, tx_hash: 'h2', isDuplicate: true },
        ],
        newCount: 1,
        duplicateCount: 1,
      }),
    );
    const r = await insertStatement(db, 'acc-lcl-default', Buffer.from('x'));
    expect(r.insertedCount).toBe(1);
    expect(r.skippedCount).toBe(1);

    const imp = db.prepare('SELECT * FROM imports').get() as {
      id: string;
      status: string;
      account_id: string;
    };
    expect(imp.status).toBe('validated');
    expect(imp.account_id).toBe('acc-lcl-default');
    expect(imp.id).toBe(r.importId);

    const txs = db.prepare('SELECT * FROM transactions').all() as {
      label_raw: string;
      label_clean: string;
      category_id: string | null;
      confidence: number | null;
      import_id: string;
    }[];
    expect(txs).toHaveLength(1);
    expect(txs[0]?.label_raw).toBe('Café');
    expect(txs[0]?.label_clean).toBe('CAFE');
    expect(txs[0]?.category_id).toBeNull();
    expect(txs[0]?.confidence).toBeNull();
    expect(txs[0]?.import_id).toBe(r.importId);
    db.close();
  });
});
```

- [ ] **Step 2: Write the failing integration test**

Create `tests/integration/import/insertStatement.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { extractStatement } from '../../../src/main/import/extractStatement';
import { insertStatement } from '../../../src/main/import/insertStatement';

const FIXTURE_PATH = resolve('spike-fixtures/LCL_STATEMENT_FIXTURE.pdf');

describe('insertStatement — real LCL fixture', () => {
  it.skipIf(!existsSync(FIXTURE_PATH))(
    'inserts one validated import and all 46 transactions',
    async () => {
      const db = new DatabaseSync(':memory:');
      runMigrations(db);
      const buffer = readFileSync(FIXTURE_PATH);

      const r = await insertStatement(db, 'acc-lcl-default', buffer);

      expect(r.insertedCount).toBe(46);
      expect(r.skippedCount).toBe(0);
      expect(db.prepare('SELECT count(*) n FROM imports').get()).toMatchObject({ n: 1 });
      expect(db.prepare('SELECT count(*) n FROM transactions').get()).toMatchObject({ n: 46 });
      const imp = db.prepare('SELECT status FROM imports').get() as { status: string };
      expect(imp.status).toBe('validated');
      db.close();
    },
  );

  it.skipIf(!existsSync(FIXTURE_PATH))(
    'skips transactions whose tx_hash already exists for the account',
    async () => {
      const db = new DatabaseSync(':memory:');
      runMigrations(db);
      const buffer = readFileSync(FIXTURE_PATH);

      // Pre-seed: a prior import row + the first 3 transactions of this statement.
      const pre = await extractStatement(db, 'acc-lcl-default', buffer);
      db.prepare(
        `INSERT INTO imports
           (id, account_id, file_hash, source_type, date_range_start, date_range_end, status)
         VALUES ('prior', 'acc-lcl-default', 'other-file-hash', 'pdf', ?, ?, 'validated')`,
      ).run(pre.dateRangeStart, pre.dateRangeEnd);
      const seedTx = db.prepare(
        `INSERT INTO transactions
           (id, account_id, import_id, tx_hash, date, amount, label_raw, label_clean,
            category_id, confidence, is_internal_transfer, user_modified)
         VALUES (?, 'acc-lcl-default', 'prior', ?, ?, ?, ?, ?, NULL, NULL, 0, 0)`,
      );
      for (let i = 0; i < 3; i++) {
        const t = pre.transactions[i];
        if (!t) throw new Error('fixture has fewer than 3 transactions');
        seedTx.run(`seed-${String(i)}`, t.tx_hash, t.date, t.amount, t.label, t.label);
      }

      const r = await insertStatement(db, 'acc-lcl-default', buffer);

      expect(r.skippedCount).toBe(3);
      expect(r.insertedCount).toBe(43);
      // 3 pre-seeded + 43 newly inserted.
      expect(db.prepare('SELECT count(*) n FROM transactions').get()).toMatchObject({ n: 46 });
      db.close();
    },
  );
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd /home/denis/finance-dashboard && npx vitest run tests/unit/import/insertStatement.test.ts tests/integration/import/insertStatement.test.ts`
Expected: FAIL — module not found (`insertStatement` not exported).

- [ ] **Step 4: Implement `src/main/import/insertStatement.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { extractStatement } from './extractStatement';
import { normalizeLabel } from './txHash';
import { ImportError } from './importError';

export interface InsertResult {
  importId: string;
  insertedCount: number;
  skippedCount: number;
}

export async function insertStatement(
  db: DatabaseSync,
  accountId: string,
  content: Buffer,
  opts: { acknowledgedCannotVerify?: boolean } = {},
): Promise<InsertResult> {
  const extraction = await extractStatement(db, accountId, content);

  if (extraction.alreadyImported) throw new ImportError('already_imported');
  if (extraction.arithmetic.status === 'failed') throw new ImportError('arithmetic_failed');
  if (extraction.arithmetic.status === 'cannot_verify' && opts.acknowledgedCannotVerify !== true) {
    throw new ImportError('cannot_verify_unacknowledged');
  }

  const importId = randomUUID();
  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO imports
         (id, account_id, file_hash, source_type, date_range_start, date_range_end, status)
       VALUES (?, ?, ?, 'pdf', ?, ?, 'validated')`,
    ).run(
      importId,
      accountId,
      extraction.fileHash,
      extraction.dateRangeStart,
      extraction.dateRangeEnd,
    );
    const insertTx = db.prepare(
      `INSERT INTO transactions
         (id, account_id, import_id, tx_hash, date, amount,
          label_raw, label_clean, category_id, confidence,
          is_internal_transfer, user_modified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0, 0)`,
    );
    for (const tx of extraction.transactions) {
      if (tx.isDuplicate) continue;
      insertTx.run(
        randomUUID(),
        accountId,
        importId,
        tx.tx_hash,
        tx.date,
        tx.amount,
        tx.label,
        normalizeLabel(tx.label),
      );
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  return {
    importId,
    insertedCount: extraction.newCount,
    skippedCount: extraction.duplicateCount,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /home/denis/finance-dashboard && npx vitest run tests/unit/import/insertStatement.test.ts tests/integration/import/insertStatement.test.ts`
Expected: PASS (unit 6 + integration 2).

- [ ] **Step 6: Lint + typecheck**

Run: `cd /home/denis/finance-dashboard && npm run lint && npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd /home/denis/finance-dashboard
git add src/main/import/insertStatement.ts tests/unit/import/insertStatement.test.ts tests/integration/import/insertStatement.test.ts
git commit -m "feat: add atomic statement INSERT with guards (#31)"
```

---

### Task 6: IPC handlers + registration

**Files:**

- Create: `src/main/ipc/handlers/importExtract.ts`, `src/main/ipc/handlers/importConfirm.ts`
- Modify: `src/main/ipc/register.ts`
- Test: `tests/unit/ipc/importHandlers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/ipc/importHandlers.test.ts`. `getDb` is mocked to return an in-memory migrated DB so the handlers run end-to-end without Electron:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

let testDb: DatabaseSync;
vi.mock('../../../src/main/db', () => ({
  getDb: () => testDb,
}));

const { handleImportExtract } = await import('../../../src/main/ipc/handlers/importExtract');
const { handleImportConfirm } = await import('../../../src/main/ipc/handlers/importConfirm');

const FIXTURE_PATH = resolve('spike-fixtures/LCL_STATEMENT_FIXTURE.pdf');

beforeEach(() => {
  testDb = new DatabaseSync(':memory:');
  runMigrations(testDb);
});

describe('handleImportExtract', () => {
  it('returns ok:false not_pdf for a non-PDF file', async () => {
    // package.json is guaranteed to exist and is not a PDF.
    const res = await handleImportExtract({
      path: resolve('package.json'),
      accountId: 'acc-lcl-default',
    });
    expect(res).toEqual({ ok: false, error: 'not_pdf' });
  });

  it.skipIf(!existsSync(FIXTURE_PATH))(
    'returns ok:true with the extraction for the real fixture',
    async () => {
      const res = await handleImportExtract({
        path: FIXTURE_PATH,
        accountId: 'acc-lcl-default',
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.extraction.newCount).toBe(46);
        expect(res.extraction.arithmetic.status).toBe('passed');
      }
    },
  );
});

describe('handleImportConfirm', () => {
  it.skipIf(!existsSync(FIXTURE_PATH))('inserts and returns ok:true with counts', async () => {
    const res = await handleImportConfirm({
      path: FIXTURE_PATH,
      accountId: 'acc-lcl-default',
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.insertedCount).toBe(46);
      expect(res.skippedCount).toBe(0);
    }
  });

  it('returns ok:false not_pdf for a non-PDF file', async () => {
    const res = await handleImportConfirm({
      path: resolve('package.json'),
      accountId: 'acc-lcl-default',
    });
    expect(res).toEqual({ ok: false, error: 'not_pdf' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/denis/finance-dashboard && npx vitest run tests/unit/ipc/importHandlers.test.ts`
Expected: FAIL — module not found (handlers not created).

- [ ] **Step 3: Implement `src/main/ipc/handlers/importExtract.ts`**

```typescript
import { readFileSync } from 'node:fs';
import type { ExtractPayload, ExtractResponse } from '@shared/types/ipc';
import { getDb } from '../../db';
import { extractStatement } from '../../import/extractStatement';
import { ImportError } from '../../import/importError';

export async function handleImportExtract(payload: ExtractPayload): Promise<ExtractResponse> {
  try {
    const content = readFileSync(payload.path);
    const extraction = await extractStatement(getDb(), payload.accountId, content);
    return { ok: true, extraction };
  } catch (e) {
    if (
      e instanceof ImportError &&
      (e.code === 'unknown_bank' || e.code === 'no_text' || e.code === 'not_pdf')
    ) {
      return { ok: false, error: e.code };
    }
    throw e;
  }
}
```

- [ ] **Step 4: Implement `src/main/ipc/handlers/importConfirm.ts`**

```typescript
import { readFileSync } from 'node:fs';
import type { ConfirmPayload, ConfirmResponse } from '@shared/types/ipc';
import { getDb } from '../../db';
import { insertStatement } from '../../import/insertStatement';
import { ImportError } from '../../import/importError';

export async function handleImportConfirm(payload: ConfirmPayload): Promise<ConfirmResponse> {
  try {
    const content = readFileSync(payload.path);
    const result = await insertStatement(getDb(), payload.accountId, content, {
      acknowledgedCannotVerify: payload.acknowledgedCannotVerify,
    });
    return { ok: true, ...result };
  } catch (e) {
    if (e instanceof ImportError) {
      return { ok: false, error: e.code };
    }
    throw e;
  }
}
```

- [ ] **Step 5: Modify `src/main/ipc/register.ts`**

Add the two handler imports next to the existing ones:

```typescript
import { handleImportExtract } from './handlers/importExtract';
import { handleImportConfirm } from './handlers/importConfirm';
```

Add the two registrations inside `registerAllHandlers()` (after the existing `register(...)` calls):

```typescript
register(CHANNELS.importExtract, handleImportExtract);
register(CHANNELS.importConfirm, handleImportConfirm);
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd /home/denis/finance-dashboard && npx vitest run tests/unit/ipc/importHandlers.test.ts`
Expected: PASS.

- [ ] **Step 7: Full suite, lint, typecheck**

Run: `cd /home/denis/finance-dashboard && npm run test:all && npm run lint && npm run typecheck`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
cd /home/denis/finance-dashboard
git add src/main/ipc/handlers/importExtract.ts src/main/ipc/handlers/importConfirm.ts src/main/ipc/register.ts tests/unit/ipc/importHandlers.test.ts
git commit -m "feat: wire import:extract and import:confirm IPC channels (#31)"
```

---

## Self-Review

**1. Spec coverage:**

- Spec §3 file structure → File Structure table; every NEW/MODIFIED file maps to a task. ✓
- Spec §3 layering fix (types to `@shared`, main re-exports) → Task 1 Steps 1–3. ✓
- Spec §4 contract (`ExtractPayload/Response`, `ConfirmPayload/Response`, `IpcContract`) → Task 1 Step 4; channels → Step 5. ✓
- Spec §4 `ReviewTransaction`/`StatementExtraction`/result types → Task 1 Step 1. ✓
- Spec §5.1 `detectBank` (concat text, signature match, load v1 mapping, null) → Task 3. ✓
- Spec §5.2 `extractStatement` 11-step pipeline → Task 4 Step 5; `not_pdf`/`no_text` via `loadPages` → covered; happy path → integration test. ✓
- Spec §5.3 `insertStatement` (re-extract, 3 guards, BEGIN/COMMIT/ROLLBACK, skip duplicates, return counts) → Task 5 Step 4 + tests. ✓
- Spec §5.4 IPC handlers (read file, delegate, map tagged errors, unexpected → reject) → Task 6 Steps 3–4. ✓
- Spec §6 error table (7 cases) → `importError.ts` codes (Task 4); extract narrows 3 codes (Task 6 Step 3); confirm maps all 6 (Task 6 Step 4); already_imported/arithmetic_failed/cannot_verify guards (Task 5). ✓
- Spec §7 testing: detectBank unit (Task 3); extractStatement integration happy path + unit not_pdf (Task 4); insertStatement guards/atomicity/dedup/label_clean/nulls (Task 5 unit+integration); handlers lightweight (Task 6). ✓
- Migration 003 default account (spec §2/§3) → Task 2. ✓

No gaps.

**2. Placeholder scan:** No TBD/TODO/"similar to". Every code step shows complete file or exact additions. Every command has an expected result.

**3. Type consistency:** `StatementExtraction`/`ReviewTransaction`/`ArithmeticCheckResult`/`PeriodOverlapResult` defined once in Task 1, consumed by `extractStatement` (Task 4), `insertStatement` (Task 5), handlers (Task 6) — names and shapes identical. `ImportError`/`ImportErrorCode` defined Task 4, used Task 5 (throws) and Task 6 (`e.code` mapping); the 6 codes match `ConfirmResponse.error` exactly and the 3-code subset matches `ExtractResponse.error`. `extractStatement(db, accountId, content)` and `insertStatement(db, accountId, content, opts)` signatures consistent across definition, tests, and handler call sites. `detectBank(db, pages) → { bankId, mapping } | null` consistent between Task 3 and Task 4. Account id `'acc-lcl-default'` consistent across Task 2 seed and all tests.
