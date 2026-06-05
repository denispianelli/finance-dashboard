-- Migration 009 — editable transactions with an audit trail.
--
-- The user can now edit a transaction's date / amount / label and delete rows
-- (see ADR-012). Figures are still extracted deterministically; an edit is an
-- explicit, audited override. We preserve the originally-extracted figures so
-- verifiability shifts from immutability to transparency:
--   * original_date / original_amount: snapshot of the extracted figure, set
--     once on the first edit that changes that figure (NULL = never changed).
--   * edited_at: ISO timestamp of the last manual edit (NULL = never edited).
-- The label keeps its own audit for free: label_raw is never edited and stays
-- visible, so no original_label column is needed. Delete is a hard DELETE (no
-- deleted_at) — see the spec for why.
ALTER TABLE transactions ADD COLUMN original_date TEXT;
ALTER TABLE transactions ADD COLUMN original_amount REAL;
ALTER TABLE transactions ADD COLUMN edited_at TEXT;
