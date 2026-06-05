# LLM batch categorization — progressive tier-3 in the import Review

- **Date**: 2026-06-05
- **Status**: **Amended 2026-06-05** — §1–§10 describe the original _in-Review_
  approach (built as PR #143). It was reversed the same day after hands-on testing:
  categorization moved **out of the import Review** to an **async background pass**.
  **Read §11 first** — it supersedes the Review-time behaviour in §4, §6, §7.
- **Author**: Denis (PO/Tech Lead) + Claude
- **Related**: ADR-003 (deterministic extraction), ADR-004 (model selection),
  ADR-005 (mandatory human review), ADR-009 (product scope — LLM is a background
  batch classifier only), proposed **ADR-013** (LLM batch categorization).
  Builds on the import pipeline (spec 2026-05-17) and the Review UI
  (spec 2026-05-18).

## 1. Context & problem

The categorization cascade was designed as **rule → history → LLM** (master spec §7).
Today only the two deterministic tiers are built and wired, and they run at
**INSERT time** inside `insertStatement.ts` — _after_ the user has validated the
import. Consequences:

1. The **LLM tier does not exist.** Transactions that match neither a seed rule
   nor a previously-seen label land **uncategorized**, and the user has to fix
   them by hand later on the Transactions page.
2. Because categorization runs at insert, the **Review screen shows no category
   at all** (`TransactionReviewTable` has columns: select / date / label / amount
   / status). The user validates an import _blind_ to how each line will be filed.

This spec adds the **LLM tier** and, to make it validatable, **surfaces categories
in the Review screen** so the human approves the final filing before anything is
written — consistent with "valider = validé" and ADR-005.

### The timing decision (already taken)

The LLM is slow (~57 s per prompt on CPU, ADR-004) — but that cost is **per
prompt, not per transaction**, and only the **residual** (lines the deterministic
tiers did not catch) needs it. For a returning user, history covers most lines, so
the residual is small.

Chosen UX: **progressive in the Review.** The Review opens immediately with the
deterministic categories filled; residual rows show an "IA…" placeholder and fill
in **live** as the model works, batch by batch. No blocking spinner; the human can
already read, correct, and validate while the model runs.

### Why categorization moves to extract

To show categories in the Review, they must be computed **before** the user
validates — i.e. at `extract` time, not `insert` time. This unifies the flow:

```
            BEFORE                                  AFTER
extract  →  (no categories)              extract  →  deterministic cascade
review   →  date/label/amount only       review   →  + category column, LLM fills
confirm  →  insert re-derives cascade               residual live, user can correct
                                         confirm  →  insert writes the VALIDATED
                                                     categories (what you saw)
```

## 2. Goals / non-goals

**Goals**

- Add the **LLM tier-3** of the cascade: classify residual transactions into an
  **existing** category, in batches, in the main process.
- Run it **progressively in the Review**: deterministic categories shown on open,
  LLM-suggested categories stream in per batch.
- Let the user **correct any category inline** in the Review (reuse `CategoryPicker`).
- `confirm` inserts **exactly the validated categories**; user corrections set
  `user_modified = 1` so they feed the history tier next time.
- **Degrade gracefully** with no model installed: residual stays uncategorized,
  picker still available, no LLM calls — today's behaviour, now visible in Review.
- Record the decision in **ADR-013**; amend the import-pipeline / master specs.

**Non-goals (YAGNI)**

- **No persisted confidence/score.** Removed in #137 and not coming back. The only
  "uncertainty" signal is the **ephemeral cascade tier** shown in the Review
  ("IA" badge on a suggested row); nothing about the tier is stored.
- **No new category invention by the LLM.** Output is constrained to the existing
  category set (ADR-009). Unmappable lines → null (user picks).
- **No conversational / reasoning use of the LLM** (ADR-009 scope guard). It is a
  batch classifier only.
- **No post-insert background re-categorization** of already-stored transactions.
  The LLM runs in the import flow only. (A "categorize existing uncategorized
  rows" action can be a later, separate feature.)
- **No new DB column / migration.** `category_id` + `user_modified` already
  suffice; accepted LLM picks become history implicitly.
- **No streaming token UI.** Progressive = per-batch updates over request/response
  IPC, not a token stream.

## 3. Data model

**No migration.** Nothing new is persisted:

- A residual line the LLM fills writes `category_id` with `user_modified = 0` — so
  next time the same label is seen, the **history tier** reuses it (implicit
  learning, no rules to manage). A user correction writes `user_modified = 1`,
  which already wins in `findHistoryCategory`'s `ORDER BY MAX(user_modified)`.
- The cascade **tier** ("rule" / "history" / "llm" / none) is computed for the
  Review and travels in-memory only. It is never written to the DB.

## 4. Behaviour

### 4.1 Deterministic cascade at extract

`extractStatement` runs the existing cascade (history → rules) on each
**non-duplicate** transaction and attaches the result to each `ReviewTransaction`:

- `categoryId: string | null` — the deterministic match, or null (residual).
- `tier: 'history' | 'rule' | null` — which tier matched (drives the Review badge).

This is **read-only** (history reads `transactions`, rules read
`categorization_rules`) — `extractStatement` stays a pure read orchestrator. The
rule **hit-count bump** is a write and stays at insert time (§4.4).

`extractStatement` **does not touch the model** — it has no reason to depend on
`electron`/`modelsDir`. The renderer does not need an upfront availability flag:
the progressive loop simply starts, and if the first `import:categorize` batch
returns `model_unavailable` it stops (§4.2). This keeps extract (and its tests)
free of the electron `app` dependency.

### 4.2 Progressive LLM fill in the Review

On entering `review`, if there is a residual (`tier === null`), `useImport` runs a
**best-effort categorization loop**:

- Split the residual into **batches** of `LLM_BATCH_SIZE` (constant, start at 12 —
  a few short labels per prompt; tunable).
- For each batch, `await ipc.invoke('import:categorize', { items })` and merge the
  returned suggestions into the Review state, so filled rows appear **as each
  batch resolves** (not all at the end).
- **No model installed** is detected from the result, not an upfront flag: a batch
  returning `{ ok: false, error: 'model_unavailable' }` **stops the whole loop**
  (the residual stays manual). At most the first batch's rows briefly flash "IA…"
  before reverting — the handler checks availability without loading the model, so
  this is one fast round-trip.
- An `inference_failed` batch (model present but choked) leaves its rows residual
  and the loop **continues** — one bad batch never aborts the rest.
- The loop is **cancellable**: if the user hits Confirm (or closes the modal) mid-loop,
  remaining batches are abandoned and not-yet-filled rows insert as null.

Residual rows render an **"IA…"** pending state while their batch is in flight,
then the suggested category with a small ephemeral **"IA"** badge (so the user
knows to scrutinize it). Accepting = doing nothing (valider = validé).

**Cancellation is "drop late results", not a hard abort.** `useImport` has no
AbortController; the existing `if (prev.step !== 'review') return prev` guards in
`setStateAndRef` mean a batch that resolves after Confirm/close is simply ignored.
The model keeps computing the **current** in-flight batch in main until it finishes
(a ~57 s batch keeps burning CPU briefly after the modal closes) — acceptable, and
called out so no one mistakes it for a true cancel. No further batches are started.

### 4.3 Inline correction

Each non-duplicate Review row exposes the category via an inline `CategoryPicker`
(the same component used on the Transactions page). Changing it marks that row
`userModified` in Review state (→ `user_modified = 1` at insert). Duplicates show
no picker (they are not inserted).

Clearing a row back to **no category** is supported end-to-end in the data layer
(`pickCategory(hash, null)` → `categoryId: null, userModified: true` → insert
`category_id = NULL, user_modified = 1`, inert for the history tier whose query
filters `category_id IS NOT NULL`). It is **not exposed in the UI for now**:
`CategoryPicker.onSelect` only emits an existing id, so the picker can set a
category but not clear one. A residual row the user leaves alone simply stays
`categoryId: null` (with `userModified: false`). Adding an explicit "clear" entry to
the shared picker is deferred (YAGNI — a row can be re-categorized later on the
Transactions page); the data path is already in place if we want it.

### 4.4 Confirm inserts the validated categories

`confirm` sends, alongside `selectedHashes`, the validated assignments:
`categories: { tx_hash, categoryId, userModified }[]` (only for selected,
non-duplicate rows).

`insertStatement`:

1. Re-extracts the file (unchanged TOCTOU safety on the **figures**).
2. Re-runs the **deterministic** cascade per line — this is both the **fallback**
   (if a tx_hash is missing from the payload) and how rule **hit-counts** are
   still attributed.
3. **Overlays the payload**: the row's final `category_id` is the validated value
   from the payload (deterministic, LLM-accepted, or user-picked); `user_modified`
   is `1` iff the payload marks it user-corrected, else `0`.

So the inserted category is always **what the user saw and validated**; the
deterministic re-run only supplies fallback + hit attribution.

> Note (don't "fix" it): the deterministic re-run queries history mid-loop, so a
> row inserted earlier in the **same** import is already visible to a later
> identical label. Harmless — the overlay (step 3) replaces the category with the
> payload value regardless, so the mid-loop history read never reaches the DB.

### 4.5 Degradation

No model → the first `import:categorize` batch returns `model_unavailable` → the
loop stops. Residual rows show "Non catégorisé" with the picker; the user files
them by hand or leaves them null (exactly today, now in the Review). Everything
else is unchanged.

## 5. LLM tier — prompt & mapping (`src/main/categorize/llm.ts`, NEW)

Mirrors the column-mapping pattern (`pdf/inferColumns.ts`): a prompt builder, a
**tolerant** parser, and a thin runner. Same model (`getModel` / `runPrompt`).

- **Prompt**: give the model the **valid category names** and a numbered list of
  transaction labels; ask for strict JSON mapping each index → a category name (or
  `"AUCUNE"`). French, "réponds UNIQUEMENT en JSON", one worked example — the same
  shape ADR-004 verified Llama 3.2 obeys.
- **Parse & map**: extract the JSON (tolerant, like `extractJsonObject`), map each
  returned name to a category **id** via a normalized-name match. This normalizer
  is the **category-name** one (NFD strip + lowercase, the `normalizeKey` style from
  `inferColumns.ts`) — distinct from `normalizeLabel` (which uppercases tx labels
  for `label_clean`); they normalize different things and must not be conflated.
  Unknown name / `AUCUNE` / malformed → `null` for that line (stays residual). The
  LLM can therefore **never** produce an invalid `category_id`.
- **Signature**:
  `categorizeBatch(model, categories: {id,name}[], items: {tx_hash,label}[]) → {tx_hash, categoryId: string|null}[]`.
- Optional hardening (noted, not required for MVP): a GBNF grammar constraining
  output to the exact category-name set.

## 6. IPC contract

One new channel; two existing ones gain fields (ADR-007 end-to-end typing).

| Channel             | Payload                                                                                     | Response                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `import:categorize` | `{ items: { tx_hash: string; label: string }[] }`                                           | `{ ok: true; results: { tx_hash: string; categoryId: string \| null }[] }` or `{ ok: false; error: 'model_unavailable' \| 'inference_failed' }` |
| `import:extract`    | _(unchanged)_                                                                               | `extraction` now carries per-tx `categoryId`/`tier` (no model flag)                                                                             |
| `import:confirm`    | adds `categories: { tx_hash: string; categoryId: string \| null; userModified: boolean }[]` | _(unchanged shape)_                                                                                                                             |

- `import:categorize` handler (`handlers/importCategorize.ts`, NEW): reads the
  category list from the DB, loads the model via the shared `modelsDir()` +
  `getModel`, calls `categorizeBatch`, returns suggestions. Model-absent →
  `model_unavailable`; inference/throw → `inference_failed` (the loop tolerates both).
- **Factor `modelsDir()`** out of `handlers/learnBank.ts` (its only home today) into
  its own module `src/main/llm/modelsDir.ts` so both handlers share one resolver
  (2nd consumer — a real shared dep). Kept separate from `llm.ts` so the electron
  `app` dependency does not leak onto the pure `runPrompt`/`getModel` path (which
  T2's tests import).
- **Full wiring checklist** (the channel touches all of these): add the entry to
  `IpcContract` (`src/shared/types/ipc.ts`), to `CHANNELS` (`channels.ts`), and a
  `register(...)` call wiring the new handler in `register.ts`. Preload/`ElectronAPI`
  is generic — no change.
- Types in `src/shared/types/import.ts`: extend `ReviewTransaction`
  (`categoryId`, `tier`); add `CategorizeItem` / `CategorizeResult`; extend
  `ConfirmPayload`. (`StatementExtraction` is unchanged — no model flag.)

## 7. UI changes (`TransactionReviewTable`, `ImportModal`, `useImport`)

File paths: `src/renderer/components/TransactionReviewTable.tsx`,
`src/renderer/components/ImportModal.tsx`, `src/renderer/hooks/useImport.ts`,
reusing `src/renderer/components/dashboard/CategoryPicker.tsx`.

**The modal has no category plumbing today — this is real work, not a one-liner.**
`ImportModal` fetches `dashboard:getAccounts` but **not** `categories:list`, and
`CategoryPicker`'s props require `current: { name; color }` **and a mandatory
`onCreate: (input) => Promise<CategoryDTO>`** — not just a `categoryId`. So the modal
must: (a) fetch the category list (like the dashboard), (b) resolve each row's
`categoryId` → `{ name, color }` from it for the picker, and (c) supply an
`onCreate` handler (invoke `categories:create`, as the dashboard wires
`onCreateCategory`).

- **Review state (`useImport`)** — kept deliberately lean (no source enum). The
  `review` step gains:
  - `categories: Map<tx_hash, { categoryId: string | null; userModified: boolean }>`,
    seeded from the extraction's deterministic result; the progressive loop sets
    `categoryId` (leaving `userModified: false`); a `pickCategory(tx_hash, id|null)`
    action sets the id and `userModified: true`.
  - two **ephemeral** sets for the badge only: `pending` (tx_hash whose batch is in
    flight → "IA…") and `suggested` (tx_hash the LLM just filled → "IA" badge until
    the user touches it). Deterministic and user-set rows are in neither.
  - `confirm` serializes `categories` into the payload and stops launching batches
    (cancellation per §4.2).
- **Review table**: insert a **Catégorie** column between label and amount,
  rendering for non-duplicate rows the `CategoryPicker` (selection resolved from the
  category list), plus the ephemeral badge — **"IA…"** when in `pending`, **"IA"**
  when in `suggested`, nothing otherwise. Duplicates show no picker.
- **No change** to the arithmetic badge, overlap banner, duplicate styling, or the
  select/confirm controls.

## 8. ADR / docs impact

- **New ADR-013 — "LLM batch categorization."** Records: LLM is cascade tier-3, run
  at **review time, progressively**, suggestions **validated by the human**
  (ADR-005), **constrained to existing categories** (ADR-009 batch-classifier
  scope), **no persisted score** (post-#137 — uncertainty is the ephemeral tier),
  **graceful degradation** without the model. References ADR-003/004/005/009.
- **Amend master spec §7 / §9** and the import-pipeline spec §4: categorization now
  runs at extract + review (not insert), with the LLM tier live.
- **Self-review pass** on the spec/ADR before commit (project rule).

## 9. Testing

- **LLM module (unit)**: prompt builder shape; parser maps names→ids, handles
  `AUCUNE`/unknown/malformed → null, never emits an invalid id; batch mapping
  preserves `tx_hash` association. Model is **mocked** (never load the 1.9 GB GGUF
  in tests).
- **extract (unit)**: returns `categoryId`/`tier` per the cascade; residual is
  `tier: null`; stays read-only and electron-free.
- **insert (unit/integration)**: applies payload categories; `user_modified = 1`
  only for user-corrected rows; falls back to deterministic when a hash is absent;
  rule hit-counts still bump; accepted LLM pick (userModified=false) is reused by
  history on a second import.
- **IPC (unit)**: `import:categorize` maps payload→llm→response; `model_unavailable`
  and `inference_failed` paths.
- **Renderer (unit, jsdom)**: Review shows deterministic categories on open;
  progressive loop fills residual (mock `ipc.invoke` resolving batches); "IA…"→badge
  states; inline correction sets source=user; confirm serializes categories and
  cancels the loop; model-unavailable path shows no "IA…".
- **Integration**: extract (deterministic) → categorize residual (mock model) →
  correct one → confirm → DB rows have the validated categories and the corrected
  one has `user_modified = 1`.

## 10. Open questions

None blocking. Resolved during design: progressive-in-Review (not blocking, not
async-background); categorization moves to extract; no migration (no persisted
score/tier); LLM constrained to existing categories; accepted suggestions feed
history implicitly; tests mock the model.

## 11. Amendment — async background categorization (supersedes §4/§6/§7)

The in-Review design (§1–§10) was built (PR #143) and tested. **Reversed the same
day** on maintainer feedback: the category column is noise during import, and — worse
— the in-flight LLM fill **blocked the Import button**. See ADR-013's Amendment for
the rationale. The new model:

### Import is clean and instant again

- The Review shows **date / label / amount / status only** — no category column, no
  picker, no "IA" badge. `ReviewTransaction` carries no category; `extractStatement`
  does no categorization; `import:confirm` carries no `categories`. (These are the §3/§4
  in-Review additions, reverted.)
- **Import is never gated** by categorization. The deterministic cascade
  (rule → history) still runs at **insert** (`insertStatement`, as it always did), so
  most rows are categorized the instant they land; the residual enters with
  `category_id = NULL`.

### The LLM runs after import, in the background

- On a successful import, the renderer kicks off a background pass (`AppShell`
  `onImported` → `useBackgroundCategorization.run()`).
- The pass pulls `categorize:pending` (`category_id IS NULL`, non-transfer; keyed by
  **transaction id**), then loops batches of `LLM_BATCH_SIZE = 12` through
  `categorize:batch`, which runs the model **and persists** each suggestion in main —
  writing `category_id` only where still null (`user_modified = 0`, so it feeds the
  history tier; a manual pick made meanwhile is never overwritten).
- After each batch that writes anything, the views **refetch** (the existing
  `refreshToken`) so categories appear progressively in the **Transactions view and
  dashboard** — where the inline `CategoryPicker` already lets the user correct them.
- **Surfacing**: a single **discreet, non-interactive indicator** in the Topbar —
  "Catégorisation IA… (N)" with a Lucide `Sparkles` — shown only while a pass runs.
- **Degradation / triggering**: `model_unavailable` on the first batch stops the pass
  (residual stays manually categorizable); `inference_failed` skips a batch and
  continues; `run()` is idempotent (concurrent imports don't double-run). Trigger is
  **auto-after-import only** (no on-mount sweep, no manual button — YAGNI; re-importing
  re-triggers, and leftovers can be set by hand).

### IPC delta vs §6

- **Removed**: `import:categorize`; `ConfirmCategory` / `categories` on `import:confirm`;
  `categoryId` / `tier` on `ReviewTransaction`; `modelAvailable`.
- **Added**: `categorize:pending` → `{ items: { id, label }[] }`;
  `categorize:batch` → `{ items }` ⇒ `{ ok: true; applied } | { ok: false; error }`.
- **Kept**: the LLM module `categorize/llm.ts` (now keyed by `id`), `modelsDir`,
  graceful-degradation and constrained-output guarantees, no migration / no score.

### What still holds from §1–§10

No persisted score (uncertainty is just "uncategorized"); LLM constrained to existing
categories; implicit learning via the history tier; ADR-005 still governs validating
the **transactions** at import — categories are now an after-the-fact, correctable
concern, not part of that gate.
