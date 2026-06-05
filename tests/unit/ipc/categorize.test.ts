import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

const dbHolder: { db: DatabaseSync | null } = { db: null };
vi.mock('../../../src/main/db', () => ({ getDb: () => dbHolder.db }));
vi.mock('../../../src/main/llm/modelsDir', () => ({ modelsDir: () => '/models' }));
vi.mock('../../../src/main/llm/llm', () => ({
  isModelAvailable: vi.fn(),
  getModel: vi.fn(),
}));
vi.mock('../../../src/main/categorize/llm', () => ({ categorizeBatch: vi.fn() }));

import {
  handleCategorizePending,
  handleCategorizeBatch,
} from '../../../src/main/ipc/handlers/categorize';
import { isModelAvailable, getModel } from '../../../src/main/llm/llm';
import { categorizeBatch } from '../../../src/main/categorize/llm';

function insertUncategorized(id: string, label: string): void {
  dbHolder.db
    ?.prepare(
      `INSERT INTO transactions (id, account_id, tx_hash, date, amount, label_raw, label_clean, category_id, is_internal_transfer, user_modified)
       VALUES (?, 'acc-lcl-default', ?, '2026-01-01', -10, ?, ?, NULL, 0, 0)`,
    )
    .run(id, id, label, label.toUpperCase());
}

beforeEach(() => {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  dbHolder.db = db;
  vi.mocked(getModel).mockResolvedValue({} as never);
});

afterEach(() => {
  dbHolder.db?.close();
  dbHolder.db = null;
  vi.clearAllMocks();
});

describe('handleCategorizePending', () => {
  it('returns the uncategorized transactions', () => {
    insertUncategorized('t1', 'ZZZ UNSEEN');
    expect(handleCategorizePending()).toEqual({ items: [{ id: 't1', label: 'ZZZ UNSEEN' }] });
  });
});

describe('handleCategorizeBatch', () => {
  it('returns model_unavailable without loading the model', async () => {
    vi.mocked(isModelAvailable).mockReturnValue(false);
    const res = await handleCategorizeBatch({ items: [{ id: 't1', label: 'X' }] });
    expect(res).toEqual({ ok: false, error: 'model_unavailable' });
    expect(getModel).not.toHaveBeenCalled();
  });

  it('persists suggestions and returns the applied count', async () => {
    vi.mocked(isModelAvailable).mockReturnValue(true);
    insertUncategorized('t1', 'CARREFOUR');
    insertUncategorized('t2', 'MYSTERY');
    vi.mocked(categorizeBatch).mockResolvedValue([
      { id: 't1', categoryId: 'cat-alimentation' },
      { id: 't2', categoryId: null }, // AUCUNE → stays uncategorized
    ]);

    const res = await handleCategorizeBatch({
      items: [
        { id: 't1', label: 'CARREFOUR' },
        { id: 't2', label: 'MYSTERY' },
      ],
    });

    expect(res).toEqual({ ok: true, applied: 1 });
    expect(
      dbHolder.db?.prepare('SELECT category_id FROM transactions WHERE id = ?').get('t1'),
    ).toMatchObject({ category_id: 'cat-alimentation' });
    expect(
      dbHolder.db?.prepare('SELECT category_id FROM transactions WHERE id = ?').get('t2'),
    ).toMatchObject({ category_id: null });
  });

  it('returns inference_failed when the model throws', async () => {
    vi.mocked(isModelAvailable).mockReturnValue(true);
    vi.mocked(categorizeBatch).mockRejectedValue(new Error('boom'));
    const res = await handleCategorizeBatch({ items: [{ id: 't1', label: 'X' }] });
    expect(res).toEqual({ ok: false, error: 'inference_failed' });
  });
});
