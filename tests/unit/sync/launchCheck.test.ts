import { describe, it, expect } from 'vitest';
import { decideLaunch } from '../../../src/main/sync/launchCheck';
import type { SnapshotHeader } from '../../../src/main/sync/header';

const header = (over: Partial<SnapshotHeader> = {}): SnapshotHeader => ({
  formatVersion: 1,
  schemaVersion: 16,
  createdAt: '2026-06-09T22:14:00.000Z',
  machineName: 'denis-mac',
  snapshotId: 'snap-remote',
  salt: 'c2FsdA==',
  nonce: 'bm9uY2U=',
  ...over,
});

const base = {
  enabled: true,
  lastSeenSnapshotId: 'snap-local' as string | null,
  dirty: false,
  appSchemaVersion: 16,
};

describe('decideLaunch', () => {
  it('disabled when sync is off', () => {
    expect(decideLaunch({ ...base, enabled: false, header: { kind: 'missing' } })).toEqual({
      kind: 'disabled',
    });
  });

  it('no_snapshot when folder is empty', () => {
    expect(decideLaunch({ ...base, header: { kind: 'missing' } })).toEqual({ kind: 'no_snapshot' });
  });

  it('folder_unavailable when folder cannot be read', () => {
    expect(decideLaunch({ ...base, header: { kind: 'unavailable' } })).toEqual({
      kind: 'folder_unavailable',
    });
  });

  it('snapshot_invalid on unparseable file', () => {
    expect(decideLaunch({ ...base, header: { kind: 'invalid' } })).toEqual({
      kind: 'snapshot_invalid',
    });
  });

  it('up_to_date when the folder snapshot is the one we last saw', () => {
    expect(
      decideLaunch({
        ...base,
        header: { kind: 'ok', header: header({ snapshotId: 'snap-local' }) },
      }),
    ).toEqual({ kind: 'up_to_date' });
  });

  it('restore_available when snapshot is new and local DB is clean', () => {
    expect(decideLaunch({ ...base, header: { kind: 'ok', header: header() } })).toEqual({
      kind: 'restore_available',
      machineName: 'denis-mac',
      createdAt: '2026-06-09T22:14:00.000Z',
    });
  });

  it('conflict when snapshot is new and local DB is dirty', () => {
    expect(
      decideLaunch({ ...base, dirty: true, header: { kind: 'ok', header: header() } }),
    ).toEqual({
      kind: 'conflict',
      machineName: 'denis-mac',
      createdAt: '2026-06-09T22:14:00.000Z',
    });
  });

  it('schema_too_new wins over restore/conflict', () => {
    const res = decideLaunch({
      ...base,
      dirty: true,
      header: { kind: 'ok', header: header({ schemaVersion: 99 }) },
    });
    expect(res.kind).toBe('schema_too_new');
  });

  it('first launch on second machine: lastSeen null + clean → restore_available', () => {
    expect(
      decideLaunch({ ...base, lastSeenSnapshotId: null, header: { kind: 'ok', header: header() } }),
    ).toEqual({
      kind: 'restore_available',
      machineName: 'denis-mac',
      createdAt: '2026-06-09T22:14:00.000Z',
    });
  });
});
