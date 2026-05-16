# Epic 2 · Story 4 — Deterministic table extraction : Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse the transaction table from LCL PDF pages using the seeded column mapping and produce `ExtractedTransaction[]` with ISO dates, raw labels, and signed amounts (positive = credit, negative = debit).

**Architecture:** Pure function `extractTransactions(pages: PdfPage[], mapping: ColumnMapping): ExtractionResult` in `src/main/import/pdf/extractTransactions.ts`. Processes pages one-by-one (to avoid y-coordinate collisions across pages). Groups text items into rows by y-band, classifies items into date/label/valeur/debit/credit zones using the mapping's x thresholds, detects special rows (opening/closing balance), and parses French number/date formats. No LLM, no DB access — pure deterministic function.

**Tech Stack:** TypeScript · Vitest · pdfjs-dist (via `extractPdfText` already built)

**Spec reference:** Design Spec §4 (step 7), §5 · ADR-003

**GitHub:** Story #27 · Epic #23

---

## LCL PDF fixture analysis (derived from spike-fixtures/COMPTEDEDEPOTS_08992009022_20251202.pdf)

**Column x positions (from seeded mapping):**

- `date_col = 42` — dates appear at x ≈ 42 (format: `DD.MM`)
- `label_col = 75` — main label text at x = 75; continuation detail lines at x = 81 (skip: no date item)
- `debit_col = 433` — DEBIT header at x = 433; amounts right-align within [433, 504)
- `credit_col = 504` — CREDIT header at x = 504; amounts right-align within [504, 570]

**VALEUR column:** header at x = 365, dates at x = 366, format `DD.MM.YY`. Use VALEUR date as the canonical transaction date. Identified by regex `/^\d{2}\.\d{2}\.\d{2}$/` anywhere in the row (no hardcoded x needed).

**Special rows:**

- `ANCIEN SOLDE` (label at x = 286, amount in credit zone x = 523): opening balance → NOT a transaction
- `SOLDE EN EUROS` (label at x = 273, amount in credit zone x = 523): closing balance → NOT a transaction
- `SOLDE INTERMEDIAIRE ...` (x = 93, no date item): skipped by date check
- `TOTAUX` (x = 317, no date item): skipped by date check
- Header row `DATE LIBELLE VALEUR DEBIT CREDIT`: dateStr = "DATE" → fails `/^\d{2}\.\d{2}$/` → skipped
- Footer rows (page numbers, legal notice): no date item → skipped

**Stray "." in credit zone:** some rows have `[x=557 "."]` in the credit area (formatting artifact). `parseAmount(".")` returns `null` → ignored naturally.

**FX detail continuation rows** (e.g., `[x=81 "AMSTERDAM"]  [x=145 "EUR"]  [x=180 "37,91"]`): no date item → skipped. The "37,91" at x=180 is in the label zone, not debit/credit zone — poses no risk.

**Page-by-page processing:** each page resets y from 0 → 800. Must process pages separately (not flatMap all items) to avoid y-collision between pages.

**Expected extraction results from fixture:**

- `transactions.length === 46`
- `openingBalance === 2638.20` (31.10.2025)
- `closingBalance === 1173.71` (02.12.2025)
- Sum of debits (as positive): `3809.73`
- Sum of credits: `2345.24`
- Arithmetic check: `2638.20 + 2345.24 − 3809.73 = 1173.71` ✓
- First transaction: `{ date: '2025-11-01', label: 'VIR.PERMANENT MR PIANELLI OU ML', amount: -1000.00 }`

---

## File Structure

- Create: `src/main/import/pdf/extractTransactions.ts` — main extraction function + helpers + types
- Create: `tests/unit/import/pdf/extractTransactions.test.ts` — pure function tests + fixture integration test

---

## Task 1: TDD — implement extractTransactions + tests

**Files:**

- Create: `tests/unit/import/pdf/extractTransactions.test.ts`
- Create: `src/main/import/pdf/extractTransactions.ts`

---

### Step 1: Write the failing tests

