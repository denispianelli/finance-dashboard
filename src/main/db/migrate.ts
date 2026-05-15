import { DatabaseSync } from 'node:sqlite';
import sql001 from './migrations/001_initial.sql?raw';

interface Migration {
  version: number;
  sql: string;
}

const MIGRATIONS: Migration[] = [{ version: 1, sql: sql001 }];

export function runMigrations(db: DatabaseSync): void {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))",
  );
  const applied = new Set(
    (
      db.prepare('SELECT version FROM schema_migrations').all() as Array<{
        version: number;
      }>
    ).map((r) => r.version),
  );
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    db.exec(migration.sql);
  }
}
