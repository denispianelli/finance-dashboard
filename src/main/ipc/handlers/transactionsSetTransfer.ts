import { getDb } from '../../db';

/**
 * Mark / un-mark a transaction as an internal transfer (ADR-016). Sets
 * `user_modified = 1` so the automatic pairing pass never overrides the choice.
 */
export function handleTransactionsSetTransfer(payload: {
  transactionId: string;
  isTransfer: boolean;
}): { ok: true } {
  getDb()
    .prepare('UPDATE transactions SET is_internal_transfer = ?, user_modified = 1 WHERE id = ?')
    .run(payload.isTransfer ? 1 : 0, payload.transactionId);
  return { ok: true };
}