Create `tests/unit/import/pdf/extractTransactions.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractPdfText } from '../../../../src/main/import/pdf/extract';
import {
  extractTransactions,
  parseAmount,
  parseDateStr,
  parseValeurDate,
} from '../../../../src/main/import/pdf/extractTransactions';
import type { ColumnMapping } from '../../../../src/main/import/pdf/extractTransactions';

const FIXTURE_PATH = resolve('spike-fixtures/COMPTEDEDEPOTS_08992009022_20251202.pdf');

const LCL_MAPPING: ColumnMapping = {
  date_col: 42,
  label_col: 75,
  debit_col: 433,
  credit_col: 504,
  balance_col: null,
};

describe('parseAmount', () => {
  it('parses French number with space thousands separator', () => {
    expect(parseAmount('1 234,56')).toBeCloseTo(1234.56, 2);
  });
  it('parses simple decimal amount', () => {
    expect(parseAmount('37,91')).toBeCloseTo(37.91, 2);
  });
  it('parses large amount', () => {
    expect(parseAmount('2 311,24')).toBeCloseTo(2311.24, 2);
  });
  it('returns null for stray period', () => {
    expect(parseAmount('.')).toBeNull();
  });
  it('returns null for non-numeric text', () => {
    expect(parseAmount('EUR')).toBeNull();
  });
  it('returns null for empty string', () => {
    expect(parseAmount('')).toBeNull();
  });
});

describe('parseDateStr', () => {
  it('converts DD.MM + year to ISO date', () => {
    expect(parseDateStr('01.11', 2025)).toBe('2025-11-01');
  });
  it('handles end-of-month dates', () => {
    expect(parseDateStr('31.10', 2025)).toBe('2025-10-31');
  });
});

describe('parseValeurDate', () => {
  it('converts DD.MM.YY to ISO date (2-digit year, 2025)', () => {
    expect(parseValeurDate('01.11.25')).toBe('2025-11-01');
    expect(parseValeurDate('02.12.25')).toBe('2025-12-02');
  });
});

describe('extractTransactions', () => {
  it.skipIf(!existsSync(FIXTURE_PATH))(
    'extracts 46 transactions with correct balances from real LCL fixture',
    async () => {
      const buffer = readFileSync(FIXTURE_PATH);
      const { pages } = await extractPdfText(buffer);
      const result = extractTransactions(pages, LCL_MAPPING);

      // Transaction count
      expect(result.transactions).toHaveLength(46);

      // Balances
      expect(result.openingBalance).toBeCloseTo(2638.2, 2);
      expect(result.closingBalance).toBeCloseTo(1173.71, 2);
      expect(result.openingDate).toBe('2025-10-31');
      expect(result.closingDate).toBe('2025-12-02');

      // First transaction
      const first = result.transactions[0]!;
      expect(first.date).toBe('2025-11-01');
      expect(first.label).toBe('VIR.PERMANENT MR PIANELLI OU ML');
      expect(first.amount).toBeCloseTo(-1000.0, 2);

      // Arithmetic verification: opening + net = closing
      const net = result.transactions.reduce((sum, t) => sum + t.amount, 0);
      expect(result.openingBalance + net).toBeCloseTo(result.closingBalance, 1);

      // All transactions have valid ISO dates and non-empty labels
      for (const tx of result.transactions) {
        expect(tx.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(tx.label.length).toBeGreaterThan(0);
      }
    },
  );
});
```

---

### Step 2: Run tests to confirm they fail

```bash
cd /home/denis/finance-dashboard && npx vitest run tests/unit/import/pdf/extractTransactions.test.ts 2>&1 | tail -20
```

Expected: FAIL — module not found.

---

### Step 3: Create the implementation

Create `src/main/import/pdf/extractTransactions.ts`:

```typescript
import type { PdfPage, PdfTextItem } from './extract';

export interface ColumnMapping {
  date_col: number;
  label_col: number;
  debit_col: number;
  credit_col: number;
  balance_col: number | null;
}

export interface ExtractedTransaction {
  date: string;
  label: string;
  amount: number; // positive = credit, negative = debit
}

export interface ExtractionResult {
  transactions: ExtractedTransaction[];
  openingBalance: number;
  closingBalance: number;
  openingDate: string;
  closingDate: string;
}

export function parseAmount(str: string): number | null {
  const cleaned = str.replace(/\s/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

export function parseDateStr(ddmm: string, year: number): string {
  const [day, month] = ddmm.split('.');
  return `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
}

