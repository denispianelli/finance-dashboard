# Mortgage Reports-Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose an imported mortgage debit in the reports — auto-match it to its amortization installment, count interest+insurance as a dedicated "Intérêts d'emprunt" expense, and neutralize the capital portion — without mutating the faithful ledger row.

**Architecture:** A nullable `transactions.loan_installment_id` link is set by a deterministic amount+date matcher (reviewable/reversible). The split is **virtual at report time**: one shared renderer helper `toAccountingRows` expands a matched transaction into an "Intérêts d'emprunt" expense row + a transfer-flagged capital row, which every JS report aggregator consumes via `flatMap`; the SQL consolidated cashflow applies the same rule via a `LEFT JOIN` + `CASE`. A badge surfaces the split in the transaction list; a counter + "Détecter" button lives on the loan card.

**Tech Stack:** TypeScript strict, `node:sqlite`, Electron IPC (`IpcContract`), React + shadcn/ui + Tailwind, Vitest 4.

**Conventions (read once):**

- Money is REAL euros. TS strict: no `any`/unsafe; `noUncheckedIndexedAccess` on.
- Renderer money formatting goes through `lib/euro` / `<Money>` (a lint rule blocks hand-rolled `Intl.NumberFormat`); dialogs use `ui/dialog`. See CLAUDE.md.
- Renderer tests: `// @vitest-environment jsdom` + explicit `afterEach(() => { cleanup(); })`.
- `main` protected: branch + PR. Conventional Commits. Husky reformats staged files (re-add + retry).
- Spec: `docs/superpowers/specs/2026-06-14-mortgage-reports-split-design.md`.

---

## File Structure

**Create:**

- `src/main/db/migrations/022_loan_payment_link.sql` — link column + index + seed category.
- `src/main/patrimoine/matchPayments.ts` — `matchLoanPayments`, `unlinkPayment`, `loanMatchCounts`.
- `src/renderer/lib/loanSplit.ts` — `INTEREST_LOAN_CATEGORY`, `toAccountingRows`.
- `src/renderer/components/patrimoine/LoanMatchRow.tsx` (optional, folded into LoanCard if small).

**Modify:**

- `src/main/db/migrate.ts` — register migration 022.
- `src/shared/types/dashboard.ts` — `DashboardTransaction.loanSplit`.
- `src/main/dashboard/queries.ts` — `getTransactions` joins the installment, fills `loanSplit`.
- `src/main/dashboard/consolidated.ts` — `getConsolidatedCashflow` split via JOIN + CASE.
- `src/renderer/lib/reports.ts` — `periodTotals` / `dailyFlow` / `topCategories` / `categoryBreakdown` consume `toAccountingRows`.
- `src/main/ipc/channels.ts`, `src/shared/types/ipc.ts`, `src/main/ipc/register.ts`, `src/main/ipc/handlers/patrimoine.ts` — detect / unlink channels; auto-detect after import.
- `src/main/ipc/handlers/importConfirm.ts` (or its callee) — run detection after a successful import.
- `src/renderer/components/dashboard/TxTable.tsx` — loan badge in the category cell.
- `src/renderer/components/patrimoine/LoanCard.tsx` + `src/renderer/hooks/usePatrimoine.ts` — counter + "Détecter" + unlink.

**Test:**

- `tests/unit/patrimoine/migration022.test.ts`, `matchPayments.test.ts`, `loanSplit.test.ts`,
  `cashflowSplit.test.ts`, `reportsSplit.test.ts`, `tests/unit/ipc/patrimoineMatch.test.ts`.

---

## Task 1: Migration 022 — link column + seed category

**Files:**

- Create: `src/main/db/migrations/022_loan_payment_link.sql`
- Modify: `src/main/db/migrate.ts`
- Test: `tests/unit/patrimoine/migration022.test.ts`

- [ ] **Step 1: Write the migration**

Create `src/main/db/migrations/022_loan_payment_link.sql`:

```sql
-- Migration 022 — link a transaction to the amortization installment it pays,
-- and seed the "Intérêts d'emprunt" category. The link drives the report-time
-- decomposition (interest+insurance = expense, capital = neutralized). It lives
-- on the transaction row, so deleting the transaction drops the link; ON DELETE
-- SET NULL reverts the transaction to a full expense if the installment goes.

ALTER TABLE transactions
  ADD COLUMN loan_installment_id TEXT
  REFERENCES loan_installments(id) ON DELETE SET NULL;

CREATE INDEX idx_transactions_loan_installment ON transactions(loan_installment_id);

INSERT OR IGNORE INTO categories (id, parent_id, name, icon, color, is_default, position)
VALUES ('cat-interets-emprunt', NULL, 'Intérêts d''emprunt', 'bank', '#C58B5C', 1, 11);
```

- [ ] **Step 2: Register it**

In `src/main/db/migrate.ts`, add after the `sql021` import:

```ts
import sql022 from './migrations/022_loan_payment_link.sql?raw';
```

And after the `{ version: 21, sql: sql021 }` entry:

```ts
  { version: 22, sql: sql022 },
```

- [ ] **Step 3: Write the test**

Create `tests/unit/patrimoine/migration022.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

describe('migration 022', () => {
  it('adds transactions.loan_installment_id', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const cols = (db.prepare('PRAGMA table_info(transactions)').all() as { name: string }[]).map(
      (r) => r.name,
    );
    expect(cols).toContain('loan_installment_id');
    db.close();
  });

  it('seeds the "Intérêts d\'emprunt" category', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const row = db
      .prepare("SELECT name, color FROM categories WHERE id = 'cat-interets-emprunt'")
      .get() as { name: string; color: string } | undefined;
    expect(row?.name).toBe("Intérêts d'emprunt");
    expect(row?.color).toBe('#C58B5C');
    db.close();
  });
});
```

