import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { isAlreadyImported } from '../../../src/main/import/duplicateCheck';

function seedImport(db: DatabaseSync, hash: string): void {
  db.prepare("INSERT INTO accounts(id,name,type) VALUES('a1','Test','checking')").run();
  db.prepare(
    `INSERT INTO imports(id,account_id,file_hash,source_type,date_range_start,date_range_end)
     VALUES('imp1','a1',?,'pdf','2025-01-01','2025-01-31')`,
  ).run(hash);
}

describe('isAlreadyImported', () => {
  it('returns false when the hash is not present', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    expect(isAlreadyImported(db, 'deadbeef')).toBe(false);
    db.close();
  });

  it('returns true when the hash exists in imports', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    seedImport(db, 'deadbeef');
    expect(isAlreadyImported(db, 'deadbeef')).toBe(true);
    db.close();
  });
});
