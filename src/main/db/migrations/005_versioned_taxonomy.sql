CREATE TABLE taxonomy_events (
  id TEXT PRIMARY KEY,
  event_seq INTEGER NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('rename', 'split', 'merge')),
  source_ids TEXT NOT NULL,
  target_ids TEXT NOT NULL,
  payload TEXT,
  occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_taxonomy_events_seq ON taxonomy_events(event_seq);

ALTER TABLE categories ADD COLUMN deprecated_at TEXT NULL;
ALTER TABLE categories ADD COLUMN replaced_by_event_id TEXT NULL REFERENCES taxonomy_events(id);
