# Multi-File Import with Learned Account Routing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import several bank statements in one pass (multi-select + drag & drop), each routed to the right account automatically via a learned identifier→account map, asking for an account at most once per account.

**Architecture:** The per-file extraction/dedup/overlap pipeline is unchanged. We add, around it: (1) a learned routes table + repo in main, (2) deterministic identifier extraction (OFX `ACCTID`/`BANKID`, PDF header IBAN) read by a new lightweight `import:resolveAccount` IPC handler before extraction, (3) a confirm-time route upsert, and (4) a renderer-side queue (`useImport`) that orchestrates N files over the existing per-file flow. No LLM. 100% local.

**Tech Stack:** Electron 42, TypeScript strict, Node `node:sqlite` (`DatabaseSync`), Vitest 4 (+ jsdom for renderer), React + shadcn/ui, pdfjs-dist (PDF text), better-sqlite-style prepared statements.

**Reference docs:** Spec `docs/superpowers/specs/2026-06-03-multi-file-import-account-routing-design.md`; ADR-015 `docs/adr/015-account-identifier-routing.md`.

---

## File Structure

**Create:**

- `src/main/db/migrations/008_account_identifiers.sql` — the route table.
- `src/main/import/accountRoutes.ts` — `findAccountByIdentifier`, `learnAccountRoute`.
- `src/main/import/accountIdentifier.ts` — `readIdentifier` (OFX/PDF) + `extractIbanFromText`.
- `src/main/ipc/handlers/importResolveAccount.ts` — the new IPC handler.
- Test files mirroring each (paths in tasks).

**Modify:**

- `src/main/db/migrate.ts` — register migration 008.
- `src/main/import/ofx/parseOfx.ts` — capture `ACCTID`.
- `src/shared/types/ipc.ts` — `PickFileResponse` → `paths`; add `import:resolveAccount`; add `ElectronAPI.getDroppedPaths`.
- `src/main/ipc/channels.ts` — add `importResolveAccount`.
- `src/main/ipc/register.ts` — register the new handler.
- `src/main/ipc/handlers/importPickFile.ts` — `multiSelections`, return `paths`.
- `src/main/ipc/handlers/importConfirm.ts` — learn route after a successful insert.
- `src/main/preload.ts` — expose `getDroppedPaths` via `webUtils`.
- `src/renderer/hooks/useImport.ts` — queue refactor.
- `src/renderer/components/ImportModal.tsx` — drop zone, ChooseAccountView, ReviewView tweaks, SummaryView.

**Ordering rationale:** Tasks 1–6 are additive (new files/fields/channel) and keep the build green with single-file behaviour intact. Task 7 makes the one breaking change (`PickFileResponse` shape) atomically together with all its renderer consumers.

---

## Task 1: Migration 008 — `account_identifiers` table

**Files:**

- Create: `src/main/db/migrations/008_account_identifiers.sql`
- Modify: `src/main/db/migrate.ts:1-23`
- Test: `tests/unit/db/accountIdentifiers.migration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

describe('migration 008 — account_identifiers', () => {
  it('creates the table and cascades on account delete', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);

    db.prepare(
      "INSERT INTO accounts (id, name, type, bank_id, currency) VALUES ('acc-x', 'X', 'checking', 'lcl', 'EUR')",
    ).run();
    db.prepare('INSERT INTO account_identifiers (identifier, account_id) VALUES (?, ?)').run(
      'ofx:30002:1',
      'acc-x',
    );

    const before = db.prepare('SELECT COUNT(*) AS n FROM account_identifiers').get() as unknown as {
      n: number;
    };
    expect(Number(before.n)).toBe(1);

    db.prepare('DELETE FROM accounts WHERE id = ?').run('acc-x');
    const after = db.prepare('SELECT COUNT(*) AS n FROM account_identifiers').get() as unknown as {
      n: number;
    };
    expect(Number(after.n)).toBe(0);
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/db/accountIdentifiers.migration.test.ts`
Expected: FAIL — `no such table: account_identifiers`.

- [ ] **Step 3: Create the migration SQL**

`src/main/db/migrations/008_account_identifiers.sql`:

```sql
CREATE TABLE account_identifiers (
  identifier TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE
);
```

- [ ] **Step 4: Register the migration in `migrate.ts`**

Add the import alongside the others (after the `sql007` import, line 8):

```ts
import sql008 from './migrations/008_account_identifiers.sql?raw';
```

Append to the `MIGRATIONS` array (after the `{ version: 7, sql: sql007 }` entry, line 22):

```ts
  { version: 8, sql: sql008 },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/db/accountIdentifiers.migration.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/db/migrations/008_account_identifiers.sql src/main/db/migrate.ts tests/unit/db/accountIdentifiers.migration.test.ts
git commit -m "feat(db): add account_identifiers table (migration 008)"
```

---

## Task 2: Account routes repository

**Files:**

- Create: `src/main/import/accountRoutes.ts`
- Test: `tests/unit/import/accountRoutes.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { findAccountByIdentifier, learnAccountRoute } from '../../../src/main/import/accountRoutes';

let db: DatabaseSync;
beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  db.prepare(
    "INSERT INTO accounts (id, name, type, bank_id, currency) VALUES ('acc-a', 'A', 'checking', 'lcl', 'EUR')",
  ).run();
  db.prepare(
    "INSERT INTO accounts (id, name, type, bank_id, currency) VALUES ('acc-b', 'B', 'checking', 'lcl', 'EUR')",
  ).run();
});

describe('accountRoutes', () => {
  it('returns null for an unknown identifier', () => {
    expect(findAccountByIdentifier(db, 'ofx:30002:1')).toBeNull();
  });

  it('learns then finds a route', () => {
    learnAccountRoute(db, 'ofx:30002:1', 'acc-a');
    expect(findAccountByIdentifier(db, 'ofx:30002:1')).toBe('acc-a');
  });

  it('upserts (re-points) an existing identifier', () => {
    learnAccountRoute(db, 'ofx:30002:1', 'acc-a');
    learnAccountRoute(db, 'ofx:30002:1', 'acc-b');
    expect(findAccountByIdentifier(db, 'ofx:30002:1')).toBe('acc-b');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/import/accountRoutes.test.ts`
Expected: FAIL — cannot find module `accountRoutes`.

- [ ] **Step 3: Write the implementation**

`src/main/import/accountRoutes.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite';

/** Look up the account a learned identifier routes to, or null if unknown. */
export function findAccountByIdentifier(db: DatabaseSync, identifier: string): string | null {
  const row = db
    .prepare('SELECT account_id FROM account_identifiers WHERE identifier = ?')
    .get(identifier) as unknown as { account_id: string } | undefined;
  return row?.account_id ?? null;
}

/** Record (or re-point) the identifier→account route. Idempotent upsert. */
export function learnAccountRoute(db: DatabaseSync, identifier: string, accountId: string): void {
  db.prepare(
    `INSERT INTO account_identifiers (identifier, account_id) VALUES (?, ?)
     ON CONFLICT(identifier) DO UPDATE SET account_id = excluded.account_id`,
  ).run(identifier, accountId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/import/accountRoutes.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/import/accountRoutes.ts tests/unit/import/accountRoutes.test.ts
git commit -m "feat(import): add learned account-route repository"
```

---

## Task 3: Capture OFX `ACCTID` in the parser

**Files:**

