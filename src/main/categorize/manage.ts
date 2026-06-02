import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  CategoryDTO,
  CreateCategoryInput,
  CreateRuleInput,
  RuleDTO,
  RuleMatchType,
  SetTransactionCategoryInput,
} from '@shared/types/category';

const MATCH_TYPES: readonly RuleMatchType[] = ['contains', 'exact', 'regex'];
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

interface CategoryRow {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  parent_id: string | null;
  is_default: number;
  position: number;
}

/** Active (non-deprecated) categories, ordered for display. */
export function listCategories(db: DatabaseSync): CategoryDTO[] {
  const rows = db
    .prepare(
      `SELECT id, name, icon, color, parent_id, is_default, position
       FROM categories
       WHERE deprecated_at IS NULL
       ORDER BY position ASC, name ASC`,
    )
    .all() as unknown as CategoryRow[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    icon: r.icon,
    color: r.color,
    parentId: r.parent_id,
    isDefault: r.is_default === 1,
    position: r.position,
  }));
}

interface RuleRow {
  id: string;
  match_type: string;
  match_value: string;
  category_id: string;
  category_name: string | null;
  hit_count: number;
}

/** All categorization rules in precedence (creation) order, with category name + hits. */
export function listRules(db: DatabaseSync): RuleDTO[] {
  const rows = db
    .prepare(
      `SELECT r.id, r.match_type, r.match_value, r.category_id,
              c.name AS category_name, r.hit_count
       FROM categorization_rules r
       LEFT JOIN categories c ON c.id = r.category_id
       ORDER BY r.rowid ASC`,
    )
    .all() as unknown as RuleRow[];
  return rows.map((r) => ({
    id: r.id,
    matchType: r.match_type as RuleMatchType,
    matchValue: r.match_value,
    categoryId: r.category_id,
    categoryName: r.category_name,
    hitCount: r.hit_count,
  }));
}

/**
 * Create a categorization rule. Validates up front so a bad rule can never
 * silently fail to match later (esp. a malformed regex). Throws on invalid input.
 */
export function createRule(db: DatabaseSync, input: CreateRuleInput): RuleDTO {
  const value = input.matchValue.trim();
  if (value === '') throw new Error('createRule: match value is empty');
  if (!MATCH_TYPES.includes(input.matchType)) {
    throw new Error(`createRule: invalid match type "${input.matchType}"`);
  }
  if (input.matchType === 'regex') {
    try {
      new RegExp(value);
    } catch {
      throw new Error('createRule: invalid regular expression');
    }
  }
  const cat = db.prepare('SELECT id FROM categories WHERE id = ?').get(input.categoryId);
  if (!cat) throw new Error(`createRule: category ${input.categoryId} not found`);

  const id = randomUUID();
  db.prepare(
    'INSERT INTO categorization_rules (id, match_type, match_value, category_id) VALUES (?, ?, ?, ?)',
  ).run(id, input.matchType, value, input.categoryId);

  const created = listRules(db).find((r) => r.id === id);
  if (!created) throw new Error('createRule: rule vanished after insert');
  return created;
}

export function deleteRule(db: DatabaseSync, id: string): void {
  db.prepare('DELETE FROM categorization_rules WHERE id = ?').run(id);
}

/** Create a user category (not a default). Appended after existing categories. */
export function createCategory(db: DatabaseSync, input: CreateCategoryInput): CategoryDTO {
  const name = input.name.trim();
  if (name === '') throw new Error('createCategory: name is empty');
  if (!HEX_COLOR.test(input.color)) throw new Error('createCategory: invalid color');
  const icon = input.icon.trim() || 'wallet';

  const id = `cat-${randomUUID()}`;
  const nextPos = (
    db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS pos FROM categories').get() as unknown as {
      pos: number;
    }
  ).pos;
  db.prepare(
    `INSERT INTO categories (id, parent_id, name, icon, color, is_default, position)
     VALUES (?, NULL, ?, ?, ?, 0, ?)`,
  ).run(id, name, icon, input.color, nextPos);

  const created = listCategories(db).find((c) => c.id === id);
  if (!created) throw new Error('createCategory: category vanished after insert');
  return created;
}

/** Reassign a transaction's category. Marks it user_modified so a future
 *  automatic pass won't override the manual choice (design §5). */
export function setTransactionCategory(db: DatabaseSync, input: SetTransactionCategoryInput): void {
  const cat = db.prepare('SELECT id FROM categories WHERE id = ?').get(input.categoryId);
  if (!cat) throw new Error(`setTransactionCategory: category ${input.categoryId} not found`);
  const res = db
    .prepare('UPDATE transactions SET category_id = ?, user_modified = 1 WHERE id = ?')
    .run(input.categoryId, input.transactionId);
  if (res.changes === 0) {
    throw new Error(`setTransactionCategory: transaction ${input.transactionId} not found`);
  }
}
