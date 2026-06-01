import type { DatabaseSync } from 'node:sqlite';

export type MatchType = 'contains' | 'exact' | 'regex';

export interface CategorizationRule {
  readonly id: string;
  readonly matchType: MatchType;
  readonly matchValue: string;
  readonly categoryId: string;
}

interface RuleRow {
  id: string;
  match_type: string;
  match_value: string;
  category_id: string;
}

/** Load rules in precedence order (creation order = rowid). First match wins. */
export function loadRules(db: DatabaseSync): CategorizationRule[] {
  const rows = db
    .prepare(
      'SELECT id, match_type, match_value, category_id FROM categorization_rules ORDER BY rowid ASC',
    )
    .all() as unknown as RuleRow[];
  return rows.map((r) => ({
    id: r.id,
    matchType: r.match_type as MatchType,
    matchValue: r.match_value,
    categoryId: r.category_id,
  }));
}

/**
 * First rule that matches the (already normalized) label, or null. Matching is
 * case-insensitive; `match_value` is expected in normalized form (see
 * `normalizeLabel`), but we upper-case both sides defensively.
 */
export function matchRule(rules: readonly CategorizationRule[], label: string): CategorizationRule | null {
  const upper = label.toUpperCase();
  for (const rule of rules) {
    if (ruleMatches(rule, label, upper)) return rule;
  }
  return null;
}

function ruleMatches(rule: CategorizationRule, label: string, upperLabel: string): boolean {
  if (rule.matchType === 'contains') return upperLabel.includes(rule.matchValue.toUpperCase());
  if (rule.matchType === 'exact') return upperLabel === rule.matchValue.toUpperCase();
  // regex — a malformed pattern simply never matches; it must not abort a whole
  // import batch. Rule creation should validate patterns up front.
  try {
    return new RegExp(rule.matchValue, 'i').test(label);
  } catch {
    return false;
  }
}
