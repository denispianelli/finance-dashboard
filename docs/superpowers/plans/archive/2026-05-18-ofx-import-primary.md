# OFX Import Primary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add OFX 1.x ingestion as the primary import path, reusing the existing format-agnostic downstream pipeline, with FITID-based transaction identity.

**Architecture:** `extractStatement` becomes a dispatcher selecting `extractPdf` or `extractOfx` by `detectType`, both producing a shared `NormalizedStatement`. Everything after hash assignment (verify → dedup → overlap → atomic INSERT) is untouched. Transaction identity is frozen: OFX rows hash from `<FITID>`, PDF rows keep the content+order hash, cross-source overlap is prevented by the existing period-overlap warning, never by hash equality.

**Tech Stack:** TypeScript (strict), node:sqlite `DatabaseSync`, Vitest, hand-rolled OFX SGML parser (no third-party dependency).

**Reference spec:** `docs/superpowers/specs/2026-05-18-ofx-import-primary-design.md`

**Spec deviation surfaced for review:** Spec §5 says "resolve `bankId` by matching OFX `<BANKID>`/`<ORG>` against the `banks` table". `bankId` is informational only for OFX (no column mapping needed; it is not propagated into `StatementExtraction` downstream). This plan resolves the bank via the account's `bank_id` (single-account scope, consistent with the "Multi-account / OFX ACCTID resolution" Non-Goal), parses `<ORG>`/`<BANKID>` for traceability, and throws `unknown_bank` when the account has no resolvable bank. Confirm at plan review.

---

### Task 1: Pivot ADR and plan commit

**Files:**

- Create: `docs/adr/008-ofx-primary-pdf-backfill.md`
- Commit: `docs/superpowers/plans/2026-05-18-ofx-import-primary.md` (this plan, currently untracked)

- [ ] **Step 1: Write the pivot ADR**

Create `docs/adr/008-ofx-primary-pdf-backfill.md`:

```markdown
# 8. OFX primary, PDF relegated to historical backfill

Date: 2026-05-18
Status: Accepted

## Context

Epic #23 assumed "PDF is the only usable format (LCL no longer offers CSV
export)". This is false: LCL exports OFX, CSV and QIF over a ~3-month rolling
window, plus a 10-year PDF statement archive.

## Decision

OFX becomes the primary, ongoing import path (structured, bank-assigned
`<FITID>` per transaction, no column mapping). PDF is relegated to one-time
historical backfill for transactions older than the OFX window — a separate
later story. CSV/QIF are not implemented (OFX is strictly superior for the same
source and window). The LLM column-mapping (#32) is deferred indefinitely.

### Frozen cross-source identity contract

`UNIQUE (account_id, tx_hash)` is the dedup engine. One column cannot both match
across sources by content and distinguish true same-day duplicates, so we do
not attempt cross-source hash equality:

- OFX: `tx_hash = sha256(accountId | 'ofx' | fitid)`
- PDF: unchanged content+order hash
- Cross-source PDF↔OFX double-import is prevented by the existing
  `checkPeriodOverlap` warning plus procedure (backfill PDF only for the
  pre-OFX era), never by hash equality.

The future PDF-backfill story conforms to this contract without rework.

## Consequences

- Reliable ongoing imports; FITID makes re-import idempotent.
- Epic #23's strategy section is superseded; see Story #58.
- A nullable `fitid` column is added to `transactions` for traceability.
```

- [ ] **Step 2: Commit the ADR and this plan**

```bash
git add docs/adr/008-ofx-primary-pdf-backfill.md docs/superpowers/plans/2026-05-18-ofx-import-primary.md
git commit -m "docs: add OFX pivot ADR and implementation plan (#58)"
```

---

### Task 2: Pre-implementation risk spike (manual gate — Denis runs this)

**Files:** none (manual verification; record outcome in the ADR)

This task is a decision gate. It requires a real LCL OFX export, which only
Denis has. Do not proceed to Task 3 until its outcome is recorded.

- [ ] **Step 1: Export two overlapping OFX files from LCL**

Download two OFX exports from the LCL web interface whose date ranges overlap
(e.g. one covering 16/02→16/05, one covering 01/03→16/05). Save them outside
the repo (they contain real data).

- [ ] **Step 2: Verify FITID uniqueness within one file**

```bash
grep -o '<FITID>[^<]*' /path/to/export1.ofx | sort | uniq -d
```

Expected: **no output** (no duplicate FITIDs within a statement).

- [ ] **Step 3: Verify FITID stability across the two overlapping files**

```bash
grep -o '<FITID>[^<]*' /path/to/export1.ofx | sort > /tmp/f1.txt
grep -o '<FITID>[^<]*' /path/to/export2.ofx | sort > /tmp/f2.txt
comm -12 /tmp/f1.txt /tmp/f2.txt | wc -l
```

Expected: a non-zero count — transactions in the overlapping period carry the
**same** FITID in both exports.

