-- Re-importing a file was impossible: imports.file_hash was UNIQUE and the confirm
-- path hard-rejected any known file before honoring the per-row selection — so a
-- statement whose first import was partial could never deliver its remaining rows.
-- Duplicate protection belongs to the transaction level (tx_hash); a known file is
-- now only an informative flag in the review screen. Inline UNIQUE constraints
-- cannot be dropped in SQLite, so rebuild the table; a plain index keeps the
-- "already imported" lookup fast. Runner runs this with foreign_keys OFF
-- (rebuildsTables) so the DROP does not trip the transactions → imports reference.
CREATE TABLE imports_rebuild (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  source_type TEXT NOT NULL,
  date_range_start TEXT NOT NULL,
  date_range_end TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'pending_review',
  closing_balance REAL,
  closing_balance_date TEXT,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);
INSERT INTO imports_rebuild
  SELECT id, account_id, file_hash, source_type, date_range_start, date_range_end,
         imported_at, status, closing_balance, closing_balance_date
    FROM imports;
DROP TABLE imports;
ALTER TABLE imports_rebuild RENAME TO imports;
CREATE INDEX idx_imports_file_hash ON imports(file_hash);
