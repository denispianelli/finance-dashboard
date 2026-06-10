import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { writeSnapshot } from '../../../src/main/sync/snapshot';

const dbHolder: { db: DatabaseSync | null } = { db: null };
vi.mock('../../../src/main/db', () => ({ getDb: () => dbHolder.db }));

import { restoreFromFolder, type RestoreEnv } from '../../../src/main/sync/restore';

let dir: string;
let dbPath: string;

function openLocalDb(): DatabaseSync {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  runMigrations(db);
  return db;
}

const env = (): RestoreEnv => ({
  dbPath,
  closeDb: () => {
    dbHolder.db?.close();
    dbHolder.db = null;
  },
  reopenDb: () => {
    dbHolder.db = openLocalDb();
  },
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fd-restore-'));
  dbPath = join(dir, 'finance.sqlite');
  dbHolder.db = openLocalDb();
});

afterEach(() => {
  dbHolder.db?.close();
  dbHolder.db = null;
  rmSync(dir, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe('restoreFromFolder', () => {
  it('replaces the local DB with the snapshot and records state', async () => {
    // Build a "remote" DB with a marker row and snapshot it into the folder.
    const remoteDir = mkdtempSync(join(tmpdir(), 'fd-remote-'));
    const remote = new DatabaseSync(join(remoteDir, 'remote.sqlite'));
    runMigrations(remote);
    remote
      .prepare(
        "INSERT INTO accounts (id, name, type, bank_id, currency) VALUES ('acc-remote','Depuis Mac','checking','lcl','EUR')",
      )
      .run();
    const header = await writeSnapshot(remote, {
      folderPath: dir,
      passphrase: 'pw',
      machineName: 'denis-mac',
    });
    remote.close();
    rmSync(remoteDir, { recursive: true, force: true });

    const result = await restoreFromFolder(dir, 'pw', env());
    expect(result).toEqual({ ok: true });

    // restored data visible through the reopened db
    const row = dbHolder.db?.prepare("SELECT name FROM accounts WHERE id = 'acc-remote'").get() as {
      name: string;
    };
    expect(row.name).toBe('Depuis Mac');

    // a .bak of the pre-restore DB exists
    expect(readdirSync(dir).some((f) => f.startsWith('finance.sqlite.bak-'))).toBe(true);

    // state updated: snapshot now "seen", not dirty
    const seen = dbHolder.db
      ?.prepare("SELECT value FROM app_settings WHERE key = 'sync.lastSeenSnapshotId'")
      .get() as { value: string };
    expect(seen.value).toBe(header.snapshotId);
  });

  it('wrong passphrase leaves the local DB untouched', async () => {
    dbHolder.db
      ?.prepare(
        "INSERT INTO accounts (id, name, type, bank_id, currency) VALUES ('acc-local','Local','checking','lcl','EUR')",
      )
      .run();
    const remoteDir = mkdtempSync(join(tmpdir(), 'fd-remote-'));
    const remote = new DatabaseSync(join(remoteDir, 'remote.sqlite'));
    runMigrations(remote);
    await writeSnapshot(remote, { folderPath: dir, passphrase: 'pw', machineName: 'm' });
    remote.close();
    rmSync(remoteDir, { recursive: true, force: true });

    const result = await restoreFromFolder(dir, 'WRONG', env());
    expect(result).toEqual({ ok: false, error: 'wrong_passphrase_or_corrupt' });
    const row = dbHolder.db?.prepare("SELECT name FROM accounts WHERE id = 'acc-local'").get() as {
      name: string;
    };
    expect(row.name).toBe('Local');
    expect(existsSync(`${dbPath}.restore-tmp`)).toBe(false);
  });

  it('missing snapshot reports folder problem', async () => {
    const result = await restoreFromFolder(join(dir, 'nope'), 'pw', env());
    expect(result).toEqual({ ok: false, error: 'folder_unavailable' });
  });
});
