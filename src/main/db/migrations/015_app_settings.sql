-- Generic key/value store for small app-level preferences (string values only).
-- First consumer: the LLM categorization opt-out ("Ne plus me proposer").
CREATE TABLE app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
