/** What the Settings UI needs to render the sync section. */
export interface SyncStatusView {
  enabled: boolean;
  folderPath: string | null;
  /** ISO timestamp of the last snapshot this machine wrote, null if never. */
  lastWriteAt: string | null;
  /** ISO timestamp of the last restore applied on this machine, null if never. */
  lastRestoreAt: string | null;
  /** Machine name embedded in the last restored snapshot. */
  lastRestoreFromMachine: string | null;
  /** Local DB has changes not yet written to the sync folder. */
  dirty: boolean;
}

/** Result of the launch-time (or post-enable) check against the sync folder. */
export type SyncLaunchCheck =
  | { kind: 'disabled' }
  | { kind: 'up_to_date' }
  | { kind: 'no_snapshot' }
  | { kind: 'folder_unavailable' }
  | { kind: 'snapshot_invalid' }
  | { kind: 'restore_available'; machineName: string; createdAt: string }
  | { kind: 'conflict'; machineName: string; createdAt: string }
  | { kind: 'schema_too_new'; machineName: string; createdAt: string };

export type SyncNowResult =
  | { ok: true; writtenAt: string }
  | { ok: false; error: 'disabled' | 'folder_unavailable' | 'write_failed' };

export type SyncRestoreResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | 'disabled'
        | 'folder_unavailable'
        | 'snapshot_invalid'
        | 'wrong_passphrase_or_corrupt'
        | 'integrity_failed'
        | 'schema_too_new';
    };

export type SyncEnableResult =
  | { ok: true }
  | { ok: false; error: 'safe_storage_unavailable' | 'folder_unavailable' };
