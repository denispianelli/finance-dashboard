import { dialog } from 'electron';
import type { PickFileResponse } from '@shared/types/ipc';

export async function handlePickFile(): Promise<PickFileResponse> {
  const result = await dialog.showOpenDialog({
    title: 'Select bank statements',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Statements', extensions: ['pdf', 'ofx'] }],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { cancelled: true };
  }
  return { cancelled: false, paths: result.filePaths };
}