- [ ] **Step 4: Run** — `npx vitest run tests/unit/patrimoine/migration022.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/db/migrations/022_loan_payment_link.sql src/main/db/migrate.ts tests/unit/patrimoine/migration022.test.ts
git commit -m "feat(patrimoine): add loan-payment link column and Intérêts d'emprunt category (migration 022)"
```

---

## Task 2: DashboardTransaction.loanSplit + the query join

**Files:**

- Modify: `src/shared/types/dashboard.ts`, `src/main/dashboard/queries.ts`
- Test: `tests/unit/patrimoine/loanSplitQuery.test.ts`

- [ ] **Step 1: Add the DTO field**

In `src/shared/types/dashboard.ts`, inside `interface DashboardTransaction` (after `userModified`):

```ts
  /** When this transaction is matched to a loan installment, the split of its
   *  amount: interest+insurance (the true expense) and capital (neutralized).
   *  Null when unmatched. */
  readonly loanSplit: { readonly interestInsurance: number; readonly capital: number } | null;
```

- [ ] **Step 2: Write the failing test**

Create `tests/unit/patrimoine/loanSplitQuery.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { getTransactions } from '../../../src/main/dashboard/queries';
import { saveLoan } from '../../../src/main/patrimoine/loanRepo';
import type { ParsedLoanTable } from '@shared/types/patrimoine';

const PARSED: ParsedLoanTable = {
  name: 'P',
  loanNumber: null,
  principal: 1000,
  nominalRate: 1,
  termMonths: 1,
  startDate: '2026-01-01',
  totals: { capital: 1000, interest: 0, insurance: 0 },
  installments: [
    {
      seq: 1,
      dueDate: '2026-01-05',
      capital: 685.43,
      interest: 214.57,
      insurance: 48.56,
      fees: 0,
      payment: 948.56,
      balanceAfter: 314.57,
    },
  ],
};

describe('getTransactions loanSplit', () => {
  it('fills loanSplit for a matched transaction and leaves others null', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const loanId = saveLoan(db, { parsed: PARSED, name: 'P', share: 1 });
    const inst = db.prepare('SELECT id FROM loan_installments WHERE loan_id = ?').get(loanId) as {
      id: string;
    };
    db.prepare(
      "INSERT INTO transactions (id, account_id, tx_hash, date, amount, label_raw, label_clean, loan_installment_id) VALUES ('m','acc-lcl-default','h1','2026-01-05',-948.56,'PRET','PRET',?)",
    ).run(inst.id);
    db.prepare(
      "INSERT INTO transactions (id, account_id, tx_hash, date, amount, label_raw, label_clean) VALUES ('o','acc-lcl-default','h2','2026-01-06',-20,'X','X')",
    ).run();

    const txns = getTransactions(db, {});
    const matched = txns.find((t) => t.id === 'm');
    const other = txns.find((t) => t.id === 'o');
    expect(matched?.loanSplit).toEqual({ interestInsurance: 263.13, capital: 685.43 });
    expect(other?.loanSplit).toBeNull();
    db.close();
  });
});
```

(`acc-lcl-default` is the account seeded by migration 003.)

- [ ] **Step 3: Run it** — `npx vitest run tests/unit/patrimoine/loanSplitQuery.test.ts` → FAIL.

- [ ] **Step 4: Implement the join**

In `src/main/dashboard/queries.ts`, in `getTransactions`, extend the SELECT to join the installment and add the columns, and the `TransactionRow` interface accordingly. Replace the `SELECT … FROM transactions t LEFT JOIN categories c …` with:

```ts
      `SELECT t.id, t.account_id, t.date, t.amount, t.label_raw, t.label_clean,
              t.category_id, c.name AS category_name, c.color AS category_color,
              c.icon AS category_icon,
              t.original_date, t.original_amount, t.edited_at,
              t.is_internal_transfer, t.user_modified,
              t.loan_installment_id,
              li.interest AS li_interest, li.insurance AS li_insurance
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       LEFT JOIN loan_installments li ON li.id = t.loan_installment_id
       ${whereSql}
       ORDER BY t.date DESC, t.id DESC
       LIMIT ?`,
```

Add to the `TransactionRow` interface (find it near the top of the file) these fields:

```ts
loan_installment_id: string | null;
li_interest: number | null;
li_insurance: number | null;
```

In the `.map((r) => ({ … }))`, add the `loanSplit` field (round to the cent; capital is the remainder so the parts always sum to the debit):

```ts
    loanSplit:
      r.loan_installment_id !== null && r.li_interest !== null && r.li_insurance !== null
        ? {
            interestInsurance: Math.round((r.li_interest + r.li_insurance) * 100) / 100,
            capital:
              Math.round((Math.abs(r.amount) - (r.li_interest + r.li_insurance)) * 100) / 100,
          }
        : null,
```

- [ ] **Step 5: Run it** — `npx vitest run tests/unit/patrimoine/loanSplitQuery.test.ts && npx tsc --noEmit` → PASS, clean. Then run the existing transactions/dashboard tests so the DTO change didn't break a literal: `npx vitest run tests/unit/dashboard tests/unit/renderer/TransactionsPage.test.tsx` — fix any `DashboardTransaction` literal that now needs `loanSplit: null` (e.g. test factories).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(patrimoine): expose loanSplit on matched transactions"
```

---

## Task 3: Matching engine

**Files:**

- Create: `src/main/patrimoine/matchPayments.ts`
- Test: `tests/unit/patrimoine/matchPayments.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/patrimoine/matchPayments.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { saveLoan } from '../../../src/main/patrimoine/loanRepo';
import {
  matchLoanPayments,
  unlinkPayment,
  loanMatchCount,
} from '../../../src/main/patrimoine/matchPayments';
import type { ParsedLoanTable } from '@shared/types/patrimoine';

