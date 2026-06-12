import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import type { RestoreEnv } from '../../../src/main/sync/restore';
import { writeBackupSnapshot } from '../../../src/main/backup/snapshot';
import { restoreFromBackupFile } from '../../../src/main/backup/restore';

let dir: string;
let dbPath: string;
let db: DatabaseSync | null;

function openDb(): DatabaseSync {
  const d = new DatabaseSync(dbPath);
  d.exec('PRAGMA journal_mode = WAL');
  runMigrations(d);
  return d;
}

const env: RestoreEnv = {
  get dbPath() {
    return dbPath;
  },
  closeDb() {
    db?.close();
    db = null;
  },
  reopenDb() {
    db = openDb();
  },
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fd-backup-restore-'));
  dbPath = join(dir, 'finance.sqlite');
  db = openDb();
  db.prepare(
    "INSERT INTO accounts (id, name, type, bank_id, currency) VALUES ('acc-1','A','checking',NULL,'EUR')",
  ).run();
});

afterEach(() => {
  db?.close();
  db = null;
  rmSync(dir, { recursive: true, force: true });
});

describe('restoreFromBackupFile', () => {
  it('round-trips: snapshot → mutate → restore brings the row back', () => {
    if (db === null) throw new Error('unreachable');
    const folder = join(dir, 'backups');
    const { fileName } = writeBackupSnapshot(db, folder);
    db.prepare("DELETE FROM accounts WHERE id = 'acc-1'").run();

    const res = restoreFromBackupFile(join(folder, fileName), env);
    expect(res).toEqual({ ok: true });
    // reopenDb() was called inside swapInValidatedCandidate — db is live again.
    // [CORRECTED ASSERTION] the deleted row is back after restore:
    const row = db.prepare("SELECT name FROM accounts WHERE id = 'acc-1'").get() as
      | { name: string }
      | undefined;
    expect(row?.name).toBe('A');
  });

  it('refuses a missing file', () => {
    expect(restoreFromBackupFile(join(dir, 'nope.sqlite'), env)).toEqual({
      ok: false,
      error: 'file_unavailable',
    });
  });

  it('refuses a non-SQLite file and leaves the current DB untouched', () => {
    const junk = join(dir, 'junk.sqlite');
    writeFileSync(junk, 'this is not a database');
    expect(restoreFromBackupFile(junk, env)).toEqual({ ok: false, error: 'not_a_database' });
    // db must still be open — the failing restore must not close the live DB.
    // [CORRECTED ASSERTION] acc-1 still present, DB untouched:
    if (db === null) throw new Error('db must still be open');
    const row = db.prepare("SELECT name FROM accounts WHERE id = 'acc-1'").get() as
      | { name: string }
      | undefined;
    expect(row?.name).toBe('A');
    // no stray restore-tmp left behind
    expect(readdirSync(dir).filter((n) => n.includes('restore-tmp'))).toEqual([]);
  });

  it('refuses a snapshot whose schema is newer than the app', () => {
    if (db === null) throw new Error('unreachable');
    const folder = join(dir, 'backups');
    const { fileName } = writeBackupSnapshot(db, folder);
    const future = new DatabaseSync(join(folder, fileName));
    future.prepare('INSERT INTO schema_migrations (version) VALUES (9999)').run();
    future.close();
    expect(restoreFromBackupFile(join(folder, fileName), env)).toEqual({
      ok: false,
      error: 'schema_too_new',
    });
  });
});
