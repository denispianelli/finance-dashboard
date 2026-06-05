import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import type { CategorizeResult } from '@shared/types/import';

const dbHolder: { db: DatabaseSync | null } = { db: null };
vi.mock('../../../src/main/db', () => ({ getDb: () => dbHolder.db }));
vi.mock('../../../src/main/llm/modelsDir', () => ({ modelsDir: () => '/models' }));
vi.mock('../../../src/main/llm/llm', () => ({
  isModelAvailable: vi.fn(),
  getModel: vi.fn(),
}));
vi.mock('../../../src/main/categorize/llm', () => ({ categorizeBatch: vi.fn() }));

import { handleImportCategorize } from '../../../src/main/ipc/handlers/importCategorize';
import { isModelAvailable, getModel } from '../../../src/main/llm/llm';
import { categorizeBatch } from '../../../src/main/categorize/llm';

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

describe('handleImportCategorize', () => {
  it('returns model_unavailable without loading the model', async () => {
    vi.mocked(isModelAvailable).mockReturnValue(false);
    const res = await handleImportCategorize({ items: [{ tx_hash: 'h1', label: 'NETFLIX' }] });
    expect(res).toEqual({ ok: false, error: 'model_unavailable' });
    expect(getModel).not.toHaveBeenCalled();
  });

  it('maps the batch through categorizeBatch and returns ok', async () => {
    vi.mocked(isModelAvailable).mockReturnValue(true);
    const results: CategorizeResult[] = [{ tx_hash: 'h1', categoryId: 'cat-abonnements' }];
    vi.mocked(categorizeBatch).mockResolvedValue(results);

    const res = await handleImportCategorize({ items: [{ tx_hash: 'h1', label: 'NETFLIX' }] });

    expect(res).toEqual({ ok: true, results });
    // categories are read from the DB and forwarded (seed taxonomy is non-empty)
    const cats = vi.mocked(categorizeBatch).mock.calls[0]?.[1] ?? [];
    expect(cats.length).toBeGreaterThan(0);
  });

  it('returns inference_failed when categorizeBatch throws', async () => {
    vi.mocked(isModelAvailable).mockReturnValue(true);
    vi.mocked(categorizeBatch).mockRejectedValue(new Error('boom'));
    const res = await handleImportCategorize({ items: [{ tx_hash: 'h1', label: 'X' }] });
    expect(res).toEqual({ ok: false, error: 'inference_failed' });
  });
});
