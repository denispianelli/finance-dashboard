import { dialog } from 'electron';
import { readFileSync } from 'node:fs';
import type { PickFileResponse } from '@shared/types/ipc';
import { detectType } from '../../import/detectType';
import { hashFile } from '../../import/hashFile';
import { isAlreadyImported } from '../../import/duplicateCheck';
import { getDb } from '../../db';

export async function handlePickFile(): Promise<PickFileResponse> {
  const result = await dialog.showOpenDialog({
    title: 'Select a bank statement',
    properties: ['openFile'],
    filters: [{ name: 'Statements', extensions: ['pdf', 'csv', 'ofx'] }],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { cancelled: true };
  }

  const path = result.filePaths[0];
  if (path === undefined) return { cancelled: true };

  const content = readFileSync(path);
  const type = detectType(content, path);
  if (type === null) {
    throw new Error('Unsupported file type (expected PDF, CSV or OFX)');
  }

  const hash = hashFile(content);
  const size = content.length;
  const alreadyImported = isAlreadyImported(getDb(), hash);

  return { cancelled: false, path, type, hash, size, alreadyImported };
}