- [ ] **Step 4: Record the OFX bank identifiers**

```bash
grep -o '<ORG>[^<]*\|<FID>[^<]*\|<BANKID>[^<]*\|<CURDEF>[^<]*' /path/to/export1.ofx | head
```

Note the `<ORG>` value (used in Task 7's test fixtures and reasoning).

- [ ] **Step 5: Record outcome in the ADR**

Append a "## Spike outcome (2026-05-18)" section to
`docs/adr/008-ofx-primary-pdf-backfill.md` stating: FITIDs unique within a file
(yes/no), stable across overlapping exports (yes/no), and the observed `<ORG>`
value. Commit:

```bash
git add docs/adr/008-ofx-primary-pdf-backfill.md
git commit -m "docs: record OFX FITID spike outcome (#58)"
```

**Gate:** If FITIDs are NOT unique-and-stable, STOP and escalate — the identity
model must be reassessed before any implementation.

---

### Task 3: fitid migration

**Files:**

- Create: `src/main/db/migrations/004_add_fitid.sql`
- Modify: `src/main/db/migrate.ts:1-15`
- Test: `tests/unit/db/add_fitid.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/db/add_fitid.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

describe('004_add_fitid', () => {
  it('adds a nullable fitid column to transactions', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const cols = db.prepare("PRAGMA table_info('transactions')").all() as unknown as {
      name: string;
      notnull: number;
    }[];
    const fitid = cols.find((c) => c.name === 'fitid');
    expect(fitid).toBeDefined();
    expect(fitid?.notnull).toBe(0);
    db.close();
  });

  it('records migration version 4 and is idempotent', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    runMigrations(db);
    const rows = db
      .prepare('SELECT version FROM schema_migrations ORDER BY version')
      .all() as unknown as { version: number }[];
    expect(rows.map((r) => r.version)).toEqual([1, 2, 3, 4]);
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/db/add_fitid.test.ts`
Expected: FAIL — `fitid` column undefined; versions `[1,2,3]`.

- [ ] **Step 3: Create the migration SQL**

Create `src/main/db/migrations/004_add_fitid.sql`:

```sql
ALTER TABLE transactions ADD COLUMN fitid TEXT;
```

- [ ] **Step 4: Register the migration**

In `src/main/db/migrate.ts`, add the import after line 4 and the array entry:

```ts
import sql004 from './migrations/004_add_fitid.sql?raw';
```

```ts
const MIGRATIONS: Migration[] = [
  { version: 1, sql: sql001 },
  { version: 2, sql: sql002 },
  { version: 3, sql: sql003 },
  { version: 4, sql: sql004 },
];
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/db/add_fitid.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/main/db/migrations/004_add_fitid.sql src/main/db/migrate.ts tests/unit/db/add_fitid.test.ts
git commit -m "feat: add nullable fitid column migration (#58)"
```

---

### Task 4: Shared types and error codes

**Files:**

- Modify: `src/shared/types/import.ts`
- Modify: `src/main/import/importError.ts:1-7`
- Modify: `src/shared/types/ipc.ts:33-54`
- Test: `tests/unit/import/importError.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/import/importError.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ImportError } from '../../../src/main/import/importError';

describe('ImportError new codes', () => {
  it('carries unsupported_format', () => {
    const e = new ImportError('unsupported_format');
    expect(e.code).toBe('unsupported_format');
    expect(e.name).toBe('ImportError');
  });

  it('carries malformed_ofx', () => {
    const e = new ImportError('malformed_ofx');
    expect(e.code).toBe('malformed_ofx');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/import/importError.test.ts`
Expected: FAIL — TS error, `'unsupported_format'` not assignable to `ImportErrorCode`.

- [ ] **Step 3: Extend `ImportErrorCode`**

Replace the type in `src/main/import/importError.ts`:

```ts
export type ImportErrorCode =
  | 'unknown_bank'
  | 'no_text'
  | 'not_pdf'
  | 'arithmetic_failed'
  | 'cannot_verify_unacknowledged'
  | 'already_imported'
  | 'unsupported_format'
  | 'malformed_ofx';
```

- [ ] **Step 4: Add normalized types to `src/shared/types/import.ts`**

Append:

```ts
export interface NormalizedTx {
  date: string; // ISO yyyy-mm-dd
  label: string;
  amount: number; // signed; debit negative, credit positive
  fitid: string | null; // OFX bank-assigned id; null for PDF
}

export interface NormalizedStatement {
  transactions: NormalizedTx[];
  openingBalance: number | null;
  closingBalance: number | null;
  openingDate: string;
  closingDate: string;
  bankId: string;
}
```

In the same file, add `fitid` to `ReviewTransaction`:

```ts
export interface ReviewTransaction {
  date: string;
  label: string;
  amount: number;
  tx_hash: string;
  fitid: string | null;
  isDuplicate: boolean;
}
```

- [ ] **Step 5: Extend the IPC error literals**

In `src/shared/types/ipc.ts`, update `ExtractResponse` and `ConfirmResponse`:

```ts
export type ExtractResponse =
  | { ok: true; extraction: StatementExtraction }
  | {
      ok: false;
      error: 'unknown_bank' | 'no_text' | 'not_pdf' | 'unsupported_format' | 'malformed_ofx';
    };
```

```ts
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
        | 'not_pdf'
        | 'unsupported_format'
        | 'malformed_ofx';
    };
```

- [ ] **Step 6: Run test + typecheck**

Run: `npx vitest run tests/unit/import/importError.test.ts && npm run typecheck`
Expected: test PASS (2 tests); typecheck FAILS in `extractStatement.ts` / handlers because `ReviewTransaction` now requires `fitid` and the extract handler's narrowed error set changed. This is expected — fixed in Tasks 8–9. Do NOT fix unrelated files here.

- [ ] **Step 7: Commit**

```bash
git add src/shared/types/import.ts src/main/import/importError.ts src/shared/types/ipc.ts tests/unit/import/importError.test.ts
git commit -m "feat: add normalized types, fitid field and OFX error codes (#58)"
```

---

### Task 5: Discriminated tx-hash identity contract

**Files:**

- Modify: `src/main/import/txHash.ts`
- Test: `tests/unit/import/txHash.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/import/txHash.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeTxHash, assignTxHashes, normalizeLabel } from '../../../src/main/import/txHash';
import type { NormalizedTx } from '@shared/types/import';

describe('computeTxHash — discriminated identity contract', () => {
  it('OFX hash depends only on accountId + fitid', () => {
    const a = computeTxHash({ kind: 'ofx', accountId: 'acc-1', fitid: 'F1' });
    const b = computeTxHash({ kind: 'ofx', accountId: 'acc-1', fitid: 'F1' });
    const c = computeTxHash({ kind: 'ofx', accountId: 'acc-1', fitid: 'F2' });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('PDF hash is unchanged from the legacy formula', () => {
    // Legacy: sha256(accountId|date|amount.toFixed(2)|normalizeLabel(label)|order)
    const h = computeTxHash({
      kind: 'pdf',
      accountId: 'acc-1',
      date: '2026-02-03',
      amount: -42.5,
      label: 'Café',
      order: 0,
    });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    // Stable snapshot of the legacy contract:
    expect(h).toBe(
      (() => {
        const { createHash } = require('node:crypto') as typeof import('node:crypto');
        const input = ['acc-1', '2026-02-03', '-42.50', normalizeLabel('Café'), '0'].join('|');
        return createHash('sha256').update(input).digest('hex');
      })(),
    );
  });

  it('assignTxHashes uses fitid when present, order counter otherwise', () => {
    const txs: NormalizedTx[] = [
      { date: '2026-02-03', label: 'X', amount: -1, fitid: 'A' },
      { date: '2026-02-03', label: 'DUP', amount: -2, fitid: null },
      { date: '2026-02-03', label: 'DUP', amount: -2, fitid: null },
    ];
    const out = assignTxHashes('acc-1', txs);
    expect(out[0]!.tx_hash).toBe(computeTxHash({ kind: 'ofx', accountId: 'acc-1', fitid: 'A' }));
    expect(out[1]!.tx_hash).not.toBe(out[2]!.tx_hash); // order counter disambiguates
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/import/txHash.test.ts`
Expected: FAIL — `computeTxHash` signature mismatch (legacy positional args).

- [ ] **Step 3: Rewrite `src/main/import/txHash.ts`**

```ts
import { createHash } from 'node:crypto';
import type { NormalizedTx } from '@shared/types/import';

export function normalizeLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export type TxHashInput =
  | { kind: 'ofx'; accountId: string; fitid: string }
  | {
      kind: 'pdf';
      accountId: string;
      date: string;
      amount: number;
      label: string;
      order: number;
    };

export function computeTxHash(input: TxHashInput): string {
  const parts =
    input.kind === 'ofx'
      ? [input.accountId, 'ofx', input.fitid]
      : [
          input.accountId,
          input.date,
          input.amount.toFixed(2),
          normalizeLabel(input.label),
          String(input.order),
        ];
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

export interface TransactionWithHash extends NormalizedTx {
  tx_hash: string;
}

export function assignTxHashes(
  accountId: string,
  transactions: NormalizedTx[],
): TransactionWithHash[] {
  const counters = new Map<string, number>();
  return transactions.map((tx) => {
    if (tx.fitid !== null) {
      return { ...tx, tx_hash: computeTxHash({ kind: 'ofx', accountId, fitid: tx.fitid }) };
    }
    const baseKey = [accountId, tx.date, tx.amount.toFixed(2), normalizeLabel(tx.label)].join('|');
    const order = counters.get(baseKey) ?? 0;
    counters.set(baseKey, order + 1);
    return {
      ...tx,
      tx_hash: computeTxHash({
        kind: 'pdf',
        accountId,
        date: tx.date,
        amount: tx.amount,
        label: tx.label,
        order,
      }),
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/import/txHash.test.ts`
Expected: PASS (3 tests). Typecheck still fails in `extractStatement.ts` (legacy `assignTxHashes(accountId, ExtractedTransaction[])` call) — fixed in Task 8.

- [ ] **Step 5: Commit**

```bash
git add src/main/import/txHash.ts tests/unit/import/txHash.test.ts
git commit -m "feat: discriminated tx-hash identity contract (OFX fitid / PDF order) (#58)"
```

---

### Task 6: extractPdf — lift PDF logic into a NormalizedStatement function

**Files:**

- Create: `src/main/import/extractPdf.ts`
- Test: `tests/unit/import/extractPdf.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/import/extractPdf.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

vi.mock('../../../src/main/import/pdf/extract', () => ({
  extractPdfText: () => Promise.resolve({ pages: [], hasText: false }),
}));

const { extractPdf } = await import('../../../src/main/import/extractPdf');

describe('extractPdf', () => {
  it('throws ImportError(no_text) when the PDF has no text layer', async () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    await expect(
      extractPdf(db, 'acc-lcl-default', Buffer.from('%PDF-1.4 image-only')),
    ).rejects.toMatchObject({ name: 'ImportError', code: 'no_text' });
    db.close();
  });

  it('throws ImportError(not_pdf) for non-PDF content', async () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    await expect(extractPdf(db, 'acc-lcl-default', Buffer.from('not a pdf'))).rejects.toMatchObject(
      { name: 'ImportError', code: 'not_pdf' },
    );
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/import/extractPdf.test.ts`
Expected: FAIL — `src/main/import/extractPdf` does not exist.

- [ ] **Step 3: Create `src/main/import/extractPdf.ts`**

```ts
import type { DatabaseSync } from 'node:sqlite';
import type { NormalizedStatement } from '@shared/types/import';
import type { PdfPage } from './pdf/extract';
import { extractPdfText } from './pdf/extract';
import { extractTransactions } from './pdf/extractTransactions';
import { detectBank } from './detectBank';
import { ImportError } from './importError';

const PDF_MAGIC = Buffer.from('%PDF-');

async function loadPages(content: Buffer): Promise<PdfPage[]> {
  if (
    content.length < PDF_MAGIC.length ||
    !content.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)
  ) {
    throw new ImportError('not_pdf');
  }
  let res: Awaited<ReturnType<typeof extractPdfText>>;
  try {
    res = await extractPdfText(content);
  } catch {
    throw new ImportError('not_pdf');
  }
  if (!res.hasText) throw new ImportError('no_text');
  return res.pages;
}

export async function extractPdf(
  db: DatabaseSync,
  _accountId: string,
  content: Buffer,
): Promise<NormalizedStatement> {
  const pages = await loadPages(content);
  const bank = detectBank(db, pages);
  if (bank === null) throw new ImportError('unknown_bank');

  const extracted = extractTransactions(pages, bank.mapping);
  return {
    transactions: extracted.transactions.map((t) => ({
      date: t.date,
      label: t.label,
      amount: t.amount,
      fitid: null,
    })),
    openingBalance: extracted.openingBalance,
    closingBalance: extracted.closingBalance,
    openingDate: extracted.openingDate,
    closingDate: extracted.closingDate,
    bankId: bank.bankId,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/import/extractPdf.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/import/extractPdf.ts tests/unit/import/extractPdf.test.ts
git commit -m "feat: extract PDF path into NormalizedStatement function (#58)"
```

---

### Task 7: parseOfx — minimal OFX 1.x SGML parser

**Files:**

- Create: `src/main/import/ofx/parseOfx.ts`
- Test: `tests/unit/import/ofx/parseOfx.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/import/ofx/parseOfx.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseOfx } from '../../../../src/main/import/ofx/parseOfx';

const OFX = `OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX>
<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS>
<FI><ORG>LCL<FID>123</FI></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>EUR
<BANKACCTFROM><BANKID>30002<ACCTID>00012345<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20260201<DTEND>20260516
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260203120000<TRNAMT>-42.50<FITID>F1<NAME>CB CAFE&amp;CO</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260205<TRNAMT>1500.00<FITID>F2<MEMO>VIREMENT SALAIRE</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>1457.50<DTASOF>20260516</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

describe('parseOfx', () => {
  it('parses transactions, dates, amounts, label fallback and entities', () => {
    const r = parseOfx(Buffer.from(OFX));
    expect(r.org).toBe('LCL');
    expect(r.bankId).toBe('30002');
    expect(r.ledgerBalance).toBe(1457.5);
    expect(r.transactions).toEqual([
      { date: '2026-02-03', amount: -42.5, fitid: 'F1', label: 'CB CAFE&CO' },
      { date: '2026-02-05', amount: 1500, fitid: 'F2', label: 'VIREMENT SALAIRE' },
    ]);
  });

  it('throws on content with no STMTTRN', () => {
    expect(() => parseOfx(Buffer.from('<OFX></OFX>'))).toThrow();
  });

  it('handles comma decimal separators', () => {
    const ofx = OFX.replace('-42.50', '-42,50');
    expect(parseOfx(Buffer.from(ofx)).transactions[0]!.amount).toBe(-42.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/import/ofx/parseOfx.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create `src/main/import/ofx/parseOfx.ts`**

```ts
export interface OfxTransaction {
  date: string; // ISO yyyy-mm-dd
  amount: number; // signed
  fitid: string;
  label: string;
}

export interface ParsedOfx {
  org: string | null;
  bankId: string | null;
  ledgerBalance: number | null;
  transactions: OfxTransaction[];
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"');
}

function parseAmount(raw: string): number {
  const n = parseFloat(raw.trim().replace(/\s/g, '').replace(',', '.'));
  if (Number.isNaN(n)) throw new Error(`OFX: invalid amount "${raw}"`);
  return n;
}

function parseOfxDate(raw: string): string {
  const d = raw.trim().slice(0, 8);
  if (!/^\d{8}$/.test(d)) throw new Error(`OFX: invalid date "${raw}"`);
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

/** Tokenize into [tag, immediateText] pairs. Closing tags ("/TAG") have no
 *  value and are kept as markers; leaf values are the text up to the next "<". */
function tokenize(body: string): { tag: string; value: string }[] {
  const re = /<([/A-Z0-9.]+)>([^<]*)/g;
  const out: { tag: string; value: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    out.push({ tag: m[1] as string, value: (m[2] ?? '').trim() });
  }
  return out;
}

export function parseOfx(content: Buffer): ParsedOfx {
  const text = content.toString('latin1');
  const ofxStart = text.indexOf('<OFX>');
  if (ofxStart === -1) throw new Error('OFX: no <OFX> root');
  const tokens = tokenize(text.slice(ofxStart));

  let org: string | null = null;
  let bankId: string | null = null;
  let ledgerBalance: number | null = null;
  const transactions: OfxTransaction[] = [];

  let cur: (Partial<OfxTransaction> & { name?: string; memo?: string }) | null = null;
  let inLedger = false;

  for (const { tag, value } of tokens) {
    switch (tag) {
      case 'ORG':
        org = value || null;
        break;
      case 'BANKID':
        if (bankId === null) bankId = value || null;
        break;
      case 'STMTTRN':
        cur = {};
        break;
      case '/STMTTRN': {
        if (!cur || cur.fitid === undefined || cur.date === undefined || cur.amount === undefined) {
          throw new Error('OFX: incomplete STMTTRN');
        }
        const label = decodeEntities(cur.name ?? cur.memo ?? '');
        transactions.push({
          date: cur.date,
          amount: cur.amount,
          fitid: cur.fitid,
          label,
        });
        cur = null;
        break;
      }
      case 'DTPOSTED':
        if (cur) cur.date = parseOfxDate(value);
        break;
      case 'TRNAMT':
        if (cur) cur.amount = parseAmount(value);
        break;
      case 'FITID':
        if (cur) cur.fitid = value;
        break;
      case 'NAME':
        if (cur) cur.name = value;
        break;
      case 'MEMO':
        if (cur) cur.memo = value;
        break;
      case 'LEDGERBAL':
        inLedger = true;
        break;
      case '/LEDGERBAL':
        inLedger = false;
        break;
      case 'BALAMT':
        if (inLedger) ledgerBalance = parseAmount(value);
        break;
      default:
        break;
    }
  }

  if (transactions.length === 0) throw new Error('OFX: no transactions');
  return { org, bankId, ledgerBalance, transactions };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/import/ofx/parseOfx.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/import/ofx/parseOfx.ts tests/unit/import/ofx/parseOfx.test.ts
git commit -m "feat: minimal OFX 1.x SGML parser (#58)"
```

---

### Task 8: extractOfx — ParsedOfx to NormalizedStatement

**Files:**

- Create: `src/main/import/ofx/extractOfx.ts`
- Test: `tests/unit/import/ofx/extractOfx.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/import/ofx/extractOfx.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../../src/main/db/migrate';
import { extractOfx } from '../../../../src/main/import/ofx/extractOfx';
import type { ImportError } from '../../../../src/main/import/importError';

const OFX = `<OFX>
<SIGNONMSGSRSV1><SONRS><FI><ORG>LCL</FI></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>30002<ACCTID>1<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><DTPOSTED>20260203<TRNAMT>-10.00<FITID>F1<NAME>A</STMTTRN>
<STMTTRN><DTPOSTED>20260210<TRNAMT>20.00<FITID>F2<NAME>B</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>10.00<DTASOF>20260210</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe('extractOfx', () => {
  it('produces a NormalizedStatement with date range and null opening balance', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const r = extractOfx(db, 'acc-lcl-default', Buffer.from(OFX));
    expect(r.bankId).toBe('lcl');
    expect(r.openingBalance).toBeNull();
    expect(r.closingBalance).toBe(10);
    expect(r.openingDate).toBe('2026-02-03');
    expect(r.closingDate).toBe('2026-02-10');
    expect(r.transactions).toEqual([
      { date: '2026-02-03', label: 'A', amount: -10, fitid: 'F1' },
      { date: '2026-02-10', label: 'B', amount: 20, fitid: 'F2' },
    ]);
    db.close();
  });

  it('throws unknown_bank when the account has no resolvable bank', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    let code: string | undefined;
    try {
      extractOfx(db, 'no-such-account', Buffer.from(OFX));
    } catch (e) {
      code = (e as ImportError).code;
    }
    expect(code).toBe('unknown_bank');
    db.close();
  });

  it('throws malformed_ofx on unparseable content', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    let code: string | undefined;
    try {
      extractOfx(db, 'acc-lcl-default', Buffer.from('garbage'));
    } catch (e) {
      code = (e as ImportError).code;
    }
    expect(code).toBe('malformed_ofx');
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/import/ofx/extractOfx.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create `src/main/import/ofx/extractOfx.ts`**

```ts
import type { DatabaseSync } from 'node:sqlite';
import type { NormalizedStatement } from '@shared/types/import';
import { ImportError } from '../importError';
import { parseOfx } from './parseOfx';

export function extractOfx(
  db: DatabaseSync,
  accountId: string,
  content: Buffer,
): NormalizedStatement {
  // Bank is resolved via the account's bank_id (single-account scope; see plan
  // header "Spec deviation"). ORG/BANKID are parsed for traceability.
  const account = db
    .prepare('SELECT bank_id FROM accounts WHERE id = ?')
    .get(accountId) as unknown as { bank_id: string | null } | undefined;
  const bankId = account?.bank_id ?? null;
  if (bankId === null) throw new ImportError('unknown_bank');
  const bank = db.prepare('SELECT id FROM banks WHERE id = ?').get(bankId) as unknown as
    | { id: string }
    | undefined;
  if (bank === undefined) throw new ImportError('unknown_bank');

  let parsed;
  try {
    parsed = parseOfx(content);
  } catch {
    throw new ImportError('malformed_ofx');
  }

  const dates = parsed.transactions.map((t) => t.date).sort((a, b) => a.localeCompare(b));
  return {
    transactions: parsed.transactions.map((t) => ({
      date: t.date,
      label: t.label,
      amount: t.amount,
      fitid: t.fitid,
    })),
    openingBalance: null,
    closingBalance: parsed.ledgerBalance,
    openingDate: dates[0] as string,
    closingDate: dates[dates.length - 1] as string,
    bankId,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/import/ofx/extractOfx.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/import/ofx/extractOfx.ts tests/unit/import/ofx/extractOfx.test.ts
git commit -m "feat: extractOfx producing NormalizedStatement (#58)"
```

---

### Task 9: extractStatement dispatcher refactor

**Files:**

- Modify: `src/main/import/extractStatement.ts` (full rewrite)
- Test: `tests/unit/import/extractStatement.dispatch.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/import/extractStatement.dispatch.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { extractStatement } from '../../../src/main/import/extractStatement';

const OFX = `<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>30002<ACCTID>1</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><DTPOSTED>20260203<TRNAMT>-10.00<FITID>F1<NAME>A</STMTTRN>
<STMTTRN><DTPOSTED>20260210<TRNAMT>-10.00<FITID>F2<NAME>A</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>0<DTASOF>20260210</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe('extractStatement dispatch', () => {
  it('extracts an OFX statement with fitid-based hashes', async () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const r = await extractStatement(db, 'acc-lcl-default', Buffer.from(OFX));
    expect(r.transactions).toHaveLength(2);
    // Two same-day/same-amount/same-label tx stay distinct via distinct FITID:
    expect(r.transactions[0]!.tx_hash).not.toBe(r.transactions[1]!.tx_hash);
    expect(r.transactions[0]!.fitid).toBe('F1');
    expect(r.newCount).toBe(2);
    expect(r.dateRangeStart).toBe('2026-02-03');
    expect(r.dateRangeEnd).toBe('2026-02-10');
    db.close();
  });

  it('throws unsupported_format for non-PDF non-OFX content', async () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    await expect(
      extractStatement(db, 'acc-lcl-default', Buffer.from('plain text, no format')),
    ).rejects.toMatchObject({ name: 'ImportError', code: 'unsupported_format' });
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/import/extractStatement.dispatch.test.ts`
Expected: FAIL — current `extractStatement` is PDF-hardcoded; OFX content reaches `loadPages` and throws `not_pdf`.

- [ ] **Step 3: Rewrite `src/main/import/extractStatement.ts`**

```ts
import type { DatabaseSync } from 'node:sqlite';
import type { ReviewTransaction, StatementExtraction } from '@shared/types/import';
import { detectType } from './detectType';
import { extractPdf } from './extractPdf';
import { extractOfx } from './ofx/extractOfx';
import { assignTxHashes } from './txHash';
import { verifyArithmetic } from './verifyArithmetic';
import { checkPeriodOverlap } from './periodOverlap';
import { hashFile } from './hashFile';
import { isAlreadyImported, findExistingHashes } from './duplicateCheck';
import { ImportError } from './importError';

export async function extractStatement(
  db: DatabaseSync,
  accountId: string,
  content: Buffer,
): Promise<StatementExtraction> {
  const fileHash = hashFile(content);
  const alreadyImported = isAlreadyImported(db, fileHash);

  const type = detectType(content, '');
  const stmt =
    type === 'pdf'
      ? await extractPdf(db, accountId, content)
      : type === 'ofx'
        ? extractOfx(db, accountId, content)
        : null;
  if (stmt === null) throw new ImportError('unsupported_format');

  const withHashes = assignTxHashes(accountId, stmt.transactions);
  const arithmetic = verifyArithmetic(stmt.transactions, stmt.openingBalance, stmt.closingBalance);
  const periodOverlap = checkPeriodOverlap(db, accountId, stmt.openingDate, stmt.closingDate);
  const existing = findExistingHashes(db, accountId);

  const transactions: ReviewTransaction[] = withHashes.map((t) => ({
    date: t.date,
    label: t.label,
    amount: t.amount,
    tx_hash: t.tx_hash,
    fitid: t.fitid,
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
    dateRangeStart: stmt.openingDate,
    dateRangeEnd: stmt.closingDate,
  };
}
```

Note: `verifyArithmetic` accepts the normalized transactions (it only reads
`.amount`), so no signature change is needed there.

- [ ] **Step 4: Run the test + the PDF regression suite**

Run: `npx vitest run tests/unit/import/extractStatement.dispatch.test.ts tests/unit/import/extractStatement.noText.test.ts tests/unit/import/extractStatement.test.ts`
Expected: dispatch test PASS (2); the legacy `extractStatement.noText.test.ts` and `extractStatement.test.ts` may now fail because they assert PDF-specific internals through the old code path. Replace them: delete `tests/unit/import/extractStatement.noText.test.ts` and `tests/unit/import/extractStatement.test.ts` (their behaviour is now covered by `tests/unit/import/extractPdf.test.ts` from Task 6 and the dispatch test). Re-run:

Run: `git rm tests/unit/import/extractStatement.noText.test.ts tests/unit/import/extractStatement.test.ts && npx vitest run tests/unit`
Expected: full unit suite PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/import/extractStatement.ts tests/unit/import/extractStatement.dispatch.test.ts
git commit -m "feat: format-pluggable extractStatement dispatcher (#58)"
```

---

### Task 10: insertStatement persists fitid

**Files:**

- Modify: `src/main/import/insertStatement.ts:43-62`
- Test: `tests/unit/import/insertStatement.fitid.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/import/insertStatement.fitid.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

vi.mock('../../../src/main/import/extractStatement', () => ({
  extractStatement: () =>
    Promise.resolve({
      transactions: [
        {
          date: '2026-02-03',
          label: 'A',
          amount: -10,
          tx_hash: 'h1',
          fitid: 'F1',
          isDuplicate: false,
        },
      ],
      arithmetic: {
        status: 'cannot_verify',
        openingBalance: null,
        closingBalance: 0,
        computedClosing: null,
        delta: null,
      },
      periodOverlap: { hasOverlap: false, overlappingImports: [] },
      newCount: 1,
      duplicateCount: 0,
      fileHash: 'fh',
      alreadyImported: false,
      dateRangeStart: '2026-02-03',
      dateRangeEnd: '2026-02-03',
    }),
}));

const { insertStatement } = await import('../../../src/main/import/insertStatement');

describe('insertStatement fitid', () => {
  it('persists fitid for OFX transactions', async () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    await insertStatement(db, 'acc-lcl-default', Buffer.from('x'), {
      acknowledgedCannotVerify: true,
    });
    const row = db.prepare('SELECT fitid FROM transactions').get() as unknown as {
      fitid: string | null;
    };
    expect(row.fitid).toBe('F1');
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/import/insertStatement.fitid.test.ts`
Expected: FAIL — `fitid` column not written (stays NULL).

- [ ] **Step 3: Update the INSERT in `src/main/import/insertStatement.ts`**

Replace the prepared statement and its `.run(...)` call (the `insertTx` block):

```ts
const insertTx = db.prepare(
  `INSERT INTO transactions
         (id, account_id, import_id, tx_hash, date, amount,
          label_raw, label_clean, category_id, confidence,
          is_internal_transfer, user_modified, fitid)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0, 0, ?)`,
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
    tx.fitid,
  );
}
```

- [ ] **Step 4: Run test + full unit suite**

Run: `npx vitest run tests/unit/import/insertStatement.fitid.test.ts && npx vitest run tests/unit`
Expected: new test PASS; full unit suite PASS (the existing `insertStatement.test.ts` mock objects must include `fitid: null` on their transactions — update those fixtures if the suite flags missing `fitid`).

- [ ] **Step 5: Commit**

```bash
git add src/main/import/insertStatement.ts tests/unit/import/insertStatement.fitid.test.ts
git commit -m "feat: persist fitid on transaction INSERT (#58)"
```

---

### Task 11: Real LCL OFX integration test + final verification

**Files:**

- Create: `tests/integration/import/ofx/extractStatement.ofx.test.ts`
- Modify: `.gitignore` (ensure `spike-fixtures/` ignored — verify only)

- [ ] **Step 1: Confirm the fixture convention**

Denis places his real LCL OFX export at `spike-fixtures/LCL_STATEMENT_FIXTURE.ofx`
(gitignored, same convention as the PDF fixture). Verify it is ignored:

Run: `git check-ignore spike-fixtures/LCL_STATEMENT_FIXTURE.ofx`
Expected: prints the path (it is ignored). If not, add `spike-fixtures/` to `.gitignore` and commit separately.

- [ ] **Step 2: Write the integration test**

Create `tests/integration/import/ofx/extractStatement.ofx.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../../src/main/db/migrate';
import { extractStatement } from '../../../../src/main/import/extractStatement';
import { insertStatement } from '../../../../src/main/import/insertStatement';

const FIXTURE = resolve('spike-fixtures/LCL_STATEMENT_FIXTURE.ofx');

describe('extractStatement — real LCL OFX fixture', () => {
  it.skipIf(!existsSync(FIXTURE))('extracts all-new with fitid hashes on a fresh DB', async () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const buf = readFileSync(FIXTURE);
    const r = await extractStatement(db, 'acc-lcl-default', buf);
    expect(r.transactions.length).toBeGreaterThan(0);
    expect(r.duplicateCount).toBe(0);
    for (const t of r.transactions) {
      expect(t.fitid).not.toBeNull();
      expect(t.tx_hash).toMatch(/^[0-9a-f]{64}$/);
    }
    db.close();
  });

  it.skipIf(!existsSync(FIXTURE))('reports all duplicates after a prior insert', async () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const buf = readFileSync(FIXTURE);
    await insertStatement(db, 'acc-lcl-default', buf, { acknowledgedCannotVerify: true });
    const r = await extractStatement(db, 'acc-lcl-default', buf);
    expect(r.newCount).toBe(0);
    expect(r.duplicateCount).toBe(r.transactions.length);
    expect(r.alreadyImported).toBe(true);
    db.close();
  });
});
```

- [ ] **Step 3: Run the integration test**

Run: `npx vitest run tests/integration/import/ofx/extractStatement.ofx.test.ts`
Expected: PASS (2 tests) if the fixture exists, or SKIPPED (0 run) if not. Both outcomes are acceptable for CI (fixture is gitignored).

- [ ] **Step 4: Full suite + typecheck + lint**

Run: `npm run typecheck && npm run lint && npx vitest run`
Expected: all green. Fix any `fitid`-related fixture gaps in pre-existing `insertStatement.test.ts` / `importHandlers` mocks (add `fitid: null`).

- [ ] **Step 5: Commit**

```bash
git add tests/integration/import/ofx/extractStatement.ofx.test.ts
git commit -m "test: real LCL OFX fixture integration test (#58)"
```

---

## Self-Review

**Spec coverage:**

- §3 hand-rolled OFX parser → Task 7
- §3 format-pluggable refactor → Tasks 6, 8, 9
- §3 fitid migration → Task 3
- §3 new error codes → Task 4 (`unsupported_format`, `malformed_ofx`)
- §4 NormalizedStatement/NormalizedTx → Task 4
- §6 frozen identity contract → Task 5
- §5 insertStatement persists fitid → Task 10
- §7 error handling → Tasks 4, 8, 9
- §8 testing strategy → unit tests in each task + Task 11 integration
- §9 risk spike → Task 2 (manual gate)
- §1 pivot ADR + Epic reference → Task 1
- §10 DoD → covered by Tasks 9–11

**Spec deviation:** §5 bank resolution implemented via `account.bank_id` rather
than OFX `<ORG>`/`<BANKID>` matching — surfaced in the plan header and ADR for
review (consistent with the single-account Non-Goal).

**Type consistency:** `NormalizedTx`/`NormalizedStatement` (Task 4) used
identically in Tasks 5–9; `computeTxHash(TxHashInput)` (Task 5) called with the
same discriminated shape in Task 5's `assignTxHashes`; `ReviewTransaction.fitid`
(Task 4) populated in Task 9, consumed in Task 10.

**Frequent commits:** one commit per task (eleven commits); Task 1 commits this
plan file.
