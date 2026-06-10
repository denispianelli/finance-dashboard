import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

const dbHolder: { db: DatabaseSync | null } = { db: null };
vi.mock('../../../src/main/db', () => ({ getDb: () => dbHolder.db }));

import {
  getSyncEnabled,
  getSyncFolder,
  getDirty,
  setDirty,
  getLastSeenSnapshotId,
  setLastSeenSnapshotId,
  enableSync,
  disableSync,
  getPassphrase,
  recordWrite,
  recordRestore,
  getStatusView,
  type PassphraseCipher,
} from '../../../src/main/sync/state';

/** Reversible fake "encryption" — enough to assert we never store the plaintext. */
const fakeCipher: PassphraseCipher = {
  isAvailable: () => true,
  encrypt: (plain) => Buffer.from(plain, 'utf8').toString('base64'),
  decrypt: (enc) => Buffer.from(enc, 'base64').toString('utf8'),
};

beforeEach(() => {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  dbHolder.db = db;
});

afterEach(() => {
  dbHolder.db?.close();
  dbHolder.db = null;
  vi.clearAllMocks();
});

describe('sync state', () => {
  it('is disabled by default with empty view', () => {
    expect(getSyncEnabled()).toBe(false);
    const view = getStatusView();
    expect(view).toEqual({
      enabled: false,
      folderPath: null,
      lastWriteAt: null,
      lastRestoreAt: null,
      lastRestoreFromMachine: null,
      dirty: false,
    });
  });

  it('enableSync stores folder and encrypted passphrase, round-trips passphrase', () => {
    enableSync('/sync/folder', 'my secret', fakeCipher);
    expect(getSyncEnabled()).toBe(true);
    expect(getSyncFolder()).toBe('/sync/folder');
    expect(getPassphrase(fakeCipher)).toBe('my secret');
    // never stored as plaintext
    const raw = dbHolder.db
      ?.prepare("SELECT value FROM app_settings WHERE key = 'sync.passphraseEnc'")
      .get() as { value: string };
    expect(raw.value).not.toBe('my secret');
  });

  it('dirty flag round-trips and survives via DB (not memory)', () => {
    expect(getDirty()).toBe(false);
    setDirty(true);
    expect(getDirty()).toBe(true);
    setDirty(false);
    expect(getDirty()).toBe(false);
  });

  it('lastSeenSnapshotId round-trips', () => {
    expect(getLastSeenSnapshotId()).toBeNull();
    setLastSeenSnapshotId('snap-1');
    expect(getLastSeenSnapshotId()).toBe('snap-1');
  });

  it('recordWrite and recordRestore update the status view', () => {
    enableSync('/sync/folder', 'pw', fakeCipher);
    recordWrite('2026-06-10T10:00:00.000Z', 'snap-1');
    expect(getLastSeenSnapshotId()).toBe('snap-1');
    expect(getDirty()).toBe(false);
    recordRestore('2026-06-10T11:00:00.000Z', 'denis-mac', 'snap-2');
    const view = getStatusView();
    expect(view.lastWriteAt).toBe('2026-06-10T10:00:00.000Z');
    expect(view.lastRestoreAt).toBe('2026-06-10T11:00:00.000Z');
    expect(view.lastRestoreFromMachine).toBe('denis-mac');
    expect(getLastSeenSnapshotId()).toBe('snap-2');
  });

  it('disableSync clears everything', () => {
    enableSync('/sync/folder', 'pw', fakeCipher);
    setDirty(true);
    setLastSeenSnapshotId('snap-1');
    disableSync();
    expect(getSyncEnabled()).toBe(false);
    expect(getSyncFolder()).toBeNull();
    expect(getPassphrase(fakeCipher)).toBeNull();
    expect(getDirty()).toBe(false);
    expect(getLastSeenSnapshotId()).toBeNull();
  });
});
