import { copyFileSync, existsSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { BackupRestoreResult } from '@shared/types/backup';
import { LATEST_SCHEMA_VERSION } from '../db/migrate';
import { swapInValidatedCandidate, type RestoreEnv } from '../sync/restore';

/**
 * Restores the live DB from a plain SQLite backup file. The source file is
 * never moved or modified — it is copied to a temp candidate first, so a
 * failed restore leaves both the backup and the current DB untouched.
 */
export function restoreFromBackupFile(srcPath: string, env: RestoreEnv): BackupRestoreResult {
  if (!existsSync(srcPath)) return { ok: false, error: 'file_unavailable' };

  let schemaVersion: number;
  try {
    const candidate = new DatabaseSync(srcPath, { readOnly: true });
    try {
      const row = candidate
        .prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations')
        .get() as { v: number } | undefined;
      schemaVersion = row?.v ?? 0;
    } finally {
      candidate.close();
    }
  } catch {
    // Not openable as SQLite, or no schema_migrations table: not one of ours.
    return { ok: false, error: 'not_a_database' };
  }
  if (schemaVersion > LATEST_SCHEMA_VERSION) return { ok: false, error: 'schema_too_new' };

  const tmpPath = `${env.dbPath}.restore-tmp`;
  rmSync(tmpPath, { force: true });
  copyFileSync(srcPath, tmpPath);
  if (swapInValidatedCandidate(tmpPath, env) !== 'ok') {
    return { ok: false, error: 'integrity_failed' };
  }
  return { ok: true };
}
