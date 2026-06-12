import { dialog } from 'electron';
import type {
  BackupCreateResult,
  BackupExportResult,
  BackupRestoreResult,
  BackupStatusView,
} from '@shared/types/backup';
import { backupController } from '../../backup';

export function handleBackupGetStatus(): BackupStatusView {
  return backupController.getStatusView();
}

export async function handleBackupPickFolder(): Promise<
  { cancelled: true } | { cancelled: false; path: string }
> {
  const result = await dialog.showOpenDialog({
    title: 'Choisir le dossier de sauvegarde',
    properties: ['openDirectory', 'createDirectory'],
  });
  const first = result.filePaths[0];
  if (result.canceled || first === undefined) return { cancelled: true };
  return { cancelled: false, path: first };
}

export function handleBackupSetFolder(payload: { folderPath: string }): { ok: true } {
  backupController.setFolder(payload.folderPath);
  return { ok: true };
}

export function handleBackupCreate(): BackupCreateResult {
  return backupController.createNow();
}

export function handleBackupRestore(payload: { fileName: string }): BackupRestoreResult {
  return backupController.restore(payload.fileName);
}

export async function handleBackupRestoreFromFile(): Promise<BackupRestoreResult> {
  const result = await dialog.showOpenDialog({
    title: 'Restaurer depuis une sauvegarde',
    properties: ['openFile'],
    filters: [{ name: 'Sauvegarde SQLite', extensions: ['sqlite'] }],
  });
  const first = result.filePaths[0];
  if (result.canceled || first === undefined) return { ok: false, error: 'cancelled' };
  return backupController.restoreFromPath(first);
}

export async function handleBackupExportJson(): Promise<BackupExportResult> {
  const stamp = new Date().toISOString().slice(0, 10);
  const result = await dialog.showSaveDialog({
    title: 'Exporter en JSON',
    defaultPath: `finance-export-${stamp}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  // filePath is typed as `string` in this Electron version (not `string | undefined`);
  // an empty string signals cancellation.
  if (result.canceled || result.filePath === '') return { ok: false, error: 'cancelled' };
  try {
    backupController.exportJson(result.filePath);
    return { ok: true, path: result.filePath };
  } catch (e) {
    console.error('backup: JSON export failed', e);
    return { ok: false, error: 'write_failed' };
  }
}