// Two installments with DIFFERENT payments (a palier) so matching is by exact amount.
const PARSED: ParsedLoanTable = {
  name: 'P',
  loanNumber: 'LN1',
  principal: 2000,
  nominalRate: 1,
  termMonths: 2,
  startDate: '2026-01-01',
  totals: { capital: 2000, interest: 0, insurance: 0 },
  installments: [
    {
      seq: 1,
      dueDate: '2026-01-05',
      capital: 900,
      interest: 40,
      insurance: 8.56,
      fees: 0,
      payment: 948.56,
      balanceAfter: 1100,
    },
    {
      seq: 2,
      dueDate: '2026-02-05',
      capital: 905,
      interest: 35,
      insurance: 8.56,
      fees: 0,
      payment: 948.56,
      balanceAfter: 195,
    },
  ],
};

function tx(db: DatabaseSync, id: string, date: string, amount: number): void {
  db.prepare(
    "INSERT INTO transactions (id, account_id, tx_hash, date, amount, label_raw, label_clean) VALUES (?, 'acc-lcl-default', ?, ?, ?, 'PRET', 'PRET')",
  ).run(id, id, date, amount);
}

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  return db;
}

describe('matchLoanPayments', () => {
  it('links debits to installments by amount within the date window', () => {
    const db = freshDb();
    const loanId = saveLoan(db, { parsed: PARSED, name: 'P', share: 1 });
    tx(db, 't1', '2026-01-06', -948.56); // 1 day after due → matches installment 1
    tx(db, 't2', '2026-02-04', -948.56); // 1 day before → matches installment 2
    tx(db, 't3', '2026-02-20', -50); // unrelated
    const linked = matchLoanPayments(db, loanId);
    expect(linked).toBe(2);
    expect(loanMatchCount(db, loanId, '2026-03-01')).toEqual({ matched: 2, due: 2 });
    db.close();
  });

  it('leaves a debit unmatched when outside the amount tolerance or date window', () => {
    const db = freshDb();
    const loanId = saveLoan(db, { parsed: PARSED, name: 'P', share: 1 });
    tx(db, 't1', '2026-01-06', -900.0); // wrong amount
    tx(db, 't2', '2026-01-20', -948.56); // 15 days off → outside ±7
    expect(matchLoanPayments(db, loanId)).toBe(0);
    db.close();
  });

  it('is idempotent and one-to-one', () => {
    const db = freshDb();
    const loanId = saveLoan(db, { parsed: PARSED, name: 'P', share: 1 });
    tx(db, 't1', '2026-01-05', -948.56);
    expect(matchLoanPayments(db, loanId)).toBe(1);
    expect(matchLoanPayments(db, loanId)).toBe(0); // already linked, no double
    db.close();
  });

  it('unlinks a payment', () => {
    const db = freshDb();
    const loanId = saveLoan(db, { parsed: PARSED, name: 'P', share: 1 });
    tx(db, 't1', '2026-01-05', -948.56);
    matchLoanPayments(db, loanId);
    unlinkPayment(db, 't1');
    expect(loanMatchCount(db, loanId, '2026-03-01').matched).toBe(0);
    db.close();
  });
});
```

- [ ] **Step 2: Run it** — FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/main/patrimoine/matchPayments.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite';

/** Max euro gap between a debit and an installment payment to call them the same. */
const AMOUNT_TOLERANCE = 0.02;
/** Max day gap between the debit date and the installment due date. */
const DATE_WINDOW_DAYS = 7;

interface InstRow {
  id: string;
  due_date: string;
  payment: number;
}
interface TxRow {
  id: string;
  date: string;
  amount: number;
}

function dayDiff(a: string, b: string): number {
  return Math.abs((Date.parse(a) - Date.parse(b)) / 86_400_000);
}

/**
 * Link this loan's still-unmatched debits to its installments by amount + date.
 * Deterministic, idempotent, one transaction ↔ one installment. Returns the
 * number of new links.
 */
export function matchLoanPayments(db: DatabaseSync, loanId: string): number {
  const installments = db
    .prepare(
      `SELECT id, due_date, payment FROM loan_installments
       WHERE loan_id = ? ORDER BY due_date ASC`,
    )
    .all(loanId) as unknown as InstRow[];
  const link = db.prepare('UPDATE transactions SET loan_installment_id = ? WHERE id = ?');
  const used = new Set<string>();
  let count = 0;

  for (const inst of installments) {
    const candidates = db
      .prepare(
        `SELECT id, date, amount FROM transactions
         WHERE loan_installment_id IS NULL
           AND ABS(amount + ?) <= ?
         ORDER BY date ASC`,
      )
      .all(inst.payment, AMOUNT_TOLERANCE) as unknown as TxRow[];
    const best = candidates
      .filter((t) => !used.has(t.id) && dayDiff(t.date, inst.due_date) <= DATE_WINDOW_DAYS)
      .sort((a, b) => dayDiff(a.date, inst.due_date) - dayDiff(b.date, inst.due_date))[0];
    if (best) {
      link.run(inst.id, best.id);
      used.add(best.id);
      count += 1;
    }
  }
  return count;
}

export function unlinkPayment(db: DatabaseSync, transactionId: string): void {
  db.prepare('UPDATE transactions SET loan_installment_id = NULL WHERE id = ?').run(transactionId);
}

/** Matched count and the number of installments already due — for the loan card. */
export function loanMatchCount(
  db: DatabaseSync,
  loanId: string,
  todayIso: string,
): { matched: number; due: number } {
  const matched = (
    db
      .prepare(
        `SELECT COUNT(*) c FROM transactions t
         JOIN loan_installments li ON li.id = t.loan_installment_id
         WHERE li.loan_id = ?`,
      )
      .get(loanId) as { c: number }
  ).c;
  const due = (
    db
      .prepare(`SELECT COUNT(*) c FROM loan_installments WHERE loan_id = ? AND due_date <= ?`)
      .get(loanId, todayIso) as { c: number }
  ).c;
  return { matched, due };
}
```

