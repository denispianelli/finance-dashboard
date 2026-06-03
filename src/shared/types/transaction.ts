/** Fields a user may edit on a transaction. All optional; only provided fields
 *  change. Figures (date/amount) are snapshotted into original_* on first change. */
export interface UpdateTransactionInput {
  readonly transactionId: string;
  readonly date?: string; // ISO yyyy-mm-dd
  readonly label?: string; // edits label_clean only; label_raw is never touched
  readonly amount?: number;
}

/** Every persisted column of a transaction, in camelCase — enough to re-insert a
 *  deleted row faithfully. Returned by `transactions:delete`, sent back to
 *  `transactions:restore`. The renderer treats it as an opaque undo token. */
export interface DeletedTransactionSnapshot {
  readonly id: string;
  readonly accountId: string;
  readonly importId: string | null;
  readonly txHash: string;
  readonly date: string;
  readonly amount: number;
  readonly labelRaw: string;
  readonly labelClean: string;
  readonly categoryId: string | null;
  readonly isInternalTransfer: boolean;
  readonly userModified: boolean;
  readonly fitid: string | null;
  readonly originalDate: string | null;
  readonly originalAmount: number | null;
  readonly editedAt: string | null;
}
