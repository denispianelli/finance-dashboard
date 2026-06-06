-- A user-declared balance for accounts no imported statement anchors (typically
-- AV / PEA / livret). It feeds net worth (ADR-014 path) without any price feed
-- or network call. `declared_balance_date` records when it was last set.
ALTER TABLE accounts ADD COLUMN declared_balance REAL;
ALTER TABLE accounts ADD COLUMN declared_balance_date TEXT;
