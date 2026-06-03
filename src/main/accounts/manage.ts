import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  AccountSummary,
  CreateAccountInput,
  UpdateAccountInput,
} from '@shared/types/dashboard';
import { getAccountSummaries } from '../dashboard/queries';

/**
 * Create a new account. `type` defaults to 'checking' and currency to 'EUR';
 * bank is an optional free-text label kept for display. Returns the new
 * account's summary (balance 0, no transactions yet).
 */
export function createAccount(db: DatabaseSync, input: CreateAccountInput): AccountSummary {
  const name = input.name.trim();
  if (name === '') throw new Error('createAccount: name is empty');
  const trimmedBank = input.bankId?.trim() ?? '';
  const bankId = trimmedBank === '' ? null : trimmedBank;

  const id = `acc-${randomUUID()}`;
  db.prepare(
    "INSERT INTO accounts (id, name, type, bank_id, currency) VALUES (?, ?, 'checking', ?, 'EUR')",
  ).run(id, name, bankId);

  const created = getAccountSummaries(db).find((a) => a.id === id);
  if (!created) throw new Error('createAccount: account vanished after insert');
  return created;
}

/** Rename an account and update its bank label. Returns the updated summary. */
export function updateAccount(db: DatabaseSync, input: UpdateAccountInput): AccountSummary {
  const name = input.name.trim();
  if (name === '') throw new Error('updateAccount: name is empty');
  const trimmedBank = input.bankId?.trim() ?? '';
  const bankId = trimmedBank === '' ? null : trimmedBank;

  const res = db
    .prepare('UPDATE accounts SET name = ?, bank_id = ? WHERE id = ?')
    .run(name, bankId, input.id);
  if (Number(res.changes) === 0) throw new Error(`updateAccount: account ${input.id} not found`);

  const updated = getAccountSummaries(db).find((a) => a.id === input.id);
  if (!updated) throw new Error('updateAccount: account vanished after update');
  return updated;
}

/**
 * Delete an account and everything anchored to it — its transactions and import
 * records — in a single transaction. Returns how many transactions were removed
 * (for the confirmation message). The cascade is explicit and ordered so it
 * holds whether or not `PRAGMA foreign_keys` is on.
 */
export function deleteAccount(db: DatabaseSync, id: string): { deletedTransactions: number } {
  db.exec('BEGIN');
  try {
    const acc = db.prepare('SELECT id FROM accounts WHERE id = ?').get(id);
    if (!acc) throw new Error(`deleteAccount: account ${id} not found`);
    const res = db.prepare('DELETE FROM transactions WHERE account_id = ?').run(id);
    db.prepare('DELETE FROM imports WHERE account_id = ?').run(id);
    db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
    db.exec('COMMIT');
    return { deletedTransactions: Number(res.changes) };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
