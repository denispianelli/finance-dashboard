import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { extractStatement } from './extractStatement';
import { normalizeLabel } from './txHash';
import { ImportError } from './importError';

export interface InsertResult {
  importId: string;
  insertedCount: number;
  skippedCount: number;
}

export async function insertStatement(
  db: DatabaseSync,
  accountId: string,
  content: Buffer,
  opts: { acknowledgedCannotVerify?: boolean } = {},
): Promise<InsertResult> {
  const extraction = await extractStatement(db, accountId, content);

  if (extraction.alreadyImported) throw new ImportError('already_imported');
  if (extraction.arithmetic.status === 'failed') throw new ImportError('arithmetic_failed');
  if (extraction.arithmetic.status === 'cannot_verify' && opts.acknowledgedCannotVerify !== true) {
    throw new ImportError('cannot_verify_unacknowledged');
  }

  const importId = randomUUID();
  // BEGIN is intentionally outside try: if it throws, no transaction is active
  // and the catch must not attempt to ROLLBACK a non-existent transaction.
  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO imports
         (id, account_id, file_hash, source_type, date_range_start, date_range_end, status)
       VALUES (?, ?, ?, 'pdf', ?, ?, 'validated')`,
    ).run(
      importId,
      accountId,
      extraction.fileHash,
      extraction.dateRangeStart,
      extraction.dateRangeEnd,
    );
    const insertTx = db.prepare(
      `INSERT INTO transactions
         (id, account_id, import_id, tx_hash, date, amount,
          label_raw, label_clean, category_id, confidence,
          is_internal_transfer, user_modified, fitid)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0, 0, ?)`,
    );
    for (const tx of extraction.transactions) {
      if (tx.isDuplicate) continue;
      insertTx.run(
        randomUUID(),
        accountId,
        importId,
        tx.tx_hash,
        tx.date,
        tx.amount,
        tx.label,
        normalizeLabel(tx.label),
        tx.fitid,
      );
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  return {
    importId,
    insertedCount: extraction.newCount,
    skippedCount: extraction.duplicateCount,
  };
}
