# Mortgage Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import a bank's definitive amortization table (LCL PDF) as the source of truth for a mortgage, store the schedule, read capital-restant-dû (CRD) at any date, and fold the maintainer's quote-part of loans and a declared property value into net worth — surfaced on a new Patrimoine page.

**Architecture:** Main process owns a new `patrimoine` domain (repos + LCL parser) on three SQLite tables (`loans`, `loan_installments`, `assets`). The amortization table is parsed from PDF text (reusing `extractPdfText`) into installment rows; CRD-at-date is a pure lookup over `balance_after`. `getNetWorth` is extended. The renderer gets a Patrimoine page (loan cards, property card, amortization viewer, add-loan flow) wired over the existing typed IPC contract.

**Tech Stack:** TypeScript (strict), `node:sqlite` (`DatabaseSync`), Electron IPC (`IpcContract` map), pdfjs (`extractPdfText`), React + shadcn/ui + Tailwind, Vitest 4 (node + jsdom).

**Conventions (read once):**

- Money is stored as **REAL euros** everywhere (`amount`, `declared_balance` are `REAL`). Follow that.
- TS strict: `no-explicit-any` and `no-unsafe-*` are errors; `noUncheckedIndexedAccess` is on (guard array indexing).
- Renderer tests need `// @vitest-environment jsdom` **and** an explicit `afterEach(() => { cleanup(); })`.
- `main` is protected: branch + PR. Conventional Commits (`feat:`, `test:`, `docs:`). Husky pre-commit reformats staged files (re-add + retry if needed).
- **No personal data in committed files.** Real PDFs live only in `spike-fixtures/mortgage/` (gitignored). Synthetic fixtures only in tests.

---

## File Structure

**Create:**

- `src/main/db/migrations/020_loans_assets.sql` — the three tables.
- `src/shared/types/patrimoine.ts` — DTOs + parsed-table types + net-worth additions.
- `src/main/patrimoine/numbers.ts` — French number / date parsing helpers.
- `src/main/patrimoine/parseLclAmortization.ts` — pure parser: `string[]` lines → `ParsedLoanTable`.
- `src/main/patrimoine/pdfLines.ts` — `pageToLines(page)` grouping pdfjs items into text lines.
- `src/main/patrimoine/importLoan.ts` — orchestrator: PDF buffer → `ParsedLoanTable`.
- `src/main/patrimoine/loanRepo.ts` — loan + installments persistence, `crdAt`, loan stats.
- `src/main/patrimoine/assetRepo.ts` — declared-asset persistence.
- `src/main/ipc/handlers/patrimoine.ts` — IPC handlers.
- `src/renderer/hooks/usePatrimoine.ts` — renderer data hook.
- `src/renderer/pages/PatrimoinePage.tsx` — the page.
- `src/renderer/components/patrimoine/LoanCard.tsx`
- `src/renderer/components/patrimoine/PropertyCard.tsx`
- `src/renderer/components/patrimoine/AmortizationTableDialog.tsx`
- `src/renderer/components/patrimoine/AddLoanDialog.tsx`

**Modify:**

- `src/main/db/migrate.ts` — import + register migration 020.
- `src/shared/types/dashboard.ts` — extend `NetWorth`.
- `src/main/dashboard/consolidated.ts` — extend `getNetWorth`.
- `src/main/ipc/channels.ts`, `src/shared/types/ipc.ts`, `src/main/ipc/register.ts` — new channels.
- `src/renderer/App.tsx` — `/patrimoine` route.
- `src/renderer/components/Sidebar.tsx` — nav entry.
- `README.md` / spec status — docs.

**Test:**

- `tests/unit/patrimoine/numbers.test.ts`
- `tests/unit/patrimoine/parseLclAmortization.test.ts`
- `tests/unit/patrimoine/loanRepo.test.ts`
- `tests/unit/patrimoine/assetRepo.test.ts`
- `tests/unit/patrimoine/netWorth.test.ts`
- `tests/unit/ipc/patrimoine.test.ts`
- `tests/unit/patrimoine/realPdf.local.test.ts` — guarded on `spike-fixtures` presence.
- `tests/unit/renderer/PatrimoinePage.test.tsx`, `LoanCard.test.tsx`

---

## Task 1: Migration 020 — loans, loan_installments, assets

**Files:**

- Create: `src/main/db/migrations/020_loans_assets.sql`
- Modify: `src/main/db/migrate.ts`
- Test: `tests/unit/patrimoine/migration020.test.ts`

- [ ] **Step 1: Write the migration SQL**

Create `src/main/db/migrations/020_loans_assets.sql`:

```sql
-- Migration 020 — patrimoine: loans + imported amortization schedule + declared assets.
-- Amounts are REAL euros, consistent with transactions.amount / accounts.declared_balance.
-- The amortization table is IMPORTED from the bank's definitive PDF (source of truth),
-- never computed: CRD at a date is a lookup over loan_installments.balance_after.

CREATE TABLE loans (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  lender       TEXT,
  principal    REAL NOT NULL,
  nominal_rate REAL NOT NULL,
  start_date   TEXT NOT NULL,
  term_months  INTEGER NOT NULL,
  share        REAL NOT NULL DEFAULT 0.5,
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE loan_installments (
  id            TEXT PRIMARY KEY,
  loan_id       TEXT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  seq           INTEGER NOT NULL,
  due_date      TEXT NOT NULL,
  capital       REAL NOT NULL,
  interest      REAL NOT NULL,
  insurance     REAL NOT NULL,
  fees          REAL NOT NULL DEFAULT 0,
  payment       REAL NOT NULL,
  balance_after REAL NOT NULL,
  UNIQUE(loan_id, seq)
);

CREATE INDEX idx_loan_installments_lookup ON loan_installments(loan_id, due_date);

CREATE TABLE assets (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  kind           TEXT NOT NULL,
  declared_value REAL NOT NULL,
  share          REAL NOT NULL DEFAULT 0.5,
  valued_at      TEXT NOT NULL,
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] **Step 2: Register the migration**

In `src/main/db/migrate.ts`, add the import after the `sql019` import line:

```ts
import sql020 from './migrations/020_loans_assets.sql?raw';
```

And add to the `MIGRATIONS` array after the `{ version: 19, sql: sql019 }` entry:

```ts
  { version: 20, sql: sql020 },
```

- [ ] **Step 3: Write the failing test**

Create `tests/unit/patrimoine/migration020.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

function cols(db: DatabaseSync, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((r) => r.name);
}

describe('migration 020', () => {
  it('creates loans, loan_installments and assets with the expected columns', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    expect(cols(db, 'loans')).toEqual(
      expect.arrayContaining(['id', 'name', 'principal', 'nominal_rate', 'term_months', 'share']),
    );
    expect(cols(db, 'loan_installments')).toEqual(
      expect.arrayContaining(['loan_id', 'seq', 'due_date', 'balance_after', 'payment']),
    );
    expect(cols(db, 'assets')).toEqual(
      expect.arrayContaining(['kind', 'declared_value', 'share', 'valued_at']),
    );
    db.close();
  });

  it('defaults share to 0.5 on loans and assets', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    db.prepare(
      "INSERT INTO loans (id, name, principal, nominal_rate, start_date, term_months) VALUES ('l1','x',1000,2,'2020-01-01',12)",
    ).run();
    const row = db.prepare('SELECT share FROM loans WHERE id = ?').get('l1') as { share: number };
    expect(row.share).toBe(0.5);
    db.close();
  });
});
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/unit/patrimoine/migration020.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add src/main/db/migrations/020_loans_assets.sql src/main/db/migrate.ts tests/unit/patrimoine/migration020.test.ts
git commit -m "feat(patrimoine): add loans/installments/assets schema (migration 020)"
```

---

## Task 2: Shared types

**Files:**

- Create: `src/shared/types/patrimoine.ts`

- [ ] **Step 1: Write the types**

Create `src/shared/types/patrimoine.ts`:

```ts
/** One parsed amortization row (before persistence). */
export interface ParsedInstallment {
  seq: number; // running 1-based index over parsed rows (document order)
  dueDate: string; // ISO yyyy-mm-dd
  capital: number;
  interest: number;
  insurance: number;
  fees: number;
  payment: number;
  balanceAfter: number;
}

/** Result of parsing one LCL amortization PDF. */
export interface ParsedLoanTable {
  name: string;
  principal: number;
  nominalRate: number; // annual percent, e.g. 1.7 or 0
  termMonths: number;
  startDate: string; // ISO
  installments: ParsedInstallment[];
  totals: { capital: number; interest: number; insurance: number };
}

export interface LoanInput {
  parsed: ParsedLoanTable;
  name: string; // editable override of parsed.name
  share: number; // 0..1
}

export interface LoanInstallmentDTO extends ParsedInstallment {
  id: string;
}

