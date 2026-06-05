-- Persist the stated closing balance of each import and its as-of date, so the
-- dashboard can show the real account balance (ADR-014) instead of a sum of
-- movements. Nullable: a source without a usable balance does not anchor.
ALTER TABLE imports ADD COLUMN closing_balance REAL;
ALTER TABLE imports ADD COLUMN closing_balance_date TEXT;
