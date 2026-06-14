-- Migration 022 — link a transaction to the amortization installment it pays,
-- and seed the "Intérêts d'emprunt" category. The link drives the report-time
-- decomposition (interest+insurance = expense, capital = neutralized). It lives
-- on the transaction row, so deleting the transaction drops the link; ON DELETE
-- SET NULL reverts the transaction to a full expense if the installment goes.

ALTER TABLE transactions
  ADD COLUMN loan_installment_id TEXT
  REFERENCES loan_installments(id) ON DELETE SET NULL;

CREATE INDEX idx_transactions_loan_installment ON transactions(loan_installment_id);

INSERT OR IGNORE INTO categories (id, parent_id, name, icon, color, is_default, position)
VALUES ('cat-interets-emprunt', NULL, 'Intérêts d''emprunt', 'bank', '#C58B5C', 1, 11);
