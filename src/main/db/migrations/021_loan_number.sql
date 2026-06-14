-- Migration 021 — store the bank loan number (N° DU PRET) on loans.
-- It is stable across reissues (a renegotiation / early-repayment table keeps the
-- same number), so it is the dedup key for replace-on-reimport. Nullable: older
-- rows and tables without a parseable number stay NULL (treated as distinct).

ALTER TABLE loans ADD COLUMN loan_number TEXT;
