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
