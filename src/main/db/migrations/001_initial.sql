PRAGMA foreign_keys = ON;

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  bank_id TEXT,
  currency TEXT NOT NULL DEFAULT 'EUR',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE banks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  detected_signature TEXT
);

CREATE TABLE bank_column_mappings (
  bank_id TEXT NOT NULL,
  format_version TEXT NOT NULL,
  date_col INTEGER NOT NULL,
  label_col INTEGER NOT NULL,
  debit_col INTEGER,
  credit_col INTEGER,
  balance_col INTEGER,
  PRIMARY KEY (bank_id, format_version),
  FOREIGN KEY (bank_id) REFERENCES banks(id)
);

CREATE TABLE imports (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  file_hash TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL,
  date_range_start TEXT NOT NULL,
  date_range_end TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'pending_review',
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  parent_id TEXT,
  name TEXT NOT NULL,
  icon TEXT,
  color TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (parent_id) REFERENCES categories(id)
);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  import_id TEXT,
  tx_hash TEXT NOT NULL,
  date TEXT NOT NULL,
  amount REAL NOT NULL,
  label_raw TEXT NOT NULL,
  label_clean TEXT NOT NULL,
  category_id TEXT,
  confidence REAL,
  is_internal_transfer INTEGER NOT NULL DEFAULT 0,
  user_modified INTEGER NOT NULL DEFAULT 0,
  UNIQUE (account_id, tx_hash),
  FOREIGN KEY (account_id) REFERENCES accounts(id),
  FOREIGN KEY (import_id) REFERENCES imports(id),
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE INDEX idx_transactions_account_date ON transactions(account_id, date);
CREATE INDEX idx_transactions_category ON transactions(category_id);

CREATE TABLE categorization_rules (
  id TEXT PRIMARY KEY,
  match_type TEXT NOT NULL,
  match_value TEXT NOT NULL,
  category_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  hit_count INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO schema_migrations(version) VALUES (1);