- [ ] **Step 4: Run** — `npx vitest run tests/unit/patrimoine/matchPayments.test.ts && npx tsc --noEmit && npx eslint src/main/patrimoine/matchPayments.ts` → all clean.

- [ ] **Step 5: Commit**

```bash
git add src/main/patrimoine/matchPayments.ts tests/unit/patrimoine/matchPayments.test.ts
git commit -m "feat(patrimoine): match loan debits to installments by amount and date"
```

---

## Task 4: The decomposition helper (renderer)

**Files:**

- Create: `src/renderer/lib/loanSplit.ts`
- Test: `tests/unit/renderer/loanSplit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/renderer/loanSplit.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { toAccountingRows, INTEREST_LOAN_CATEGORY } from '../../../src/renderer/lib/loanSplit';
import type { DashboardTransaction } from '@shared/types/dashboard';

function base(over: Partial<DashboardTransaction>): DashboardTransaction {
  return {
    id: 't',
    accountId: 'a',
    date: '2026-01-05',
    amount: -948.56,
    labelRaw: 'PRET',
    labelClean: 'PRET',
    categoryId: 'cat-logement',
    categoryName: 'Logement',
    categoryColor: '#888',
    categoryIcon: 'home',
    originalDate: null,
    originalAmount: null,
    editedAt: null,
    isInternalTransfer: false,
    userModified: false,
    loanSplit: null,
    ...over,
  };
}

describe('toAccountingRows', () => {
  it('returns the row unchanged when not a matched loan payment', () => {
    const t = base({});
    expect(toAccountingRows(t)).toEqual([t]);
  });

  it('expands a matched payment into an interest expense + a neutralized capital row', () => {
    const t = base({ loanSplit: { interestInsurance: 263.13, capital: 685.43 } });
    const [interest, capital] = toAccountingRows(t);
    expect(interest?.amount).toBe(-263.13);
    expect(interest?.categoryId).toBe(INTEREST_LOAN_CATEGORY.id);
    expect(interest?.categoryName).toBe(INTEREST_LOAN_CATEGORY.name);
    expect(interest?.isInternalTransfer).toBe(false);
    expect(capital?.amount).toBe(-685.43);
    expect(capital?.isInternalTransfer).toBe(true); // neutralized like a transfer
    // The parts conserve the original debit.
    expect((interest?.amount ?? 0) + (capital?.amount ?? 0)).toBeCloseTo(-948.56, 2);
  });
});
```

- [ ] **Step 2: Run it** — FAIL.

- [ ] **Step 3: Implement**

Create `src/renderer/lib/loanSplit.ts`:

```ts
import type { DashboardTransaction } from '@shared/types/dashboard';

/** The seeded category for the interest+insurance part of a loan payment.
 *  Mirrors migration 022 (a test asserts they stay in sync). */
export const INTEREST_LOAN_CATEGORY = {
  id: 'cat-interets-emprunt',
  name: "Intérêts d'emprunt",
  color: '#C58B5C',
} as const;

/**
 * Expand a matched loan payment into the rows the reports should actually count:
 * an "Intérêts d'emprunt" expense (interest+insurance) and a transfer-flagged
 * capital row (neutralized — it builds equity, it is not spending). Unmatched
 * transactions pass through unchanged. The two parts conserve the debit.
 */
export function toAccountingRows(t: DashboardTransaction): DashboardTransaction[] {
  if (t.loanSplit === null) return [t];
  const { interestInsurance, capital } = t.loanSplit;
  return [
    {
      ...t,
      amount: -interestInsurance,
      categoryId: INTEREST_LOAN_CATEGORY.id,
      categoryName: INTEREST_LOAN_CATEGORY.name,
      categoryColor: INTEREST_LOAN_CATEGORY.color,
      isInternalTransfer: false,
      loanSplit: null,
    },
    {
      ...t,
      amount: -capital,
      categoryId: 'cat-transferts',
      categoryName: 'Transferts internes',
      isInternalTransfer: true,
      loanSplit: null,
    },
  ];
}
```

