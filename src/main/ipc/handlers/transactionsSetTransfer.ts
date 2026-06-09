import { getDb } from '../../db';

/**
 * Mark / un-mark a transaction as an internal transfer (ADR-016). Sets
 * `user_modified = 1` so the automatic pairing pass never overrides the choice.
 */
export function handleTransactionsSetTransfer(payload: {
  transactionId: string;
  isTransfer: boolean;
}): { ok: true } {
  const res = getDb()
    .prepare('UPDATE transactions SET is_internal_transfer = ?, user_modified = 1 WHERE id = ?')
    .run(payload.isTransfer ? 1 : 0, payload.transactionId);
  // A stale id (row deleted in another view) would otherwise report success
  // while nothing changed — match updateTransaction and surface it.
  if (Number(res.changes) === 0) {
    throw new Error(`setTransfer: transaction ${payload.transactionId} not found`);
  }
  return { ok: true };
}