export function parseValeurDate(str: string): string {
  const [day, month, yy] = str.split('.');
  const fullYear = parseInt(yy!, 10) <= 50 ? 2000 + parseInt(yy!, 10) : 1900 + parseInt(yy!, 10);
  return `${fullYear}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
}

function inferYear(items: PdfTextItem[]): number {
  for (const item of items) {
    const m = /^\d{2}\.\d{2}\.(\d{2})$/.exec(item.str);
    if (m) {
      const yy = parseInt(m[1]!, 10);
      return yy <= 50 ? 2000 + yy : 1900 + yy;
    }
  }
  return new Date().getFullYear();
}

function groupItemsByY(items: PdfTextItem[], tolerance = 4): PdfTextItem[][] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => b.y - a.y);
  const groups: PdfTextItem[][] = [];
  let current: PdfTextItem[] = [sorted[0]!];
  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i]!;
    if (Math.abs(item.y - current[0]!.y) <= tolerance) {
      current.push(item);
    } else {
      groups.push(current.sort((a, b) => a.x - b.x));
      current = [item];
    }
  }
  groups.push(current.sort((a, b) => a.x - b.x));
  return groups;
}

export function extractTransactions(pages: PdfPage[], mapping: ColumnMapping): ExtractionResult {
  const year = inferYear(pages.flatMap((p) => p.items));

  let openingBalance = 0;
  let closingBalance = 0;
  let openingDate = '';
  let closingDate = '';
  const transactions: ExtractedTransaction[] = [];

  for (const page of pages) {
    const rows = groupItemsByY(page.items);

    for (const row of rows) {
      const dateItems = row.filter((item) => item.x < mapping.label_col);
      const dateStr = dateItems
        .map((i) => i.str.trim())
        .join('')
        .trim();

      if (!/^\d{2}\.\d{2}$/.test(dateStr)) continue;

      const valeurItem = row.find((i) => /^\d{2}\.\d{2}\.\d{2}$/.test(i.str));
      const date = valeurItem ? parseValeurDate(valeurItem.str) : parseDateStr(dateStr, year);

      const labelItems = row.filter(
        (i) =>
          i.x >= mapping.label_col &&
          i.x < mapping.debit_col &&
          !/^\d{2}\.\d{2}\.\d{2}$/.test(i.str),
      );
      const debitItems = row.filter((i) => i.x >= mapping.debit_col && i.x < mapping.credit_col);
      const creditItems = row.filter((i) => i.x >= mapping.credit_col);

      const labelStr = labelItems
        .map((i) => i.str.trim())
        .filter(Boolean)
        .join(' ')
        .trim();

      if (labelStr.includes('ANCIEN SOLDE')) {
        openingBalance = creditItems.map((i) => parseAmount(i.str)).find((n) => n !== null) ?? 0;
        openingDate = parseDateStr(dateStr, year);
        continue;
      }

      if (/SOLDE EN EUROS/i.test(labelStr)) {
        closingBalance = creditItems.map((i) => parseAmount(i.str)).find((n) => n !== null) ?? 0;
        closingDate = date;
        continue;
      }

      const debitAmt = debitItems.map((i) => parseAmount(i.str)).find((n) => n !== null);
      const creditAmt = creditItems.map((i) => parseAmount(i.str)).find((n) => n !== null);

      if (debitAmt == null && creditAmt == null) continue;

      transactions.push({
        date,
        label: labelStr,
        amount: debitAmt != null ? -debitAmt : creditAmt!,
      });
    }
  }

  return { transactions, openingBalance, closingBalance, openingDate, closingDate };
}
```

---

### Step 4: Run tests to confirm they pass

```bash
cd /home/denis/finance-dashboard && npx vitest run tests/unit/import/pdf/extractTransactions.test.ts 2>&1 | tail -20
```

Expected:

- If fixture present: 10 tests pass (6 parseAmount + 2 parseDateStr + 2 parseValeurDate + 1 fixture integration)
- If fixture absent: 9 tests pass (fixture test skipped)

---

### Step 5: Run the full suite to confirm no regressions

```bash
cd /home/denis/finance-dashboard && npm test 2>&1 | tail -10
```

Expected: all existing tests + new tests pass.

---

### Step 6: Commit (include the plan file)

```bash
cd /home/denis/finance-dashboard && git add \
  src/main/import/pdf/extractTransactions.ts \
  tests/unit/import/pdf/extractTransactions.test.ts \
  docs/superpowers/plans/2026-05-16-epic-2-story-4-deterministic-table-extraction.md \
  && git commit -m "feat(import): add deterministic table extraction from LCL PDF tokens"
```

---

## Task 2: Typecheck + lint + PR

**Files:** none (verification + PR)

- [ ] **Step 1: Typecheck and lint**

```bash
cd /home/denis/finance-dashboard && npm run typecheck && npm run lint 2>&1 | tail -10
```

Expected: zero errors, zero warnings.

- [ ] **Step 2: Push branch**

```bash
cd /home/denis/finance-dashboard && git push -u origin feat/27-deterministic-table-extraction
```

- [ ] **Step 3: Open PR**

```bash
gh pr create \
  --title "feat(import): add deterministic table extraction from LCL PDF tokens (#27)" \
  --body "$(cat <<'EOF'
Closes #27

## Summary
- Adds \`extractTransactions(pages, mapping): ExtractionResult\` in \`src/main/import/pdf/extractTransactions.ts\`
- Groups PDF text items into rows by y-band (tolerance ±4px), classifies by x zone using column mapping
- Parses French number format (\`1 234,56\` → 1234.56) and 2-digit valeur dates (\`DD.MM.YY\`)
- Detects \`ANCIEN SOLDE\` / \`SOLDE EN EUROS\` rows as opening/closing balance (not transactions)
- Processes pages individually to avoid y-coordinate collisions across PDF pages
- Signed amounts: negative = debit, positive = credit

## Test Plan
- [x] \`npm test\` — all tests pass; fixture test asserts 46 transactions, balances, arithmetic check
- [x] \`npm run typecheck && npm run lint\` — zero errors
EOF
)"
```

---

## Self-Review

- **Spec coverage:** rows reconstructed from x/y tokens using seeded LCL mapping ✓; date/label/amount parsed ✓; opening/closing balance extracted ✓; unit test on real LCL fixture ✓; arithmetic verification in test ✓.
- **ADR-003:** deterministic extraction, no LLM involved ✓.
- **Exported types:** `ColumnMapping`, `ExtractedTransaction`, `ExtractionResult` — usable by pipeline stories.
- **No placeholders:** complete implementation and test code included.
- **Commit includes plan file** ✓.
