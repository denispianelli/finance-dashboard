// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { SNAPSHOT_FILENAME } from '../../../src/main/sync/snapshot';
import type { PassphraseCipher } from '../../../src/main/sync/state';

const dbHolder: { db: DatabaseSync | null } = { db: null };
let dbPath: string;
vi.mock('../../../src/main/db', () => ({
  getDb: () => dbHolder.db,
  getDbPath: () => dbPath,
  closeDb: () => {
    dbHolder.db?.close();
    dbHolder.db = null;
  },
}));

const fakeCipher: PassphraseCipher = {
  isAvailable: () => true,
  encrypt: (plain) => Buffer.from(plain, 'utf8').toString('base64'),
  decrypt: (enc) => Buffer.from(enc, 'base64').toString('utf8'),
};
vi.mock('../../../src/main/sync/passphrase', () => ({
  get safeStorageCipher() {
    return fakeCipher;
  },
}));

import { SyncController } from '../../../src/main/sync/controller';

let dir: string;
let folder: string;
let controller: SyncController;

beforeEach(() => {
  vi.useFakeTimers();
  dir = mkdtempSync(join(tmpdir(), 'fd-ctrl-'));
  folder = mkdtempSync(join(tmpdir(), 'fd-ctrl-folder-'));
  dbPath = join(dir, 'finance.sqlite');
  dbHolder.db = new DatabaseSync(dbPath);
  runMigrations(dbHolder.db);
  controller = new SyncController();
});

afterEach(() => {
  vi.useRealTimers();
  dbHolder.db?.close();
  dbHolder.db = null;
  rmSync(dir, { recursive: true, force: true });
  rmSync(folder, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe('SyncController', () => {
  it('syncNow is a no-op error when disabled', async () => {
    expect(await controller.syncNow()).toEqual({ ok: false, error: 'disabled' });
  });

  it('enable + syncNow writes a snapshot and clears dirty', async () => {
    // Switch to real timers for this test because writeSnapshot runs real
    // async crypto (Argon2id key derivation) which doesn't mix with fake timers.
    vi.useRealTimers();
    expect(controller.enable(folder, 'pw')).toEqual({ ok: true });
    controller.markDirty();
    const result = await controller.syncNow();
    expect(result.ok).toBe(true);
    expect(existsSync(join(folder, SNAPSHOT_FILENAME))).toBe(true);
    expect(controller.getStatusView().dirty).toBe(false);
    expect(controller.needsQuitFlush()).toBe(false);
  });

  it('enable refuses an unreachable folder', () => {
    expect(controller.enable(join(folder, 'missing-sub'), 'pw')).toEqual({
      ok: false,
      error: 'folder_unavailable',
    });
  });

  it('markDirty schedules a debounced syncNow', async () => {
    // Advance fake timers to trigger the debounce, then drain microtasks.
    // writeSnapshot uses real async crypto so we switch to real timers after
    // the debounce fires, wait for the file to appear, and switch back.
    controller.enable(folder, 'pw');
    controller.markDirty();
    expect(controller.getStatusView().dirty).toBe(true);
    expect(existsSync(join(folder, SNAPSHOT_FILENAME))).toBe(false);

    // Fire the debounce — this schedules the async syncNow callback.
    await vi.advanceTimersByTimeAsync(31_000);

    // The debounce timer has fired and syncNow is now running on real async.
    // Switch to real timers and poll until the snapshot appears (max 10 s).
    vi.useRealTimers();
    const deadline = Date.now() + 10_000;
    while (!existsSync(join(folder, SNAPSHOT_FILENAME)) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(existsSync(join(folder, SNAPSHOT_FILENAME))).toBe(true);
    expect(controller.getStatusView().dirty).toBe(false);
  });

  it('markDirty does nothing when sync is disabled', () => {
    controller.markDirty();
    expect(controller.getStatusView().dirty).toBe(false);
  });

  it('launchCheck reflects the folder state', async () => {
    vi.useRealTimers();
    controller.enable(folder, 'pw');
    expect(controller.launchCheck().kind).toBe('no_snapshot');
    await controller.syncNow();
    expect(controller.launchCheck().kind).toBe('up_to_date');
  });

  it('needsQuitFlush true only when enabled and dirty', () => {
    expect(controller.needsQuitFlush()).toBe(false);
    controller.enable(folder, 'pw');
    expect(controller.needsQuitFlush()).toBe(false);
    controller.markDirty();
    expect(controller.needsQuitFlush()).toBe(true);
  });

  it('flushOnQuit is a no-op when sync is disabled', async () => {
    vi.useRealTimers();
    await expect(controller.flushOnQuit()).resolves.toBeUndefined();
    expect(existsSync(join(folder, SNAPSHOT_FILENAME))).toBe(false);
  });

  it('disable clears a pending debounced write', async () => {
    controller.enable(folder, 'pw');
    controller.markDirty();
    controller.disable();
    await vi.advanceTimersByTimeAsync(31_000);
    vi.useRealTimers();
    await new Promise((r) => setTimeout(r, 300));
    expect(existsSync(join(folder, SNAPSHOT_FILENAME))).toBe(false);
  });
});
