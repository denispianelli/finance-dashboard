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
  it('returns distinct pending groups', () => {
    insertUncategorized('t1', 'VIR PAYPAL 12/03/25');
    insertUncategorized('t2', 'VIR PAYPAL 14/05/25');
    insertUncategorized('t3', 'CARREFOUR');
    expect(handleCategorizePending()).toEqual({
      groups: [
        { key: 'VIR PAYPAL', label: 'VIR PAYPAL 12/03/25', count: 2 },
        { key: 'CARREFOUR', label: 'CARREFOUR', count: 1 },
      ],
    });
  });
});

describe('handleCategorizeBatch', () => {
  it('returns model_unavailable without loading the model', async () => {
    vi.mocked(isModelAvailable).mockReturnValue(false);
    const res = await handleCategorizeBatch({ key: 'X', label: 'X' });
    expect(res).toEqual({ ok: false, error: 'model_unavailable' });
    expect(getModel).not.toHaveBeenCalled();
  });

  it('applies the suggestion to every row of the key and returns the count', async () => {
    vi.mocked(isModelAvailable).mockReturnValue(true);
    insertUncategorized('t1', 'VIR PAYPAL 12/03/25');
    insertUncategorized('t2', 'VIR PAYPAL 14/05/25');
    vi.mocked(categorizeBatch).mockResolvedValue([
      { id: 'VIR PAYPAL', categoryId: 'cat-alimentation' },
    ]);

    const res = await handleCategorizeBatch({ key: 'VIR PAYPAL', label: 'VIR PAYPAL 12/03/25' });

    expect(res).toEqual({ ok: true, applied: 2 });
    expect(
      dbHolder.db?.prepare('SELECT category_id FROM transactions WHERE id = ?').get('t2'),
    ).toMatchObject({ category_id: 'cat-alimentation' });
  });

  it('applies nothing when the model returns AUCUNE (null)', async () => {
    vi.mocked(isModelAvailable).mockReturnValue(true);
    insertUncategorized('t1', 'MYSTERY');
    vi.mocked(categorizeBatch).mockResolvedValue([{ id: 'MYSTERY', categoryId: null }]);

    const res = await handleCategorizeBatch({ key: 'MYSTERY', label: 'MYSTERY' });

    expect(res).toEqual({ ok: true, applied: 0 });
    expect(
      dbHolder.db?.prepare('SELECT category_id FROM transactions WHERE id = ?').get('t1'),
    ).toMatchObject({ category_id: null });
  });

  it('returns inference_failed when the model throws', async () => {
    vi.mocked(isModelAvailable).mockReturnValue(true);
    vi.mocked(categorizeBatch).mockRejectedValue(new Error('boom'));
    const res = await handleCategorizeBatch({ key: 'X', label: 'X' });
    expect(res).toEqual({ ok: false, error: 'inference_failed' });
  });
});
