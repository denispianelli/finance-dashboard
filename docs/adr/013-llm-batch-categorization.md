# ADR-013 — LLM batch categorization

- **Status**: Accepted
- **Date**: 2026-06-05
- **Category**: LLM, Product, UX
- **Related**: ADR-003 (deterministic extraction), ADR-004 (model selection),
  ADR-005 (mandatory human review), ADR-009 (product scope — LLM is a background
  batch classifier only)

## Context

The categorization cascade was designed as **rule → history → LLM** (master spec
§7). Only the two deterministic tiers were built, and they ran at INSERT time —
so transactions matching neither a seed rule nor a previously-seen label landed
**uncategorized**, and the Review screen showed no category at all. The LLM
runtime exists (`node-llama-cpp`, Llama 3.2 3B — ADR-004) but was wired only for
per-bank column mapping.

Two constraints shape the solution:

- The model is slow (~57 s per prompt on CPU, ADR-004) — but per **prompt**, not
  per transaction, and only the **residual** (lines the deterministic tiers miss)
  needs it.
- ADR-005 requires the human to validate an import before anything is written;
  ADR-009 bounds the LLM to a non-conversational batch classifier; the
  per-transaction confidence score was removed in #137.

## Decision

Add the LLM as **cascade tier-3**, run **at import-review time, progressively**.

- **Categorization moves from insert to extract**, so the Review can show each
  line's category and the human can validate it. The deterministic cascade runs
  read-only at extract; the LLM fills the residual **live, batch by batch**, in
  the Review (no blocking spinner).
- The LLM is **constrained to existing categories** — it maps labels to known
  category names and can never invent one or emit an invalid id (ADR-009).
- The human **validates or corrects** every category in the Review; `confirm`
  inserts exactly what was validated. A correction sets `user_modified = 1`.
- **No persisted score or tier.** Uncertainty is the **ephemeral cascade tier**
  shown as an "IA" badge in the Review only — never written to the DB (post-#137).
- **Graceful degradation**: with no model installed, the residual stays
  uncategorized with a manual picker — today's behaviour, now visible in Review.

## Consequences

- **Implicit learning, no migration.** An accepted LLM suggestion is written with
  `user_modified = 0`; the history tier reuses it on the next import. A
  user-corrected one (`user_modified = 1`) wins over it. `category_id` +
  `user_modified` already exist — nothing new is persisted.
- The LLM stays an **explicit, validated batch step**, never an automatic mutation
  — ADR-003 (deterministic figures) and ADR-005 (human review) both still hold;
  the LLM only proposes a non-numeric label-to-category mapping.
- A first-ever import (empty history) has a large residual and may run several
  ~57 s batches; the progressive UI makes this tolerable and the step is
  best-effort and cancellable (confirm abandons remaining batches).
- The LLM runs **only inside the import flow**. Re-categorizing already-stored
  rows is out of scope here (possible later, separately).

## Alternatives considered

- **Blocking the Review on the LLM** (compute all categories before showing it):
  rejected — a ~1 min spinner on every import; progressive fill gives the same
  validation with no wait.
- **Async background categorization after insert**: rejected — categories would be
  filed without passing the human-validation gate at the moment of categorization
  (tension with ADR-005 / "valider = validé").
- **Persisting a confidence score / cascade tier**: rejected — reverses #137 and
  adds a column for a signal that is only useful ephemerally, in the Review.
- **Letting the LLM create new categories**: rejected per ADR-009 — it is a
  classifier into the existing taxonomy, not a generative tool.
