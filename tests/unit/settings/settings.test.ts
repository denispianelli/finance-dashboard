import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

const dbHolder: { db: DatabaseSync | null } = { db: null };
vi.mock('../../../src/main/db', () => ({ getDb: () => dbHolder.db }));

import { getCategorizeOptOut, setCategorizeOptOut } from '../../../src/main/settings/settings';

beforeEach(() => {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  dbHolder.db = db;
});

afterEach(() => {
  dbHolder.db?.close();
  dbHolder.db = null;
  vi.clearAllMocks();
});

describe('categorize opt-out setting', () => {
  it('defaults to false when unset', () => {
    expect(getCategorizeOptOut()).toBe(false);
  });
  it('round-trips true', () => {
    setCategorizeOptOut(true);
    expect(getCategorizeOptOut()).toBe(true);
  });
  it('round-trips back to false', () => {
    setCategorizeOptOut(true);
    setCategorizeOptOut(false);
    expect(getCategorizeOptOut()).toBe(false);
  });
});