- Modify: `src/main/import/ofx/parseOfx.ts:8-13` (interface) and `:58-73` (switch)
- Test: `tests/unit/import/ofx/parseOfx.acctid.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { parseOfx } from '../../../../src/main/import/ofx/parseOfx';

const OFX = `<OFX>
<SIGNONMSGSRSV1><SONRS><FI><ORG>LCL</FI></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>30002<ACCTID>00012345<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><DTPOSTED>20260504<TRNAMT>2500.00<FITID>SAL<NAME>SALAIRE</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>2500.00<DTASOF>20260504</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe('parseOfx — account id', () => {
  it('captures ACCTID', () => {
    const parsed = parseOfx(Buffer.from(OFX));
    expect(parsed.acctId).toBe('00012345');
    expect(parsed.bankId).toBe('30002');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/import/ofx/parseOfx.acctid.test.ts`
Expected: FAIL — `parsed.acctId` is `undefined` (property does not exist / type error).

- [ ] **Step 3: Add the field to `ParsedOfx`**

In `src/main/import/ofx/parseOfx.ts`, extend the interface (around lines 8-13):

```ts
export interface ParsedOfx {
  org: string | null;
  bankId: string | null;
  acctId: string | null;
  ledgerBalance: number | null;
  transactions: OfxTransaction[];
}
```

- [ ] **Step 4: Capture the token and return it**

Add a local next to `bankId` (around line 59):

```ts
let acctId: string | null = null;
```

Add a case next to `BANKID` in the switch (around lines 71-73):

```ts
      case 'ACCTID':
        acctId ??= value || null;
        break;
```

Include it in the returned object (the `return { org, bankId, ledgerBalance, transactions };` at line 124):

```ts
return { org, bankId, acctId, ledgerBalance, transactions };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/import/ofx/parseOfx.acctid.test.ts`
Expected: PASS. Also run the existing parser test to confirm no regression:
Run: `npx vitest run tests/unit/import/ofx/parseOfx.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/import/ofx/parseOfx.ts tests/unit/import/ofx/parseOfx.acctid.test.ts
git commit -m "feat(import): capture OFX ACCTID in the parser"
```

---

## Task 4: Identifier extraction module

**Files:**

- Create: `src/main/import/accountIdentifier.ts`
- Test: `tests/unit/import/accountIdentifier.test.ts`

Note: this module exports a pure `extractIbanFromText` (unit-testable without a PDF) and an async `readIdentifier` that dispatches by `detectType`. The OFX branch is deterministic and tested inline; the PDF-buffer branch is exercised by the integration test in Task 8 (real fixtures, `skipIf`).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { readIdentifier, extractIbanFromText } from '../../../src/main/import/accountIdentifier';

const OFX = `<OFX>
<SIGNONMSGSRSV1><SONRS><FI><ORG>LCL</FI></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>30002<ACCTID>00012345<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><DTPOSTED>20260504<TRNAMT>2500.00<FITID>SAL<NAME>SALAIRE</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>2500.00<DTASOF>20260504</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe('extractIbanFromText', () => {
  it('finds and normalizes a spaced French IBAN', () => {
    expect(extractIbanFromText('Titulaire IBAN FR76 3000 6000 0112 3456 7890 189 RIB')).toBe(
      'FR7630006000011234567890189',
    );
  });
  it('returns null when no IBAN is present', () => {
    expect(extractIbanFromText('Relevé de compte — aucune référence ici')).toBeNull();
  });
  it('is idempotent on an already-stripped IBAN', () => {
    const once = extractIbanFromText('FR7630006000011234567890189');
    expect(extractIbanFromText(once ?? '')).toBe(once);
  });
});

describe('readIdentifier — OFX', () => {
  it('builds the ofx:<bankid>:<acctid> key and reads the org', async () => {
    const r = await readIdentifier(Buffer.from(OFX), 'statement.ofx');
    expect(r).toEqual({ identifier: 'ofx:30002:00012345', sourceType: 'ofx', detectedBank: 'LCL' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/import/accountIdentifier.test.ts`
Expected: FAIL — cannot find module `accountIdentifier`.

- [ ] **Step 3: Write the implementation**

`src/main/import/accountIdentifier.ts`:

```ts
import { detectType } from './detectType';
import { ImportError } from './importError';
import { parseOfx } from './ofx/parseOfx';
import { extractPdfText } from './pdf/extract';

export interface ReadIdentifierResult {
  identifier: string | null;
  sourceType: 'ofx' | 'pdf';
  detectedBank: string | null;
}

/** French IBAN: FR + 2 check digits + 23 alphanumerics, spaces optional. */
const IBAN_RE = /FR\d{2}(?:\s?[0-9A-Z]){23}/;

/** Extract and normalize a French IBAN from free text, or null. */
export function extractIbanFromText(text: string): string | null {
  const match = IBAN_RE.exec(text.toUpperCase());
  if (match === null) return null;
  return match[0].replace(/\s/g, '');
}

/**
 * Read the account identifier from a statement file without running full
 * extraction. OFX → `ofx:<bankid>:<acctid>`; PDF → `iban:<digits>` from the
 * page-1 header. Throws ImportError('unsupported_format') for non-PDF/OFX input.
 */
export async function readIdentifier(content: Buffer, path: string): Promise<ReadIdentifierResult> {
  const type = detectType(content, path);
  if (type !== 'ofx' && type !== 'pdf') throw new ImportError('unsupported_format');

  if (type === 'ofx') {
    const parsed = parseOfx(content);
    const identifier =
      parsed.bankId !== null && parsed.acctId !== null
        ? `ofx:${parsed.bankId}:${parsed.acctId}`.toLowerCase()
        : null;
    return { identifier, sourceType: 'ofx', detectedBank: parsed.org };
  }

  const { pages } = await extractPdfText(content);
  const page1 = pages[0]?.items.map((item) => item.str).join(' ') ?? '';
  const iban = extractIbanFromText(page1);
  return {
    identifier: iban !== null ? `iban:${iban}` : null,
    sourceType: 'pdf',
    detectedBank: null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/import/accountIdentifier.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/import/accountIdentifier.ts tests/unit/import/accountIdentifier.test.ts
git commit -m "feat(import): read account identifier from OFX/PDF statements"
```

---

## Task 5: IPC types + channel + `resolveAccount` handler

**Files:**

- Modify: `src/shared/types/ipc.ts` (add types; do NOT touch `PickFileResponse` yet)
- Modify: `src/main/ipc/channels.ts:3-21`
- Create: `src/main/ipc/handlers/importResolveAccount.ts`
- Modify: `src/main/ipc/register.ts`
- Test: `tests/unit/ipc/resolveAccount.test.ts`

- [ ] **Step 1: Add the IPC types**

In `src/shared/types/ipc.ts`, add after the `ExtractResponse` block (around line 53):

```ts
export interface ResolveAccountPayload {
  path: string;
}

export type ResolveAccountResponse =
  | {
      ok: true;
      identifier: string | null;
      matchedAccountId: string | null;
      sourceType: 'ofx' | 'pdf';
      detectedBank: string | null;
    }
  | { ok: false; error: 'unsupported_format' };
```

Add the channel to `IpcContract` (after the `'import:extract'` line, ~line 80):

```ts
  'import:resolveAccount': { payload: ResolveAccountPayload; response: ResolveAccountResponse };
```

> Note: the resolveAccount error union is narrowed to `'unsupported_format'` (the only error the handler emits — `detectType` rejects non-PDF/OFX). The spec listed `not_pdf`/`no_text` defensively; they are not reachable here, so they are omitted to avoid dead union members.

- [ ] **Step 2: Add the channel constant**

In `src/main/ipc/channels.ts`, add to `CHANNELS` (after `importExtract`, ~line 6):

```ts
  importResolveAccount: 'import:resolveAccount',
```

- [ ] **Step 3: Write the failing test**

`tests/unit/ipc/resolveAccount.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { learnAccountRoute } from '../../../src/main/import/accountRoutes';

let testDb: DatabaseSync;
vi.mock('../../../src/main/db', () => ({ getDb: () => testDb }));

const { handleImportResolveAccount } =
  await import('../../../src/main/ipc/handlers/importResolveAccount');

const OFX = `<OFX>
<SIGNONMSGSRSV1><SONRS><FI><ORG>LCL</FI></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>30002<ACCTID>00012345<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><DTPOSTED>20260504<TRNAMT>2500.00<FITID>SAL<NAME>SALAIRE</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>2500.00<DTASOF>20260504</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function writeOfx(): string {
  const dir = mkdtempSync(join(tmpdir(), 'resolve-'));
  const p = join(dir, 'statement.ofx');
  writeFileSync(p, OFX);
  return p;
}

beforeEach(() => {
  testDb = new DatabaseSync(':memory:');
  runMigrations(testDb);
});

describe('handleImportResolveAccount', () => {
  it('returns identifier with no match when route is unknown', async () => {
    const res = await handleImportResolveAccount({ path: writeOfx() });
    expect(res).toEqual({
      ok: true,
      identifier: 'ofx:30002:00012345',
      matchedAccountId: null,
      sourceType: 'ofx',
      detectedBank: 'LCL',
    });
  });

  it('returns the matched account when a route exists', async () => {
    testDb
      .prepare(
        "INSERT INTO accounts (id, name, type, bank_id, currency) VALUES ('acc-a','A','checking','lcl','EUR')",
      )
      .run();
    learnAccountRoute(testDb, 'ofx:30002:00012345', 'acc-a');
    const res = await handleImportResolveAccount({ path: writeOfx() });
    expect(res).toMatchObject({ ok: true, matchedAccountId: 'acc-a' });
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run tests/unit/ipc/resolveAccount.test.ts`
Expected: FAIL — cannot find module `importResolveAccount`.

- [ ] **Step 5: Write the handler**

`src/main/ipc/handlers/importResolveAccount.ts`:

```ts
import { readFileSync } from 'node:fs';
import type { ResolveAccountPayload, ResolveAccountResponse } from '@shared/types/ipc';
import { getDb } from '../../db';
import { readIdentifier } from '../../import/accountIdentifier';
import { findAccountByIdentifier } from '../../import/accountRoutes';
import { ImportError } from '../../import/importError';

export async function handleImportResolveAccount(
  payload: ResolveAccountPayload,
): Promise<ResolveAccountResponse> {
  const content = readFileSync(payload.path);
  try {
    const { identifier, sourceType, detectedBank } = await readIdentifier(content, payload.path);
    const matchedAccountId =
      identifier !== null ? findAccountByIdentifier(getDb(), identifier) : null;
    return { ok: true, identifier, matchedAccountId, sourceType, detectedBank };
  } catch (e) {
    if (e instanceof ImportError && e.code === 'unsupported_format') {
      return { ok: false, error: 'unsupported_format' };
    }
    throw e;
  }
}
```

- [ ] **Step 6: Register the handler**

In `src/main/ipc/register.ts`, add the import (next to the other handler imports near the top):

```ts
import { handleImportResolveAccount } from './handlers/importResolveAccount';
```

Add the registration inside `registerAllHandlers()` (next to the other import lines, ~line 51):

```ts
register(CHANNELS.importResolveAccount, handleImportResolveAccount);
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run tests/unit/ipc/resolveAccount.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 8: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add src/shared/types/ipc.ts src/main/ipc/channels.ts src/main/ipc/handlers/importResolveAccount.ts src/main/ipc/register.ts tests/unit/ipc/resolveAccount.test.ts
git commit -m "feat(ipc): add import:resolveAccount channel and handler"
```

---

## Task 6: Learn the route on a successful confirm

**Files:**

- Modify: `src/main/ipc/handlers/importConfirm.ts:7-21`
- Test: `tests/unit/ipc/confirmLearnsRoute.test.ts`

- [ ] **Step 1: Write the failing test**

This test drives the real `handleImportConfirm` against an in-memory DB seeded so the OFX statement imports cleanly, then asserts a route was learned. It uses the same `vi.mock` getDb pattern.

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMigrations } from '../../../src/main/db/migrate';
import { findAccountByIdentifier } from '../../../src/main/import/accountRoutes';

let testDb: DatabaseSync;
vi.mock('../../../src/main/db', () => ({ getDb: () => testDb }));

const { handleImportConfirm } = await import('../../../src/main/ipc/handlers/importConfirm');

const OFX = `<OFX>
<SIGNONMSGSRSV1><SONRS><FI><ORG>LCL</FI></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>30002<ACCTID>00012345<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><DTPOSTED>20260504<TRNAMT>2500.00<FITID>SAL<NAME>SALAIRE</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>2500.00<DTASOF>20260504</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

function writeOfx(): string {
  const dir = mkdtempSync(join(tmpdir(), 'confirm-'));
  const p = join(dir, 'statement.ofx');
  writeFileSync(p, OFX);
  return p;
}

beforeEach(() => {
  testDb = new DatabaseSync(':memory:');
  runMigrations(testDb);
  testDb
    .prepare(
      "INSERT INTO accounts (id, name, type, bank_id, currency) VALUES ('acc-a','A','checking','lcl','EUR')",
    )
    .run();
});

describe('handleImportConfirm — learns the account route', () => {
  it('records the identifier→account route after a successful insert', async () => {
    const res = await handleImportConfirm({ path: writeOfx(), accountId: 'acc-a' });
    expect(res.ok).toBe(true);
    expect(findAccountByIdentifier(testDb, 'ofx:30002:00012345')).toBe('acc-a');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/ipc/confirmLearnsRoute.test.ts`
Expected: FAIL — `findAccountByIdentifier` returns `null` (route not learned yet).

- [ ] **Step 3: Update the confirm handler**

`src/main/ipc/handlers/importConfirm.ts` — add imports at the top:

```ts
import { readIdentifier } from '../../import/accountIdentifier';
import { learnAccountRoute } from '../../import/accountRoutes';
```

Inside the `try`, after the successful `insertStatement` call and before `return { ok: true, ...result }`, learn the route:

```ts
const { identifier } = await readIdentifier(content, payload.path);
if (identifier !== null) {
  learnAccountRoute(getDb(), identifier, payload.accountId);
}
return { ok: true, ...result };
```

(The handler already has `content`, `getDb`, and `payload` in scope.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/ipc/confirmLearnsRoute.test.ts`
Expected: PASS. Also run the existing import handler tests:
Run: `npx vitest run tests/unit/ipc/importHandlers.test.ts`
Expected: PASS (no regression).

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/handlers/importConfirm.ts tests/unit/ipc/confirmLearnsRoute.test.ts
git commit -m "feat(import): learn account route on successful confirm"
```

---

## Task 7: Multi-file picker, drag & drop, and the renderer queue

This is the one breaking change (`PickFileResponse` shape) and it lands atomically with all consumers: the picker handler, the preload `getDroppedPaths`, the `useImport` queue rewrite, and the `ImportModal` rewrite. Steps are ordered test-first per unit, but everything is committed together so the build stays green.

**Files:**

- Modify: `src/shared/types/ipc.ts` (`PickFileResponse`, `ElectronAPI.getDroppedPaths`)
- Modify: `src/main/ipc/handlers/importPickFile.ts`
- Modify: `src/main/preload.ts`
- Rewrite: `src/renderer/hooks/useImport.ts`
- Rewrite: `src/renderer/components/ImportModal.tsx`
- Test: `tests/unit/renderer/useImportQueue.test.ts`, `tests/unit/renderer/ImportModal.summary.test.tsx`

- [ ] **Step 1: Write the failing hook test**

`tests/unit/renderer/useImportQueue.test.ts`:

```ts
// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@renderer/ipc/client', () => ({ ipc: { invoke: vi.fn() } }));

import { ipc } from '@renderer/ipc/client';
import { useImport } from '@renderer/hooks/useImport';

const mockInvoke = vi.mocked(ipc.invoke);

function extraction() {
  return {
    transactions: [{ tx_hash: 'h1', isDuplicate: false }],
    arithmetic: { status: 'passed', closingBalance: 10, delta: null },
    periodOverlap: { hasOverlap: false, overlappingImports: [] },
    newCount: 1,
    duplicateCount: 0,
    fileHash: 'fh',
    alreadyImported: false,
    dateRangeStart: '2026-01-01',
    dateRangeEnd: '2026-01-31',
    sourceType: 'ofx',
  };
}

beforeEach(() => {
  mockInvoke.mockReset();
});

describe('useImport — queue', () => {
  it('auto-routes one file, asks for the second, and reports a summary', async () => {
    // Mandatory review (ADR-005) means EVERY file — even an auto-routed one —
    // pauses at review until confirm() is called. The sequence below mirrors
    // that: resolve → extract → (user confirm) per file.
    mockInvoke
      .mockResolvedValueOnce({
        ok: true,
        identifier: 'ofx:1:1',
        matchedAccountId: 'acc-a',
        sourceType: 'ofx',
        detectedBank: 'LCL',
      }) // file 1 resolve → matched
      .mockResolvedValueOnce({ ok: true, extraction: extraction() }) // file 1 extract
      .mockResolvedValueOnce({ ok: true, importId: 'i1', insertedCount: 1, skippedCount: 0 }) // file 1 confirm
      .mockResolvedValueOnce({
        ok: true,
        identifier: 'ofx:1:2',
        matchedAccountId: null,
        sourceType: 'ofx',
        detectedBank: 'LCL',
      }) // file 2 resolve → no match
      .mockResolvedValueOnce({ ok: true, extraction: extraction() }) // file 2 extract
      .mockResolvedValueOnce({ ok: true, importId: 'i2', insertedCount: 1, skippedCount: 0 }); // file 2 confirm

    const { result } = renderHook(() => useImport());

    // file 1 auto-routed, paused at review
    await act(async () => {
      await result.current.startFromPaths(['/x/a.ofx', '/x/b.ofx']);
    });
    expect(result.current.state).toMatchObject({
      step: 'queue',
      index: 0,
      sub: { step: 'review', autoRouted: true },
    });

    // confirm file 1 → advances → file 2 resolve has no match → choose account
    await act(async () => {
      await result.current.confirm();
    });
    expect(result.current.state).toMatchObject({
      step: 'queue',
      index: 1,
      sub: { step: 'chooseAccount', identifier: 'ofx:1:2' },
    });

    // choose account for file 2 → extract → review, then confirm → summary
    await act(async () => {
      await result.current.chooseAccount('acc-b');
    });
    await act(async () => {
      await result.current.confirm();
    });

    expect(result.current.state.step).toBe('summary');
    const summary = result.current.state as { step: 'summary'; results: unknown[] };
    expect(summary.results).toEqual([
      {
        fileName: 'a.ofx',
        status: 'imported',
        accountId: 'acc-a',
        insertedCount: 1,
        autoRouted: true,
      },
      {
        fileName: 'b.ofx',
        status: 'imported',
        accountId: 'acc-b',
        insertedCount: 1,
        autoRouted: false,
      },
    ]);
  });

  it('marks an invalid extension as failed without calling resolve', async () => {
    const { result } = renderHook(() => useImport());
    await act(async () => {
      await result.current.startFromPaths(['/x/notes.txt']);
    });
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(result.current.state).toMatchObject({
      step: 'summary',
      results: [{ fileName: 'notes.txt', status: 'failed' }],
    });
  });
});
```

- [ ] **Step 2: Run the hook test to verify it fails**

Run: `npx vitest run tests/unit/renderer/useImportQueue.test.ts`
Expected: FAIL — `startFromPaths` / `chooseAccount` do not exist on the hook.

- [ ] **Step 3: Rewrite `useImport.ts`**

Replace the entire contents of `src/renderer/hooks/useImport.ts` with:

```ts
import { useRef, useState } from 'react';
import type { StatementExtraction } from '@shared/types/import';
import { ipc } from '@renderer/ipc/client';

const VALID_EXT = ['pdf', 'csv', 'ofx'];

export interface QueuedFile {
  path: string;
  fileName: string;
}

export type FileResult =
  | {
      fileName: string;
      status: 'imported';
      accountId: string;
      insertedCount: number;
      autoRouted: boolean;
    }
  | { fileName: string; status: 'skipped'; reason: string }
  | { fileName: string; status: 'failed'; error: string };

export type SubState =
  | { step: 'resolving' }
  | {
      step: 'chooseAccount';
      identifier: string | null;
      detectedBank: string | null;
      sourceType: 'ofx' | 'pdf';
    }
  | { step: 'extracting' }
  | { step: 'unknownBank'; accountId: string }
  | { step: 'learning'; accountId: string }
  | {
      step: 'review';
      extraction: StatementExtraction;
      accountId: string;
      selected: Set<string>;
      acknowledgedCannotVerify: boolean;
      autoRouted: boolean;
    }
  | { step: 'confirming' }
  | { step: 'fileError'; message: string };

export type ImportState =
  | { step: 'idle' }
  | { step: 'queue'; files: QueuedFile[]; index: number; results: FileResult[]; sub: SubState }
  | { step: 'summary'; results: FileResult[] };

export interface UseImport {
  state: ImportState;
  pickFiles: () => Promise<void>;
  startFromPaths: (paths: string[]) => Promise<void>;
  chooseAccount: (accountId: string) => Promise<void>;
  learnBank: (bankName: string) => Promise<void>;
  toggleTx: (txHash: string) => void;
  toggleAll: () => void;
  setAcknowledgedCannotVerify: (value: boolean) => void;
  confirm: () => Promise<void>;
  skipFile: () => void;
  reset: () => void;
}

const ERROR_MESSAGES: Partial<Record<string, string>> = {
  unsupported_format: 'Format non reconnu. Utilisez un fichier OFX ou PDF.',
  malformed_ofx: 'Fichier OFX invalide ou corrompu.',
  not_pdf: 'Le fichier ne semble pas être un PDF valide.',
  no_text: 'Ce PDF ne contient pas de texte extractible (scan image ?).',
  arithmetic_failed: 'Le solde ne correspond pas aux transactions. Import bloqué.',
  cannot_verify_unacknowledged: 'Vérification du solde non confirmée.',
  already_imported: 'Déjà importé — rien de nouveau.',
  model_unavailable: "Modèle IA non installé — impossible d'analyser une nouvelle banque.",
  inference_failed: "L'IA n'a pas réussi à lire la structure de ce relevé.",
};

function fileNameOf(path: string): string {
  return path.split('/').pop() ?? path;
}

export function useImport(): UseImport {
  const [state, setState] = useState<ImportState>({ step: 'idle' });
  const stateRef = useRef<ImportState>(state);

  function setS(next: ImportState): void {
    stateRef.current = next;
    setState(next);
  }

  function updateSub(
    updater: (prev: Extract<ImportState, { step: 'queue' }>) => ImportState,
  ): void {
    setState((prev) => {
      if (prev.step !== 'queue') return prev;
      const resolved = updater(prev);
      stateRef.current = resolved;
      return resolved;
    });
  }

  async function advance(files: QueuedFile[], index: number, results: FileResult[]): Promise<void> {
    const next = index + 1;
    if (next >= files.length) {
      setS({ step: 'summary', results });
      return;
    }
    await resolveAt(files, next, results);
  }

  async function resolveAt(
    files: QueuedFile[],
    index: number,
    results: FileResult[],
  ): Promise<void> {
    const file = files[index];
    if (file === undefined) return;
    setS({ step: 'queue', files, index, results, sub: { step: 'resolving' } });
    const res = await ipc.invoke('import:resolveAccount', { path: file.path });
    if (!res.ok) {
      await advance(files, index, [
        ...results,
        {
          fileName: file.fileName,
          status: 'failed',
          error: ERROR_MESSAGES[res.error] ?? res.error,
        },
      ]);
      return;
    }
    if (res.matchedAccountId !== null) {
      await runExtract(files, index, results, res.matchedAccountId, true);
      return;
    }
    setS({
      step: 'queue',
      files,
      index,
      results,
      sub: {
        step: 'chooseAccount',
        identifier: res.identifier,
        detectedBank: res.detectedBank,
        sourceType: res.sourceType,
      },
    });
  }

  async function runExtract(
    files: QueuedFile[],
    index: number,
    results: FileResult[],
    accountId: string,
    autoRouted: boolean,
  ): Promise<void> {
    const file = files[index];
    if (file === undefined) return;
    setS({ step: 'queue', files, index, results, sub: { step: 'extracting' } });
    const res = await ipc.invoke('import:extract', { path: file.path, accountId });
    if (!res.ok) {
      if (res.error === 'unknown_bank') {
        setS({ step: 'queue', files, index, results, sub: { step: 'unknownBank', accountId } });
        return;
      }
      await advance(files, index, [
        ...results,
        {
          fileName: file.fileName,
          status: 'failed',
          error: ERROR_MESSAGES[res.error] ?? res.error,
        },
      ]);
      return;
    }
    const selected = new Set(
      res.extraction.transactions.filter((tx) => !tx.isDuplicate).map((tx) => tx.tx_hash),
    );
    setS({
      step: 'queue',
      files,
      index,
      results,
      sub: {
        step: 'review',
        extraction: res.extraction,
        accountId,
        selected,
        acknowledgedCannotVerify: false,
        autoRouted,
      },
    });
  }

  async function startFromPaths(paths: string[]): Promise<void> {
    const valid: QueuedFile[] = [];
    const failed: FileResult[] = [];
    for (const path of paths) {
      const ext = path.toLowerCase().split('.').pop();
      if (ext !== undefined && VALID_EXT.includes(ext)) {
        valid.push({ path, fileName: fileNameOf(path) });
      } else {
        failed.push({ fileName: fileNameOf(path), status: 'failed', error: 'Format non supporté' });
      }
    }
    if (valid.length === 0) {
      setS({ step: 'summary', results: failed });
      return;
    }
    await resolveAt(valid, 0, failed);
  }

  async function pickFiles(): Promise<void> {
    const res = await ipc.invoke('import:pickFile', {});
    if (res.cancelled) {
      setS({ step: 'idle' });
      return;
    }
    await startFromPaths(res.paths);
  }

  async function chooseAccount(accountId: string): Promise<void> {
    const cur = stateRef.current;
    if (cur.step !== 'queue' || cur.sub.step !== 'chooseAccount') return;
    await runExtract(cur.files, cur.index, cur.results, accountId, false);
  }

  async function learnBank(bankName: string): Promise<void> {
    const cur = stateRef.current;
    if (cur.step !== 'queue' || cur.sub.step !== 'unknownBank') return;
    const { accountId } = cur.sub;
    const file = cur.files[cur.index];
    if (file === undefined) return;
    setS({ ...cur, sub: { step: 'learning', accountId } });
    const res = await ipc.invoke('banks:learn', { path: file.path, bankName });
    if (res.ok) {
      await runExtract(cur.files, cur.index, cur.results, accountId, false);
    } else {
      await advance(cur.files, cur.index, [
        ...cur.results,
        {
          fileName: file.fileName,
          status: 'failed',
          error: ERROR_MESSAGES[res.error] ?? res.error,
        },
      ]);
    }
  }

  function toggleTx(txHash: string): void {
    updateSub((prev) => {
      if (prev.sub.step !== 'review') return prev;
      const next = new Set(prev.sub.selected);
      if (next.has(txHash)) next.delete(txHash);
      else next.add(txHash);
      return { ...prev, sub: { ...prev.sub, selected: next } };
    });
  }

  function toggleAll(): void {
    updateSub((prev) => {
      if (prev.sub.step !== 'review') return prev;
      const hashes = prev.sub.extraction.transactions
        .filter((tx) => !tx.isDuplicate)
        .map((tx) => tx.tx_hash);
      const allSelected = hashes.every(
        (h) => prev.sub.step === 'review' && prev.sub.selected.has(h),
      );
      return {
        ...prev,
        sub: { ...prev.sub, selected: allSelected ? new Set<string>() : new Set(hashes) },
      };
    });
  }

  function setAcknowledgedCannotVerify(value: boolean): void {
    updateSub((prev) => {
      if (prev.sub.step !== 'review') return prev;
      return { ...prev, sub: { ...prev.sub, acknowledgedCannotVerify: value } };
    });
  }

  async function confirm(): Promise<void> {
    const cur = stateRef.current;
    if (cur.step !== 'queue' || cur.sub.step !== 'review') return;
    const { extraction, accountId, selected, acknowledgedCannotVerify, autoRouted } = cur.sub;
    const file = cur.files[cur.index];
    if (file === undefined) return;
    setS({ ...cur, sub: { step: 'confirming' } });
    const ack = extraction.sourceType === 'ofx' ? true : acknowledgedCannotVerify;
    const res = await ipc.invoke('import:confirm', {
      path: file.path,
      accountId,
      selectedHashes: [...selected],
      acknowledgedCannotVerify: ack,
    });
    if (res.ok) {
      await advance(cur.files, cur.index, [
        ...cur.results,
        {
          fileName: file.fileName,
          status: 'imported',
          accountId,
          insertedCount: res.insertedCount,
          autoRouted,
        },
      ]);
    } else if (res.error === 'already_imported') {
      await advance(cur.files, cur.index, [
        ...cur.results,
        {
          fileName: file.fileName,
          status: 'skipped',
          reason: ERROR_MESSAGES.already_imported ?? '',
        },
      ]);
    } else {
      setS({ ...cur, sub: { step: 'fileError', message: ERROR_MESSAGES[res.error] ?? res.error } });
    }
  }

  function skipFile(): void {
    const cur = stateRef.current;
    if (cur.step !== 'queue') return;
    const file = cur.files[cur.index];
    if (file === undefined) return;
    void advance(cur.files, cur.index, [
      ...cur.results,
      { fileName: file.fileName, status: 'skipped', reason: 'Ignoré' },
    ]);
  }

  function reset(): void {
    setS({ step: 'idle' });
  }

  return {
    state,
    pickFiles,
    startFromPaths,
    chooseAccount,
    learnBank,
    toggleTx,
    toggleAll,
    setAcknowledgedCannotVerify,
    confirm,
    skipFile,
    reset,
  };
}
```

- [ ] **Step 4: Run the hook test to verify it passes**

Run: `npx vitest run tests/unit/renderer/useImportQueue.test.ts`
Expected: PASS (2 tests). The old `tests/unit/renderer/useImport.test.ts` will now fail to compile (it calls `pickAndExtract`); delete it — its behaviour is superseded by the queue test:

```bash
git rm tests/unit/renderer/useImport.test.ts
```

- [ ] **Step 5: Change `PickFileResponse` and add `getDroppedPaths` to the IPC types**

In `src/shared/types/ipc.ts`, replace the `PickFileResponse` definition (lines 32-41) with:

```ts
export type PickFileResponse = { cancelled: true } | { cancelled: false; paths: string[] };
```

Add `getDroppedPaths` to the `ElectronAPI` interface (the `invoke` member is at ~line 108):

```ts
export interface ElectronAPI {
  invoke: <C extends IpcChannel>(channel: C, payload: IpcPayload<C>) => Promise<IpcResponse<C>>;
  getDroppedPaths: (files: File[]) => string[];
}
```

- [ ] **Step 6: Update the picker handler**

Replace the body of `handlePickFile` in `src/main/ipc/handlers/importPickFile.ts` with (this drops the now-unused type/hash/size/alreadyImported computation and the imports they needed):

```ts
import { dialog } from 'electron';
import type { PickFileResponse } from '@shared/types/ipc';

export async function handlePickFile(): Promise<PickFileResponse> {
  const result = await dialog.showOpenDialog({
    title: 'Select bank statements',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Statements', extensions: ['pdf', 'csv', 'ofx'] }],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { cancelled: true };
  }
  return { cancelled: false, paths: result.filePaths };
}
```

- [ ] **Step 7: Expose `getDroppedPaths` in the preload**

Replace `src/main/preload.ts` with:

```ts
import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { ElectronAPI, IpcChannel, IpcPayload, IpcResponse } from '@shared/types/ipc';

const api: ElectronAPI = {
  invoke: <C extends IpcChannel>(channel: C, payload: IpcPayload<C>): Promise<IpcResponse<C>> =>
    ipcRenderer.invoke(channel, payload),
  getDroppedPaths: (files: File[]): string[] => files.map((f) => webUtils.getPathForFile(f)),
};

contextBridge.exposeInMainWorld('electronAPI', api);
```

- [ ] **Step 8: Write the failing ImportModal summary test**

`tests/unit/renderer/ImportModal.summary.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@renderer/ipc/client', () => ({
  ipc: { invoke: vi.fn().mockResolvedValue({ accounts: [] }) },
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

// Drive the modal straight to a multi-file summary by stubbing the hook.
vi.mock('@renderer/hooks/useImport', () => ({
  useImport: () => ({
    state: {
      step: 'summary',
      results: [
        {
          fileName: 'a.ofx',
          status: 'imported',
          accountId: 'acc-a',
          insertedCount: 3,
          autoRouted: true,
        },
        { fileName: 'b.pdf', status: 'skipped', reason: 'Déjà importé — rien de nouveau.' },
        { fileName: 'c.txt', status: 'failed', error: 'Format non supporté' },
      ],
    },
    pickFiles: vi.fn(),
    startFromPaths: vi.fn(),
    chooseAccount: vi.fn(),
    learnBank: vi.fn(),
    toggleTx: vi.fn(),
    toggleAll: vi.fn(),
    setAcknowledgedCannotVerify: vi.fn(),
    confirm: vi.fn(),
    skipFile: vi.fn(),
    reset: vi.fn(),
  }),
}));

import { ImportModal } from '@renderer/components/ImportModal';

afterEach(() => {
  cleanup();
});

describe('ImportModal — summary view', () => {
  it('lists imported, skipped and failed files', () => {
    render(<ImportModal open onClose={vi.fn()} />);
    expect(screen.getByText('a.ofx')).toBeTruthy();
    expect(screen.getByText('b.pdf')).toBeTruthy();
    expect(screen.getByText('c.txt')).toBeTruthy();
    expect(screen.getByText(/Format non supporté/)).toBeTruthy();
  });
});
```

- [ ] **Step 9: Run the modal test to verify it fails**

Run: `npx vitest run tests/unit/renderer/ImportModal.summary.test.tsx`
Expected: FAIL — the current `ImportModal` has no SummaryView; the stubbed hook shape mismatches the component.

- [ ] **Step 10: Rewrite `ImportModal.tsx`**

Replace `src/renderer/components/ImportModal.tsx` with the following. It keeps `ArithmeticBadge`, `LearnBankView`, `ErrorView`, and `TransactionReviewTable` usage, moves account selection into `ChooseAccountView`, adds a drop zone and `SummaryView`, and renders per the queue sub-state.

```tsx
import {
  AlertTriangle,
  CheckCircle,
  Plus,
  Sparkles,
  Upload,
  XCircle,
  SkipForward,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ipc } from '@renderer/ipc/client';
import { useImport, type FileResult, type SubState } from '../hooks/useImport';
import { TransactionReviewTable } from './TransactionReviewTable';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import type { StatementExtraction } from '@shared/types/import';
import type { AccountSummary, CreateAccountInput } from '@shared/types/dashboard';

const FIELD =
  'h-9 w-full rounded-md border border-line-2 bg-ink-3 px-2.5 text-[13px] text-paper placeholder:text-paper-dim focus:outline-none focus:ring-1 focus:ring-brass';

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  onImported?: () => void;
}

export function ImportModal({ open, onClose, onImported }: ImportModalProps) {
  const {
    state,
    pickFiles,
    startFromPaths,
    chooseAccount,
    learnBank,
    toggleTx,
    toggleAll,
    setAcknowledgedCannotVerify,
    confirm,
    skipFile,
    reset,
  } = useImport();

  const onCloseRef = useRef(onClose);
  const onImportedRef = useRef(onImported);
  useEffect(() => {
    onCloseRef.current = onClose;
    onImportedRef.current = onImported;
  });

  const [overlapDismissed, setOverlapDismissed] = useState(false);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void ipc.invoke('dashboard:getAccounts', {}).then(({ accounts: next }) => {
      if (active) setAccounts(next);
    });
    return () => {
      active = false;
    };
  }, [open]);

  async function createAccountInline(input: CreateAccountInput): Promise<string | null> {
    try {
      const { account } = await ipc.invoke('accounts:create', input);
      setAccounts((prev) => [...prev, account]);
      onImportedRef.current?.();
      toast.success(`Compte « ${account.name} » créé`);
      return account.id;
    } catch {
      toast.error('Compte non créé');
      return null;
    }
  }

  // On reaching the summary, refresh the dashboard; auto-close the trivial
  // single-imported-file case with the familiar toast.
  useEffect(() => {
    if (state.step !== 'summary') return;
    onImportedRef.current?.();
    if (state.results.length === 1 && state.results[0]?.status === 'imported') {
      const n = state.results[0].insertedCount;
      toast(`${String(n)} transaction${n > 1 ? 's' : ''} importée${n > 1 ? 's' : ''}`, {
        duration: 3000,
      });
      reset();
      onCloseRef.current();
    }
  }, [state, reset]);

  function handleClose() {
    reset();
    setOverlapDismissed(false);
    onClose();
  }

  function accountName(id: string): string {
    return accounts.find((a) => a.id === id)?.name ?? id;
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    const paths = window.electronAPI.getDroppedPaths(files);
    if (paths.length > 0) void startFromPaths(paths);
  }

  const sub: SubState | null = state.step === 'queue' ? state.sub : null;
  const progress =
    state.step === 'queue' ? ` (${String(state.index + 1)}/${String(state.files.length)})` : '';

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) handleClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importer des relevés{progress}</DialogTitle>
          <DialogDescription className="sr-only">
            Sélectionnez ou déposez des fichiers OFX ou PDF, vérifiez les transactions, confirmez.
          </DialogDescription>
        </DialogHeader>

        {state.step === 'idle' && (
          <DropPickView
            dragOver={dragOver}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => {
              setDragOver(false);
            }}
            onDrop={onDrop}
            onPick={() => {
              void pickFiles();
            }}
          />
        )}

        {(sub?.step === 'resolving' || sub?.step === 'extracting') && (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">
              {sub.step === 'resolving' ? 'Analyse du compte…' : 'Extraction du relevé…'}
            </p>
          </div>
        )}

        {sub?.step === 'chooseAccount' && (
          <ChooseAccountView
            fileName={state.step === 'queue' ? (state.files[state.index]?.fileName ?? '') : ''}
            detectedBank={sub.detectedBank}
            accounts={accounts}
            onChoose={(id) => {
              void chooseAccount(id);
            }}
            onCreateAccount={createAccountInline}
            onSkip={skipFile}
          />
        )}

        {sub?.step === 'unknownBank' && (
          <LearnBankView
            onLearn={(name) => {
              void learnBank(name);
            }}
            onCancel={skipFile}
          />
        )}

        {sub?.step === 'learning' && (
          <div className="flex flex-col items-center gap-2 py-8">
            <p className="text-sm text-paper">Analyse de la banque par l'IA…</p>
            <p className="text-xs text-paper-mute">
              Environ une minute, une seule fois par banque.
            </p>
          </div>
        )}

        {sub?.step === 'review' && (
          <ReviewView
            extraction={sub.extraction}
            fileName={state.step === 'queue' ? (state.files[state.index]?.fileName ?? '') : ''}
            accountLabel={accountName(sub.accountId)}
            autoRouted={sub.autoRouted}
            selected={sub.selected}
            acknowledgedCannotVerify={sub.acknowledgedCannotVerify}
            overlapDismissed={overlapDismissed}
            onDismissOverlap={() => {
              setOverlapDismissed(true);
            }}
            onToggleTx={toggleTx}
            onToggleAll={toggleAll}
            onAcknowledge={setAcknowledgedCannotVerify}
            onSkip={skipFile}
            onConfirm={() => {
              void confirm();
            }}
            confirmDisabled={!canConfirm(sub)}
          />
        )}

        {sub?.step === 'confirming' && (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">Import en cours…</p>
          </div>
        )}

        {sub?.step === 'fileError' && (
          <div className="flex flex-col gap-4 py-4">
            <p className="text-sm text-destructive">{sub.message}</p>
            <DialogFooter>
              <Button variant="outline" onClick={skipFile}>
                <SkipForward size={14} strokeWidth={1.8} />
                Ignorer ce fichier
              </Button>
            </DialogFooter>
          </div>
        )}

        {state.step === 'summary' && (
          <SummaryView results={state.results} accountName={accountName} onClose={handleClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function canConfirm(sub: SubState): boolean {
  if (sub.step !== 'review') return false;
  if (sub.selected.size === 0) return false;
  if (sub.extraction.arithmetic.status === 'failed') return false;
  if (
    sub.extraction.sourceType === 'pdf' &&
    sub.extraction.arithmetic.status === 'cannot_verify' &&
    !sub.acknowledgedCannotVerify
  ) {
    return false;
  }
  return true;
}

function DropPickView({
  dragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onPick,
}: {
  dragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onPick: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 py-6">
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`flex flex-col items-center gap-3 rounded-md border border-dashed p-8 text-center transition-colors ${
          dragOver ? 'border-brass bg-brass/5' : 'border-line-2'
        }`}
      >
        <Upload size={22} strokeWidth={1.6} className="text-paper-mute" />
        <p className="text-sm text-paper-soft">Dépose tes relevés ici</p>
        <p className="text-xs text-paper-mute">OFX recommandé · PDF pour les archives</p>
        <Button onClick={onPick}>Parcourir…</Button>
      </div>
    </div>
  );
}

function ChooseAccountView({
  fileName,
  detectedBank,
  accounts,
  onChoose,
  onCreateAccount,
  onSkip,
}: {
  fileName: string;
  detectedBank: string | null;
  accounts: AccountSummary[];
  onChoose: (accountId: string) => void;
  onCreateAccount: (input: CreateAccountInput) => Promise<string | null>;
  onSkip: () => void;
}) {
  const [selected, setSelected] = useState<string>(accounts[0]?.id ?? '');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [bank, setBank] = useState(detectedBank ?? '');

  async function submitNew() {
    if (name.trim() === '') return;
    const id = await onCreateAccount({ name, bankId: bank.trim() === '' ? null : bank });
    if (id !== null) onChoose(id);
  }

  return (
    <div className="flex flex-col gap-4 py-4">
      <p className="text-sm text-paper-soft">
        Compte non reconnu pour <span className="font-medium text-paper">{fileName}</span>. Choisis
        son compte — il sera mémorisé pour les prochains imports.
      </p>

      {creating ? (
        <div className="flex flex-col gap-2 rounded-md border border-line-2 bg-ink-2/60 p-2.5">
          <input
            autoFocus
            value={name}
            placeholder="Nom du compte (ex. Compte joint)"
            onChange={(e) => {
              setName(e.target.value);
            }}
            className={FIELD}
          />
          <input
            value={bank}
            placeholder="Banque (optionnel)"
            onChange={(e) => {
              setBank(e.target.value);
            }}
            className={FIELD}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={name.trim() === ''}
              onClick={() => {
                void submitNew();
              }}
            >
              Créer et utiliser
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setCreating(false);
              }}
            >
              Annuler
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <select
            value={selected}
            aria-label="Compte de destination"
            onChange={(e) => {
              setSelected(e.target.value);
            }}
            className={FIELD}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.bankId !== null ? ` · ${a.bankId}` : ''}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="secondary"
            aria-label="Nouveau compte"
            onClick={() => {
              setCreating(true);
            }}
          >
            <Plus size={14} strokeWidth={1.8} />
          </Button>
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onSkip}>
          <SkipForward size={14} strokeWidth={1.8} />
          Ignorer ce fichier
        </Button>
        {!creating && (
          <Button
            disabled={selected === ''}
            onClick={() => {
              onChoose(selected);
            }}
          >
            Continuer →
          </Button>
        )}
      </DialogFooter>
    </div>
  );
}

function SummaryView({
  results,
  accountName,
  onClose,
}: {
  results: FileResult[];
  accountName: (id: string) => string;
  onClose: () => void;
}) {
  const total = results.reduce(
    (sum, r) => sum + (r.status === 'imported' ? r.insertedCount : 0),
    0,
  );
  return (
    <div className="flex flex-col gap-4 py-2">
      <ul className="flex flex-col gap-1.5 text-sm">
        {results.map((r) => (
          <li key={r.fileName} className="flex items-center gap-2">
            {r.status === 'imported' && (
              <CheckCircle size={14} strokeWidth={1.6} className="text-sage" />
            )}
            {r.status === 'skipped' && (
              <SkipForward size={14} strokeWidth={1.6} className="text-paper-mute" />
            )}
            {r.status === 'failed' && (
              <XCircle size={14} strokeWidth={1.6} className="text-coral" />
            )}
            <span className="font-medium text-paper">{r.fileName}</span>
            <span className="text-muted-foreground">
              {r.status === 'imported' &&
                `${String(r.insertedCount)} tx → ${accountName(r.accountId)}${r.autoRouted ? ' (auto)' : ''}`}
              {r.status === 'skipped' && r.reason}
              {r.status === 'failed' && r.error}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">
        {total} transaction{total > 1 ? 's' : ''} importée{total > 1 ? 's' : ''} au total.
      </p>
      <DialogFooter>
        <Button onClick={onClose}>Fermer</Button>
      </DialogFooter>
    </div>
  );
}

function LearnBankView({
  onLearn,
  onCancel,
}: {
  onLearn: (bankName: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="flex items-start gap-2 rounded-md border border-line-2 bg-ink-2/60 p-3 text-sm">
        <Sparkles size={16} strokeWidth={1.6} className="mt-0.5 shrink-0 text-brass" />
        <span className="text-paper-soft">
          Banque non reconnue. L'IA peut analyser ce relevé pour apprendre sa mise en page — une
          seule fois (~1 min, en local). Les imports suivants de cette banque seront instantanés.
        </span>
      </div>
      <input
        autoFocus
        value={name}
        placeholder="Nom de la banque (ex. Société Générale)"
        onChange={(e) => {
          setName(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim() !== '') onLearn(name.trim());
        }}
        className={FIELD}
      />
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          <SkipForward size={14} strokeWidth={1.8} />
          Ignorer ce fichier
        </Button>
        <Button
          disabled={name.trim() === ''}
          onClick={() => {
            onLearn(name.trim());
          }}
        >
          <Sparkles size={14} strokeWidth={1.8} />
          Analyser avec l'IA (~1 min)
        </Button>
      </DialogFooter>
    </div>
  );
}

interface ReviewViewProps {
  extraction: StatementExtraction;
  fileName: string;
  accountLabel: string;
  autoRouted: boolean;
  selected: Set<string>;
  acknowledgedCannotVerify: boolean;
  overlapDismissed: boolean;
  onDismissOverlap: () => void;
  onToggleTx: (hash: string) => void;
  onToggleAll: () => void;
  onAcknowledge: (v: boolean) => void;
  onSkip: () => void;
  onConfirm: () => void;
  confirmDisabled: boolean;
}

function ReviewView({
  extraction,
  fileName,
  accountLabel,
  autoRouted,
  selected,
  acknowledgedCannotVerify,
  overlapDismissed,
  onDismissOverlap,
  onToggleTx,
  onToggleAll,
  onAcknowledge,
  onSkip,
  onConfirm,
  confirmDisabled,
}: ReviewViewProps) {
  const selectedCount = selected.size;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{fileName}</span>
          <span className="text-xs text-paper-mute">
            → {accountLabel}
            {autoRouted ? ' (auto)' : ''}
          </span>
        </div>
        <div className="text-sm text-muted-foreground">
          {extraction.dateRangeStart} → {extraction.dateRangeEnd} · {extraction.transactions.length}{' '}
          transaction
          {extraction.transactions.length > 1 ? 's' : ''}
        </div>
      </div>

      <ArithmeticBadge
        extraction={extraction}
        acknowledgedCannotVerify={acknowledgedCannotVerify}
        onAcknowledge={onAcknowledge}
      />

      {extraction.periodOverlap.hasOverlap && !overlapDismissed && (
        <div
          className="rounded-md border p-3 text-sm"
          style={{
            background: 'hsl(var(--flag-soft))',
            color: 'hsl(var(--flag))',
            borderColor: 'hsl(var(--flag))',
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <span>
              Ce relevé chevauche un import existant (
              {extraction.periodOverlap.overlappingImports[0]?.date_range_start} →{' '}
              {extraction.periodOverlap.overlappingImports[0]?.date_range_end}). Vérifiez les
              doublons ci-dessous.
            </span>
            <button
              type="button"
              className="shrink-0 opacity-70 hover:opacity-100"
              style={{ color: 'hsl(var(--flag))' }}
              onClick={onDismissOverlap}
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <TransactionReviewTable
        transactions={extraction.transactions}
        selected={selected}
        onToggleTx={onToggleTx}
        onToggleAll={onToggleAll}
      />

      <DialogFooter>
        <Button variant="outline" onClick={onSkip}>
          <SkipForward size={14} strokeWidth={1.8} />
          Ignorer
        </Button>
        <Button onClick={onConfirm} disabled={confirmDisabled}>
          Importer {selectedCount} transaction{selectedCount > 1 ? 's' : ''} →
        </Button>
      </DialogFooter>
    </div>
  );
}

function ArithmeticBadge({
  extraction,
  acknowledgedCannotVerify,
  onAcknowledge,
}: {
  extraction: StatementExtraction;
  acknowledgedCannotVerify: boolean;
  onAcknowledge: (v: boolean) => void;
}) {
  const { arithmetic, sourceType } = extraction;

  if (arithmetic.status === 'passed') {
    return (
      <div
        className="flex items-center gap-2 rounded-md px-3 py-2 text-sm"
        style={{ background: 'hsl(var(--sage-soft))', color: 'hsl(var(--sage))' }}
      >
        <CheckCircle size={14} strokeWidth={1.6} />
        <span>
          Solde vérifié —{' '}
          {arithmetic.closingBalance?.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
        </span>
      </div>
    );
  }

  if (arithmetic.status === 'failed') {
    return (
      <div
        className="flex items-center gap-2 rounded-md px-3 py-2 text-sm"
        style={{ background: 'hsl(var(--coral-soft))', color: 'hsl(var(--coral))' }}
      >
        <XCircle size={14} strokeWidth={1.6} />
        <span>
          Écart de {arithmetic.delta?.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
        </span>
      </div>
    );
  }

  if (sourceType === 'pdf') {
    return (
      <div
        className="flex flex-col gap-2 rounded-md px-3 py-2 text-sm"
        style={{ background: 'hsl(var(--flag-soft))', color: 'hsl(var(--flag))' }}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} strokeWidth={1.6} />
          <span>Solde non vérifiable</span>
        </div>
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox
            checked={acknowledgedCannotVerify}
            onCheckedChange={(v) => {
              onAcknowledge(v === true);
            }}
            aria-label="Je confirme l'import sans vérification du solde"
          />
          <span>Je confirme l&apos;import sans vérification du solde</span>
        </label>
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 11: Run the modal test to verify it passes**

Run: `npx vitest run tests/unit/renderer/ImportModal.summary.test.tsx`
Expected: PASS.

- [ ] **Step 12: Full typecheck + targeted suites**

Run: `npx tsc --noEmit`
Expected: clean. If `ImportModal` is referenced by a dashboard test that asserts old copy ("Importer un relevé"), update that assertion to the new title.

Run: `npx vitest run tests/unit/renderer tests/unit/ipc`
Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add src/shared/types/ipc.ts src/main/ipc/handlers/importPickFile.ts src/main/preload.ts src/renderer/hooks/useImport.ts src/renderer/components/ImportModal.tsx tests/unit/renderer/useImportQueue.test.ts tests/unit/renderer/ImportModal.summary.test.tsx
git add -u tests/unit/renderer/useImport.test.ts
git commit -m "feat(import): multi-file import with drag & drop and learned account routing"
```

---

## Task 8: Integration test — auto-route a second statement

**Files:**

- Test: `tests/integration/import/accountRouting.test.ts`

This uses the gitignored real LCL fixtures (`it.skipIf(!existsSync)`), exercising the full chain: confirm an OFX statement (learns the route), then resolve a second OFX for the same account and assert it auto-matches with no prompt. It also covers the PDF identifier branch when a PDF fixture is present.

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { readIdentifier } from '../../../src/main/import/accountIdentifier';
import { findAccountByIdentifier, learnAccountRoute } from '../../../src/main/import/accountRoutes';

const OFX_FIXTURE = resolve('spike-fixtures/LCL_STATEMENT_FIXTURE.ofx');

let db: DatabaseSync;
beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  db.prepare(
    "INSERT INTO accounts (id, name, type, bank_id, currency) VALUES ('acc-lcl','LCL','checking','lcl','EUR')",
  ).run();
});

describe('account routing — real LCL OFX fixture', () => {
  it.skipIf(!existsSync(OFX_FIXTURE))('learns then auto-resolves the same account', async () => {
    const buf = readFileSync(OFX_FIXTURE);
    const { identifier } = await readIdentifier(buf, OFX_FIXTURE);
    expect(identifier).toMatch(/^ofx:/);

    // first import would learn the route:
    learnAccountRoute(db, identifier as string, 'acc-lcl');

    // a second statement for the same account resolves with no prompt:
    const second = await readIdentifier(buf, OFX_FIXTURE);
    expect(findAccountByIdentifier(db, second.identifier as string)).toBe('acc-lcl');
    db.close();
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/integration/import/accountRouting.test.ts`
Expected: PASS if `spike-fixtures/` is symlinked (per CLAUDE.md), otherwise SKIPPED — both are acceptable green outcomes.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/import/accountRouting.test.ts
git commit -m "test(import): integration test for learned account routing"
```

---

## Task 9: Promote ADR-015, full verification, open PR

**Files:**

- Modify: `docs/adr/015-account-identifier-routing.md` (Status → Accepted)

- [ ] **Step 1: Full Definition-of-Done sweep**

Run each and confirm clean/green:

```bash
npx eslint .
npx tsc --noEmit
npx vitest run
npm run build
```

Expected: lint clean, types clean, all tests pass, build succeeds.

- [ ] **Step 2: Manual smoke (per CLAUDE.md, optional but recommended)**

Launch the app, open Import, drop two OFX statements: the first asks for an account once, the second (same account) auto-routes; the summary lists both. Use the `/run` skill if helpful.

- [ ] **Step 3: Promote the ADR**

In `docs/adr/015-account-identifier-routing.md`, change the status line:

```md
- **Status** : Accepted
```

And replace the closing promotion note with a one-line record that it shipped.

- [ ] **Step 4: Commit and open the PR**

```bash
git add docs/adr/015-account-identifier-routing.md
git commit -m "docs: promote ADR-015 to Accepted"
git push -u origin worktree-multi-file-import-account-routing
gh pr create --title "feat(import): multi-file import with learned account routing" --body "Implements ADR-015 / the multi-file import spec: multi-select + drag & drop, deterministic identifier extraction (OFX ACCTID / PDF IBAN), a learned identifier→account map, and a per-file import queue. See docs/superpowers/specs/2026-06-03-multi-file-import-account-routing-design.md."
```

- [ ] **Step 5: Self-merge once CI is green** (per CLAUDE.md MVP light gate — 0 required reviews, branch up to date).

---

## Notes for the implementer

- **`tx.isDuplicate` / `tx.tx_hash`** are existing fields on `ReviewTransaction` (see `StatementExtraction`); the hook filters on them exactly as the original `useImport` did.
- **`Number(res.changes)`** is required for `node:sqlite` write results (BigInt) — not used in this plan's repo (the upsert/select don't read `changes`), but follow it if you add counts.
- **Migrations need both** the `.sql` file and the `migrate.ts` array entry — nothing auto-discovers them.
- **`extractPdfText` extracts all pages**; `readIdentifier` slices `pages[0]` for the header — do not add a page-limit option.
- **Keep the per-file review (ADR-005).** Do not add an "import all without review" shortcut in this plan.
