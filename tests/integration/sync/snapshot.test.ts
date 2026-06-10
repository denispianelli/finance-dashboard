import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import {
  writeSnapshot,
  readSnapshotHeader,
  decryptSnapshotToFile,
  SNAPSHOT_FILENAME,
} from '../../../src/main/sync/snapshot';

let dir: string;
let db: DatabaseSync;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fd-sync-'));
  db = new DatabaseSync(join(dir, 'source.sqlite'));
  db.exec('PRAGMA journal_mode = WAL');
  runMigrations(db);
  db.prepare(
    "INSERT INTO accounts (id, name, type, bank_id, currency) VALUES ('acc-1','Sync Test','checking','lcl','EUR')",
  ).run();
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('snapshot write + read', () => {
  it('writes finance.fbk and reads its header back', async () => {
    const header = await writeSnapshot(db, {
      folderPath: dir,
      passphrase: 'pw',
      machineName: 'test-machine',
    });
    expect(existsSync(join(dir, SNAPSHOT_FILENAME))).toBe(true);
    const res = readSnapshotHeader(dir);
    expect(res.kind).toBe('ok');
    if (res.kind !== 'ok') return;
    expect(res.header.snapshotId).toBe(header.snapshotId);
    expect(res.header.machineName).toBe('test-machine');
    expect(res.header.schemaVersion).toBeGreaterThan(0);
  });

  it('decrypts the snapshot back to a valid SQLite file with the data', async () => {
    await writeSnapshot(db, { folderPath: dir, passphrase: 'pw', machineName: 'm' });
    const dest = join(dir, 'restored.sqlite');
    const result = await decryptSnapshotToFile(dir, 'pw', dest);
    expect(result).toBe('ok');
    const restored = new DatabaseSync(dest);
    const row = restored.prepare("SELECT name FROM accounts WHERE id = 'acc-1'").get() as {
      name: string;
    };
    expect(row.name).toBe('Sync Test');
    restored.close();
  });

  it('fails decryption with the wrong passphrase', async () => {
    await writeSnapshot(db, { folderPath: dir, passphrase: 'pw', machineName: 'm' });
    expect(await decryptSnapshotToFile(dir, 'nope', join(dir, 'out.sqlite'))).toBe('mac_failed');
    expect(existsSync(join(dir, 'out.sqlite'))).toBe(false);
  });

  it('reports missing / invalid / unavailable headers', () => {
    expect(readSnapshotHeader(dir).kind).toBe('missing');
    writeFileSync(join(dir, SNAPSHOT_FILENAME), Buffer.from('garbage'));
    expect(readSnapshotHeader(dir).kind).toBe('invalid');
    expect(readSnapshotHeader(join(dir, 'does-not-exist')).kind).toBe('unavailable');
  });

  it('truncated file fails cleanly as mac_failed (partial sync simulation)', async () => {
    await writeSnapshot(db, { folderPath: dir, passphrase: 'pw', machineName: 'm' });
    const full = readFileSync(join(dir, SNAPSHOT_FILENAME));
    writeFileSync(join(dir, SNAPSHOT_FILENAME), full.subarray(0, full.length - 32));
    expect(await decryptSnapshotToFile(dir, 'pw', join(dir, 'out.sqlite'))).toBe('mac_failed');
  });
});
