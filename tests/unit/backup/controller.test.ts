import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

const dbHolder: { db: DatabaseSync | null } = { db: null };
vi.mock('../../../src/main/db', () => ({ getDb: () => dbHolder.db }));

import { BackupController } from '../../../src/main/backup/controller';
import { setBackupFolder } from '../../../src/main/backup/state';
import { listBackups } from '../../../src/main/backup/rotation';

let dir: string;
let controller: BackupController;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fd-backup-ctl-'));
  dbHolder.db = new DatabaseSync(join(dir, 'finance.sqlite'));
  runMigrations(dbHolder.db);
  controller = new BackupController({
    getDb: () => {
      if (dbHolder.db === null) throw new Error('db closed');
      return dbHolder.db;
    },
    defaultFolder: () => join(dir, 'backups'),
    restoreEnv: () => ({
      dbPath: join(dir, 'finance.sqlite'),
      closeDb: () => {
        dbHolder.db?.close();
        dbHolder.db = null;
      },
      reopenDb: () => {
        dbHolder.db = new DatabaseSync(join(dir, 'finance.sqlite'));
        runMigrations(dbHolder.db);
      },
    }),
  });
});

afterEach(() => {
  dbHolder.db?.close();
  dbHolder.db = null;
  rmSync(dir, { recursive: true, force: true });
});

describe('ensureDailySnapshot', () => {
  it('writes one snapshot, then skips the rest of the day', () => {
    controller.ensureDailySnapshot();
    controller.ensureDailySnapshot();
    expect(listBackups(join(dir, 'backups'))).toHaveLength(1);
  });

  it('records a lastError instead of throwing when the folder is unwritable', () => {
    setBackupFolder(join(dir, 'finance.sqlite')); // a file → mkdir/VACUUM fails
    expect(() => {
      controller.ensureDailySnapshot();
    }).not.toThrow();
    expect(controller.getStatusView().lastError).not.toBeNull();
  });
});

describe('snapshotBeforeImport', () => {
  it('always writes (same day as the launch snapshot) and reports success', () => {
    controller.ensureDailySnapshot();
    const ok = controller.snapshotBeforeImport(new Date(Date.now() + 60_000));
    expect(ok).toBe(true);
    expect(listBackups(join(dir, 'backups'))).toHaveLength(2);
  });

  it('returns false on failure instead of throwing', () => {
    setBackupFolder(join(dir, 'finance.sqlite'));
    expect(controller.snapshotBeforeImport()).toBe(false);
  });
});

describe('createNow', () => {
  it('writes a snapshot and returns its file name', () => {
    const res = controller.createNow();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(listBackups(join(dir, 'backups')).map((b) => b.fileName)).toContain(res.fileName);
  });
});

describe('restore', () => {
  it('refuses a fileName that is not a plain backup name (path traversal)', () => {
    expect(controller.restore('../finance.sqlite')).toEqual({
      ok: false,
      error: 'file_unavailable',
    });
  });
});

describe('getStatusView', () => {
  it('reports the override folder and the backup list', () => {
    setBackupFolder(join(dir, 'elsewhere'));
    controller.ensureDailySnapshot();
    const view = controller.getStatusView();
    expect(view.folderPath).toBe(join(dir, 'elsewhere'));
    expect(view.backups).toHaveLength(1);
  });
});
