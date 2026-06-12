import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type {
  BackupCreateResult,
  BackupRestoreResult,
  BackupStatusView,
} from '@shared/types/backup';
import type { RestoreEnv } from '../sync/restore';
import { writeBackupSnapshot } from './snapshot';
import { BACKUP_FILE_RE, hasBackupForDay, listBackups, pruneBackups } from './rotation';
import { restoreFromBackupFile } from './restore';
import { writeJsonExport } from './exportJson';
import { getBackupFolderOverride, setBackupFolder } from './state';

export interface BackupControllerDeps {
  getDb(): DatabaseSync;
  /** `<userData>/backups` in the app; injected for tests. */
  defaultFolder(): string;
  restoreEnv(): RestoreEnv;
}

export class BackupController {
  private lastError: string | null = null;

  constructor(private readonly deps: BackupControllerDeps) {}

  folder(): string {
    return getBackupFolderOverride() ?? this.deps.defaultFolder();
  }

  setFolder(folderPath: string): void {
    setBackupFolder(folderPath);
  }

  getStatusView(): BackupStatusView {
    const folderPath = this.folder();
    return { folderPath, backups: listBackups(folderPath), lastError: this.lastError };
  }

  /** Launch trigger (spec §1): at most one snapshot per local day. Never throws. */
  ensureDailySnapshot(now: Date = new Date()): void {
    try {
      if (hasBackupForDay(this.folder(), now)) return;
      this.write(now);
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      console.error('backup: daily snapshot failed', e);
    }
  }

  /** Pre-import trigger (spec §1): always writes. False on failure — the import proceeds. */
  snapshotBeforeImport(now: Date = new Date()): boolean {
    try {
      this.write(now);
      return true;
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      console.error('backup: pre-import snapshot failed', e);
      return false;
    }
  }

  /** Manual « Sauvegarder maintenant ». */
  createNow(): BackupCreateResult {
    try {
      const { fileName } = this.write(new Date());
      return { ok: true, fileName };
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      console.error('backup: manual snapshot failed', e);
      return { ok: false, error: 'write_failed' };
    }
  }

  /** Restore a snapshot from the backup folder by file name (no paths from the renderer). */
  restore(fileName: string): BackupRestoreResult {
    if (!BACKUP_FILE_RE.test(fileName)) return { ok: false, error: 'file_unavailable' };
    return restoreFromBackupFile(join(this.folder(), fileName), this.deps.restoreEnv());
  }

  /** Restore from an absolute path picked in a main-process file dialog. */
  restoreFromPath(filePath: string): BackupRestoreResult {
    return restoreFromBackupFile(filePath, this.deps.restoreEnv());
  }

  exportJson(destPath: string): void {
    writeJsonExport(this.deps.getDb(), destPath);
  }

  private write(now: Date): { fileName: string } {
    const folderPath = this.folder();
    const res = writeBackupSnapshot(this.deps.getDb(), folderPath, now);
    pruneBackups(folderPath);
    this.lastError = null;
    return { fileName: res.fileName };
  }
}
