-- Imported brokerage operations (audit + shares + the source imported flows derive from).
CREATE TABLE support_operations (
  id          TEXT PRIMARY KEY,
  support_id  TEXT NOT NULL REFERENCES investment_supports(id) ON DELETE CASCADE,
  op_date     TEXT NOT NULL,
  kind        TEXT NOT NULL,
  quantity    REAL NOT NULL,
  unit_price  REAL,
  gross       REAL,
  fees        REAL,
  net         REAL NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'EUR',
  raw_label   TEXT NOT NULL,
  op_hash     TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'fortuneo_csv',
  imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_support_operations_hash ON support_operations(op_hash);

ALTER TABLE support_flows ADD COLUMN operation_id TEXT REFERENCES support_operations(id) ON DELETE CASCADE;
ALTER TABLE investment_supports ADD COLUMN import_label TEXT;
