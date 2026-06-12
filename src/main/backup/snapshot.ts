import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

/** `finance-YYYY-MM-DD_HHmm.sqlite`, local time (spec §1). */
export function backupFileName(now: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const date = `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `finance-${date}_${pad(now.getHours())}${pad(now.getMinutes())}.sqlite`;
}

export interface WriteBackupResult {
  fileName: string;
  /** True when a snapshot for the same minute already existed (nothing written). */
  skipped: boolean;
}

/**
 * VACUUM INTO a tmp name inside the backup folder (clean, WAL-independent
 * copy — same pattern as sync/snapshot.ts), then rename atomically.
 * Same-minute target already present → skip: it captures the same state.
 * Throws on fs/SQLite errors — callers map that to a user-facing result.
 */
export function writeBackupSnapshot(
  db: DatabaseSync,
  folderPath: string,
  now: Date = new Date(),
): WriteBackupResult {
  mkdirSync(folderPath, { recursive: true });
  const fileName = backupFileName(now);
  const target = join(folderPath, fileName);
  if (existsSync(target)) return { fileName, skipped: true };
  // VACUUM INTO refuses to overwrite; the random name guarantees absence.
  const tmp = join(folderPath, `.${fileName}.${randomUUID()}.tmp`);
  try {
    db.exec(`VACUUM INTO '${tmp.replaceAll("'", "''")}'`);
    renameSync(tmp, target);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
  return { fileName, skipped: false };
}
