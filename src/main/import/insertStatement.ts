import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { extractStatement } from './extractStatement';
import { normalizeLabel } from './txHash';
import { ImportError } from './importError';
import { loadRules } from '../categorize/rules';
import { buildPassthroughDetector } from '../categorize/passthrough';
import { buildHistoryIndex } from '../categorize/history';
import { resolveImportCategory } from '../categorize/resolveImportCategory';

export interface InsertResult {
  importId: string;
  insertedCount: number;
  skippedCount: number;
}

export async function insertStatement(
  db: DatabaseSync,
  accountId: string,
  content: Buffer,
  opts: {
    acknowledgedCannotVerify?: boolean;
    acknowledgedArithmeticFailed?: boolean;
    selectedHashes?: string[];
  } = {},
): Promise<InsertResult> {
  const extraction = await extractStatement(db, accountId, content);

  // A known file (alreadyImported) is NOT a blocker: duplicate protection is
  // per-transaction (the isDuplicate flags below), so a partially-imported
  // statement can deliver its remaining rows. The review surfaces the file-level
  // info; the old hard reject here silently discarded the user's selection.
  if (extraction.arithmetic.status === 'failed' && opts.acknowledgedArithmeticFailed !== true) {
    throw new ImportError('arithmetic_failed_unacknowledged');
  }
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
         (id, account_id, file_hash, source_type, date_range_start, date_range_end,
          closing_balance, closing_balance_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'validated')`,
    ).run(
      importId,
      accountId,
      extraction.fileHash,
      extraction.sourceType,
      extraction.dateRangeStart,
      extraction.dateRangeEnd,
      extraction.closingBalance,
      extraction.closingBalanceDate,
    );
    const insertTx = db.prepare(
      `INSERT INTO transactions
         (id, account_id, import_id, tx_hash, date, amount,
          label_raw, label_clean, category_id,
          is_internal_transfer, user_modified, fitid)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`,
    );
    // Deterministic categorization cascade (design §7): history (a previously
    // seen / user-corrected label) wins, then the under-the-hood seed rules.
    // An LLM categorization tier will land later; uncertainty is surfaced only
    // in the import Review screen (cascade tier), not stored as a score.
    const rules = loadRules(db);
    const isPassthrough = buildPassthroughDetector(db);
    const history = buildHistoryIndex(db);
    const hits = new Map<string, number>();
    const selectedSet =
      opts.selectedHashes !== undefined ? new Set(opts.selectedHashes) : undefined;
    let insertedCount = 0;
    for (const tx of extraction.transactions) {
      if (tx.isDuplicate) continue;
      if (selectedSet !== undefined && !selectedSet.has(tx.tx_hash)) continue;
      const labelClean = normalizeLabel(tx.label);
      const { categoryId, ruleId } = resolveImportCategory(
        labelClean,
        tx.amount,
        rules,
        isPassthrough,
        history,
      );
      if (ruleId !== null) hits.set(ruleId, (hits.get(ruleId) ?? 0) + 1);
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
