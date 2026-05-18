import { DatabaseSync } from 'node:sqlite';
import sql001 from './migrations/001_initial.sql?raw';
import sql002 from './migrations/002_seed_lcl.sql?raw';
import sql003 from './migrations/003_seed_default_account.sql?raw';
import sql004 from './migrations/004_add_fitid.sql?raw';

interface Migration {
  version: number;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  { version: 1, sql: sql001 },
  { version: 2, sql: sql002 },
  { version: 3, sql: sql003 },
  { version: 4, sql: sql004 },
];

export function runMigrations(db: DatabaseSync): void {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))",
  );
  const applied = new Set(
    (
      db.prepare('SELECT version FROM schema_migrations').all() as {
        version: number;
      }[]
    ).map((r) => r.version),
  );
  const insertVersion = db.prepare('INSERT INTO schema_migrations(version) VALUES (?)');
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    db.exec('BEGIN');
    try {
      db.exec(migration.sql);
      insertVersion.run(migration.version);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}
