-- Asset classes for the allocation view (user-defined; no seed rows).
CREATE TABLE IF NOT EXISTS asset_classes (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL,
  target_pct  REAL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Tag every net-worth contributor with its class. ON DELETE SET NULL so removing
-- a class drops its holdings to the "Non classé" bucket rather than erroring.
ALTER TABLE accounts ADD COLUMN class_id TEXT REFERENCES asset_classes(id) ON DELETE SET NULL;
ALTER TABLE assets   ADD COLUMN class_id TEXT REFERENCES asset_classes(id) ON DELETE SET NULL;
ALTER TABLE loans    ADD COLUMN class_id TEXT REFERENCES asset_classes(id) ON DELETE SET NULL;
