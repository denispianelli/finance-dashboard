import type { SyncLaunchCheck } from '@shared/types/sync';
import type { HeaderReadResult } from './snapshot';

export interface LaunchCheckInput {
  enabled: boolean;
  header: HeaderReadResult;
  /** Snapshot id this machine last wrote or restored, null on first run. */
  lastSeenSnapshotId: string | null;
  /** Local DB has changes not yet snapshotted. */
  dirty: boolean;
  appSchemaVersion: number;
}

/**
 * Pure decision for the launch gate. Identity-based, never clock-based:
 * a snapshot is "new" iff its id differs from the one we last saw.
 */
export function decideLaunch(input: LaunchCheckInput): SyncLaunchCheck {
  if (!input.enabled) return { kind: 'disabled' };
  switch (input.header.kind) {
    case 'unavailable':
      return { kind: 'folder_unavailable' };
    case 'missing':
      return { kind: 'no_snapshot' };
    case 'invalid':
      return { kind: 'snapshot_invalid' };
    case 'ok':
      break;
  }
  const { header } = input.header;
  if (header.snapshotId === input.lastSeenSnapshotId) return { kind: 'up_to_date' };
  if (header.schemaVersion > input.appSchemaVersion) {
    return {
      kind: 'schema_too_new',
      machineName: header.machineName,
      createdAt: header.createdAt,
    };
  }
  if (input.dirty) {
    return { kind: 'conflict', machineName: header.machineName, createdAt: header.createdAt };
  }
  return {
    kind: 'restore_available',
    machineName: header.machineName,
    createdAt: header.createdAt,
  };
}
