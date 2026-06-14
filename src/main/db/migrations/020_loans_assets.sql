-- Migration 020 — patrimoine: loans + imported amortization schedule + declared assets.
-- Amounts are REAL euros, consistent with transactions.amount / accounts.declared_balance.
-- The amortization table is IMPORTED from the bank's definitive PDF (source of truth),
-- never computed: CRD at a date is a lookup over loan_installments.balance_after.

CREATE TABLE loans (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  lender       TEXT,
  principal    REAL NOT NULL,
  nominal_rate REAL NOT NULL,
  start_date   TEXT NOT NULL,
  term_months  INTEGER NOT NULL,
  share        REAL NOT NULL DEFAULT 0.5,
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE loan_installments (
  id            TEXT PRIMARY KEY,
  loan_id       TEXT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  seq           INTEGER NOT NULL,
  due_date      TEXT NOT NULL,
  capital       REAL NOT NULL,
  interest      REAL NOT NULL,
  insurance     REAL NOT NULL,
  fees          REAL NOT NULL DEFAULT 0,
  payment       REAL NOT NULL,
  balance_after REAL NOT NULL,
  UNIQUE(loan_id, seq)
);

CREATE INDEX idx_loan_installments_lookup ON loan_installments(loan_id, due_date);

CREATE TABLE assets (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  kind           TEXT NOT NULL,
  declared_value REAL NOT NULL,
  share          REAL NOT NULL DEFAULT 0.5,
  valued_at      TEXT NOT NULL,
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
