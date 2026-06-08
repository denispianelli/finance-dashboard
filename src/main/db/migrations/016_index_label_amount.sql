-- Speeds up passthrough amount-aware categorization: findAmountHistoryCategory and
-- propagateCategoryByAmount both query `WHERE label_clean = ? AND ROUND(amount*100)...`.
-- The label_clean equality is the selective part — this index turns those lookups
-- from a full scan into a label-scoped one (design 2026-06-08-passthrough-amount).
CREATE INDEX IF NOT EXISTS idx_transactions_label_amount
  ON transactions(label_clean, amount);
