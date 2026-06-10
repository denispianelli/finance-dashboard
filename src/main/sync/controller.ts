import { statSync } from 'node:fs';
import { hostname } from 'node:os';
import type {
  SyncEnableResult,
  SyncLaunchCheck,
  SyncNowResult,
  SyncRestoreResult,
  SyncStatusView,
} from '@shared/types/sync';
import { closeDb, getDb, getDbPath } from '../db';
import { LATEST_SCHEMA_VERSION } from '../db/migrate';
import { decideLaunch } from './launchCheck';
import { safeStorageCipher } from './passphrase';
import { restoreFromFolder } from './restore';
import { readSnapshotHeader, writeSnapshot } from './snapshot';
import * as state from './state';

const DEBOUNCE_MS = 30_000;

export class SyncController {
  private debounceTimer: NodeJS.Timeout | null = null;

  enable(folderPath: string, passphrase: string): SyncEnableResult {
    if (!safeStorageCipher.isAvailable()) {
      return { ok: false, error: 'safe_storage_unavailable' };
    }
    try {
      if (!statSync(folderPath).isDirectory()) return { ok: false, error: 'folder_unavailable' };
    } catch {
      return { ok: false, error: 'folder_unavailable' };
    }
    state.enableSync(folderPath, passphrase, safeStorageCipher);
    return { ok: true };
  }

  disable(): void {
    this.clearDebounce();
    state.disableSync();
  }

  getStatusView(): SyncStatusView {
    return state.getStatusView();
  }

  /** Mark the DB as changed and schedule a debounced snapshot write. */
  markDirty(): void {
    if (!state.getSyncEnabled()) return;
    state.setDirty(true);
    this.clearDebounce();
    this.debounceTimer = setTimeout(() => {
      void this.syncNow().catch((e: unknown) => {
        console.error('sync: debounced snapshot failed', e);
      });
    }, DEBOUNCE_MS);
    this.debounceTimer.unref();
  }

  async syncNow(): Promise<SyncNowResult> {
    this.clearDebounce();
    if (!state.getSyncEnabled()) return { ok: false, error: 'disabled' };
    const folderPath = state.getSyncFolder();
    const passphrase = state.getPassphrase(safeStorageCipher);
    if (folderPath === null || passphrase === null) return { ok: false, error: 'disabled' };
    try {
      if (!statSync(folderPath).isDirectory()) return { ok: false, error: 'folder_unavailable' };
    } catch {
      return { ok: false, error: 'folder_unavailable' };
    }
    try {
      const header = await writeSnapshot(getDb(), {
        folderPath,
        passphrase,
        machineName: hostname(),
      });
      state.recordWrite(header.createdAt, header.snapshotId);
      return { ok: true, writtenAt: header.createdAt };
    } catch (e) {
      console.error('sync: snapshot write failed', e);
      return { ok: false, error: 'write_failed' };
    }
  }

  launchCheck(): SyncLaunchCheck {
    const enabled = state.getSyncEnabled();
    const folderPath = state.getSyncFolder();
    return decideLaunch({
      enabled,
      header: enabled && folderPath !== null ? readSnapshotHeader(folderPath) : { kind: 'missing' },
      lastSeenSnapshotId: state.getLastSeenSnapshotId(),
      dirty: state.getDirty(),
      appSchemaVersion: LATEST_SCHEMA_VERSION,
    });
  }

  async restore(): Promise<SyncRestoreResult> {
    if (!state.getSyncEnabled()) return { ok: false, error: 'disabled' };
    const folderPath = state.getSyncFolder();
    const passphrase = state.getPassphrase(safeStorageCipher);
    if (folderPath === null || passphrase === null) return { ok: false, error: 'disabled' };
    const result = await restoreFromFolder(folderPath, passphrase, {
      dbPath: getDbPath(),
      closeDb,
      reopenDb: () => {
        getDb();
      },
    });
    if (result.ok) {
      // The restored DB carries the sender's sync settings (their keychain-
      // encrypted passphrase, their folder path). Rewrite them with this
      // machine's values so the next snapshot write works here.
      state.enableSync(folderPath, passphrase, safeStorageCipher);
    }
    return result;
  }

  needsQuitFlush(): boolean {
    return state.getSyncEnabled() && state.getDirty();
  }

  async flushOnQuit(): Promise<void> {
    if (!this.needsQuitFlush()) return;
    const result = await this.syncNow();
    if (!result.ok) console.error('sync: quit flush failed:', result.error);
  }

  private clearDebounce(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}

export const syncController = new SyncController();
