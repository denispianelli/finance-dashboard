import { readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { BackupFileInfo } from '@shared/types/backup';
import { backupFileName } from './snapshot';

/** Must match snapshot.ts's backupFileName output — and nothing else. */
export const BACKUP_FILE_RE = /^finance-(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})\.sqlite$/;

export const KEEP_COUNT = 15;

/** Newest first. Missing/unreadable folder → []. */
export function listBackups(folderPath: string): BackupFileInfo[] {
  let names: string[];
  try {
    names = readdirSync(folderPath);
  } catch {
    return [];
  }
  const out: BackupFileInfo[] = [];
  for (const fileName of names) {
    const m = BACKUP_FILE_RE.exec(fileName);
    if (m === null) continue;
    const [, date, hh, mm] = m;
    let sizeBytes: number;
    try {
      sizeBytes = statSync(join(folderPath, fileName)).size;
    } catch {
      continue; // raced away — not a backup we can offer
    }
    if (date === undefined || hh === undefined || mm === undefined) continue;
    out.push({ fileName, createdAt: `${date}T${hh}:${mm}:00`, sizeBytes });
  }
  // Name encodes the timestamp, so lexicographic order is chronological.
  out.sort((a, b) => (a.fileName < b.fileName ? 1 : -1));
  return out;
}

/** True when a snapshot whose name is dated `day`'s local calendar day exists. */
export function hasBackupForDay(folderPath: string, day: Date): boolean {
  // 'finance-YYYY-MM-DD' — the date-only prefix of backupFileName's output.
  const DATE_PREFIX_LENGTH = 'finance-XXXX-XX-XX'.length;
  const prefix = backupFileName(day).slice(0, DATE_PREFIX_LENGTH);
  return listBackups(folderPath).some((b) => b.fileName.startsWith(prefix));
}

/** Deletes matching files beyond the KEEP_COUNT newest; returns deleted names. */
export function pruneBackups(folderPath: string, keep: number = KEEP_COUNT): string[] {
  const excess = listBackups(folderPath).slice(keep);
  const deleted: string[] = [];
  for (const b of excess) {
    try {
      rmSync(join(folderPath, b.fileName), { force: true });
      deleted.push(b.fileName);
    } catch {
      // best-effort — an undeletable old file must not fail the snapshot write.
    }
  }
  return deleted;
}