/** A loan plus the figures shown on its card. */
export interface LoanWithStats {
  id: string;
  name: string;
  lender: string | null;
  principal: number;
  nominalRate: number;
  startDate: string;
  termMonths: number;
  share: number;
  crd: number; // capital restant dû today (100%)
  endDate: string; // due_date of the last installment
  nextInstallment: LoanInstallmentDTO | null; // first installment with due_date >= today
  interestThisYear: number; // Σ interest of installments in the current calendar year
  remainingCost: number; // Σ interest of installments with due_date >= today
}

export interface AssetDTO {
  id: string;
  name: string;
  kind: 'property';
  declaredValue: number;
  share: number;
  valuedAt: string;
  notes: string | null;
}

export interface UpsertAssetInput {
  id?: string;
  name: string;
  kind: 'property';
  declaredValue: number;
  share: number;
  valuedAt: string;
}

export type ParseLoanResponse =
  | { ok: true; parsed: ParsedLoanTable }
  | { ok: false; error: 'not_pdf' | 'no_text' | 'unrecognized_format' };
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no usages yet; this only adds types).

- [ ] **Step 3: Commit**

```bash
git add src/shared/types/patrimoine.ts
git commit -m "feat(patrimoine): add shared types for loans and assets"
```

---

## Task 3: French number / date helpers

**Files:**

- Create: `src/main/patrimoine/numbers.ts`
- Test: `tests/unit/patrimoine/numbers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/patrimoine/numbers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseFrAmount, frDateToIso, extractAmounts } from '../../../src/main/patrimoine/numbers';

describe('parseFrAmount', () => {
  it('parses thousands-spaced comma decimals', () => {
    expect(parseFrAmount('151 464,50')).toBe(151464.5);
    expect(parseFrAmount('0,00')).toBe(0);
    expect(parseFrAmount('948,56')).toBe(948.56);
  });
});

describe('frDateToIso', () => {
  it('handles both dot and slash separators', () => {
    expect(frDateToIso('07.09.2016')).toBe('2016-09-07');
    expect(frDateToIso('05/06/2018')).toBe('2018-06-05');
  });
});

describe('extractAmounts', () => {
  it('pulls every monetary token in order, even with thousands spaces', () => {
    expect(extractAmounts('685,43 214,57 48,56 0,00 948,56 150 779,07')).toEqual([
      685.43, 214.57, 48.56, 0, 948.56, 150779.07,
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/patrimoine/numbers.test.ts`
Expected: FAIL ("Failed to resolve import .../numbers").

- [ ] **Step 3: Write the implementation**

Create `src/main/patrimoine/numbers.ts`:

```ts
/** A French monetary token: digits with optional thousands spaces, comma decimals. */
const AMOUNT_RE = /\d[\d ]*,\d{2}/g;

/** "151 464,50" -> 151464.5 */
export function parseFrAmount(token: string): number {
  return Number(token.replace(/\s/g, '').replace(',', '.'));
}

/** "07.09.2016" or "05/06/2018" -> "2016-09-07" / "2018-06-05" */
export function frDateToIso(token: string): string {
  const m = /^(\d{2})[./](\d{2})[./](\d{4})$/.exec(token.trim());
  if (!m) throw new Error(`bad fr date: ${token}`);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Every monetary token in a string, left to right, as numbers. */
export function extractAmounts(s: string): number[] {
  return (s.match(AMOUNT_RE) ?? []).map(parseFrAmount);
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/unit/patrimoine/numbers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/patrimoine/numbers.ts tests/unit/patrimoine/numbers.test.ts
git commit -m "feat(patrimoine): add French number/date parsing helpers"
```

---

## Task 4: LCL amortization parser

**Files:**

- Create: `src/main/patrimoine/parseLclAmortization.ts`
- Test: `tests/unit/patrimoine/parseLclAmortization.test.ts`

The parser consumes already-joined text **lines** (`string[]`). A header block names the loan; each installment row holds a `dd/mm/yyyy` date followed by exactly six monetary values (`capital interest insurance fees payment balanceAfter`). A `TOTAL` line gives Σ capital / interest / insurance for a self-check.

- [ ] **Step 1: Write the failing test (synthetic fixture inline — no personal data)**

Create `tests/unit/patrimoine/parseLclAmortization.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseLclAmortization } from '../../../src/main/patrimoine/parseLclAmortization';

// Synthetic 1.00%/3-month loan of 3 000,00 €, insurance 1,00/mo. Fake figures.
const LINES = [
  'INTITULE DU PRET : PRET SYNTHETIQUE DE TEST',
  "MONTANT DU PRET : EUR 3 000,00 PERCEPTION D'INTERETS : A TERME ECHU",
  'DUREE TOTALE DU PRET : 3 MOIS TYPE DE TAUX EN COURS : FIXE',
  'DATE DE DEPART DU PRET : 07.09.2016 TAUX DEBITEUR EN COURS : 1,000000 %',
  'N° DATE AMORTISSEMENT INTERETS ASSURANCE FRAIS MONTANT CAPITAL',
  '001 05/06/2018 997,50 2,50 1,00 0,00 1 001,00 2 002,50',
  '002 05/07/2018 998,33 1,67 1,00 0,00 1 001,00 1 004,17',
  '003 05/08/2018 1 004,17 0,83 1,00 0,00 1 006,00 0,00',
  'TOTAL 3 000,00 5,00 3,00 0,00',
];

describe('parseLclAmortization', () => {
  it('reads the header fields', () => {
    const t = parseLclAmortization(LINES);
    expect(t.name).toBe('PRET SYNTHETIQUE DE TEST');
    expect(t.principal).toBe(3000);
    expect(t.nominalRate).toBe(1);
    expect(t.termMonths).toBe(3);
    expect(t.startDate).toBe('2016-09-07');
  });

  it('reads installments with seq, iso date and the six amounts', () => {
    const t = parseLclAmortization(LINES);
    expect(t.installments).toHaveLength(3);
    expect(t.installments[0]).toEqual({
      seq: 1,
      dueDate: '2018-06-05',
      capital: 997.5,
      interest: 2.5,
      insurance: 1,
      fees: 0,
      payment: 1001,
      balanceAfter: 2002.5,
    });
    expect(t.installments[2]?.balanceAfter).toBe(0);
  });

  it('every row satisfies payment = capital + interest + insurance + fees (to the cent)', () => {
    const t = parseLclAmortization(LINES);
    for (const i of t.installments) {
      expect(Math.round((i.capital + i.interest + i.insurance + i.fees) * 100) / 100).toBe(
        i.payment,
      );
    }
  });

  it('totals match the sum of installments (self-check)', () => {
    const t = parseLclAmortization(LINES);
    const sum = (k: 'capital' | 'interest' | 'insurance') =>
      Math.round(t.installments.reduce((s, i) => s + i[k], 0) * 100) / 100;
    expect(sum('capital')).toBe(t.totals.capital);
    expect(sum('interest')).toBe(t.totals.interest);
    expect(sum('insurance')).toBe(t.totals.insurance);
  });

  it('throws on an unrecognized document (no installment rows)', () => {
    expect(() => parseLclAmortization(['random text', 'no rows here'])).toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/patrimoine/parseLclAmortization.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

Create `src/main/patrimoine/parseLclAmortization.ts`:

```ts
import type { ParsedInstallment, ParsedLoanTable } from '@shared/types/patrimoine';
import { parseFrAmount, frDateToIso, extractAmounts } from './numbers';

const DATE_RE = /\b(\d{2}\/\d{2}\/\d{4})\b/;

function firstMatch(lines: string[], re: RegExp): RegExpExecArray | null {
  for (const line of lines) {
    const m = re.exec(line);
    if (m) return m;
  }
  return null;
}

function parseInstallmentLine(line: string, seq: number): ParsedInstallment | null {
  const dateMatch = DATE_RE.exec(line);
  if (!dateMatch) return null;
  const afterDate = line.slice(dateMatch.index + dateMatch[0].length);
  const amounts = extractAmounts(afterDate);
  // capital, interest, insurance, fees, payment, balanceAfter
  if (amounts.length !== 6) return null;
  const [capital, interest, insurance, fees, payment, balanceAfter] = amounts as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  return {
    seq,
    dueDate: frDateToIso(dateMatch[1]),
    capital,
    interest,
    insurance,
    fees,
    payment,
    balanceAfter,
  };
}

