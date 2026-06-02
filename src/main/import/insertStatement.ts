import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { extractStatement } from './extractStatement';
import { normalizeLabel } from './txHash';
import { ImportError } from './importError';
import { loadRules, matchRule } from '../categorize/rules';
import { findHistoryCategory } from '../categorize/history';

export interface InsertResult {
  importId: string;
  insertedCount: number;
  skippedCount: number;
}

export async function insertStatement(
  db: DatabaseSync,
  accountId: string,
  content: Buffer,
  opts: { acknowledgedCannotVerify?: boolean; selectedHashes?: string[] } = {},
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
       VALUES (?, ?, ?, ?, ?, ?, 'validated')`,
    ).run(
      importId,
      accountId,
      extraction.fileHash,
      extraction.sourceType,
      extraction.dateRangeStart,
      extraction.dateRangeEnd,
    );
    const insertTx = db.prepare(
      `INSERT INTO transactions
         (id, account_id, import_id, tx_hash, date, amount,
          label_raw, label_clean, category_id, confidence,
          is_internal_transfer, user_modified, fitid)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, 0, ?)`,
    );
    // Deterministic categorization cascade (design §7): history (a previously
    // seen / user-corrected label) wins, then the under-the-hood seed rules.
    // confidence stays NULL — it is the LLM score, and no model has run.
    const rules = loadRules(db);
    const hits = new Map<string, number>();
    const selectedSet =
      opts.selectedHashes !== undefined ? new Set(opts.selectedHashes) : undefined;
    let insertedCount = 0;
    for (const tx of extraction.transactions) {
      if (tx.isDuplicate) continue;
      if (selectedSet !== undefined && !selectedSet.has(tx.tx_hash)) continue;
      const labelClean = normalizeLabel(tx.label);
      let categoryId = findHistoryCategory(db, labelClean);
      if (categoryId === null) {
        const rule = matchRule(rules, labelClean);
        if (rule !== null) {
          categoryId = rule.categoryId;
          hits.set(rule.id, (hits.get(rule.id) ?? 0) + 1);
        }
      }
      insertTx.run(
        randomUUID(),
        accountId,
        importId,
        tx.tx_hash,
        tx.date,
        tx.amount,
        tx.label,
        labelClean,
        categoryId,
        tx.fitid,
      );
      insertedCount++;
    }
    const bumpHits = db.prepare(
      'UPDATE categorization_rules SET hit_count = hit_count + ? WHERE id = ?',
    );
    for (const [ruleId, count] of hits) {
      bumpHits.run(count, ruleId);
    }
    db.exec('COMMIT');
    return { importId, insertedCount, skippedCount: extraction.duplicateCount };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
