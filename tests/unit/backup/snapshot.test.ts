import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { backupFileName, writeBackupSnapshot } from '../../../src/main/backup/snapshot';

let dir: string;
let folder: string;
let db: DatabaseSync;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fd-backup-'));
  folder = join(dir, 'backups'); // does not exist yet — write must create it
  db = new DatabaseSync(join(dir, 'source.sqlite'));
  db.exec('PRAGMA journal_mode = WAL');
  runMigrations(db);
  db.prepare(
    "INSERT INTO accounts (id, name, type, bank_id, currency) VALUES ('acc-1','Backup Test','checking',NULL,'EUR')",
  ).run();
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('backupFileName', () => {
  it('formats local date and time with zero padding', () => {
    expect(backupFileName(new Date(2026, 5, 3, 9, 7))).toBe('finance-2026-06-03_0907.sqlite');
  });
});

describe('writeBackupSnapshot', () => {
  it('creates the folder, writes a valid SQLite copy, leaves no tmp file', () => {
    const res = writeBackupSnapshot(db, folder, new Date(2026, 5, 12, 10, 30));
    expect(res).toEqual({ fileName: 'finance-2026-06-12_1030.sqlite', skipped: false });
    const copy = new DatabaseSync(join(folder, res.fileName), { readOnly: true });
    const row = copy.prepare("SELECT name FROM accounts WHERE id = 'acc-1'").get() as
      | {
          name: string;
        }
      | undefined;
    copy.close();
    expect(row?.name).toBe('Backup Test');
    expect(readdirSync(folder)).toEqual([res.fileName]); // no leftover tmp
  });

  it('skips when a snapshot for the same minute already exists', () => {
    const when = new Date(2026, 5, 12, 10, 30);
    writeBackupSnapshot(db, folder, when);
    const res = writeBackupSnapshot(db, folder, when);
    expect(res.skipped).toBe(true);
  });

  it('propagates fs errors (unwritable folder)', () => {
    expect(() => writeBackupSnapshot(db, join(dir, 'source.sqlite'), new Date())).toThrow();
  });
});