- [ ] **Step 4: Run** — `npx vitest run tests/unit/renderer/loanSplit.test.ts && npx tsc --noEmit` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/lib/loanSplit.ts tests/unit/renderer/loanSplit.test.ts
git commit -m "feat(patrimoine): add the loan-payment decomposition helper"
```

---

## Task 5: Apply the split to the JS report aggregators

**Files:**

- Modify: `src/renderer/lib/reports.ts`
- Test: `tests/unit/renderer/reportsSplit.test.ts`

`periodTotals`, `dailyFlow`, `topCategories`, `categoryBreakdown` all already skip transfers via `counts(t) = !isTransferTx(t)`. Feed them the decomposed rows so the capital part is excluded and the interest part lands under "Intérêts d'emprunt". `biggestMovements` keeps the original rows.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/renderer/reportsSplit.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { periodTotals, topCategories } from '../../../src/renderer/lib/reports';
import type { DashboardTransaction } from '@shared/types/dashboard';

function base(over: Partial<DashboardTransaction>): DashboardTransaction {
  return {
    id: 't',
    accountId: 'a',
    date: '2026-01-05',
    amount: -948.56,
    labelRaw: 'PRET',
    labelClean: 'PRET',
    categoryId: 'cat-logement',
    categoryName: 'Logement',
    categoryColor: '#888',
    categoryIcon: 'home',
    originalDate: null,
    originalAmount: null,
    editedAt: null,
    isInternalTransfer: false,
    userModified: false,
    loanSplit: null,
    ...over,
  };
}

describe('reports with a matched loan payment', () => {
  it('counts only interest+insurance as expense, not the full debit', () => {
    const matched = base({ id: 'm', loanSplit: { interestInsurance: 263.13, capital: 685.43 } });
    const { expense } = periodTotals([matched]);
    expect(expense).toBeCloseTo(-263.13, 2); // not -948.56
  });

  it("attributes the interest to the Intérêts d'emprunt category", () => {
    const matched = base({ id: 'm', loanSplit: { interestInsurance: 263.13, capital: 685.43 } });
    const top = topCategories([matched]);
    expect(top[0]?.name).toBe("Intérêts d'emprunt");
    expect(top[0]?.total).toBeCloseTo(263.13, 2);
  });

  it('is a no-op for unmatched transactions', () => {
    const plain = base({ id: 'p', amount: -20, loanSplit: null });
    expect(periodTotals([plain]).expense).toBeCloseTo(-20, 2);
  });
});
```

- [ ] **Step 2: Run it** — FAIL (full debit counted).

- [ ] **Step 3: Implement**

In `src/renderer/lib/reports.ts`, add the import at the top:

```ts
import { toAccountingRows } from './loanSplit';
```

Then in each of `periodTotals`, `dailyFlow`, `topCategories`, `categoryBreakdown`, change the loop source from `txns` to `txns.flatMap(toAccountingRows)`. Concretely:

- `periodTotals`: `for (const t of txns.flatMap(toAccountingRows)) {`
- `dailyFlow`: `for (const t of txns.flatMap(toAccountingRows)) {`
- `topCategories`: `for (const tx of txns.flatMap(toAccountingRows)) {`
- `categoryBreakdown`: `for (const t of txns.flatMap(toAccountingRows)) {`

Leave `biggestMovements`, `countableTransactions`, `txInPeriod` untouched (they list/inspect real transactions, not aggregate spend).

- [ ] **Step 4: Run** — `npx vitest run tests/unit/renderer/reportsSplit.test.ts tests/unit/renderer/reports.test.ts && npx tsc --noEmit` → PASS (new + existing reports tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/lib/reports.ts tests/unit/renderer/reportsSplit.test.ts
git commit -m "feat(patrimoine): decompose matched loan payments in the JS reports"
```

---

## Task 6: Apply the split to the SQL consolidated cashflow

**Files:**

- Modify: `src/main/dashboard/consolidated.ts`
- Test: `tests/unit/patrimoine/cashflowSplit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/patrimoine/cashflowSplit.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { getConsolidatedCashflow } from '../../../src/main/dashboard/consolidated';
import { saveLoan } from '../../../src/main/patrimoine/loanRepo';
import type { ParsedLoanTable } from '@shared/types/patrimoine';

const PARSED: ParsedLoanTable = {
  name: 'P',
  loanNumber: null,
  principal: 1000,
  nominalRate: 1,
  termMonths: 1,
  startDate: '2026-01-01',
  totals: { capital: 1000, interest: 0, insurance: 0 },
  installments: [
    {
      seq: 1,
      dueDate: '2026-01-05',
      capital: 685.43,
      interest: 214.57,
      insurance: 48.56,
      fees: 0,
      payment: 948.56,
      balanceAfter: 314.57,
    },
  ],
};

describe('getConsolidatedCashflow with a matched loan payment', () => {
  it('counts interest+insurance as the month expense, not the full debit', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const loanId = saveLoan(db, { parsed: PARSED, name: 'P', share: 1 });
    const inst = db.prepare('SELECT id FROM loan_installments WHERE loan_id = ?').get(loanId) as {
      id: string;
    };
    db.prepare(
      "INSERT INTO transactions (id, account_id, tx_hash, date, amount, label_raw, label_clean, loan_installment_id) VALUES ('m','acc-lcl-default','h','2026-01-05',-948.56,'PRET','PRET',?)",
    ).run(inst.id);

    const series = getConsolidatedCashflow(db, 'month');
    const jan = series.find((p) => p.period === '2026-01');
    expect(jan?.expense).toBeCloseTo(-263.13, 2); // not -948.56
    db.close();
  });
});
```

- [ ] **Step 2: Run it** — FAIL (full -948.56 counted).

- [ ] **Step 3: Implement**

In `src/main/dashboard/consolidated.ts`, rewrite the query inside `getConsolidatedCashflow` to LEFT JOIN the installment and special-case matched rows (a matched row contributes `−(interest+insurance)` to expense, nothing to income; the capital part is simply never added). Replace the `db.prepare(...)` SQL with:

```ts
      `SELECT ${periodExpr} AS period,
              COALESCE(SUM(CASE
                WHEN loan_installment_id IS NULL AND ${INCOME_ROW} THEN amount ELSE 0 END), 0) AS income,
              COALESCE(SUM(CASE
                WHEN loan_installment_id IS NOT NULL THEN -(li.interest + li.insurance)
                WHEN ${EXPENSE_ROW} THEN amount
                ELSE 0 END), 0) AS expense
       FROM transactions t
       LEFT JOIN loan_installments li ON li.id = t.loan_installment_id
       GROUP BY period
       ORDER BY period ASC`,
