import { createHash } from 'node:crypto';
import type { NormalizedTx } from '@shared/types/import';

export function normalizeLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export type TxHashInput =
  | { kind: 'ofx'; accountId: string; fitid: string }
  | {
      kind: 'pdf';
      accountId: string;
      date: string;
      amount: number;
      label: string;
      order: number;
    };

export function computeTxHash(input: TxHashInput): string {
  const parts =
    input.kind === 'ofx'
      ? [input.accountId, 'ofx', input.fitid]
      : [
          input.accountId,
          input.date,
          input.amount.toFixed(2),
          normalizeLabel(input.label),
          String(input.order),
        ];
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

export interface TransactionWithHash extends NormalizedTx {
  tx_hash: string;
}

export function assignTxHashes(
  accountId: string,
  transactions: NormalizedTx[],
): TransactionWithHash[] {
  const counters = new Map<string, number>();
  return transactions.map((tx) => {
    if (tx.fitid !== null) {
      return { ...tx, tx_hash: computeTxHash({ kind: 'ofx', accountId, fitid: tx.fitid }) };
    }
    const baseKey = [accountId, tx.date, tx.amount.toFixed(2), normalizeLabel(tx.label)].join('|');
    const order = counters.get(baseKey) ?? 0;
    counters.set(baseKey, order + 1);
    return {
      ...tx,
      tx_hash: computeTxHash({
        kind: 'pdf',
        accountId,
        date: tx.date,
        amount: tx.amount,
        label: tx.label,
        order,
      }),
    };
  });
}
