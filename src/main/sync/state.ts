import { getDb } from '../db';
import type { SyncStatusView } from '@shared/types/sync';

export interface PassphraseCipher {
  isAvailable(): boolean;
  /** plaintext → opaque string safe to persist */
  encrypt(plain: string): string;
  /** inverse of encrypt */
  decrypt(enc: string): string;
}

const KEYS = {
  enabled: 'sync.enabled',
  folder: 'sync.folderPath',
  passphraseEnc: 'sync.passphraseEnc',
  dirty: 'sync.dirty',
  lastSeenSnapshotId: 'sync.lastSeenSnapshotId',
  lastWriteAt: 'sync.lastWriteAt',
  lastRestoreAt: 'sync.lastRestoreAt',
  lastRestoreFrom: 'sync.lastRestoreFromMachine',
} as const;

function read(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

function write(key: string, value: string): void {
  getDb()
    .prepare(
      'INSERT INTO app_settings (key, value) VALUES (?, ?) ' +
        'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    )
    .run(key, value);
}

function remove(key: string): void {
  getDb().prepare('DELETE FROM app_settings WHERE key = ?').run(key);
}

export function getSyncEnabled(): boolean {
  return read(KEYS.enabled) === '1';
}

export function getSyncFolder(): string | null {
  return read(KEYS.folder);
}

export function getDirty(): boolean {
  return read(KEYS.dirty) === '1';
}

export function setDirty(value: boolean): void {
  write(KEYS.dirty, value ? '1' : '0');
}

export function getLastSeenSnapshotId(): string | null {
  return read(KEYS.lastSeenSnapshotId);
}

export function setLastSeenSnapshotId(id: string): void {
  write(KEYS.lastSeenSnapshotId, id);
}

export function enableSync(folderPath: string, passphrase: string, cipher: PassphraseCipher): void {
  if (!cipher.isAvailable()) {
    throw new Error('sync: passphrase cipher unavailable — cannot enable sync');
  }
  write(KEYS.folder, folderPath);
  write(KEYS.passphraseEnc, cipher.encrypt(passphrase));
  write(KEYS.enabled, '1');
}

export function disableSync(): void {
  for (const key of Object.values(KEYS)) remove(key);
}

export function getPassphrase(cipher: PassphraseCipher): string | null {
  const enc = read(KEYS.passphraseEnc);
  if (enc === null) return null;
  return cipher.decrypt(enc);
}

/** After a successful snapshot write: our own snapshot becomes the last seen one. */
export function recordWrite(writtenAt: string, snapshotId: string): void {
  write(KEYS.lastWriteAt, writtenAt);
  setLastSeenSnapshotId(snapshotId);
  setDirty(false);
}

/** After a successful restore: the folder snapshot becomes the last seen one. */
export function recordRestore(restoredAt: string, fromMachine: string, snapshotId: string): void {
  write(KEYS.lastRestoreAt, restoredAt);
  write(KEYS.lastRestoreFrom, fromMachine);
  setLastSeenSnapshotId(snapshotId);
  setDirty(false);
}

export function getStatusView(): SyncStatusView {
  return {
    enabled: getSyncEnabled(),
    folderPath: getSyncFolder(),
    lastWriteAt: read(KEYS.lastWriteAt),
    lastRestoreAt: read(KEYS.lastRestoreAt),
    lastRestoreFromMachine: read(KEYS.lastRestoreFrom),
    dirty: getDirty(),
  };
}
