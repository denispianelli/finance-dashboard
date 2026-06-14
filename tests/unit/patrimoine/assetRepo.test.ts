import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { upsertAsset, listAssets, deleteAsset } from '../../../src/main/patrimoine/assetRepo';

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
