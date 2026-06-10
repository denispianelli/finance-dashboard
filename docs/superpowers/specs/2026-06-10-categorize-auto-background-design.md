# Auto background categorization — design

**Date:** 2026-06-10
**Status:** validated (maintainer-approved in session)
**Scope guard:** stays within ADR-009 — the LLM remains a background batch classifier
(column mapping + categorization); nothing conversational or user-facing is added.

## Problem

Three issues observed after importing a statement:

1. **"Catégoriser (N)" button appears broken.** When the LLM answers `AUCUNE` for a
   label (a valid "I don't know"), the matching transactions stay pending forever:
   the count never decreases, and every click re-runs inference on the same labels
   with the same outcome. No feedback, no memory of "already attempted".
2. **The skeleton blocks manual categorization.** During a pass, `TxTable` replaces
   the category cell of _every_ uncategorized row with a skeleton, so the user must
   wait for the pass to finish before editing — even though the backend only writes
   `WHERE category_id IS NULL`, meaning a manual edit during a pass is already safe
   and always wins.
3. **The LLM trigger is a manual button**, while the user expectation is "import
   categorizes what it can, I handle the rest". (Import already runs the
   deterministic cascade — history + seed rules — synchronously; only the LLM
   residual pass is button-gated.)

## Decision

Make the LLM pass automatic, invisible and non-blocking. Remove the button and the
skeleton. Remember labels the LLM could not classify so they are never re-processed
in a loop and are honestly handed back to the user.

## Design

### 1. Trigger

- After each successful import (`onImported` in `AppShell`), run the pass
  automatically (`bg.run()`), in addition to the existing "model just finished
  downloading" trigger.
- The existing idempotency guard (`runningRef`) covers back-to-back imports; a
  refresh of pending groups at loop start picks up rows imported mid-pass.
- Model not installed → the pass stops silently (no error toast for an automatic
  run). The existing `CategorizationPrompt` banner already offers the install; it is
  unchanged.

### 2. Attempt memory (the "broken button" fix)

New table:

```sql
CREATE TABLE llm_attempts (
  label_key    TEXT PRIMARY KEY,   -- stableLabelKey of the label
  model_id     TEXT NOT NULL,      -- active model at attempt time
  attempted_at TEXT NOT NULL       -- ISO timestamp
);
```

- When the LLM returns `AUCUNE` / unknown (parsed `categoryId === null`), record the
  label key with the active model id.
- `listPendingGroups` excludes keys present in `llm_attempts` **with the currently
  active model id** — so upgrading to a stronger model (e.g. Qwen-7B) automatically
  makes past failures eligible again. Re-attempting with the same model never
  happens, including for future imports of the same label.
- `inference_failed` (exception/timeout) is **not** recorded — transient, retried on
  the next pass.
- A manual category set by the user feeds the history tier as today, so the label
  leaves the residual naturally; its `llm_attempts` row becomes inert (no cleanup
  needed — pending groups are derived from `category_id IS NULL` first).

### 3. UI

- **Remove** the "Catégoriser (N)" Topbar button (`onCategorize` / `pendingCount`
  trigger branch).
- **Remove** the per-row skeleton in `TxTable` (`categorizing && t.uncategorized`)
  and the `categorizing` plumbing through `AppOutletContext` if no consumer remains.
  The category select stays editable at all times, including during a pass.
- **Keep** the discreet Topbar running indicator ("Catégorisation IA… (N)") while a
  pass is in flight.
- Views keep refreshing progressively per resolved label via the existing
  `onApplied` mechanism.
- `pending` stays exposed: the model-missing banner (`CategorizationPrompt`) still
  needs the count.

### 4. End-of-pass feedback

One quiet toast when an automatic pass finishes and did something or left a
residual: « Catégorisation terminée — X transactions catégorisées, Y à classer
manuellement » (X = sum of `applied`, Y = transactions whose labels were marked
attempted). No toast when there was nothing to do.

## Error handling

- `model_unavailable` mid-pass: stop silently (automatic run — the banner covers
  the call to action). The current error toast tied to the manual button goes away
  with the button.
- `inference_failed`: skip the label, no attempt recorded, pass continues
  (unchanged).
- DB migration: `CREATE TABLE IF NOT EXISTS` in the existing schema bootstrap path,
  consistent with how other tables are created.

## Testing

- Unit (main): `listPendingGroups` excludes attempted keys for the active model;
  includes them again when the active model id differs; `AUCUNE` records an
  attempt, `inference_failed` does not.
- Unit (renderer): post-import trigger fires `run()`; toast summarizes
  applied/residual; no skeleton rendered for uncategorized rows during a pass;
  category select enabled during a pass.
- Existing suites updated where the button/skeleton props were asserted.
