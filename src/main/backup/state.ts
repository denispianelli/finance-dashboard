import { getDb } from '../db';

const KEY = 'backup.folderPath';

/** User override of the backup folder; null → caller falls back to the default. */
export function getBackupFolderOverride(): string | null {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(KEY) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setBackupFolder(folderPath: string): void {
  getDb()
    .prepare(
      'INSERT INTO app_settings (key, value) VALUES (?, ?) ' +
        'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    )
    .run(KEY, folderPath);
}
