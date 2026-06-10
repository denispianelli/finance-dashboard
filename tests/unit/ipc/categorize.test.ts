import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

const dbHolder: { db: DatabaseSync | null } = { db: null };
vi.mock('../../../src/main/db', () => ({ getDb: () => dbHolder.db }));
vi.mock('../../../src/main/llm/modelsDir', () => ({ modelsDir: () => '/models' }));
vi.mock('../../../src/main/llm/llm', () => ({
  findBestPresentModel: vi.fn(),
  getModel: vi.fn(),
}));
vi.mock('../../../src/main/categorize/llm', () => ({ categorizeBatch: vi.fn() }));

import {
  handleCategorizePending,
  handleCategorizeBatch,
} from '../../../src/main/ipc/handlers/categorize';
import { findBestPresentModel, getModel } from '../../../src/main/llm/llm';
import type { ModelSpec } from '../../../src/main/llm/modelRegistry';
import { categorizeBatch } from '../../../src/main/categorize/llm';

const SPEC_3B = { id: 'llama-3.2-3b' } as unknown as ModelSpec;
const SPEC_7B = { id: 'qwen2.5-7b' } as unknown as ModelSpec;

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
  vi.mocked(findBestPresentModel).mockReturnValue(SPEC_3B);
});

afterEach(() => {
  dbHolder.db?.close();
  dbHolder.db = null;
  vi.clearAllMocks();
});

describe('handleCategorizePending', () => {
  it('returns distinct pending groups', () => {
    insertUncategorized('t1', 'VIR LOYER 12/03/25');
    insertUncategorized('t2', 'VIR LOYER 14/05/25');
    insertUncategorized('t3', 'CARREFOUR');
    expect(handleCategorizePending()).toEqual({
      groups: [
        { key: 'VIR LOYER', label: 'VIR LOYER 12/03/25', count: 2 },
        { key: 'CARREFOUR', label: 'CARREFOUR', count: 1 },
      ],
    });
  });

  it('excludes keys already attempted by the active model', () => {
    insertUncategorized('t1', 'MYSTERY');
    insertUncategorized('t2', 'CARREFOUR');
    dbHolder.db
      ?.prepare(`INSERT INTO llm_attempts (label_key, model_id) VALUES ('MYSTERY', 'llama-3.2-3b')`)
      .run();

    expect(handleCategorizePending().groups.map((g) => g.key)).toEqual(['CARREFOUR']);
  });

  it('keeps attempted keys pending when a different (stronger) model is active', () => {
    insertUncategorized('t1', 'MYSTERY');
    dbHolder.db
      ?.prepare(`INSERT INTO llm_attempts (label_key, model_id) VALUES ('MYSTERY', 'llama-3.2-3b')`)
      .run();
    vi.mocked(findBestPresentModel).mockReturnValue(SPEC_7B);

    expect(handleCategorizePending().groups.map((g) => g.key)).toEqual(['MYSTERY']);
  });

  it('does not filter by attempts when no model is installed (banner needs the full count)', () => {
    insertUncategorized('t1', 'MYSTERY');
    dbHolder.db
      ?.prepare(`INSERT INTO llm_attempts (label_key, model_id) VALUES ('MYSTERY', 'llama-3.2-3b')`)
      .run();
    vi.mocked(findBestPresentModel).mockReturnValue(null);

    expect(handleCategorizePending().groups.map((g) => g.key)).toEqual(['MYSTERY']);
  });
});

describe('handleCategorizeBatch', () => {
  it('returns model_unavailable without loading the model', async () => {
    vi.mocked(findBestPresentModel).mockReturnValue(null);
    const res = await handleCategorizeBatch({ key: 'X', label: 'X' });
    expect(res).toEqual({ ok: false, error: 'model_unavailable' });
    expect(getModel).not.toHaveBeenCalled();
  });

  it('applies the suggestion to every row of the key and returns the count', async () => {
    insertUncategorized('t1', 'VIR PAYPAL 12/03/25');
    insertUncategorized('t2', 'VIR PAYPAL 14/05/25');
    vi.mocked(categorizeBatch).mockResolvedValue([
      { id: 'VIR PAYPAL', categoryId: 'cat-alimentation' },
    ]);

    const res = await handleCategorizeBatch({ key: 'VIR PAYPAL', label: 'VIR PAYPAL 12/03/25' });

    expect(res).toEqual({ ok: true, applied: 2, residual: 0 });
    expect(
      dbHolder.db?.prepare('SELECT category_id FROM transactions WHERE id = ?').get('t2'),
    ).toMatchObject({ category_id: 'cat-alimentation' });
  });

  it('records an attempt and returns the residual when the model returns AUCUNE', async () => {
    insertUncategorized('t1', 'MYSTERY');
    // Different stable key — not part of the residual. (No digits: since #205 the
    // key drops every digit-bearing token, so 'MYSTERY 2' would collapse into 'MYSTERY'.)
    insertUncategorized('t2', 'OTHER SHOP');
    vi.mocked(categorizeBatch).mockResolvedValue([{ id: 'MYSTERY', categoryId: null }]);

    const res = await handleCategorizeBatch({ key: 'MYSTERY', label: 'MYSTERY' });

    expect(res).toEqual({ ok: true, applied: 0, residual: 1 });
    expect(
      dbHolder.db?.prepare('SELECT model_id FROM llm_attempts WHERE label_key = ?').get('MYSTERY'),
    ).toMatchObject({ model_id: 'llama-3.2-3b' });
  });

  it('does not record an attempt when inference fails (transient — retried next pass)', async () => {
    vi.mocked(categorizeBatch).mockRejectedValue(new Error('boom'));

    await handleCategorizeBatch({ key: 'X', label: 'X' });

    expect(dbHolder.db?.prepare('SELECT COUNT(*) AS n FROM llm_attempts').get()).toMatchObject({
      n: 0,
    });
  });

  it('returns inference_failed when the model throws', async () => {
    vi.mocked(categorizeBatch).mockRejectedValue(new Error('boom'));
    const res = await handleCategorizeBatch({ key: 'X', label: 'X' });
    expect(res).toEqual({ ok: false, error: 'inference_failed' });
  });
});