```

Note: `INCOME_ROW` / `EXPENSE_ROW` reference bare `amount` / `category_id` / `is_internal_transfer`; these stay unambiguous after the join (`loan_installments` has none of those columns). `periodExpr` already uses `substr(date, 1, 7|4)` on the (single) `date` column — keep it; if SQLite complains about ambiguity, qualify it as `substr(t.date, …)`.

- [ ] **Step 4: Run** — `npx vitest run tests/unit/patrimoine/cashflowSplit.test.ts tests/unit/dashboard/consolidated.test.ts` → PASS (new + existing; existing rows are all unmatched so unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/main/dashboard/consolidated.ts tests/unit/patrimoine/cashflowSplit.test.ts
git commit -m "feat(patrimoine): decompose matched loan payments in the consolidated cashflow"
```

---

## Task 7: IPC — detect / unlink / counts

**Files:**

- Modify: `src/main/ipc/channels.ts`, `src/shared/types/ipc.ts`, `src/main/ipc/register.ts`, `src/main/ipc/handlers/patrimoine.ts`
- Test: `tests/unit/ipc/patrimoineMatch.test.ts`

- [ ] **Step 1: Channels** — in `src/main/ipc/channels.ts`, before the closing `} as const`:

```ts
  patrimoineDetectPayments: 'patrimoine:detectPayments',
  patrimoineUnlinkPayment: 'patrimoine:unlinkPayment',
```

- [ ] **Step 2: Contract** — in `src/shared/types/ipc.ts`, inside `IpcContract`:

```ts
  'patrimoine:detectPayments': { payload: { loanId: string }; response: { matched: number } };
  'patrimoine:unlinkPayment': { payload: { transactionId: string }; response: { ok: true } };
```

- [ ] **Step 3: Handlers** — in `src/main/ipc/handlers/patrimoine.ts`, add the import and handlers:

```ts
import { matchLoanPayments, unlinkPayment } from '../../patrimoine/matchPayments';
```

```ts
export function handlePatrimoineDetectPayments(payload: { loanId: string }): { matched: number } {
  return { matched: matchLoanPayments(getDb(), payload.loanId) };
}

export function handlePatrimoineUnlinkPayment(payload: { transactionId: string }): { ok: true } {
  unlinkPayment(getDb(), payload.transactionId);
  return { ok: true };
}
```

Also extend `handlePatrimoineListLoans` so the card has its match counts. Add the import:

```ts
import { loanMatchCount } from '../../patrimoine/matchPayments';
```

and change it to attach counts (the renderer type for this is added in Task 8 — for now return the extra field):

```ts
export function handlePatrimoineListLoans() {
  const db = getDb();
  const today = todayIso();
  return {
    loans: listLoans(db, today).map((l) => ({ ...l, match: loanMatchCount(db, l.id, today) })),
  };
}
```

- [ ] **Step 4: Register** — in `src/main/ipc/register.ts`, add to the patrimoine import block `handlePatrimoineDetectPayments, handlePatrimoineUnlinkPayment`; add to `MUTATING_CHANNELS`:

```ts
  'patrimoine:detectPayments',
  'patrimoine:unlinkPayment',
```

and inside `registerAllHandlers()`:

```ts
register(CHANNELS.patrimoineDetectPayments, handlePatrimoineDetectPayments);
register(CHANNELS.patrimoineUnlinkPayment, handlePatrimoineUnlinkPayment);
```

- [ ] **Step 5: Add `match` to `LoanWithStats`** — in `src/shared/types/patrimoine.ts`, add to `LoanWithStats`:

```ts
match: {
  matched: number;
  due: number;
}
```

(`listLoans` doesn't set it; the handler does. To keep `listLoans` returning `LoanWithStats`, instead add `match` in `loanRepo.listLoans` by calling `loanMatchCount`. Simpler: move the `loanMatchCount` call into `listLoans` and drop the `.map` in the handler. Do that: import `loanMatchCount` into `loanRepo.ts` and set `match: loanMatchCount(db, l.id, todayIso)` in the returned object; revert the handler to `return { loans: listLoans(getDb(), todayIso()) };`.)

- [ ] **Step 6: Test**

Create `tests/unit/ipc/patrimoineMatch.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

const db = new DatabaseSync(':memory:');
runMigrations(db);
vi.mock('../../../src/main/db', () => ({ getDb: () => db }));

const { handlePatrimoineDetectPayments, handlePatrimoineUnlinkPayment } =
  await import('../../../src/main/ipc/handlers/patrimoine');
const { saveLoan } = await import('../../../src/main/patrimoine/loanRepo');

beforeEach(() => {
  db.exec('DELETE FROM transactions; DELETE FROM loans;');
});

describe('patrimoine match handlers', () => {
  it('detects and unlinks a loan payment', () => {
    const loanId = saveLoan(db, {
      name: 'P',
      share: 1,
      parsed: {
        name: 'P',
        loanNumber: null,
        principal: 1000,
        nominalRate: 1,
        termMonths: 1,
        startDate: '2026-01-01',
        totals: { capital: 1000, interest: 0, insurance: 0 },
        installments: [
          {
            seq: 1,
            dueDate: '2026-01-05',
            capital: 900,
            interest: 40,
            insurance: 8.56,
            fees: 0,
            payment: 948.56,
            balanceAfter: 100,
          },
        ],
      },
    });
    db.prepare(
      "INSERT INTO transactions (id, account_id, tx_hash, date, amount, label_raw, label_clean) VALUES ('m','acc-lcl-default','h','2026-01-05',-948.56,'PRET','PRET')",
    ).run();
    expect(handlePatrimoineDetectPayments({ loanId }).matched).toBe(1);
    expect(handlePatrimoineUnlinkPayment({ transactionId: 'm' })).toEqual({ ok: true });
    expect(handlePatrimoineDetectPayments({ loanId }).matched).toBe(1); // re-detectable after unlink
    void loanId;
  });
});
```

- [ ] **Step 7: Run** — `npx vitest run tests/unit/ipc/patrimoineMatch.test.ts && npx tsc --noEmit && npx eslint src/main` → all clean. Update the `LoanCard.test.tsx` / `patrimoine.test.ts` `LoanWithStats` literal(s) to include `match: { matched: 0, due: 0 }`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(patrimoine): IPC to detect/unlink loan payments and expose match counts"
```

---

## Task 8: Transaction-list badge

**Files:**

- Modify: `src/renderer/components/dashboard/TxTable.tsx`
- Test: `tests/unit/renderer/TxTableLoanBadge.test.tsx`

The category cell of a matched row (`row.loanSplit !== null`) shows a badge instead of the category picker. The `TxTableRow` receives a `DashboardTransaction`-derived row; confirm it carries `loanSplit` (the row mapping in `dashboardMap.ts` may need to pass it through).

- [ ] **Step 1: Ensure the row carries `loanSplit`** — in `src/renderer/lib/dashboardMap.ts`, the `toTxRow` mapper: add `loanSplit: t.loanSplit` to the returned object, and add `loanSplit` to the `TxRow` type it produces (and that `TxTable` consumes). If `TxTable` consumes `DashboardTransaction` directly, skip.

- [ ] **Step 2: Write the failing test**

Create `tests/unit/renderer/TxTableLoanBadge.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TxTableRow } from '../../../src/renderer/components/dashboard/TxTable';
import type { TxRow } from '../../../src/renderer/lib/dashboardMap';

