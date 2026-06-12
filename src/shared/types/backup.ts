/** One snapshot file in the backup folder. */
export interface BackupFileInfo {
  fileName: string;
  /** ISO timestamp parsed from the file name (local time, seconds = 00). */
  createdAt: string;
  sizeBytes: number;
}

/** What the Settings UI needs to render the backup section. */
export interface BackupStatusView {
  /** Always resolved: the user override or the default `<userData>/backups`. Never null. */
  folderPath: string;
  /** Newest first. */
  backups: BackupFileInfo[];
  /** Human-readable message of the last failed automatic snapshot, null if none. */
  lastError: string | null;
}

export type BackupCreateResult =
  | { ok: true; fileName: string }
  | { ok: false; error: 'write_failed' };

export type BackupRestoreResult =
  | { ok: true }
  | {
      ok: false;
      /** 'cancelled' is returned only by the restoreFromFile flow (native file dialog). */
      error:
        | 'file_unavailable'
        | 'not_a_database'
        | 'integrity_failed'
        | 'schema_too_new'
        | 'cancelled';
    };

export type BackupExportResult =
  | { ok: true; path: string }
  | { ok: false; error: 'write_failed' | 'cancelled' };
