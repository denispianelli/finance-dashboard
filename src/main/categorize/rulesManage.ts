import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { RuleDTO, RuleInput } from '@shared/types/rules';
import { matchRule, type CategorizationRule } from './rules';

/** Input failed validation (empty value, bad regex, unknown category). */
export class InvalidRuleError extends Error {
  constructor(reason: string) {
    super(`invalid rule: ${reason}`);
    this.name = 'InvalidRuleError';
  }
}

interface RuleRow {
  id: string;
  match_type: string;
  match_value: string;
  category_id: string;
  hit_count: number;
  created_at: string;
}

function toDTO(r: RuleRow): RuleDTO {
  return {
    id: r.id,
    matchType: r.match_type as RuleDTO['matchType'],
    matchValue: r.match_value,
    categoryId: r.category_id,
    hitCount: r.hit_count,
    createdAt: r.created_at,
  };
}

function getRow(db: DatabaseSync, id: string): RuleRow {
  const row = db
    .prepare(
      'SELECT id, match_type, match_value, category_id, hit_count, created_at FROM categorization_rules WHERE id = ?',
    )
    .get(id) as unknown as RuleRow | undefined;
  if (row === undefined) throw new InvalidRuleError(`no rule ${id}`);
  return row;
}

/** All rules in matching order (rowid ASC = creation order, first match wins). */
export function listRules(db: DatabaseSync): RuleDTO[] {
  const rows = db
    .prepare(
      'SELECT id, match_type, match_value, category_id, hit_count, created_at FROM categorization_rules ORDER BY rowid ASC',
    )
    .all() as unknown as RuleRow[];
  return rows.map(toDTO);
}

function validate(db: DatabaseSync, input: RuleInput): string {
  const value = input.matchValue.trim();
  if (value === '') throw new InvalidRuleError('empty match value');
  if (!['contains', 'exact', 'regex'].includes(input.matchType)) {
    throw new InvalidRuleError(`bad match type ${input.matchType}`);
  }
  if (input.matchType === 'regex') {
    try {
      new RegExp(value);
    } catch {
      throw new InvalidRuleError('regex does not compile');
    }
  }
  const cat = db
    .prepare('SELECT 1 FROM categories WHERE id = ? AND deprecated_at IS NULL')
    .get(input.categoryId);
  if (cat === undefined) throw new InvalidRuleError(`unknown category ${input.categoryId}`);
  return value;
}

/**
 * Apply ONE rule to every still-uncategorized transaction (same matcher as the
 * import cascade) and bump its hit_count by the rows applied. Never overwrites —
 * a manual pick always wins. Returns the applied count.
 */
function applyRetroactively(db: DatabaseSync, rule: CategorizationRule): number {
  const rows = db
    .prepare(
      `SELECT id, label_clean FROM transactions
        WHERE category_id IS NULL AND is_internal_transfer = 0`,
    )
    .all() as unknown as { id: string; label_clean: string }[];
  const ids = rows.filter((r) => matchRule([rule], r.label_clean) !== null).map((r) => r.id);
  if (ids.length === 0) return 0;
  // Chunked: a single IN (...) would hit SQLite's bind-variable limit (~32k)
  // on a large residual.
  const CHUNK = 500;
  let applied = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => '?').join(',');
    const res = db
      .prepare(
        `UPDATE transactions SET category_id = ?
          WHERE id IN (${placeholders}) AND category_id IS NULL`,
      )
      .run(rule.categoryId, ...chunk);
    applied += Number(res.changes);
  }
  db.prepare('UPDATE categorization_rules SET hit_count = hit_count + ? WHERE id = ?').run(
    applied,
    rule.id,
  );
  return applied;
}

/** Validate, insert, retroactively apply — atomically. */
export function createRule(db: DatabaseSync, input: RuleInput): { rule: RuleDTO; applied: number } {
  const value = validate(db, input);
  const id = randomUUID();
  db.exec('BEGIN');
  try {
    db.prepare(
      'INSERT INTO categorization_rules (id, match_type, match_value, category_id) VALUES (?, ?, ?, ?)',
    ).run(id, input.matchType, value, input.categoryId);
    const applied = applyRetroactively(db, {
      id,
      matchType: input.matchType,
      matchValue: value,
      categoryId: input.categoryId,
    });
    db.exec('COMMIT');
    return { rule: toDTO(getRow(db, id)), applied };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/** Validate, update in place (created_at and hit_count kept), re-run the retroactive pass. */
export function updateRule(
  db: DatabaseSync,
  input: RuleInput & { id: string },
): { rule: RuleDTO; applied: number } {
  const value = validate(db, input);
  getRow(db, input.id); // existence check before writing
  db.exec('BEGIN');
  try {
    db.prepare(
      'UPDATE categorization_rules SET match_type = ?, match_value = ?, category_id = ? WHERE id = ?',
    ).run(input.matchType, value, input.categoryId, input.id);
    const applied = applyRetroactively(db, {
      id: input.id,
      matchType: input.matchType,
      matchValue: value,
      categoryId: input.categoryId,
    });
    db.exec('COMMIT');
    return { rule: toDTO(getRow(db, input.id)), applied };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/** Delete the rule. Already-categorized rows are untouched (no reverse magic). */
export function deleteRule(db: DatabaseSync, id: string): void {
  db.prepare('DELETE FROM categorization_rules WHERE id = ?').run(id);
}
