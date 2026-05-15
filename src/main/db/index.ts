import { DatabaseSync } from 'node:sqlite';
import { app } from 'electron';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { runMigrations } from './migrate';

let dbInstance: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;
  const userData = app.getPath('userData');
  mkdirSync(userData, { recursive: true });
  const dbPath = join(userData, 'finance.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  dbInstance = db;
  return db;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
