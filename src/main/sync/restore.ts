import { copyFileSync, existsSync, renameSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { SyncRestoreResult } from '@shared/types/sync';
import { LATEST_SCHEMA_VERSION } from '../db/migrate';
import { decryptSnapshotToFile, readSnapshotHeader } from './snapshot';
import { recordRestore } from './state';

export interface RestoreEnv {
  dbPath: string;
  closeDb(): void;
  /** Reopen the app DB (runs migrations) so subsequent getDb() calls serve the restored data. */
  reopenDb(): void;
}

export async function restoreFromFolder(
  folderPath: string,
  passphrase: string,
  env: RestoreEnv,
): Promise<SyncRestoreResult> {
  const headerRes = readSnapshotHeader(folderPath);
  if (headerRes.kind === 'unavailable' || headerRes.kind === 'missing') {
    return { ok: false, error: 'folder_unavailable' };
  }
  if (headerRes.kind === 'invalid') return { ok: false, error: 'snapshot_invalid' };
  const { header } = headerRes;
  if (header.schemaVersion > LATEST_SCHEMA_VERSION) {
    return { ok: false, error: 'schema_too_new' };
  }

  const tmpPath = `${env.dbPath}.restore-tmp`;
  rmSync(tmpPath, { force: true });
  const decrypted = await decryptSnapshotToFile(folderPath, passphrase, tmpPath);
  if (decrypted === 'invalid') return { ok: false, error: 'snapshot_invalid' };
  if (decrypted === 'mac_failed') return { ok: false, error: 'wrong_passphrase_or_corrupt' };

  try {
    const check = new DatabaseSync(tmpPath);
    const row = check.prepare('PRAGMA integrity_check').get() as
      | { integrity_check: string }
      | undefined;
    check.close();
    if (row?.integrity_check !== 'ok') {
      rmSync(tmpPath, { force: true });
      return { ok: false, error: 'integrity_failed' };
    }
  } catch {
    rmSync(tmpPath, { force: true });
    return { ok: false, error: 'integrity_failed' };
  }

  env.closeDb();
  // .bak files accumulate by design in v1 — manual cleanup; they are the
  // rollback story (see ADR-017).
  if (existsSync(env.dbPath)) {
    const stamp = new Date().toISOString().replaceAll(':', '-');
    copyFileSync(env.dbPath, `${env.dbPath}.bak-${stamp}`);
  }
  // WAL side files belong to the old DB; they must not shadow the restored one.
  rmSync(`${env.dbPath}-wal`, { force: true });
  rmSync(`${env.dbPath}-shm`, { force: true });
  renameSync(tmpPath, env.dbPath);
  env.reopenDb();

  recordRestore(new Date().toISOString(), header.machineName, header.snapshotId);
  return { ok: true };
}
