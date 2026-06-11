-- Labels the LLM already answered "AUCUNE" for, scoped by the model that answered.
-- Pending groups exclude these keys for the active model, so a residual label is
-- classified at most once per model — installing a stronger model retries them
-- (design 2026-06-10-categorize-auto-background).
CREATE TABLE llm_attempts (
  label_key    TEXT PRIMARY KEY,
  model_id     TEXT NOT NULL,
  attempted_at TEXT NOT NULL DEFAULT (datetime('now'))
);