export function parseLclAmortization(lines: string[]): ParsedLoanTable {
  const nameM = firstMatch(lines, /INTITULE DU PRET\s*:\s*(.+?)\s*$/);
  const principalM = firstMatch(lines, /MONTANT DU PRET\s*:\s*EUR\s*([\d ]+,\d{2})/);
  const rateM = firstMatch(lines, /TAUX DEBITEUR EN COURS\s*:\s*([\d ]*,\d+)\s*%/);
  const termM = firstMatch(lines, /DUREE TOTALE DU PRET\s*:\s*(\d+)\s*MOIS/);
  const startM = firstMatch(lines, /DATE DE DEPART DU PRET\s*:\s*(\d{2}\.\d{2}\.\d{4})/);

  const installments: ParsedInstallment[] = [];
  for (const line of lines) {
    const inst = parseInstallmentLine(line, installments.length + 1);
    if (inst) installments.push(inst);
  }
  if (installments.length === 0) {
    throw new Error('parseLclAmortization: no installment rows found');
  }

  const totalsLine = lines.find((l) => /^\s*TOTAL\b/.test(l)) ?? '';
  const totalsAmounts = extractAmounts(totalsLine);

  return {
    name: nameM?.[1]?.trim() ?? 'Prêt',
    principal: principalM ? parseFrAmount(principalM[1] ?? '0') : 0,
    nominalRate: rateM ? parseFrAmount((rateM[1] ?? '0').replace(/0+$/, '') || '0') : 0,
    termMonths: termM ? Number(termM[1]) : installments.length,
    startDate: startM ? frDateToIso(startM[1] ?? '') : (installments[0]?.dueDate ?? ''),
    installments,
    totals: {
      capital: totalsAmounts[0] ?? 0,
      interest: totalsAmounts[1] ?? 0,
      insurance: totalsAmounts[2] ?? 0,
    },
  };
}
```

Note on `nominalRate`: `parseFrAmount('1,000000')` yields `1`; `parseFrAmount('0,000000')` yields `0`. The `.replace(/0+$/, '')` guards trailing-zero edge cases; `parseFrAmount` already normalizes, so the rate is the numeric percent (e.g. `1.7`).

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/unit/patrimoine/parseLclAmortization.test.ts`
Expected: PASS (all five cases).

- [ ] **Step 5: Commit**

```bash
git add src/main/patrimoine/parseLclAmortization.ts tests/unit/patrimoine/parseLclAmortization.test.ts
git commit -m "feat(patrimoine): parse LCL amortization tables to a typed schedule"
```

---

## Task 5: PDF lines + import orchestrator

**Files:**

- Create: `src/main/patrimoine/pdfLines.ts`, `src/main/patrimoine/importLoan.ts`
- Test: `tests/unit/patrimoine/pdfLines.test.ts`, `tests/unit/patrimoine/importLoan.test.ts`

- [ ] **Step 1: Write the failing test for pageToLines**

Create `tests/unit/patrimoine/pdfLines.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { pageToLines } from '../../../src/main/patrimoine/pdfLines';
import type { PdfPage } from '../../../src/main/import/pdf/extract';

const page: PdfPage = {
  pageNumber: 1,
  items: [
    { str: '002', x: 10, y: 100, width: 5 },
    { str: '05/07/2018', x: 40, y: 100, width: 5 },
    { str: '998,33', x: 120, y: 100, width: 5 },
    { str: 'INTITULE DU PRET : X', x: 10, y: 200, width: 5 },
  ],
};

describe('pageToLines', () => {
  it('groups items by y (top to bottom) and orders left to right', () => {
    expect(pageToLines(page)).toEqual(['INTITULE DU PRET : X', '002 05/07/2018 998,33']);
  });
});
```

- [ ] **Step 2: Run it (fails), then implement pdfLines.ts**

Run: `npx vitest run tests/unit/patrimoine/pdfLines.test.ts` → FAIL.

Create `src/main/patrimoine/pdfLines.ts`:

```ts
import type { PdfPage } from '../import/pdf/extract';

/** pdfjs y jitters by fractions of a point; round to group items onto one line. */
export function pageToLines(page: PdfPage): string[] {
  const byLine = new Map<number, { x: number; str: string }[]>();
  for (const it of page.items) {
    const key = Math.round(it.y);
    const row = byLine.get(key) ?? [];
    row.push({ x: it.x, str: it.str });
    byLine.set(key, row);
  }
  return [...byLine.keys()]
    .sort((a, b) => b - a) // top (higher y) first
    .map((y) =>
      (byLine.get(y) ?? [])
        .sort((a, b) => a.x - b.x)
        .map((i) => i.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((l) => l.length > 0);
}
```

- [ ] **Step 3: Run pageToLines test**

Run: `npx vitest run tests/unit/patrimoine/pdfLines.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the failing test for importLoan (mock extractPdfText)**

Create `tests/unit/patrimoine/importLoan.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/main/import/pdf/extract', () => ({
  extractPdfText: () =>
    Promise.resolve({
      hasText: true,
      pages: [
        {
          pageNumber: 1,
          items: [
            { str: 'INTITULE DU PRET : PRET TEST', x: 10, y: 300, width: 5 },
            { str: 'MONTANT DU PRET : EUR 3 000,00', x: 10, y: 290, width: 5 },
            { str: 'DUREE TOTALE DU PRET : 3 MOIS', x: 10, y: 280, width: 5 },
            { str: 'DATE DE DEPART DU PRET : 07.09.2016', x: 10, y: 270, width: 5 },
            { str: 'TAUX DEBITEUR EN COURS : 1,000000 %', x: 400, y: 270, width: 5 },
            {
              str: '001 05/06/2018 997,50 2,50 1,00 0,00 1 001,00 2 002,50',
              x: 10,
              y: 200,
              width: 5,
            },
            {
              str: '002 05/07/2018 998,33 1,67 1,00 0,00 1 001,00 1 004,17',
              x: 10,
              y: 190,
              width: 5,
            },
            {
              str: '003 05/08/2018 1 004,17 0,83 1,00 0,00 1 006,00 0,00',
              x: 10,
              y: 180,
              width: 5,
            },
          ],
        },
      ],
    }),
}));

const { importLoanFromPdf } = await import('../../../src/main/patrimoine/importLoan');

describe('importLoanFromPdf', () => {
  it('returns a parsed table for a valid LCL PDF buffer', async () => {
    const res = await importLoanFromPdf(Buffer.from('%PDF-1.4 ...'));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.parsed.principal).toBe(3000);
      expect(res.parsed.installments).toHaveLength(3);
    }
  });

  it('rejects non-PDF buffers', async () => {
    const res = await importLoanFromPdf(Buffer.from('not a pdf'));
    expect(res).toEqual({ ok: false, error: 'not_pdf' });
  });
});
```

- [ ] **Step 5: Run it (fails), then implement importLoan.ts**

Run: `npx vitest run tests/unit/patrimoine/importLoan.test.ts` → FAIL.

Create `src/main/patrimoine/importLoan.ts`:

```ts
import type { ParseLoanResponse } from '@shared/types/patrimoine';
import { extractPdfText } from '../import/pdf/extract';
import { pageToLines } from './pdfLines';
import { parseLclAmortization } from './parseLclAmortization';

function isPdf(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString('latin1') === '%PDF-';
}

export async function importLoanFromPdf(buffer: Buffer): Promise<ParseLoanResponse> {
  if (!isPdf(buffer)) return { ok: false, error: 'not_pdf' };
  const { pages, hasText } = await extractPdfText(buffer);
  if (!hasText) return { ok: false, error: 'no_text' };
  const lines = pages.flatMap(pageToLines);
  try {
    return { ok: true, parsed: parseLclAmortization(lines) };
  } catch {
    return { ok: false, error: 'unrecognized_format' };
  }
}
```

- [ ] **Step 6: Run both tests**

Run: `npx vitest run tests/unit/patrimoine/pdfLines.test.ts tests/unit/patrimoine/importLoan.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/main/patrimoine/pdfLines.ts src/main/patrimoine/importLoan.ts tests/unit/patrimoine/pdfLines.test.ts tests/unit/patrimoine/importLoan.test.ts
git commit -m "feat(patrimoine): orchestrate PDF extraction into a parsed loan table"
```

---

## Task 6: Loan repository — persistence, CRD, stats

**Files:**

- Create: `src/main/patrimoine/loanRepo.ts`
- Test: `tests/unit/patrimoine/loanRepo.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/patrimoine/loanRepo.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { saveLoan, listLoans, deleteLoan, crdAt } from '../../../src/main/patrimoine/loanRepo';
import type { ParsedLoanTable } from '@shared/types/patrimoine';

const PARSED: ParsedLoanTable = {
  name: 'Prêt test',
  principal: 3000,
  nominalRate: 1,
  termMonths: 3,
  startDate: '2018-05-05',
  totals: { capital: 3000, interest: 5, insurance: 3 },
  installments: [
    {
      seq: 1,
      dueDate: '2018-06-05',
      capital: 997.5,
      interest: 2.5,
      insurance: 1,
      fees: 0,
      payment: 1001,
      balanceAfter: 2002.5,
    },
    {
      seq: 2,
      dueDate: '2018-07-05',
      capital: 998.33,
      interest: 1.67,
      insurance: 1,
      fees: 0,
      payment: 1001,
      balanceAfter: 1004.17,
    },
    {
      seq: 3,
      dueDate: '2018-08-05',
      capital: 1004.17,
      interest: 0.83,
      insurance: 1,
      fees: 0,
      payment: 1006,
      balanceAfter: 0,
    },
  ],
};

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

