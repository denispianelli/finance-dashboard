import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { buildJsonExport, writeJsonExport } from '../../../src/main/backup/exportJson';

let dir: string;
let db: DatabaseSync;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fd-export-'));
  db = new DatabaseSync(join(dir, 'db.sqlite'));
  runMigrations(db);
  db.prepare(
    "INSERT INTO accounts (id, name, type, bank_id, currency) VALUES ('acc-1','Compte LCL','checking',NULL,'EUR')",
  ).run();
  db.prepare(
    "INSERT INTO categories (id, parent_id, name) VALUES ('cat-1', NULL, 'Courses Test')",
  ).run();
  db.prepare(
    `INSERT INTO transactions
       (id, account_id, import_id, tx_hash, date, amount, label_raw, label_clean,
        category_id, is_internal_transfer, user_modified)
     VALUES ('tx-1','acc-1',NULL,'h1','2026-06-01',-42.5,'CB CARREFOUR','Carrefour',
        'cat-1',0,1)`,
  ).run();
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('buildJsonExport', () => {
  it('produces formatVersion 1 with flat rows and a resolved category name', () => {
    const exp = buildJsonExport(db, new Date('2026-06-12T09:30:00.000Z'));
    expect(exp.formatVersion).toBe(1);
    expect(exp.exportedAt).toBe('2026-06-12T09:30:00.000Z');
    // seeded defaults exist (migrations 003/006/014) — assert containment, not equality:
    expect(exp.accounts).toContainEqual({
      id: 'acc-1',
      name: 'Compte LCL',
      type: 'checking',
      currency: 'EUR',
    });
    expect(exp.categories).toContainEqual({ id: 'cat-1', parentId: null, name: 'Courses Test' });
    // only the test transaction exists — exact match:
    expect(exp.transactions).toEqual([
      {
        id: 'tx-1',
        account: 'Compte LCL',
        date: '2026-06-01',
        amount: -42.5,
        labelRaw: 'CB CARREFOUR',
        labelClean: 'Carrefour',
        category: 'Courses Test',
        isInternalTransfer: false,
        userModified: true,
      },
    ]);
  });

  it('exports an uncategorized transaction with category null', () => {
    db.prepare("UPDATE transactions SET category_id = NULL WHERE id = 'tx-1'").run();
    expect(buildJsonExport(db).transactions[0]?.category).toBeNull();
  });
});

describe('writeJsonExport', () => {
  it('writes pretty-printed parseable JSON', () => {
    const dest = join(dir, 'export.json');
    writeJsonExport(db, dest);
    const parsed = JSON.parse(readFileSync(dest, 'utf8')) as { formatVersion: number };
    expect(parsed.formatVersion).toBe(1);
  });
});
