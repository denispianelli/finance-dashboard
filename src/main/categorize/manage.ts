import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  CategoryDTO,
  CreateCategoryInput,
  SetTransactionCategoryInput,
} from '@shared/types/category';
import { stableLabelKey } from './labelKey';

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

/**
 * Delete a category. Detaches it first so the foreign keys stay valid:
 * referencing transactions become uncategorized (category_id NULL) and rules
 * pointing to it are removed. Returns how many transactions were uncategorized.
 */
export function deleteCategory(db: DatabaseSync, id: string): { uncategorizedCount: number } {
  db.exec('BEGIN');
  try {
    const cat = db.prepare('SELECT id FROM categories WHERE id = ?').get(id);
    if (!cat) throw new Error(`deleteCategory: category ${id} not found`);
    const res = db
      .prepare('UPDATE transactions SET category_id = NULL WHERE category_id = ?')
      .run(id);
    db.prepare('DELETE FROM categorization_rules WHERE category_id = ?').run(id);
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    db.exec('COMMIT');
    return { uncategorizedCount: Number(res.changes) };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/** Categories whose assignment propagates to every similar label (Transfert,
 *  Remboursement) — the user-initiated label-rule behaviour (see the
 *  category-driven accounting spec). */
const PROPAGATING_CATEGORIES = new Set(['cat-transferts', 'cat-remboursement']);

/** Reassign a transaction's category. Marks it user_modified so it sticks and,
 *  via the history cascade, propagates to future imports of the same label.
 *  Assigning a *propagating* category (Transfert / Remboursement) also applies it
 *  to all existing similar labels and saves a rule for future imports. */
export function setTransactionCategory(db: DatabaseSync, input: SetTransactionCategoryInput): void {
  const cat = db.prepare('SELECT id FROM categories WHERE id = ?').get(input.categoryId);
  if (!cat) throw new Error(`setTransactionCategory: category ${input.categoryId} not found`);

  const row = db
    .prepare('SELECT label_clean FROM transactions WHERE id = ?')
    .get(input.transactionId) as { label_clean: string } | undefined;
  if (row === undefined) {
    throw new Error(`setTransactionCategory: transaction ${input.transactionId} not found`);
  }

  if (PROPAGATING_CATEGORIES.has(input.categoryId)) {
    propagateCategory(db, row.label_clean, input.categoryId);
    return;
  }

  db.prepare('UPDATE transactions SET category_id = ?, user_modified = 1 WHERE id = ?').run(
    input.categoryId,
    input.transactionId,
  );
}

/** Apply `categoryId` to every transaction whose label contains the stable key of
 *  `sampleLabel` (skipping rows manually filed under a *different* category), and
 *  upsert a `contains` rule so future imports inherit it. */
function propagateCategory(db: DatabaseSync, sampleLabel: string, categoryId: string): void {
  const key = stableLabelKey(sampleLabel);

  db.prepare(
    `UPDATE transactions
        SET category_id = ?, user_modified = 1
      WHERE INSTR(UPPER(label_clean), ?) > 0
        AND NOT (user_modified = 1 AND category_id IS NOT NULL AND category_id != ?)`,
  ).run(categoryId, key, categoryId);

  const exists = db
    .prepare(
      `SELECT id FROM categorization_rules
        WHERE match_type = 'contains' AND UPPER(match_value) = ? AND category_id = ?`,
    )
    .get(key, categoryId);
  if (exists === undefined) {
    db.prepare(
      `INSERT INTO categorization_rules (id, match_type, match_value, category_id)
       VALUES (?, 'contains', ?, ?)`,
    ).run(`cr-user-${randomUUID()}`, key, categoryId);
  }
}
