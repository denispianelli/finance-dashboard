import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  LoanInput,
  LoanInstallmentDTO,
  LoanWithStats,
  ParsedInstallment,
  ExistingLoanMatch,
} from '@shared/types/patrimoine';

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

function insertInstallments(
  db: DatabaseSync,
  loanId: string,
  installments: readonly ParsedInstallment[],
): void {
  const insert = db.prepare(
    `INSERT INTO loan_installments
       (id, loan_id, seq, due_date, capital, interest, insurance, fees, payment, balance_after)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const i of installments) {
    insert.run(
      randomUUID(),
      loanId,
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
}

export function saveLoan(db: DatabaseSync, input: LoanInput): string {
  const id = randomUUID();
  const { parsed, name, share } = input;
  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO loans
         (id, name, lender, principal, nominal_rate, start_date, term_months, share, loan_number)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      name,
      'LCL',
      parsed.principal,
      parsed.nominalRate,
      parsed.startDate,
      parsed.termMonths,
      share,
      parsed.loanNumber,
    );
    insertInstallments(db, id, parsed.installments);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return id;
}

/**
 * Replace an existing loan's header and schedule from a freshly imported table
 * (same bank loan number — e.g. a renegotiation reissue). Keeps the loan's id so
 * nothing else needs re-linking; the user's name/share come from `input`.
 */
export function replaceLoan(db: DatabaseSync, id: string, input: LoanInput): string {
  const { parsed, name, share } = input;
  db.exec('BEGIN');
  try {
    db.prepare(
      `UPDATE loans
         SET name = ?, principal = ?, nominal_rate = ?, start_date = ?,
             term_months = ?, share = ?, loan_number = ?
       WHERE id = ?`,
    ).run(
      name,
      parsed.principal,
      parsed.nominalRate,
      parsed.startDate,
      parsed.termMonths,
      share,
      parsed.loanNumber,
      id,
    );
    db.prepare('DELETE FROM loan_installments WHERE loan_id = ?').run(id);
    insertInstallments(db, id, parsed.installments);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return id;
}

/** Find an existing loan by bank loan number (the replace-on-reimport key). */
export function findLoanByNumber(db: DatabaseSync, loanNumber: string): ExistingLoanMatch | null {
  const row = db
    .prepare('SELECT id, name, share FROM loans WHERE loan_number = ? LIMIT 1')
    .get(loanNumber) as { id: string; name: string; share: number } | undefined;
  return row ? { id: row.id, name: row.name, share: row.share } : null;
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
    .all(loanId) as unknown as InstallmentRow[];
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
    .all() as unknown as LoanRow[];
  const year = todayIso.slice(0, 4);
  return loans.map((l) => {
    const rows = installments(db, l.id);
    const next = rows.find((r) => r.due_date >= todayIso) ?? null;
    const remaining = rows.filter((r) => r.due_date >= todayIso);
    const thisYear = rows.filter((r) => r.due_date.slice(0, 4) === year);
    const remainingCost = round2(remaining.reduce((s, r) => s + r.interest, 0));
    const remainingInsurance = round2(remaining.reduce((s, r) => s + r.insurance, 0));
    const interestThisYear = round2(thisYear.reduce((s, r) => s + r.interest, 0));
    const insuranceThisYear = round2(thisYear.reduce((s, r) => s + r.insurance, 0));
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
      insuranceThisYear,
      remainingCost,
      remainingInsurance,
    };
  });
}

export function listInstallments(db: DatabaseSync, loanId: string): LoanInstallmentDTO[] {
  return installments(db, loanId).map(toDto);
}

export function deleteLoan(db: DatabaseSync, id: string): void {
  db.prepare('DELETE FROM loans WHERE id = ?').run(id);
}
