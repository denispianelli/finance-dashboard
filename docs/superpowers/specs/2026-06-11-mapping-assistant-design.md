# Manual bank mapping assistant — design

**Date:** 2026-06-11
**Status:** validated (maintainer-approved in session)
**Scope guard:** ADR-019 phase 1b — the second and last deterministic replacement before
the LLM removal. Replaces the LLM column-order inference for unknown banks with a
deterministic header suggestion + user confirmation, and removes the learn-flow's
LLM plumbing. The categorization classifier (phase 2) is untouched.

## Problem

Importing a PDF from an unknown bank currently requires the LLM: the user names the
bank, then « Analyser avec l'IA (~1 min) » runs `inferColumnOrder` (a prompt asking the
model for the table's column order), gated by the model being downloaded
(`modelRequired` step, forced download dialog, auto-resume). With ADR-019 the model
goes away — and the LLM's actual contribution here is tiny: ONE `ColumnOrder` guess
(`{date:1, label:3, debit:4, …}`). Everything else (x-threshold derivation, extraction,
persistence, re-detection, arithmetic safety net) is already deterministic.

## Decision

Ask the user instead of the model — with a deterministic pre-fill so confirming takes
seconds: nearly every French statement has a header line containing the canonical
column words the code already knows (`KEY_ALIASES`: date, valeur, libellé/nature,
débit, crédit, solde).

## Design

### 1. Deterministic suggestion — `suggestColumnOrder`

New module `src/main/import/pdf/suggestColumns.ts`:

- Owns the `ColumnOrder` type and the accent-stripped keyword alias table (moved from
  `inferColumns.ts`, which is deleted — prompt building and LLM parsing die with it).
- `suggestColumnOrder(pages): { order: ColumnOrder; headerTokens: string[] } | null` —
  group the PDF text items into lines by y (tolerance ~2pt), find the first line whose
  tokens match ≥ 3 distinct canonical keys, sort the matches by x, and number them
  left-to-right into a `ColumnOrder` (absent keys → null). `headerTokens` = the
  matched tokens' raw text, in x order, for display in the assistant.
- No qualifying line → null (the assistant starts empty, the user composes manually).

### 2. The assistant UI (replaces the IA pitch in `LearnBankView`)

Same step of the import modal, new content:

- Bank name input (unchanged).
- The detected header line shown in monospace (« Date · Valeur · Libellé · Débit ·
  Crédit · Solde ») when a suggestion exists; otherwise a short hint that the columns
  must be picked manually.
- Six selects « Colonne 1 » … « Colonne 6 », each offering the 6 canonical columns
  (Date, Date valeur, Libellé, Débit, Crédit, Solde) plus « — » (absent). Pre-filled
  from the suggestion.
- Local validation before submit: a date, a label, and at least one amount column
  (débit or crédit); no canonical column may appear twice. Inline error otherwise.
- CTA « Enregistrer cette banque » → `banks:learn` with the composed order; the import
  continues immediately. The review screen + arithmetic check remain the real
  validation of the mapping. « Ignorer ce fichier » (unchanged).
- No model download, no wait, no Sparkles/IA copy.

### 3. IPC changes

- New channel `banks:prepareMapping` `{ path }` →
  `{ ok: true; suggested: ColumnOrder | null; headerTokens: string[] } |
{ ok: false; error: 'not_pdf' | 'no_text' }`.
  Called when the unknown-bank step is entered (the renderer keeps the path it already
  has). Reuses the handler-side PDF guards (extension allowlist, %PDF magic, hasText).
- `banks:learn` payload becomes `{ path, bankName, order: ColumnOrder }`; the handler
  validates the order server-side (same rules as the UI), calls
  `deriveColumnMapping(order, tableRegionItems(pages))` directly and persists. The
  `model_unavailable` and `inference_failed` error codes leave its contract;
  `invalid_mapping` replaces them (derivation returned null or order invalid — the
  assistant surfaces it inline and lets the user adjust).
- `learnBankMapping`'s injected-inference indirection is removed (it existed only to
  make the LLM testable).

### 4. LLM plumbing removal (learn flow only)

- `inferColumns.ts` deleted; `handlers/learnBank.ts` loses `getModel`/`isModelAvailable`/
  `modelsDir` imports.
- Renderer: the `modelRequired` sub-step, the auto-resume-on-model-ready effect, the
  lazy hardware-detection effect tied to it, and `PdfModelRequiredDialog` are removed
  (after verifying the dialog has no other consumer). The categorization-side model UX
  (Settings, download indicator, CategorizationPrompt) is phase 2 — untouched here.

## Error handling

- `banks:prepareMapping` failures (`not_pdf`, `no_text`) reuse the existing file-error
  surface of the import queue.
- `banks:learn` `invalid_mapping` → inline error in the assistant (the step stays
  open); never a toast.
- A wrong-but-derivable mapping is caught downstream by the arithmetic check on the
  review screen, as today.

## Testing

- Unit (main): `suggestColumnOrder` — header found and ordered by x; aliases matched
  accent-insensitively (Libellé/NATURE); < 3 keywords → null; decoy lines (a sentence
  containing « date » once) not matched. `handleBanksLearn` — persists with a valid
  user order; rejects invalid orders (`invalid_mapping`); no model imports remain.
  `handleBanksPrepareMapping` — suggestion + guards.
- Unit (renderer): assistant pre-filled from prepareMapping; manual composition when
  no suggestion; local validation blocks submit; `invalid_mapping` shown inline;
  modelRequired/PdfModelRequiredDialog tests removed.
- Local (not CI): run the SocGen fixture (spike-fixtures) through extraction and check
  the suggestion matches its real header.
