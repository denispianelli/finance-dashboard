# ADR-006 — Multi-level deduplication

- **Status** : Accepted
- **Date** : 2026-05-14
- **Category** : Data

## Context

Users will re-import the same statement, or import statements with overlapping periods. Duplicate figures must be prevented without blocking productivity.

## Decision

3 levels of detection:

1. **File** : SHA-256 of the PDF, table `imports.file_hash UNIQUE`. Re-import → explicit confirmation required.
2. **Period** : `date_range_start/end` per import. Overlap → non-blocking alert.
3. **Transaction** : `tx_hash = SHA256(account_id + date + amount + normalize(label))` with SQL constraint `UNIQUE(account_id, tx_hash)`.

Same day + same amount + same label within the same import → `order_in_import` is added to the hash to avoid collision.

## Alternatives considered

Single-level deduplication (file hash only) — rejected because the same transaction can appear in two overlapping statements from the same bank.

## Consequences

- Review page can display "Already imported on ..."
- SQL UNIQUE constraint acts as a safety net if application logic has a bug
