INSERT INTO banks (id, name, detected_signature) VALUES
  ('lcl', 'Crédit Lyonnais', 'CREDIT LYONNAIS');

-- x-coordinates (PDF points) of each column, derived from spike-fixtures/LCL_STATEMENT_FIXTURE.pdf
INSERT INTO bank_column_mappings
  (bank_id, format_version, date_col, label_col, debit_col, credit_col, balance_col)
VALUES
  ('lcl', 'v1', 42, 75, 433, 504, NULL);
