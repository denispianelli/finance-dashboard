-- Investment tracking (ADR-009 Amd 3, Phase A): wrappers → supports → declared
-- valuations + flows. 100% local; no quotes/prices (Phase B).
CREATE TABLE investment_wrappers (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE investment_supports (
  id             TEXT PRIMARY KEY,
  wrapper_id     TEXT NOT NULL REFERENCES investment_wrappers(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  isin           TEXT,
  valuation_mode TEXT NOT NULL DEFAULT 'declared',
  class_id       TEXT REFERENCES asset_classes(id) ON DELETE SET NULL,
  currency       TEXT NOT NULL DEFAULT 'EUR',
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE support_valuations (
  id         TEXT PRIMARY KEY,
  support_id TEXT NOT NULL REFERENCES investment_supports(id) ON DELETE CASCADE,
  as_of      TEXT NOT NULL,
  value      REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_support_valuations ON support_valuations(support_id, as_of);

CREATE TABLE support_flows (
  id         TEXT PRIMARY KEY,
  support_id TEXT NOT NULL REFERENCES investment_supports(id) ON DELETE CASCADE,
  flow_date  TEXT NOT NULL,
  amount     REAL NOT NULL,
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_support_flows ON support_flows(support_id, flow_date);
