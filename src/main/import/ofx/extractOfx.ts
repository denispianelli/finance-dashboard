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
  const openingDate = dates[0];
  const closingDate = dates[dates.length - 1];
  if (openingDate === undefined || closingDate === undefined) {
    throw new ImportError('malformed_ofx');
  }
  return {
    transactions: parsed.transactions.map((t) => ({
      date: t.date,
      label: t.label,
      amount: t.amount,
      fitid: t.fitid,
    })),
    openingBalance: null,
    closingBalance: parsed.ledgerBalance,
    openingDate,
    closingDate,
    bankId,
  };
}