describe('loanRepo', () => {
  it('saves a loan with its installments and lists it back', () => {
    const db = freshDb();
    const id = saveLoan(db, { parsed: PARSED, name: 'Mon prêt', share: 0.5 });
    const loans = listLoans(db, '2018-07-10');
    expect(loans).toHaveLength(1);
    expect(loans[0]?.name).toBe('Mon prêt');
    expect(loans[0]?.share).toBe(0.5);
    expect(loans[0]?.endDate).toBe('2018-08-05');
    db.close();
    void id;
  });

  it('crdAt is a lookup: principal before the first row, balance_after at/after a row, 0 at the end', () => {
    const db = freshDb();
    const id = saveLoan(db, { parsed: PARSED, name: 'x', share: 1 });
    expect(crdAt(db, id, '2018-05-01')).toBe(3000); // before first due date
    expect(crdAt(db, id, '2018-06-05')).toBe(2002.5); // on a due date
    expect(crdAt(db, id, '2018-07-20')).toBe(1004.17); // between rows
    expect(crdAt(db, id, '2030-01-01')).toBe(0); // after the end
    db.close();
  });

  it('computes card stats: next installment, interest this year, remaining cost', () => {
    const db = freshDb();
    saveLoan(db, { parsed: PARSED, name: 'x', share: 0.5 });
    const [loan] = listLoans(db, '2018-07-01');
    expect(loan?.crd).toBe(2002.5);
    expect(loan?.nextInstallment?.dueDate).toBe('2018-07-05');
    expect(loan?.remainingCost).toBe(2.5); // interest of installments 2 + 3 = 1.67 + 0.83
    expect(loan?.interestThisYear).toBe(5); // all three rows are in 2018
    db.close();
  });

  it('deletes a loan and cascades its installments', () => {
    const db = freshDb();
    const id = saveLoan(db, { parsed: PARSED, name: 'x', share: 0.5 });
    deleteLoan(db, id);
    expect(listLoans(db, '2018-07-01')).toHaveLength(0);
    expect(db.prepare('SELECT COUNT(*) c FROM loan_installments').get()).toEqual({ c: 0 });
    db.close();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/patrimoine/loanRepo.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

Create `src/main/patrimoine/loanRepo.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { LoanInput, LoanInstallmentDTO, LoanWithStats } from '@shared/types/patrimoine';

interface LoanRow {
  id: string;
  name: string;
  lender: string | null;
  principal: number;
  nominal_rate: number;
  start_date: string;
  term_months: number;
  share: number;
}

interface InstallmentRow {
  id: string;
  seq: number;
  due_date: string;
  capital: number;
  interest: number;
  insurance: number;
  fees: number;
  payment: number;
  balance_after: number;
}

export function saveLoan(db: DatabaseSync, input: LoanInput): string {
  const id = randomUUID();
  const { parsed, name, share } = input;
  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO loans (id, name, lender, principal, nominal_rate, start_date, term_months, share)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      name,
      'LCL',
      parsed.principal,
      parsed.nominalRate,
      parsed.startDate,
      parsed.termMonths,
      share,
    );
    const insert = db.prepare(
      `INSERT INTO loan_installments
         (id, loan_id, seq, due_date, capital, interest, insurance, fees, payment, balance_after)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const i of parsed.installments) {
      insert.run(
        randomUUID(),
        id,
        i.seq,
        i.dueDate,
        i.capital,
        i.interest,
        i.insurance,
        i.fees,
        i.payment,
        i.balanceAfter,
      );
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return id;
}

/** Capital restant dû at `isoDate` (100%): a pure lookup, never recomputed. */
export function crdAt(db: DatabaseSync, loanId: string, isoDate: string): number {
  const row = db
    .prepare(
      `SELECT balance_after FROM loan_installments
       WHERE loan_id = ? AND due_date <= ? ORDER BY due_date DESC LIMIT 1`,
    )
    .get(loanId, isoDate) as { balance_after: number } | undefined;
  if (row) return row.balance_after;
  const loan = db.prepare('SELECT principal FROM loans WHERE id = ?').get(loanId) as
    | { principal: number }
    | undefined;
  return loan?.principal ?? 0;
}

function installments(db: DatabaseSync, loanId: string): InstallmentRow[] {
  return db
    .prepare(
      `SELECT id, seq, due_date, capital, interest, insurance, fees, payment, balance_after
       FROM loan_installments WHERE loan_id = ? ORDER BY due_date ASC`,
    )
    .all(loanId) as InstallmentRow[];
}

function toDto(r: InstallmentRow): LoanInstallmentDTO {
  return {
    id: r.id,
    seq: r.seq,
    dueDate: r.due_date,
    capital: r.capital,
    interest: r.interest,
    insurance: r.insurance,
    fees: r.fees,
    payment: r.payment,
    balanceAfter: r.balance_after,
  };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function listLoans(db: DatabaseSync, todayIso: string): LoanWithStats[] {
  const loans = db
    .prepare(
      `SELECT id, name, lender, principal, nominal_rate, start_date, term_months, share
       FROM loans ORDER BY created_at ASC`,
    )
    .all() as LoanRow[];
  const year = todayIso.slice(0, 4);
  return loans.map((l) => {
    const rows = installments(db, l.id);
    const next = rows.find((r) => r.due_date >= todayIso) ?? null;
    const remainingCost = round2(
      rows.filter((r) => r.due_date >= todayIso).reduce((s, r) => s + r.interest, 0),
    );
    const interestThisYear = round2(
      rows.filter((r) => r.due_date.slice(0, 4) === year).reduce((s, r) => s + r.interest, 0),
    );
    return {
      id: l.id,
      name: l.name,
      lender: l.lender,
      principal: l.principal,
      nominalRate: l.nominal_rate,
      startDate: l.start_date,
      termMonths: l.term_months,
      share: l.share,
      crd: crdAt(db, l.id, todayIso),
      endDate: rows[rows.length - 1]?.due_date ?? l.start_date,
      nextInstallment: next ? toDto(next) : null,
      interestThisYear,
      remainingCost,
    };
  });
}

export function listInstallments(db: DatabaseSync, loanId: string): LoanInstallmentDTO[] {
  return installments(db, loanId).map(toDto);
}

export function deleteLoan(db: DatabaseSync, id: string): void {
  db.prepare('DELETE FROM loans WHERE id = ?').run(id);
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/unit/patrimoine/loanRepo.test.ts`
Expected: PASS (all four cases).

- [ ] **Step 5: Commit**

```bash
git add src/main/patrimoine/loanRepo.ts tests/unit/patrimoine/loanRepo.test.ts
git commit -m "feat(patrimoine): loan repository with CRD lookup and card stats"
```

---

## Task 7: Asset repository

**Files:**

- Create: `src/main/patrimoine/assetRepo.ts`
- Test: `tests/unit/patrimoine/assetRepo.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/patrimoine/assetRepo.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { upsertAsset, listAssets, deleteAsset } from '../../../src/main/patrimoine/assetRepo';

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  return db;
}

describe('assetRepo', () => {
  it('creates then updates a property asset by id', () => {
    const db = freshDb();
    const a = upsertAsset(db, {
      name: 'Résidence principale',
      kind: 'property',
      declaredValue: 300000,
      share: 0.5,
      valuedAt: '2026-06-14',
    });
    expect(listAssets(db)).toHaveLength(1);
    const updated = upsertAsset(db, {
      id: a.id,
      name: 'RP',
      kind: 'property',
      declaredValue: 320000,
      share: 0.5,
      valuedAt: '2026-06-14',
    });
    expect(updated.id).toBe(a.id);
    expect(listAssets(db)).toHaveLength(1);
    expect(listAssets(db)[0]?.declaredValue).toBe(320000);
    db.close();
  });

  it('deletes an asset', () => {
    const db = freshDb();
    const a = upsertAsset(db, {
      name: 'x',
      kind: 'property',
      declaredValue: 1,
      share: 1,
      valuedAt: '2026-06-14',
    });
    deleteAsset(db, a.id);
    expect(listAssets(db)).toHaveLength(0);
    db.close();
  });
});
```

- [ ] **Step 2: Run it (fails), then implement assetRepo.ts**

Run: `npx vitest run tests/unit/patrimoine/assetRepo.test.ts` → FAIL.

Create `src/main/patrimoine/assetRepo.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { AssetDTO, UpsertAssetInput } from '@shared/types/patrimoine';

interface AssetRow {
  id: string;
  name: string;
  kind: string;
  declared_value: number;
  share: number;
  valued_at: string;
  notes: string | null;
}

function toDto(r: AssetRow): AssetDTO {
  return {
    id: r.id,
    name: r.name,
    kind: 'property',
    declaredValue: r.declared_value,
    share: r.share,
    valuedAt: r.valued_at,
    notes: r.notes,
  };
}

export function upsertAsset(db: DatabaseSync, input: UpsertAssetInput): AssetDTO {
  const id = input.id ?? randomUUID();
  db.prepare(
    `INSERT INTO assets (id, name, kind, declared_value, share, valued_at)
     VALUES (@id, @name, @kind, @declaredValue, @share, @valuedAt)
     ON CONFLICT(id) DO UPDATE SET
       name = @name, declared_value = @declaredValue, share = @share, valued_at = @valuedAt`,
  ).run({
    id,
    name: input.name,
    kind: input.kind,
    declaredValue: input.declaredValue,
    share: input.share,
    valuedAt: input.valuedAt,
  });
  const row = db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as AssetRow;
  return toDto(row);
}

export function listAssets(db: DatabaseSync): AssetDTO[] {
  return (db.prepare('SELECT * FROM assets ORDER BY created_at ASC').all() as AssetRow[]).map(
    toDto,
  );
}

export function deleteAsset(db: DatabaseSync, id: string): void {
  db.prepare('DELETE FROM assets WHERE id = ?').run(id);
}
```

- [ ] **Step 3: Run the test**

Run: `npx vitest run tests/unit/patrimoine/assetRepo.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main/patrimoine/assetRepo.ts tests/unit/patrimoine/assetRepo.test.ts
git commit -m "feat(patrimoine): declared-asset repository (upsert/list/delete)"
```

---

## Task 8: Extend net worth

**Files:**

- Modify: `src/shared/types/dashboard.ts`, `src/main/dashboard/consolidated.ts`
- Test: `tests/unit/patrimoine/netWorth.test.ts`

- [ ] **Step 1: Extend the NetWorth type**

In `src/shared/types/dashboard.ts`, after the `NetWorth` interface (around line 131), add the new breakdown types and two fields. Replace the `NetWorth` interface with:

```ts
export interface NetWorthLoan {
  readonly loanId: string;
  readonly name: string;
  readonly crd: number; // 100% capital restant dû today
  readonly share: number;
  readonly contribution: number; // negative: -crd * share
}

export interface NetWorthAsset {
  readonly assetId: string;
  readonly name: string;
  readonly value: number; // 100% declared value
  readonly share: number;
  readonly contribution: number; // value * share
}

/** Consolidated net worth: accounts + declared assets − loan CRD, all at the maintainer's share. */
export interface NetWorth {
  readonly total: number;
  readonly accounts: NetWorthAccount[];
  readonly assets: NetWorthAsset[];
  readonly loans: NetWorthLoan[];
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/unit/patrimoine/netWorth.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { getNetWorth } from '../../../src/main/dashboard/consolidated';
import { saveLoan } from '../../../src/main/patrimoine/loanRepo';
import { upsertAsset } from '../../../src/main/patrimoine/assetRepo';
import type { ParsedLoanTable } from '@shared/types/patrimoine';

const PARSED: ParsedLoanTable = {
  name: 'P',
  principal: 3000,
  nominalRate: 1,
  termMonths: 1,
  startDate: '2018-05-05',
  totals: { capital: 3000, interest: 0, insurance: 0 },
  installments: [
    {
      seq: 1,
      dueDate: '2018-06-05',
      capital: 3000,
      interest: 0,
      insurance: 0,
      fees: 0,
      payment: 3000,
      balanceAfter: 2000,
    },
  ],
};

describe('getNetWorth with loans and assets', () => {
  it('total = accounts + asset*share − crd*share, with breakdowns', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    db.exec('DELETE FROM accounts');
    db.prepare(
      "INSERT INTO accounts (id, name, type, declared_balance, declared_balance_date) VALUES ('a','A','checking',1000,'2026-01-01')",
    ).run();
    saveLoan(db, { parsed: PARSED, name: 'Prêt', share: 0.5 }); // crd today = 2000 (after last row)
    upsertAsset(db, {
      name: 'RP',
      kind: 'property',
      declaredValue: 300000,
      share: 0.5,
      valuedAt: '2026-06-14',
    });

    const nw = getNetWorth(db);
    // 1000 + 300000*0.5 − 2000*0.5 = 1000 + 150000 − 1000 = 150000
    expect(nw.total).toBe(150000);
    expect(nw.loans[0]?.contribution).toBe(-1000);
    expect(nw.assets[0]?.contribution).toBe(150000);
    db.close();
  });
});
```

Note: confirm the account-balance source. If `getAccountSummaries` derives balance from `declared_balance` only when no statement anchors it, and the assertion's account total differs, adjust the seeded account to whatever yields a deterministic `balance` (the test asserts the loan/asset math; align the account seed with `getAccountSummaries` behavior observed in `tests/unit/dashboard/consolidated.test.ts`).

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run tests/unit/patrimoine/netWorth.test.ts`
Expected: FAIL (`assets`/`loans` undefined on result, or total mismatch).

- [ ] **Step 4: Extend getNetWorth**

In `src/main/dashboard/consolidated.ts`, add imports at the top:

```ts
import { listLoans } from '../patrimoine/loanRepo';
import { listAssets } from '../patrimoine/assetRepo';
```

Replace the `getNetWorth` function body with:

```ts
export function getNetWorth(db: DatabaseSync): NetWorth {
  const accounts = getAccountSummaries(db);
  const accountsTotal = accounts.reduce((sum, a) => sum + (a.balance ?? 0), 0);

  const todayIso = new Date().toISOString().slice(0, 10);
  const round2 = (n: number): number => Math.round(n * 100) / 100;

  const loans = listLoans(db, todayIso).map((l) => ({
    loanId: l.id,
    name: l.name,
    crd: l.crd,
    share: l.share,
    contribution: round2(-l.crd * l.share),
  }));
  const assets = listAssets(db).map((a) => ({
    assetId: a.id,
    name: a.name,
    value: a.declaredValue,
    share: a.share,
    contribution: round2(a.declaredValue * a.share),
  }));

  const total = round2(
    accountsTotal +
      assets.reduce((s, a) => s + a.contribution, 0) +
      loans.reduce((s, l) => s + l.contribution, 0),
  );

  return {
    total,
    accounts: accounts.map((a) => ({ accountId: a.id, name: a.name, balance: a.balance })),
    assets,
    loans,
  };
}
```

- [ ] **Step 5: Run the net-worth test + the existing consolidated test (no regression)**

Run: `npx vitest run tests/unit/patrimoine/netWorth.test.ts tests/unit/dashboard/consolidated.test.ts tests/unit/ipc/dashboardConsolidated.test.ts`
Expected: PASS. If the existing tests assert the old `NetWorth` shape, update them to include `assets: []` and `loans: []` for the empty case.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types/dashboard.ts src/main/dashboard/consolidated.ts tests/unit/patrimoine/netWorth.test.ts
git commit -m "feat(patrimoine): fold loan CRD and declared assets into net worth"
```

---

## Task 9: IPC channels and handlers

**Files:**

- Modify: `src/main/ipc/channels.ts`, `src/shared/types/ipc.ts`, `src/main/ipc/register.ts`
- Create: `src/main/ipc/handlers/patrimoine.ts`
- Test: `tests/unit/ipc/patrimoine.test.ts`

- [ ] **Step 1: Add channel keys**

In `src/main/ipc/channels.ts`, add before the closing `} as const`:

```ts
  patrimoineListLoans: 'patrimoine:listLoans',
  patrimoineListInstallments: 'patrimoine:listInstallments',
  patrimoinePickLoanFile: 'patrimoine:pickLoanFile',
  patrimoineParseLoanFile: 'patrimoine:parseLoanFile',
  patrimoineCreateLoan: 'patrimoine:createLoan',
  patrimoineDeleteLoan: 'patrimoine:deleteLoan',
  patrimoineListAssets: 'patrimoine:listAssets',
  patrimoineUpsertAsset: 'patrimoine:upsertAsset',
  patrimoineDeleteAsset: 'patrimoine:deleteAsset',
```

- [ ] **Step 2: Add the IpcContract entries**

In `src/shared/types/ipc.ts`, add imports:

```ts
import type {
  LoanWithStats,
  LoanInput,
  LoanInstallmentDTO,
  AssetDTO,
  UpsertAssetInput,
  ParseLoanResponse,
} from './patrimoine';
```

Add inside the `IpcContract` interface:

```ts
  'patrimoine:listLoans': { payload: Record<string, never>; response: { loans: LoanWithStats[] } };
  'patrimoine:listInstallments': {
    payload: { loanId: string };
    response: { installments: LoanInstallmentDTO[] };
  };
  'patrimoine:pickLoanFile': {
    payload: Record<string, never>;
    response: { cancelled: true } | { cancelled: false; path: string };
  };
  'patrimoine:parseLoanFile': { payload: { path: string }; response: ParseLoanResponse };
  'patrimoine:createLoan': { payload: LoanInput; response: { ok: true; id: string } };
  'patrimoine:deleteLoan': { payload: { id: string }; response: { ok: true } };
  'patrimoine:listAssets': { payload: Record<string, never>; response: { assets: AssetDTO[] } };
  'patrimoine:upsertAsset': { payload: UpsertAssetInput; response: { asset: AssetDTO } };
  'patrimoine:deleteAsset': { payload: { id: string }; response: { ok: true } };
```

- [ ] **Step 3: Write the handlers**

Create `src/main/ipc/handlers/patrimoine.ts`:

```ts
import { readFileSync } from 'node:fs';
import { dialog } from 'electron';
import type { LoanInput, ParseLoanResponse, UpsertAssetInput } from '@shared/types/patrimoine';
import type { PickFileResponse } from '@shared/types/ipc';
import { getDb } from '../../db';
import { listLoans, listInstallments, saveLoan, deleteLoan } from '../../patrimoine/loanRepo';
import { listAssets, upsertAsset, deleteAsset } from '../../patrimoine/assetRepo';
import { importLoanFromPdf } from '../../patrimoine/importLoan';

const todayIso = (): string => new Date().toISOString().slice(0, 10);

export function handlePatrimoineListLoans() {
  return { loans: listLoans(getDb(), todayIso()) };
}

export function handlePatrimoineListInstallments(payload: { loanId: string }) {
  return { installments: listInstallments(getDb(), payload.loanId) };
}

export async function handlePatrimoinePickLoanFile(): Promise<PickFileResponse> {
  const result = await dialog.showOpenDialog({
    title: "Sélectionner le tableau d'amortissement (PDF)",
    properties: ['openFile'],
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return { cancelled: true };
  return { cancelled: false, path: result.filePaths[0] ?? '' };
}

export async function handlePatrimoineParseLoanFile(payload: {
  path: string;
}): Promise<ParseLoanResponse> {
  return importLoanFromPdf(readFileSync(payload.path));
}

export function handlePatrimoineCreateLoan(payload: LoanInput): { ok: true; id: string } {
  return { ok: true, id: saveLoan(getDb(), payload) };
}

export function handlePatrimoineDeleteLoan(payload: { id: string }): { ok: true } {
  deleteLoan(getDb(), payload.id);
  return { ok: true };
}

export function handlePatrimoineListAssets() {
  return { assets: listAssets(getDb()) };
}

export function handlePatrimoineUpsertAsset(payload: UpsertAssetInput) {
  return { asset: upsertAsset(getDb(), payload) };
}

export function handlePatrimoineDeleteAsset(payload: { id: string }): { ok: true } {
  deleteAsset(getDb(), payload.id);
  return { ok: true };
}
```

- [ ] **Step 4: Register the handlers**

In `src/main/ipc/register.ts`, add the import:

```ts
import {
  handlePatrimoineListLoans,
  handlePatrimoineListInstallments,
  handlePatrimoinePickLoanFile,
  handlePatrimoineParseLoanFile,
  handlePatrimoineCreateLoan,
  handlePatrimoineDeleteLoan,
  handlePatrimoineListAssets,
  handlePatrimoineUpsertAsset,
  handlePatrimoineDeleteAsset,
} from './handlers/patrimoine';
```

Add to `MUTATING_CHANNELS` (the persisted mutations):

```ts
  'patrimoine:createLoan',
  'patrimoine:deleteLoan',
  'patrimoine:upsertAsset',
  'patrimoine:deleteAsset',
```

Add inside `registerAllHandlers()`:

```ts
register(CHANNELS.patrimoineListLoans, () => handlePatrimoineListLoans());
register(CHANNELS.patrimoineListInstallments, handlePatrimoineListInstallments);
register(CHANNELS.patrimoinePickLoanFile, () => handlePatrimoinePickLoanFile());
register(CHANNELS.patrimoineParseLoanFile, handlePatrimoineParseLoanFile);
register(CHANNELS.patrimoineCreateLoan, handlePatrimoineCreateLoan);
register(CHANNELS.patrimoineDeleteLoan, handlePatrimoineDeleteLoan);
register(CHANNELS.patrimoineListAssets, () => handlePatrimoineListAssets());
register(CHANNELS.patrimoineUpsertAsset, handlePatrimoineUpsertAsset);
register(CHANNELS.patrimoineDeleteAsset, handlePatrimoineDeleteAsset);
```

- [ ] **Step 5: Write the handler test**

Create `tests/unit/ipc/patrimoine.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

const db = new DatabaseSync(':memory:');
runMigrations(db);
vi.mock('../../../src/main/db', () => ({ getDb: () => db }));

const {
  handlePatrimoineCreateLoan,
  handlePatrimoineListLoans,
  handlePatrimoineDeleteLoan,
  handlePatrimoineUpsertAsset,
  handlePatrimoineListAssets,
} = await import('../../../src/main/ipc/handlers/patrimoine');

beforeEach(() => {
  db.exec('DELETE FROM loans; DELETE FROM assets;');
});

describe('patrimoine handlers', () => {
  it('creates and lists a loan', () => {
    const { id } = handlePatrimoineCreateLoan({
      name: 'Prêt',
      share: 0.5,
      parsed: {
        name: 'Prêt',
        principal: 1000,
        nominalRate: 1,
        termMonths: 1,
        startDate: '2020-01-01',
        totals: { capital: 1000, interest: 0, insurance: 0 },
        installments: [
          {
            seq: 1,
            dueDate: '2020-02-01',
            capital: 1000,
            interest: 0,
            insurance: 0,
            fees: 0,
            payment: 1000,
            balanceAfter: 0,
          },
        ],
      },
    });
    expect(handlePatrimoineListLoans().loans).toHaveLength(1);
    handlePatrimoineDeleteLoan({ id });
    expect(handlePatrimoineListLoans().loans).toHaveLength(0);
  });

  it('upserts and lists an asset', () => {
    handlePatrimoineUpsertAsset({
      name: 'RP',
      kind: 'property',
      declaredValue: 300000,
      share: 0.5,
      valuedAt: '2026-06-14',
    });
    expect(handlePatrimoineListAssets().assets).toHaveLength(1);
  });
});
```

- [ ] **Step 6: Run the test + full typecheck**

Run: `npx vitest run tests/unit/ipc/patrimoine.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/main/ipc/channels.ts src/shared/types/ipc.ts src/main/ipc/register.ts src/main/ipc/handlers/patrimoine.ts tests/unit/ipc/patrimoine.test.ts
git commit -m "feat(patrimoine): IPC channels and handlers for loans and assets"
```

---

## Task 10: Renderer data hook

**Files:**

- Create: `src/renderer/hooks/usePatrimoine.ts`

- [ ] **Step 1: Write the hook**

Create `src/renderer/hooks/usePatrimoine.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import { ipc } from '../ipc/client';
import type { LoanWithStats, AssetDTO, UpsertAssetInput } from '@shared/types/patrimoine';

export function usePatrimoine(refreshToken: number) {
  const [loans, setLoans] = useState<LoanWithStats[]>([]);
  const [assets, setAssets] = useState<AssetDTO[]>([]);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      ipc.invoke('patrimoine:listLoans', {}),
      ipc.invoke('patrimoine:listAssets', {}),
    ]).then(([l, a]) => {
      if (!alive) return;
      setLoans(l.loans);
      setAssets(a.assets);
    });
    return () => {
      alive = false;
    };
  }, [refreshToken, tick]);

  const deleteLoan = useCallback(
    async (id: string) => {
      await ipc.invoke('patrimoine:deleteLoan', { id });
      reload();
    },
    [reload],
  );

  const upsertAsset = useCallback(
    async (input: UpsertAssetInput) => {
      await ipc.invoke('patrimoine:upsertAsset', input);
      reload();
    },
    [reload],
  );

  const deleteAsset = useCallback(
    async (id: string) => {
      await ipc.invoke('patrimoine:deleteAsset', { id });
      reload();
    },
    [reload],
  );

  return { loans, assets, reload, deleteLoan, upsertAsset, deleteAsset };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/hooks/usePatrimoine.ts
git commit -m "feat(patrimoine): renderer hook for loans and assets"
```

---

## Task 11: Patrimoine page and components

**Files:**

- Create: `src/renderer/components/patrimoine/LoanCard.tsx`, `PropertyCard.tsx`, `AmortizationTableDialog.tsx`, `AddLoanDialog.tsx`, `src/renderer/pages/PatrimoinePage.tsx`
- Test: `tests/unit/renderer/LoanCard.test.tsx`

Follow existing patterns: `Card`/`CardHeader`/`CardTitle` from `../ui/card`, `Overline`, `Button`, `cn()`, Lucide icons, French copy, euro formatting. Reuse the euro formatter already used elsewhere (grep `Intl.NumberFormat` in `src/renderer` and reuse that helper; if it is a local util, import it — do not duplicate).

- [ ] **Step 1: Write the failing LoanCard test**

Create `tests/unit/renderer/LoanCard.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LoanCard } from '../../../src/renderer/components/patrimoine/LoanCard';
import type { LoanWithStats } from '@shared/types/patrimoine';

afterEach(() => {
  cleanup();
});

const LOAN: LoanWithStats = {
  id: 'l1',
  name: 'Prêt principal',
  lender: 'LCL',
  principal: 150000,
  nominalRate: 1.7,
  startDate: '2016-09-07',
  termMonths: 319,
  share: 0.5,
  crd: 120000,
  endDate: '2043-05-05',
  nextInstallment: {
    id: 'i',
    seq: 30,
    dueDate: '2026-07-05',
    capital: 700,
    interest: 200,
    insurance: 48.56,
    fees: 0,
    payment: 948.56,
    balanceAfter: 119300,
  },
  interestThisYear: 2400,
  remainingCost: 18000,
};

describe('LoanCard', () => {
  it('shows the name, CRD and end date', () => {
    render(<LoanCard loan={LOAN} onView={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('Prêt principal')).toBeInTheDocument();
    expect(screen.getByText(/restant dû/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it (fails), then implement LoanCard.tsx**

Run: `npx vitest run tests/unit/renderer/LoanCard.test.tsx` → FAIL.

Create `src/renderer/components/patrimoine/LoanCard.tsx`:

```tsx
import { Eye, Trash2 } from 'lucide-react';
import type { LoanWithStats } from '@shared/types/patrimoine';
import { Card, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';

const eur = (n: number): string =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n);

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-sans text-[11px] text-paper-dim">{label}</span>
      <span className="font-mono text-[13px] text-paper">{value}</span>
    </div>
  );
}

export function LoanCard({
  loan,
  onView,
  onDelete,
}: {
  loan: LoanWithStats;
  onView: (loan: LoanWithStats) => void;
  onDelete: (id: string) => void;
}) {
  const next = loan.nextInstallment;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{loan.name}</CardTitle>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onView(loan)}
            aria-label="Voir le tableau"
          >
            <Eye size={14} strokeWidth={1.8} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(loan.id)}
            aria-label="Supprimer le prêt"
          >
            <Trash2 size={14} strokeWidth={1.8} />
          </Button>
        </div>
      </CardHeader>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Capital restant dû" value={eur(loan.crd)} />
        <Stat label="Quote-part" value={`${String(Math.round(loan.share * 100))} %`} />
        <Stat label="Fin du prêt" value={loan.endDate} />
        <Stat
          label="Prochaine échéance"
          value={next ? `${eur(next.payment)} · ${next.dueDate}` : '—'}
        />
        <Stat label="Intérêts cette année" value={eur(loan.interestThisYear)} />
        <Stat label="Coût restant (intérêts)" value={eur(loan.remainingCost)} />
      </div>
    </Card>
  );
}
```

- [ ] **Step 3: Run the LoanCard test**

Run: `npx vitest run tests/unit/renderer/LoanCard.test.tsx`
Expected: PASS.

- [ ] **Step 4: Implement AmortizationTableDialog.tsx**

Create `src/renderer/components/patrimoine/AmortizationTableDialog.tsx`. Use the project's dialog primitive if one exists (grep `components/ui/dialog`); otherwise a simple fixed overlay. It fetches installments on open via `ipc.invoke('patrimoine:listInstallments', { loanId })` and renders a scrollable table (date, capital, intérêts, assurance, échéance, CRD):

```tsx
import { useEffect, useState } from 'react';
import { ipc } from '../../ipc/client';
import type { LoanInstallmentDTO } from '@shared/types/patrimoine';

const eur = (n: number): string =>
  new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(n);

export function AmortizationTableDialog({
  loanId,
  loanName,
  onClose,
}: {
  loanId: string;
  loanName: string;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<LoanInstallmentDTO[]>([]);
  useEffect(() => {
    let alive = true;
    void ipc.invoke('patrimoine:listInstallments', { loanId }).then((r) => {
      if (alive) setRows(r.installments);
    });
    return () => {
      alive = false;
    };
  }, [loanId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-8"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-3xl flex-col rounded-lg border border-line-2 bg-ink-2 p-5"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="flex items-center justify-between pb-3">
          <h2 className="font-sans text-sm font-medium text-paper">Amortissement — {loanName}</h2>
          <button type="button" onClick={onClose} className="text-paper-dim hover:text-paper">
            Fermer
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full font-mono text-[12px] text-paper">
            <thead className="sticky top-0 bg-ink-2 text-paper-dim">
              <tr>
                <th className="px-2 py-1 text-left">Date</th>
                <th className="px-2 py-1 text-right">Capital</th>
                <th className="px-2 py-1 text-right">Intérêts</th>
                <th className="px-2 py-1 text-right">Assurance</th>
                <th className="px-2 py-1 text-right">Échéance</th>
                <th className="px-2 py-1 text-right">CRD</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line-1">
                  <td className="px-2 py-1">{r.dueDate}</td>
                  <td className="px-2 py-1 text-right">{eur(r.capital)}</td>
                  <td className="px-2 py-1 text-right">{eur(r.interest)}</td>
                  <td className="px-2 py-1 text-right">{eur(r.insurance)}</td>
                  <td className="px-2 py-1 text-right">{eur(r.payment)}</td>
                  <td className="px-2 py-1 text-right">{eur(r.balanceAfter)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Implement AddLoanDialog.tsx**

Create `src/renderer/components/patrimoine/AddLoanDialog.tsx`. Flow: pick file → parse → show a confirmation preview (header + first/last row + totals self-check) → editable name + share → create. On parse error, show the error code mapped to French copy.

```tsx
import { useState } from 'react';
import { ipc } from '../../ipc/client';
import { Button } from '../ui/button';
import type { ParsedLoanTable } from '@shared/types/patrimoine';

const ERR: Record<string, string> = {
  not_pdf: 'Ce fichier n’est pas un PDF.',
  no_text: 'Ce PDF n’a pas de couche texte (scan ?).',
  unrecognized_format: 'Format non reconnu — ce n’est pas un tableau d’amortissement LCL.',
};

export function AddLoanDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [parsed, setParsed] = useState<ParsedLoanTable | null>(null);
  const [name, setName] = useState('');
  const [sharePct, setSharePct] = useState(50);
  const [error, setError] = useState<string | null>(null);

  async function pickAndParse() {
    setError(null);
    const picked = await ipc.invoke('patrimoine:pickLoanFile', {});
    if (picked.cancelled) return;
    const res = await ipc.invoke('patrimoine:parseLoanFile', { path: picked.path });
    if (!res.ok) {
      setError(ERR[res.error] ?? 'Erreur de lecture.');
      return;
    }
    setParsed(res.parsed);
    setName(res.parsed.name);
  }

  async function create() {
    if (!parsed) return;
    await ipc.invoke('patrimoine:createLoan', { parsed, name, share: sharePct / 100 });
    onCreated();
    onClose();
  }

  const first = parsed?.installments[0];
  const last = parsed ? parsed.installments[parsed.installments.length - 1] : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-line-2 bg-ink-2 p-5"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <h2 className="pb-3 font-sans text-sm font-medium text-paper">Ajouter un prêt</h2>
        {!parsed ? (
          <div className="flex flex-col gap-3">
            <p className="font-sans text-[13px] text-paper-soft">
              Sélectionne le tableau d’amortissement PDF de ta banque (LCL).
            </p>
            {error && <p className="font-sans text-[12px] text-coral">{error}</p>}
            <Button variant="secondary" size="sm" onClick={() => void pickAndParse()}>
              Choisir le PDF…
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 font-mono text-[12px] text-paper">
            <div>
              Montant : {parsed.principal.toLocaleString('fr-FR')} € · Taux {parsed.nominalRate} % ·{' '}
              {parsed.termMonths} mois
            </div>
            <div>
              1ʳᵉ échéance : {first?.dueDate} · CRD {first?.balanceAfter.toLocaleString('fr-FR')} €
            </div>
            <div>
              Dernière : {last?.dueDate} · CRD {last?.balanceAfter.toLocaleString('fr-FR')} €
            </div>
            <div>Total intérêts : {parsed.totals.interest.toLocaleString('fr-FR')} €</div>
            <label className="flex flex-col gap-1 font-sans text-[12px] text-paper-soft">
              Nom
              <input
                className="h-8 rounded-md border border-line-2 bg-ink-3 px-2 text-paper"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                }}
              />
            </label>
            <label className="flex flex-col gap-1 font-sans text-[12px] text-paper-soft">
              Quote-part (%)
              <input
                type="number"
                min={0}
                max={100}
                className="h-8 w-24 rounded-md border border-line-2 bg-ink-3 px-2 text-paper"
                value={sharePct}
                onChange={(e) => {
                  setSharePct(Number(e.target.value));
                }}
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Annuler
              </Button>
              <Button variant="secondary" size="sm" onClick={() => void create()}>
                Enregistrer
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Implement PropertyCard.tsx**

Create `src/renderer/components/patrimoine/PropertyCard.tsx`: shows the declared value + share with an inline edit (value, share %), calling `onSave(UpsertAssetInput)`. Mirror `LoanCard` styling and the inline-edit pattern from `CategoriesPage`'s `CategoryRow`. Include an empty state ("Déclare la valeur de ton bien") when there is no property asset yet. (Keep it focused; reuse the `eur` formatter.)

- [ ] **Step 7: Implement PatrimoinePage.tsx**

Create `src/renderer/pages/PatrimoinePage.tsx`:

```tsx
import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Plus } from 'lucide-react';
import type { AppOutletContext } from '../lib/outletContext';
import type { LoanWithStats } from '@shared/types/patrimoine';
import { usePatrimoine } from '../hooks/usePatrimoine';
import { Card, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Overline } from '../components/ui/overline';
import { LoanCard } from '../components/patrimoine/LoanCard';
import { PropertyCard } from '../components/patrimoine/PropertyCard';
import { AmortizationTableDialog } from '../components/patrimoine/AmortizationTableDialog';
import { AddLoanDialog } from '../components/patrimoine/AddLoanDialog';

export function PatrimoinePage() {
  const { refreshToken, notifyDataChanged } = useOutletContext<AppOutletContext>();
  const { loans, assets, reload, deleteLoan, upsertAsset, deleteAsset } =
    usePatrimoine(refreshToken);
  const [viewing, setViewing] = useState<LoanWithStats | null>(null);
  const [adding, setAdding] = useState(false);

  const onChanged = () => {
    reload();
    notifyDataChanged();
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3.5">
            <Overline>— I</Overline>
            <CardTitle>Prêts</CardTitle>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setAdding(true);
            }}
          >
            <Plus size={14} strokeWidth={1.8} /> Ajouter un prêt
          </Button>
        </CardHeader>
        {loans.length === 0 ? (
          <p className="py-6 text-center text-sm text-paper-mute">
            Aucun prêt — importe ton tableau d’amortissement pour commencer.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {loans.map((l) => (
              <LoanCard
                key={l.id}
                loan={l}
                onView={setViewing}
                onDelete={(id) => {
                  void deleteLoan(id).then(notifyDataChanged);
                }}
              />
            ))}
          </div>
        )}
      </Card>

      <PropertyCard
        asset={assets[0] ?? null}
        onSave={(input) => {
          void upsertAsset(input).then(notifyDataChanged);
        }}
        onDelete={(id) => {
          void deleteAsset(id).then(notifyDataChanged);
        }}
      />

      {viewing && (
        <AmortizationTableDialog
          loanId={viewing.id}
          loanName={viewing.name}
          onClose={() => {
            setViewing(null);
          }}
        />
      )}
      {adding && (
        <AddLoanDialog
          onClose={() => {
            setAdding(false);
          }}
          onCreated={onChanged}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 8: Run the renderer test + typecheck**

Run: `npx vitest run tests/unit/renderer/LoanCard.test.tsx && npx tsc --noEmit`
Expected: PASS. (If `Button` lacks a `ghost` variant, use the closest existing variant — grep `buttonVariants` in `components/ui/button.tsx`.)

- [ ] **Step 9: Commit**

```bash
git add src/renderer/components/patrimoine src/renderer/pages/PatrimoinePage.tsx tests/unit/renderer/LoanCard.test.tsx
git commit -m "feat(patrimoine): Patrimoine page with loan cards, property card, amortization viewer"
```

---

## Task 12: Routing and sidebar entry

**Files:**

- Modify: `src/renderer/App.tsx`, `src/renderer/components/Sidebar.tsx`

- [ ] **Step 1: Add the route**

In `src/renderer/App.tsx`, add the import with the other page imports:

```ts
import { PatrimoinePage } from './pages/PatrimoinePage';
```

Add the route after the `/reports` route:

```tsx
<Route path="/patrimoine" element={<PatrimoinePage />} />
```

- [ ] **Step 2: Add the sidebar nav item**

In `src/renderer/components/Sidebar.tsx`, import a Lucide icon already used or add `Wallet`:

```ts
import { Wallet } from 'lucide-react';
```

Add the nav entry after the `/reports` entry (line ~54):

```ts
        { kind: 'route', path: '/patrimoine', label: 'Patrimoine', Icon: Wallet, enabled: true },
```

- [ ] **Step 3: Verify build + typecheck**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS (renderer + main bundles build).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/App.tsx src/renderer/components/Sidebar.tsx
git commit -m "feat(patrimoine): add Patrimoine route and sidebar entry"
```

---

## Task 13: Local real-PDF validation (guarded, no personal data committed)

**Files:**

- Create: `tests/unit/patrimoine/realPdf.local.test.ts`

This test runs only when the maintainer's gitignored fixtures exist. It asserts **structural invariants** (never personal figures): per-row `payment = capital + interest + insurance + fees`, monotonically non-increasing CRD, last CRD = 0, and totals == Σ rows.

- [ ] **Step 1: Write the guarded test**

Create `tests/unit/patrimoine/realPdf.local.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importLoanFromPdf } from '../../../src/main/patrimoine/importLoan';

const dir = join(process.cwd(), 'spike-fixtures', 'mortgage');
const files = ['pret-A.pdf', 'pret-B.pdf'].map((f) => join(dir, f)).filter(existsSync);

describe.skipIf(files.length === 0)('real LCL PDFs (local only)', () => {
  it.each(files)('parses %s with consistent invariants', async (file) => {
    const res = await importLoanFromPdf(readFileSync(file));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const t = res.parsed;
    expect(t.installments.length).toBeGreaterThan(0);

    let prev = Infinity;
    for (const i of t.installments) {
      expect(Math.round((i.capital + i.interest + i.insurance + i.fees) * 100) / 100).toBe(
        i.payment,
      );
      expect(i.balanceAfter).toBeLessThanOrEqual(prev + 1e-6);
      prev = i.balanceAfter;
    }
    expect(t.installments[t.installments.length - 1]?.balanceAfter).toBe(0);

    const sumCapital = Math.round(t.installments.reduce((s, i) => s + i.capital, 0) * 100) / 100;
    expect(sumCapital).toBe(t.totals.capital);
  });
});
```

- [ ] **Step 2: Run it locally (fixtures present)**

Run: `npx vitest run tests/unit/patrimoine/realPdf.local.test.ts`
Expected: PASS for both real PDFs. **If an invariant fails, the parser needs adjusting for that loan's layout** (e.g. the partial first `ECH` row or a palier boundary) — fix `parseLclAmortization` and re-run. This is the real-world validation gate.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/patrimoine/realPdf.local.test.ts
git commit -m "test(patrimoine): guarded local validation against real LCL tables"
```

---

## Task 14: Docs + full gate

**Files:**

- Modify: `README.md`, `docs/superpowers/specs/2026-06-14-mortgage-module-design.md`

- [ ] **Step 1: Update docs**

In `README.md`, add the Patrimoine module to the feature list (loans imported from the bank's amortization table; declared property value; net worth at the maintainer's quote-part). In the spec file, change the status line to `Status: implemented`.

- [ ] **Step 2: Run the full gate**

Run: `npx tsc --noEmit && npx eslint src tests && npx vitest run && npm run build`
Expected: all green. Fix any lint/type issues inline.

- [ ] **Step 3: Commit**

```bash
git add README.md docs/superpowers/specs/2026-06-14-mortgage-module-design.md
git commit -m "docs(patrimoine): document the mortgage module"
```

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin <branch>
gh pr create --title "feat(patrimoine): mortgage module v1 (import + net worth)" --body "Implements docs/superpowers/specs/2026-06-14-mortgage-module-design.md. UI change — to be validated in-app by the maintainer before merge."
```

This is a UI-bearing change: per the repo's process, the maintainer validates in-app (import a real LCL table, check CRD and net worth to the cent) **before** merge.

---

## Self-Review Notes

- **Spec coverage:** §2 data model → Task 1; types → Task 2; §3 parser/import → Tasks 3–5; CRD lookup → Task 6; §4 net worth → Task 8; declared asset → Task 7; §5 UI → Tasks 11–12; §6 verification (synthetic + local real) → Tasks 4 & 13; reconciliation explicitly deferred (not implemented) — matches §6 decision 4.
- **Net worth account seed (Task 8 Step 2):** the exact `balance` produced by `getAccountSummaries` for a declared-balance-only account must be confirmed against `tests/unit/dashboard/consolidated.test.ts`; adjust the seed so the loan/asset math is what's asserted.
- **Button variants / dialog primitive (Task 11):** verify `ghost` variant and whether `components/ui/dialog` exists before use; fall back to existing primitives.
- **Existing NetWorth consumers:** the sidebar `useNetWorthSummary` and any test asserting the old shape must tolerate the added `assets`/`loans` fields (Task 8 Step 5).
