// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import {
  listClasses,
  upsertClass,
  deleteClass,
  assignClass,
  listHoldings,
} from '../../../src/main/patrimoine/assetClassRepo';

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  return db;
}

describe('assetClassRepo', () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = freshDb();
  });

  it('creates, renames and lists classes by sort order', () => {
    const a = upsertClass(db, { name: 'Actions', color: '#D4B062', targetPct: 0.25 });
    upsertClass(db, { name: 'Immo', color: '#7C9A8E', targetPct: 0.55 });
    const renamed = upsertClass(db, {
      id: a.id,
      name: 'Actions monde',
      color: a.color,
      targetPct: 0.3,
    });
    expect(renamed.name).toBe('Actions monde');
    expect(renamed.targetPct).toBe(0.3);
    expect(listClasses(db).map((c) => c.name)).toContain('Immo');
  });

  it('assigns a holding and drops it to NULL when the class is deleted', () => {
    const c = upsertClass(db, { name: 'Cash', color: '#888888', targetPct: null });
    assignClass(db, { kind: 'account', id: 'acc-lcl-default', classId: c.id });
    expect(listHoldings(db).find((h) => h.id === 'acc-lcl-default')?.classId).toBe(c.id);
    deleteClass(db, c.id);
    expect(listHoldings(db).find((h) => h.id === 'acc-lcl-default')?.classId).toBeNull();
    expect(listClasses(db)).toHaveLength(0);
  });
});
