import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { upsertAsset, listAssets, deleteAsset } from '../../../src/main/patrimoine/assetRepo';
import { upsertClass } from '../../../src/main/patrimoine/assetClassRepo';

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  return db;
}

describe('assetRepo', () => {
  it('creates then updates a property asset by id', () => {
    const db = freshDb();
    const a = upsertAsset(db, {
      name: 'Résidence principale',
      kind: 'property',
      declaredValue: 300000,
      share: 0.5,
      valuedAt: '2026-06-14',
    });
    expect(listAssets(db)).toHaveLength(1);
    const updated = upsertAsset(db, {
      id: a.id,
      name: 'RP',
      kind: 'property',
      declaredValue: 320000,
      share: 0.5,
      valuedAt: '2026-06-14',
    });
    expect(updated.id).toBe(a.id);
    expect(listAssets(db)).toHaveLength(1);
    expect(listAssets(db)[0]?.declaredValue).toBe(320000);
    db.close();
  });

  it('persists kind and classId, and updates kind on upsert conflict', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const c = upsertClass(db, { name: 'Fonds €', color: '#C58B5C', targetPct: 0.15 });
    const a = upsertAsset(db, {
      name: 'AV Linxea',
      kind: 'av',
      declaredValue: 18000,
      share: 1,
      valuedAt: '2026-06-01',
      classId: c.id,
    });
    expect(a.kind).toBe('av');
    expect(a.classId).toBe(c.id);
    expect(listAssets(db)[0]?.kind).toBe('av');

    // upsert by id changes kind
    const updated = upsertAsset(db, {
      id: a.id,
      name: 'AV Linxea',
      kind: 'pea',
      declaredValue: 18000,
      share: 1,
      valuedAt: '2026-06-01',
      classId: c.id,
    });
    expect(updated.kind).toBe('pea');
    db.close();
  });

  it('deletes an asset', () => {
    const db = freshDb();
    const a = upsertAsset(db, {
      name: 'x',
      kind: 'property',
      declaredValue: 1,
      share: 1,
      valuedAt: '2026-06-14',
    });
    deleteAsset(db, a.id);
    expect(listAssets(db)).toHaveLength(0);
    db.close();
  });
});
