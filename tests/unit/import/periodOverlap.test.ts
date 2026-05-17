import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { checkPeriodOverlap } from '../../../src/main/import/periodOverlap';

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  db.prepare("INSERT INTO accounts(id,name,type) VALUES('a1','Main','checking')").run();
  db.prepare("INSERT INTO accounts(id,name,type) VALUES('a2','Other','checking')").run();
  return db;
}

function addImport(
  db: DatabaseSync,
  id: string,
  accountId: string,
  start: string,
  end: string,
  status: string,
): void {
  db.prepare(
    `INSERT INTO imports(id,account_id,file_hash,source_type,date_range_start,date_range_end,status)
     VALUES(?,?,?, 'pdf', ?, ?, ?)`,
  ).run(id, accountId, `hash-${id}`, start, end, status);
}

describe('checkPeriodOverlap', () => {
  it('reports no overlap when ranges are disjoint', () => {
    const db = freshDb();
    addImport(db, 'i1', 'a1', '2025-01-01', '2025-01-31', 'validated');
    const r = checkPeriodOverlap(db, 'a1', '2025-02-01', '2025-02-28');
    expect(r.hasOverlap).toBe(false);
    expect(r.overlappingImports).toEqual([]);
    db.close();
  });

  it('flags a partial overlap', () => {
    const db = freshDb();
    addImport(db, 'i1', 'a1', '2025-01-01', '2025-01-31', 'validated');
    const r = checkPeriodOverlap(db, 'a1', '2025-01-15', '2025-02-15');
    expect(r.hasOverlap).toBe(true);
    expect(r.overlappingImports).toHaveLength(1);
    expect(r.overlappingImports[0]?.id).toBe('i1');
    db.close();
  });

  it('treats touching boundaries as overlapping (inclusive)', () => {
    const db = freshDb();
    addImport(db, 'i1', 'a1', '2025-01-01', '2025-01-31', 'validated');
    const r = checkPeriodOverlap(db, 'a1', '2025-01-31', '2025-02-28');
    expect(r.hasOverlap).toBe(true);
    db.close();
  });

  it('includes pending_review imports', () => {
    const db = freshDb();
    addImport(db, 'i1', 'a1', '2025-01-01', '2025-01-31', 'pending_review');
    const r = checkPeriodOverlap(db, 'a1', '2025-01-10', '2025-01-20');
    expect(r.hasOverlap).toBe(true);
    db.close();
  });

  it('ignores cancelled imports', () => {
    const db = freshDb();
    addImport(db, 'i1', 'a1', '2025-01-01', '2025-01-31', 'cancelled');
    const r = checkPeriodOverlap(db, 'a1', '2025-01-10', '2025-01-20');
    expect(r.hasOverlap).toBe(false);
    db.close();
  });

  it('ignores imports on a different account', () => {
    const db = freshDb();
    addImport(db, 'i1', 'a2', '2025-01-01', '2025-01-31', 'validated');
    const r = checkPeriodOverlap(db, 'a1', '2025-01-10', '2025-01-20');
    expect(r.hasOverlap).toBe(false);
    db.close();
  });

  it('flags a fully-contained range (new range inside existing)', () => {
    const db = freshDb();
    addImport(db, 'i1', 'a1', '2025-01-01', '2025-12-31', 'validated');
    const r = checkPeriodOverlap(db, 'a1', '2025-03-01', '2025-04-30');
    expect(r.hasOverlap).toBe(true);
    expect(r.overlappingImports[0]?.id).toBe('i1');
    db.close();
  });

  it('returns all overlapping imports when multiple exist', () => {
    const db = freshDb();
    addImport(db, 'i1', 'a1', '2025-01-01', '2025-01-31', 'validated');
    addImport(db, 'i2', 'a1', '2025-01-15', '2025-02-15', 'pending_review');
    const r = checkPeriodOverlap(db, 'a1', '2025-01-20', '2025-01-25');
    expect(r.hasOverlap).toBe(true);
    expect(r.overlappingImports).toHaveLength(2);
    const ids = r.overlappingImports.map((i) => i.id).sort();
    expect(ids).toEqual(['i1', 'i2']);
    db.close();
  });
});
