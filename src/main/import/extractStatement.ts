import type { DatabaseSync } from 'node:sqlite';
import type {
  CategorizationTier,
  ReviewTransaction,
  StatementExtraction,
} from '@shared/types/import';
import { detectType } from './detectType';
import { extractPdf } from './extractPdf';
import { extractOfx } from './ofx/extractOfx';
import { assignTxHashes, normalizeLabel } from './txHash';
import { verifyArithmetic } from './verifyArithmetic';
import { checkPeriodOverlap } from './periodOverlap';
import { hashFile } from './hashFile';
import { isAlreadyImported, findExistingHashes } from './duplicateCheck';
import { ImportError } from './importError';
import { loadRules, matchRule, type CategorizationRule } from '../categorize/rules';
import { findHistoryCategory } from '../categorize/history';

export async function extractStatement(
  db: DatabaseSync,
  accountId: string,
  content: Buffer,
): Promise<StatementExtraction> {
  const fileHash = hashFile(content);
  const alreadyImported = isAlreadyImported(db, fileHash);

  const detectedType = detectType(content, '');
  if (detectedType !== 'pdf' && detectedType !== 'ofx') {
    throw new ImportError('unsupported_format');
  }
  const type = detectedType;
  const stmt =
    type === 'pdf' ? await extractPdf(db, accountId, content) : extractOfx(db, accountId, content);

  const withHashes = assignTxHashes(accountId, stmt.transactions);
  const arithmetic = verifyArithmetic(stmt.transactions, stmt.openingBalance, stmt.closingBalance);
  const periodOverlap = checkPeriodOverlap(db, accountId, stmt.openingDate, stmt.closingDate);
  const existing = findExistingHashes(db, accountId);

  // Deterministic cascade (design §7) computed here, read-only, so the Review can
  // show each line's category and the user can validate it (ADR-005). The residual
  // (tier null) is what the LLM tier fills in the Review. The rule hit-count bump
  // is a write and stays at insert time (insertStatement).
  const rules = loadRules(db);

  const transactions: ReviewTransaction[] = withHashes.map((t) => {
    const isDuplicate = existing.has(t.tx_hash);
    const { categoryId, tier } = isDuplicate
      ? { categoryId: null, tier: null as CategorizationTier }
      : categorizeDeterministic(db, rules, normalizeLabel(t.label));
    return {
      date: t.date,
      label: t.label,
      amount: t.amount,
      tx_hash: t.tx_hash,
      fitid: t.fitid,
      isDuplicate,
      categoryId,
      tier,
    };
  });

  const duplicateCount = transactions.filter((t) => t.isDuplicate).length;
  const newCount = transactions.length - duplicateCount;

  return {
    transactions,
    arithmetic,
    periodOverlap,
    newCount,
    duplicateCount,
    fileHash,
    alreadyImported,
    dateRangeStart: stmt.openingDate,
    dateRangeEnd: stmt.closingDate,
    // Anchor for the real account balance (ADR-014): the stated closing balance
    // and its as-of date (the statement's last transaction date). Null when the
    // source carries no usable balance, so the account simply does not anchor.
    closingBalance: stmt.closingBalance,
    closingBalanceDate: stmt.closingBalance === null ? null : stmt.closingDate,
    sourceType: type,
  };
}

/** History wins, then the seed rules. Both reads only — no writes here. */
function categorizeDeterministic(
  db: DatabaseSync,
  rules: readonly CategorizationRule[],
  labelClean: string,
): { categoryId: string | null; tier: CategorizationTier } {
  const fromHistory = findHistoryCategory(db, labelClean);
  if (fromHistory !== null) return { categoryId: fromHistory, tier: 'history' };
  const rule = matchRule(rules, labelClean);
  if (rule !== null) return { categoryId: rule.categoryId, tier: 'rule' };
  return { categoryId: null, tier: null };
}
