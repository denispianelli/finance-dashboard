import type { UpdateTransactionInput, DeletedTransactionSnapshot } from '@shared/types/transaction';
import { getDb } from '../../db';
import {
  updateTransaction,
  deleteTransaction,
  restoreTransaction,
} from '../../transactions/mutate';

export function handleTransactionsUpdate(payload: UpdateTransactionInput): { ok: true } {
  updateTransaction(getDb(), payload);
  return { ok: true };
}

export function handleTransactionsDelete(payload: { transactionId: string }): {
  ok: true;
  snapshot: DeletedTransactionSnapshot;
} {
  const snapshot = deleteTransaction(getDb(), payload.transactionId);
  return { ok: true, snapshot };
}

export function handleTransactionsRestore(payload: { transaction: DeletedTransactionSnapshot }): {
  ok: true;
} {
  restoreTransaction(getDb(), payload.transaction);
  return { ok: true };
}