afterEach(() => {
  cleanup();
});

const row: TxRow = {
  id: 'm',
  date: '2026-01-05',
  label: 'PRET IMMOBILIER',
  amount: -948.56,
  categoryId: 'cat-logement',
  categoryName: 'Logement',
  categoryColor: '#888',
  categoryIcon: 'home',
  loanSplit: { interestInsurance: 263.13, capital: 685.43 },
};

describe('TxTableRow loan badge', () => {
  it('shows the split badge for a matched loan payment', () => {
    render(
      <table>
        <tbody>
          <TxTableRow row={row} categories={[]} />
        </tbody>
      </table>,
    );
    expect(screen.getByText(/mensualité prêt/i)).toBeInTheDocument();
  });
});
```

(Match the real `TxRow` shape and `TxTableRow` required props — open `dashboardMap.ts` and `TxTable.tsx` and fill the literal/props exactly; the assert is the only behavioural check.)

- [ ] **Step 3: Run it** — FAIL.

- [ ] **Step 4: Implement** — in `TxTable.tsx`, in the category cell, branch on `row.loanSplit`:

```tsx
{row.loanSplit ? (
  <span className="inline-flex items-center gap-1.5 rounded-md border border-line-2 bg-ink-2 px-2 py-0.5 font-sans text-[11px] text-paper-soft">
    <Landmark size={12} strokeWidth={1.8} className="text-brass" />
    Mensualité prêt · int. {formatAmount(row.loanSplit.interestInsurance)} · cap.{' '}
    {formatAmount(row.loanSplit.capital)}
  </span>
) : (
  /* …existing category picker / chip… */
)}
```

Import `Landmark` from `lucide-react` and `formatAmount` from `@renderer/lib/euro`. (An unlink control can live in the loan card; keep the row read-only here to avoid widening `TxTableRow`'s props.)

- [ ] **Step 5: Run** — `npx vitest run tests/unit/renderer/TxTableLoanBadge.test.tsx && npx tsc --noEmit` → PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(patrimoine): badge matched loan payments in the transaction list"
```

---

## Task 9: Loan card — match counter, detect, unlink

**Files:**

- Modify: `src/renderer/components/patrimoine/LoanCard.tsx`, `src/renderer/hooks/usePatrimoine.ts`, `src/renderer/pages/PatrimoinePage.tsx`

- [ ] **Step 1: Hook actions** — in `src/renderer/hooks/usePatrimoine.ts`, add:

```ts
const detectPayments = useCallback(
  async (loanId: string) => {
    const { matched } = await ipc.invoke('patrimoine:detectPayments', { loanId });
    reload();
    return matched;
  },
  [reload],
);
```

and return `detectPayments` from the hook.

- [ ] **Step 2: LoanCard UI** — add to `LoanCard`'s props `onDetect: (id: string) => void`, and a Stat-row line showing `loan.match.matched / loan.match.due mensualités appariées` plus a small "Détecter" `Button` (variant `ghost`, size `sm`) calling `onDetect(loan.id)`. Use `lib/euro` for any amount (none needed here). Keep it inside the existing stats grid or just below it.

- [ ] **Step 3: Wire it** — in `PatrimoinePage.tsx`, pass `onDetect={(id) => { void detectPayments(id).then(notifyDataChanged); }}` to each `LoanCard`, pulling `detectPayments` from `usePatrimoine`.

- [ ] **Step 4: Verify** — `npx tsc --noEmit && npx eslint src/renderer && npm run build`. Update `LoanCard.test.tsx` fixture (`match`) and add `onDetect={vi.fn()}` to its renders.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(patrimoine): detect/relink loan payments from the loan card"
```

---

## Task 10: Auto-detect after import

**Files:**

- Modify: `src/main/ipc/handlers/importConfirm.ts` (or the import-confirm service it calls)
- Test: `tests/unit/patrimoine/autoDetectOnImport.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/patrimoine/autoDetectOnImport.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { saveLoan } from '../../../src/main/patrimoine/loanRepo';
import { matchAllLoans } from '../../../src/main/patrimoine/matchPayments';
import type { ParsedLoanTable } from '@shared/types/patrimoine';

