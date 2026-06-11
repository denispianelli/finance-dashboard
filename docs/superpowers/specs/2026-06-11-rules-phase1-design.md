# Rules phase 1 — one-click rule creation + rules audit section

**Date:** 2026-06-11
**Status:** validated (maintainer-approved in session)
**Scope guard:** ADR-019 phase 1a — strengthen deterministic categorization BEFORE the LLM
removal. The import cascade (`resolveImportCategory`, matching engine, history tier) is
not modified. The new-bank manual mapping assistant is phase 1b, a separate spec/PR.

## Problem

With the LLM on its way out (ADR-019), the rules tier becomes the categorization engine —
but today it is invisible and unreachable:

1. A manual correction propagates to same-key labels and feeds the history tier, but it
   never **generalizes**: correcting « CB CARREFOUR MARKET PARIS 11 » teaches nothing
   about « CB CARREFOUR CITY LYON ». Only a rule (`contains CARREFOUR`) does that, and
   there is no way to create one from the UI.
2. Rules (the ~seed set) run silently with no inspection surface: a too-greedy rule
   miscategorizes forever and the user cannot find, edit or delete it. `hit_count` is
   recorded but never shown.

## Decision

Two halves of one mechanism: **contextual creation** (one click from a correction) and an
**audit/management section** (the undo/inspection counterpart).

## Design

### 1. Contextual creation (Transactions / Dashboard rows)

- When a category is set via the row `CategoryPicker`, the existing confirmation toast
  gains an action button **« Créer une règle »** (sonner toast `action`).
- Clicking it opens a small dialog pre-filled with:
  - match type `contains` (type selectable: contains / exact / regex);
  - match value = the **suggested significant token** of the corrected label;
  - category = the one just chosen (changeable).
- The user can edit everything before validating. Cancel = no rule.
- Not added to the import Review screen (post-import correction in Transactions is the
  primary flow; YAGNI).

**Suggested token:** first token of `label_clean` with length ≥ 4 that contains no digit
and is not generic bank vocabulary — reuse/extract the `KEY_STOPWORDS` logic from
`labelKey.ts` into a shared helper (`suggestRuleToken(labelClean): string | null`). If no
token qualifies, fall back to the full `stableLabelKey` with match type `exact`.

### 2. Retroactive application on create

- Creating a rule immediately applies it to existing transactions that are **still
  uncategorized** (`category_id IS NULL AND is_internal_transfer = 0`), using the same
  matching engine as import (`matchRule` on `label_clean`). It never overwrites an
  existing category (manual pick always wins — same semantics as the LLM pass and
  `applyCategoryToKey`).
- Applied rows keep `user_modified = 0` (rule-applied, not hand-edited).
- `hit_count` is incremented by the number of rows applied (same counter the import
  cascade bumps).
- Feedback toast: « Règle créée — N transaction(s) catégorisée(s) ».
- Updating a rule's category or value does **not** re-touch already-categorized rows;
  it re-runs the retroactive pass over still-uncategorized rows only (cheap, consistent).
- Deleting a rule never un-categorizes anything; it just stops matching.

### 3. Rules section (Categories page)

A « Règles » section appended to the existing Categories page:

- Lists ALL rules (seed + user) in matching order (`rowid` ASC = creation order, first
  match wins). No reordering UI (YAGNI).
- Per row: match-type badge (`contient` / `exact` / `regex`), match value, target
  category (color dot + name), hit count (« 47 × »), creation date.
- Inline edit: match value, match type, category. Delete with a confirmation step.
- Seed rules are ordinary rows: editable and deletable like user rules (full
  transparency — this is the user's engine now).

### 4. IPC + backend

New typed channels (handlers in `src/main/ipc/handlers/rules.ts`, logic in
`src/main/categorize/rulesManage.ts`):

- `rules:list` → `{ rules: RuleDTO[] }` where `RuleDTO = { id, matchType, matchValue,
categoryId, hitCount, createdAt }`.
- `rules:create` `{ matchType, matchValue, categoryId }` → `{ rule: RuleDTO;
applied: number }` (retroactive count).
- `rules:update` `{ id, matchType, matchValue, categoryId }` → `{ rule: RuleDTO;
applied: number }`.
- `rules:delete` `{ id }` → `{ ok: true }`.

Validation (create + update): non-empty trimmed `matchValue`; `matchType` one of the
three; for `regex`, the pattern must compile (`new RegExp`) — reject with a typed error
`invalid_rule` otherwise; `categoryId` must exist and be non-deprecated. Matching at
runtime already tolerates bad regexes defensively; validation just keeps garbage out.

`rules.ts` (engine) gains nothing; `loadRules` is reused by the retroactive pass.

## Error handling

- `rules:create/update` with invalid input → `{ ok: false, error: 'invalid_rule' }`
  surfaced as an inline error in the dialog (not a toast).
- Retroactive pass runs in a transaction with the rule insert/update (a failed apply
  rolls back the rule).

## Testing

- Unit (main): create/update/delete; retroactive application categorizes only
  still-uncategorized matching rows and bumps hit_count; never overwrites; regex
  validation rejects bad patterns; `suggestRuleToken` cases (stopwords skipped, digits
  skipped, fallback to exact stable key).
- Unit (renderer): reassign toast exposes the action; dialog opens pre-filled
  (token + category); rules section renders list with hits, edits and deletes via
  mocked IPC.
- Existing suites untouched (no behavior change in the import cascade).
