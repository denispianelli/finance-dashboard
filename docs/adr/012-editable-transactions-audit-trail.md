# ADR-012 — Editable transactions with an audit trail

- **Status**: Accepted
- **Date**: 2026-06-03
- **Category**: Data, UI, Product
- **Related**: ADR-003 (deterministic extraction), ADR-005 (mandatory human review)

## Context

ADR-003 held that figures (amount, date) come exclusively from deterministic
extraction and are never touched by hand — the basis for arithmetic
reconciliation and the "you can verify" promise. But extraction is not perfect
(OCR on scanned PDFs, an odd bank layout), deduplication can miss a duplicate,
and a label is sometimes worth clarifying. With no way to correct a transaction
after import, the user is stuck with wrong data.

## Decision

Allow the user to edit a transaction's `date`, `label` and `amount`, and to
delete a row. Verifiability shifts **from immutability to transparency**:

- The originally-extracted figures are preserved on first change
  (`original_date`, `original_amount`; migration 009). The label keeps its audit
  for free — `label_raw` is never edited and stays visible; only `label_clean`
  is editable.
- `edited_at` marks a row as manually modified; the UI shows a marker with the
  original values.
- Delete is a hard `DELETE` (no `deleted_at`). Undo is transient (held in the
  renderer for the toast). A future reconciliation (#71) detects an unbalanced
  statement from the import's closing balance vs the current sum — it does not
  need the deleted row, and soft delete would tax every query forever.

## Consequences

- Editing is an explicit, audited user override — never an LLM/automatic
  mutation. ADR-003's "no automatic figure mutation" still holds; this adds a
  deliberate manual path.
- A reconciliation feature can later flag edited (`original_* IS NOT NULL`) and
  deleted rows using data preserved here.
- No edit history (single "as extracted" snapshot) and no soft delete, by
  YAGNI — see the design spec.

## Alternatives considered

- **Read-only transactions** (status quo): rejected — leaves bad extractions
  uncorrectable.
- **Soft delete + edit-history log**: rejected as over-engineering for a
  single-user app; the permanent per-query filter tax outweighs the benefit.
