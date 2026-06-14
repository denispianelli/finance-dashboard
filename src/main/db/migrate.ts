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
import sql014 from './migrations/014_refund_category.sql?raw';
import sql015 from './migrations/015_app_settings.sql?raw';
import sql016 from './migrations/016_index_label_amount.sql?raw';
import sql017 from './migrations/017_llm_attempts.sql?raw';
import sql018 from './migrations/018_imports_allow_reimport.sql?raw';
import sql019 from './migrations/019_drop_llm_attempts.sql?raw';
import sql020 from './migrations/020_loans_assets.sql?raw';
import sql021 from './migrations/021_loan_number.sql?raw';

interface Migration {
  version: number;
  sql: string;
  /** Drops/renames a table other tables reference: run with foreign_keys OFF
   *  (a DROP would otherwise trip the children's references), then verify with
   *  foreign_key_check before re-enabling. */
  rebuildsTables?: boolean;
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
  { version: 14, sql: sql014 },
  { version: 15, sql: sql015 },
  { version: 16, sql: sql016 },
  { version: 17, sql: sql017 },
  { version: 18, sql: sql018, rebuildsTables: true },
  { version: 19, sql: sql019 },
  { version: 20, sql: sql020 },
  { version: 21, sql: sql021 },
];

/** Highest migration version this build knows — embedded in snapshot headers. */
export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;

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
  const fkOn = (): boolean =>
    (db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys === 1;
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    // PRAGMA foreign_keys is a no-op inside a transaction, so toggle it before BEGIN
    // and only when the connection actually enforces FKs (tests usually don't).
    const suspendFk = migration.rebuildsTables === true && fkOn();
    if (suspendFk) db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN');
    try {
      db.exec(migration.sql);
      insertVersion.run(migration.version);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    } finally {
      if (suspendFk) db.exec('PRAGMA foreign_keys = ON');
    }
    if (suspendFk && db.prepare('PRAGMA foreign_key_check').all().length > 0) {
      throw new Error(`migration ${String(migration.version)} left broken foreign keys`);
    }
  }
}
