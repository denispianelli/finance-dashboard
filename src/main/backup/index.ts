import { app } from 'electron';
import { join } from 'node:path';
import { closeDb, getDb, getDbPath } from '../db';
import { BackupController } from './controller';

export const backupController = new BackupController({
  getDb,
  defaultFolder: () => join(app.getPath('userData'), 'backups'),
  restoreEnv: () => ({
    dbPath: getDbPath(),
    closeDb,
    reopenDb: () => {
      getDb();
    },
  }),
});
