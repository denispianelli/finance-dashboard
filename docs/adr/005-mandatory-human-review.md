# ADR-005 — Mandatory human review before import

- **Status** : Accepted — **amended 2026-06-03 (review signal is the cascade tier, not a confidence score — see Amendment)**
- **Date** : 2026-05-14 (accepted) — 2026-06-03 (amended)
- **Category** : Data, UI, Security

## Context

Even with deterministic extraction, LLM categorization can be wrong. And the LLM column mapping (1×/bank) can also fail on the first import.

## Decision

Before any INSERT into the database, the user **must** go through a Review page displaying:

- Original PDF on the left
- Extracted transactions on the right, editable
- Visual emphasis on the transactions worth a second look (see Amendment)
- Result of arithmetic verification (green/red)
- Buttons: Validate / Edit / Cancel

## Alternatives considered

Silent auto-import after extraction — rejected because it would give the user no opportunity to catch errors and erodes trust.

## Consequences

- One additional step in the import flow (intentional)
- User retains full control
- Corrections feed continuous learning of categorization rules

## Amendment (2026-06-03) — review signal is the cascade tier, not a confidence score

The original decision colour-coded review by a per-transaction `confidence`
score (0–1) that the LLM would return alongside each category. That score is
**dropped**, in code and in the data model (migration `008_drop_confidence.sql`).

### Why

An LLM-self-reported confidence number is **not calibrated** — the model emits a
plausible-looking 0.94, it does not measure anything. Surfacing it would be fake
precision, exactly the kind of false signal this product avoids. Logprob-based
uncertainty is the only honest numeric alternative and is too fragile/illegible
for a small local model classifying multi-token category names — not worth it.

### What replaces it

The honest "is this one uncertain?" signal is a **fact the software actually
knows**: where the category came from in the deterministic cascade (design §7).

- **Rule** (a rule the user wrote) or **history** (this label was categorized
  before) → trusted, shown without fuss.
- **LLM-suggested** (no rule, no history match — a label never confirmed) or
  **uncategorized** → _this_ is what the Review screen emphasises.

This signal is **ephemeral**: it lives only in the import Review screen. Once the
user validates an import, every categorization is confirmed and there is nothing
left to score. Validated labels enter history, so the same label is auto-resolved
(and no longer flagged) on the next import — the review surface shrinks itself
over time, with no stored score and no configuration.

> The LLM categorization tier itself is not built yet; this amendment only fixes
> _how_ uncertainty is expressed once it lands. Nothing here is persisted on
> `transactions`.

## Amendment (2026-06-03) — post-import editing is a separate, audited path

The mandatory pre-INSERT Review is unchanged. Correcting a transaction _after_
import (edit / delete) is a distinct, audited path (see ADR-012), not a bypass of
the Review gate.
