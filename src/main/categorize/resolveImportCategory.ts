import type { DatabaseSync } from 'node:sqlite';
import { stableLabelKey } from './labelKey';
import { findHistoryCategory, findAmountHistoryCategory } from './history';
import { matchRule, type CategorizationRule } from './rules';

/**
 * The deterministic per-transaction categorization decision used at import.
 * Passthrough payees (detected) are routed to the amount-aware history (their label
 * is ambiguous); everything else uses the label cascade (history -> rules). Returns
 * the chosen category and the matched rule id (so the caller can bump hit counts).
 */
export function resolveImportCategory(
  db: DatabaseSync,
  labelClean: string,
  amount: number,
  rules: readonly CategorizationRule[],
  isPassthrough: (labelKey: string) => boolean,
): { categoryId: string | null; ruleId: string | null } {
  if (isPassthrough(stableLabelKey(labelClean))) {
    return { categoryId: findAmountHistoryCategory(db, labelClean, amount), ruleId: null };
  }
  const hist = findHistoryCategory(db, labelClean);
  if (hist !== null) return { categoryId: hist, ruleId: null };
  const rule = matchRule(rules, labelClean);
  if (rule !== null) return { categoryId: rule.categoryId, ruleId: rule.id };
  return { categoryId: null, ruleId: null };
}
