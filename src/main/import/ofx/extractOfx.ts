import type { DatabaseSync } from 'node:sqlite';
import type { NormalizedStatement } from '@shared/types/import';
import { ImportError } from '../importError';
import { parseOfx } from './parseOfx';

export function extractOfx(
  db: DatabaseSync,
  accountId: string,
  content: Buffer,
): NormalizedStatement {
  // OFX is a standardized, bank-agnostic format — parsing does not depend on the
  // bank, so it is NOT gated on a seeded bank (that would block every bank but
  // LCL for no reason). bankId is recorded for traceability only: the account's
  // own label first, else the OFX's BANKID, else "unknown".
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

  const account = db
    .prepare('SELECT bank_id FROM accounts WHERE id = ?')
    .get(accountId) as unknown as { bank_id: string | null } | undefined;
  const bankId = account?.bank_id ?? parsed.bankId ?? 'unknown';

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