const PARSED: ParsedLoanTable = {
  name: 'P',
  loanNumber: null,
  principal: 1000,
  nominalRate: 1,
  termMonths: 1,
  startDate: '2026-01-01',
  totals: { capital: 1000, interest: 0, insurance: 0 },
  installments: [
    {
      seq: 1,
      dueDate: '2026-01-05',
      capital: 900,
      interest: 40,
      insurance: 8.56,
      fees: 0,
      payment: 948.56,
      balanceAfter: 100,
    },
  ],
};

describe('matchAllLoans', () => {
  it('matches debits across every loan', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    saveLoan(db, { parsed: PARSED, name: 'P', share: 1 });
    db.prepare(
      "INSERT INTO transactions (id, account_id, tx_hash, date, amount, label_raw, label_clean) VALUES ('m','acc-lcl-default','h','2026-01-05',-948.56,'PRET','PRET')",
    ).run();
    expect(matchAllLoans(db)).toBe(1);
    db.close();
  });
});
```

- [ ] **Step 2: Run it** — FAIL (`matchAllLoans` not found).

- [ ] **Step 3: Implement** — add to `src/main/patrimoine/matchPayments.ts`:

```ts
/** Run matching for every loan (used after an import). Returns total new links. */
export function matchAllLoans(db: DatabaseSync): number {
  const ids = db.prepare('SELECT id FROM loans').all() as unknown as { id: string }[];
  return ids.reduce((sum, { id }) => sum + matchLoanPayments(db, id), 0);
}
```

- [ ] **Step 4: Call it after import** — in `src/main/ipc/handlers/importConfirm.ts`, after the import successfully inserts transactions (just before building the success response), call `matchAllLoans(getDb())`. Read the file first to place it after the insert and inside the same DB; import `matchAllLoans`. It is best-effort: wrap in `try { matchAllLoans(getDb()); } catch { /* matching is non-critical to the import */ }`.

- [ ] **Step 5: Run** — `npx vitest run tests/unit/patrimoine/autoDetectOnImport.test.ts && npx tsc --noEmit` → PASS. Run the existing import-confirm tests too: `npx vitest run tests/unit/import`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(patrimoine): auto-detect loan payments after an import"
```

---

## Task 11: Sync-in-sync constant check + docs + full gate

**Files:**

- Create: `tests/unit/patrimoine/categoryConstantSync.test.ts`
- Modify: `README.md`, the spec status line.

- [ ] **Step 1: Guard the seed/constant duplication**

Create `tests/unit/patrimoine/categoryConstantSync.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { INTEREST_LOAN_CATEGORY } from '../../../src/renderer/lib/loanSplit';

describe("Intérêts d'emprunt category stays in sync", () => {
  it('matches the seeded row (migration 022)', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const row = db
      .prepare('SELECT id, name, color FROM categories WHERE id = ?')
      .get(INTEREST_LOAN_CATEGORY.id) as { id: string; name: string; color: string } | undefined;
    expect(row).toEqual({
      id: INTEREST_LOAN_CATEGORY.id,
      name: INTEREST_LOAN_CATEGORY.name,
      color: INTEREST_LOAN_CATEGORY.color,
    });
    db.close();
  });
});
```

- [ ] **Step 2: Docs** — in `README.md`, extend the patrimoine bullet: loan monthly payments imported from the bank are split in the reports (interest+insurance = expense under "Intérêts d'emprunt", capital = neutralized savings), auto-matched to the amortization schedule. Set the spec `Status:` line to `implemented`.

- [ ] **Step 3: Full gate**

Run: `npx tsc --noEmit && npx eslint src tests && npx vitest run && npm run build`
Expected: all green. Fix inline.

- [ ] **Step 4: Commit + PR**

```bash
git add -A
git commit -m "test(patrimoine): guard the Intérêts d'emprunt seed/constant sync; docs"
git push -u origin feat/mortgage-reports-split
gh pr create --title "feat(patrimoine): split mortgage payments in reports (brick 2)" --body "Implements docs/superpowers/specs/2026-06-14-mortgage-reports-split-design.md. UI-bearing — maintainer validates in-app before merge."
```

This is UI-bearing: the maintainer validates in-app (import a statement with real mortgage debits, detect, confirm the badge split and the monthly "Intérêts d'emprunt" expense match the amortization table to the cent) **before** merge.

---

## Self-Review Notes

- **Spec coverage:** §2 data model → Task 1; DTO/link surfacing → Task 2; §3 matching + counts → Task 3 (+ IPC Task 7, auto-run Task 10); §4 decomposition rule → the shared helper (Task 4) applied to JS reports (Task 5) and SQL cashflow (Task 6); §5 UI badge → Task 8, loan-card counter/detect → Task 9; §6 edge cases covered by the matcher tests (paliers, tolerance, idempotency) and `ON DELETE SET NULL` (migration 022); §8 testing throughout; the SQL/JS dual-implementation drift risk is mitigated by both being unit-tested against the same figures and the constant-sync test (Task 11).
- **Type consistency:** `loanSplit: { interestInsurance; capital } | null` is defined in Task 2 and consumed unchanged in Tasks 4/5/8. `LoanWithStats.match` added in Task 7 and consumed in Task 9. `matchLoanPayments` / `unlinkPayment` / `loanMatchCount` / `matchAllLoans` signatures consistent across Tasks 3/7/10.
- **Open verifications for the implementer (call out, don't guess):** the exact `TxRow` shape + `TxTableRow` props (Task 8) and whether `dashboardMap.toTxRow` must forward `loanSplit`; whether `getConsolidatedCashflow`'s `periodExpr` needs `t.` qualification after the join (Task 6). Read those files before writing the literal/props.
