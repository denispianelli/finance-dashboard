-- ADR-019 phase 2: the LLM classifier is removed. Drop its per-model failure
-- memory (017) and the categorization-prompt opt-out setting. No user data
-- is touched — transaction categories live on transactions/rules.
DROP TABLE llm_attempts;
DELETE FROM app_settings WHERE key = 'categorize.optOut';
