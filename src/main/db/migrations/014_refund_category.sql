-- Refund accounting moves from a detected flag to a user-assigned category
-- (see docs/superpowers/specs/2026-06-06-category-driven-accounting-design.md).
-- A « Remboursement » is not income and is subtracted from expenses; the existing
-- « Transferts internes » category already covers transfers. Assigning either is
-- propagated to similar labels via a user-initiated categorization rule. The old
-- is_refund flag (013) and its pair-detector are removed.
INSERT INTO categories (id, parent_id, name, icon, color, is_default, position) VALUES
  ('cat-remboursement', NULL, 'Remboursements', 'refund', '#5B8CB7', 1, 11);

ALTER TABLE transactions DROP COLUMN is_refund;
