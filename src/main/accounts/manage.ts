import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { AccountSummary, CreateAccountInput } from '@shared/types/dashboard';
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
