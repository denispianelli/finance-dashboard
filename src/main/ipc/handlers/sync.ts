import { dialog } from 'electron';
import type {
  SyncEnableResult,
  SyncLaunchCheck,
  SyncNowResult,
  SyncRestoreResult,
  SyncStatusView,
} from '@shared/types/sync';
import { syncController } from '../../sync/controller';

export function handleSyncGetStatus(): SyncStatusView {
  return syncController.getStatusView();
}

export async function handleSyncPickFolder(): Promise<
  { cancelled: true } | { cancelled: false; path: string }
> {
  const result = await dialog.showOpenDialog({
    title: 'Choisir le dossier de synchronisation',
    properties: ['openDirectory', 'createDirectory'],
  });
  const first = result.filePaths[0];
  if (result.canceled || first === undefined) return { cancelled: true };
  return { cancelled: false, path: first };
}

export function handleSyncEnable(payload: {
  folderPath: string;
  passphrase: string;
}): SyncEnableResult {
  return syncController.enable(payload.folderPath, payload.passphrase);
}

export function handleSyncDisable(): { ok: true } {
  syncController.disable();
  return { ok: true };
}

export function handleSyncNow(): Promise<SyncNowResult> {
  return syncController.syncNow();
}

export function handleSyncLaunchCheck(): SyncLaunchCheck {
  return syncController.launchCheck();
}

export function handleSyncRestore(): Promise<SyncRestoreResult> {
  return syncController.restore();
}

/** Conflict resolution "keep this machine": overwrite the folder snapshot. */
export function handleSyncKeepLocal(): Promise<SyncNowResult> {
  return syncController.syncNow();
}
