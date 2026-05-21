# ADR-005 — Mandatory human review before import

- **Status** : Accepted
- **Date** : 2026-05-14
- **Category** : Data, UI, Security

## Context

Even with deterministic extraction, LLM categorization can be wrong. And the LLM column mapping (1×/bank) can also fail on the first import.

## Decision

Before any INSERT into the database, the user **must** go through a Review page displaying:

- Original PDF on the left
- Extracted transactions on the right, editable
- Color coding by confidence score
- Result of arithmetic verification (green/red)
- Buttons: Validate / Edit / Cancel

## Alternatives considered

Silent auto-import after extraction — rejected because it would give the user no opportunity to catch errors and erodes trust.

## Consequences

- One additional step in the import flow (intentional)
- User retains full control
- Corrections feed continuous learning of categorization rules
