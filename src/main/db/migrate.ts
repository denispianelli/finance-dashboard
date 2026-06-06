import { DatabaseSync } from 'node:sqlite';
import sql001 from './migrations/001_initial.sql?raw';
import sql002 from './migrations/002_seed_lcl.sql?raw';
import sql003 from './migrations/003_seed_default_account.sql?raw';
import sql004 from './migrations/004_add_fitid.sql?raw';
import sql005 from './migrations/005_versioned_taxonomy.sql?raw';
import sql006 from './migrations/006_seed_categories.sql?raw';
import sql007 from './migrations/007_drop_transfer_label_rules.sql?raw';
import sql008 from './migrations/008_drop_confidence.sql?raw';
import sql009 from './migrations/009_editable_transactions.sql?raw';
import sql010 from './migrations/010_account_identifiers.sql?raw';
import sql011 from './migrations/011_account_closing_balance.sql?raw';
import sql012 from './migrations/012_account_declared_balance.sql?raw';
import sql013 from './migrations/013_transaction_refund.sql?raw';

interface Migration {
  version: number;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  { version: 1, sql: sql001 },
  { version: 2, sql: sql002 },
  { version: 3, sql: sql003 },
  { version: 4, sql: sql004 },
  { version: 5, sql: sql005 },
  { version: 6, sql: sql006 },
  { version: 7, sql: sql007 },
  { version: 8, sql: sql008 },
  { version: 9, sql: sql009 },
  { version: 10, sql: sql010 },
  { version: 11, sql: sql011 },
  { version: 12, sql: sql012 },
  { version: 13, sql: sql013 },
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
