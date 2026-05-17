import { createHash } from 'node:crypto';
import type { ExtractedTransaction } from './pdf/extractTransactions';

export function normalizeLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function computeTxHash(
  accountId: string,
  date: string,
  amount: number,
  labelRaw: string,
  orderInImport: number,
): string {
  const input = [
    accountId,
    date,
    amount.toFixed(2),
    normalizeLabel(labelRaw),
    String(orderInImport),
  ].join('|');
  return createHash('sha256').update(input).digest('hex');
}

export interface TransactionWithHash {
  date: string;
  label: string;
  amount: number;
  tx_hash: string;
}

export function assignTxHashes(
  accountId: string,
  transactions: ExtractedTransaction[],
): TransactionWithHash[] {
  const counters = new Map<string, number>();
  return transactions.map((tx) => {
    const baseKey = [accountId, tx.date, tx.amount.toFixed(2), normalizeLabel(tx.label)].join('|');
    const orderInImport = counters.get(baseKey) ?? 0;
    counters.set(baseKey, orderInImport + 1);
    return {
      date: tx.date,
      label: tx.label,
      amount: tx.amount,
      tx_hash: computeTxHash(accountId, tx.date, tx.amount, tx.label, orderInImport),
    };
  });
}
