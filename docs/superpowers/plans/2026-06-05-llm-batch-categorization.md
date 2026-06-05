# Plan — LLM batch categorization (progressive tier-3 in Review)

Implements `docs/superpowers/specs/2026-06-05-llm-batch-categorization-design.md`
and ADR-013. TDD, bottom-up. Each task: **write the listed tests first (red) →
implement → green**, lint + `tsc --noEmit` clean before moving on.

**Invariants to respect throughout** (CLAUDE.md / ADRs):

- TS strict; no `any`, no `no-unsafe-*`; `noUncheckedIndexedAccess` on.
- Renderer does no I/O — only typed IPC. CSP `'self'`. No network from the LLM
  (the model is local; categorization sends nothing out).
- Vitest 4: component tests need `// @vitest-environment jsdom` **and** an explicit
  `afterEach(() => { cleanup(); })`.
- Lucide icons, never emoji. shadcn/ui + `cn()` + design tokens.
- The 1.9 GB GGUF is **never** loaded in tests — mock at the `categorizeBatch(model, …)`
  boundary (pass a fake `model`) or mock `runPrompt`.

Task order: T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8. T6/T7 depend on T3–T5 types.

---

## T1 — Factor `modelsDir()` into its own module (refactor)

**Goal:** one shared model-dir resolver (2nd consumer arriving; real shared dep).
Put it in a **separate** module — NOT `llm.ts` — so the electron `app` dependency
does not leak onto the pure `runPrompt`/`getModel` path that T2's tests import.

**Files:**

- `src/main/llm/modelsDir.ts` (NEW): the resolver, moved verbatim from `learnBank.ts`.
  It imports `MODEL_FILE` from `./llm`, `app` from `electron`, `existsSync`/`join`.
- `src/main/ipc/handlers/learnBank.ts` (MOD): delete the local `modelsDir()`, import
  it from `../../llm/modelsDir`.

```ts
// src/main/llm/modelsDir.ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { MODEL_FILE } from './llm';
/** Where the GGUF model lives: the repo's models/ in dev, else userData/models. */
export function modelsDir(): string {
  const devDir = join(process.cwd(), 'models');
  if (existsSync(join(devDir, MODEL_FILE))) return devDir;
  return join(app.getPath('userData'), 'models');
}
```

**Tests:** no new unit (it reads `process.cwd()`/`app`). Acceptance = existing
`learnBank` tests + `tsc` + lint stay green.

**Acceptance:** `modelsDir` exported from `src/main/llm/modelsDir.ts`; `learnBank.ts`
imports it from there; no behavior change; suite green.

---

## T2 — LLM categorization module `src/main/categorize/llm.ts` (NEW)

**Goal:** prompt builder + tolerant parser + batch runner, mirroring
`pdf/inferColumns.ts`. The LLM maps labels to **existing** category names only.

**Files:** `src/main/categorize/llm.ts` (NEW); `tests/unit/categorize/llm.test.ts` (NEW).

**Public API:**

```ts
import type { LlamaModel } from 'node-llama-cpp';
export interface LlmCategory {
  id: string;
  name: string;
}
export interface CategorizeItem {
  tx_hash: string;
  label: string;
}
export interface CategorizeResult {
  tx_hash: string;
  categoryId: string | null;
}

export function buildCategorizationPrompt(
  categories: readonly LlmCategory[],
  items: readonly CategorizeItem[],
): string;

/** Parse the model's JSON into per-index category names, map to ids. Pure. */
export function parseCategorization(
  response: string,
  categories: readonly LlmCategory[],
  items: readonly CategorizeItem[],
): CategorizeResult[];

/** One LLM call for a batch. Returns a result per item (categoryId null = residual). */
export function categorizeBatch(
  model: LlamaModel,
  categories: readonly LlmCategory[],
  items: readonly CategorizeItem[],
): Promise<CategorizeResult[]>; // calls runPrompt(model, buildCategorizationPrompt(...))
```

**Prompt shape** (French, strict JSON, one example — the shape ADR-004 verified):

- List categories as a numbered/bulleted name list.
- List items as `1. <label>`, `2. <label>`, …
- Ask: reply ONLY strict JSON `{"1":"<nom de catégorie>","2":"AUCUNE",...}` mapping
  each item number to one of the listed category names **exactly**, or `"AUCUNE"`.
- Truncate each label defensively (e.g. `.slice(0, 120)`).

**Name→id mapping (category-name normalizer — NOT `normalizeLabel`):**

```ts
function normName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}
```

Build `Map<normName(category.name), id>`. For each item index: read the returned
name, `normName` it, look up the id; `"AUCUNE"` / unknown / missing → `categoryId: null`.
Always return one `CategorizeResult` per input item, preserving `tx_hash` order.
Tolerant JSON extraction like `extractJsonObject` (first `{` … last `}`); malformed →
every item `null`.

**Tests (red first), with a fake model for `categorizeBatch`:**

- `buildCategorizationPrompt` includes every category name and every item label, and
  asks for JSON only.
- `parseCategorization`: maps `{"1":"Alimentation","2":"AUCUNE"}` → `[catId, null]`.
- accent/case-insensitive: `"alimentation"` / `"ALIMENTATION"` → same id as `"Alimentation"`.
- unknown name → null; `"AUCUNE"` → null; malformed JSON → all null; JSON wrapped in
  prose → still parsed (tolerant); fewer keys than items → missing items null.
- order/association preserved: result[i].tx_hash === items[i].tx_hash.
- `categorizeBatch` with a fake `model` whose `runPrompt` is stubbed (mock the
  `../llm/llm` `runPrompt` import) returns mapped results.

**Acceptance:** parser can never emit an id outside `categories`; one result per item.

---

## T3 — Deterministic cascade at extract

**Goal:** Review receives categories; residual identifiable. Extract stays
read-only **and electron-free** (no model flag — see §4.1; absence is detected by
the renderer loop from the first batch's `model_unavailable`).

**Files:**

- `src/shared/types/import.ts` (MOD): extend types.
- `src/main/import/extractStatement.ts` (MOD): attach cascade result.
- `tests/integration/import/*` or `tests/unit/import/extractStatement*.test.ts` (MOD/NEW).

**Type changes:**

```ts
export type CategorizationTier = 'history' | 'rule' | null;
export interface ReviewTransaction {
  date: string;
  label: string;
  amount: number;
  tx_hash: string;
  fitid: string | null;
  isDuplicate: boolean;
  categoryId: string | null; // NEW deterministic result (null = residual)
  tier: CategorizationTier; // NEW which tier matched
}
// StatementExtraction is UNCHANGED — no modelAvailable flag.
```

**extractStatement changes:** after building `withHashes`, compute per
non-duplicate tx: `labelClean = normalizeLabel(t.label)`,
`categoryId = findHistoryCategory(db, labelClean)` → `tier 'history'`; else
`matchRule(loadRules(db), labelClean)` → its `categoryId`, `tier 'rule'`; else
`null`/`null`. Duplicates get `categoryId: null, tier: null` (not inserted anyway).
`loadRules(db)` once before the map. **No model import, no hit-count bump** here.

**Tests:** a tx whose label matches a seed rule → `tier: 'rule'`, correct
`categoryId`; a label previously categorized in DB → `tier: 'history'`; an unknown
label → `categoryId: null, tier: null`.

**Acceptance:** existing extract tests still pass with the new fields;
`extractStatement` does no writes and imports nothing from `electron`.

---

## T4 — Insert overlays validated categories

**Goal:** `confirm` inserts exactly what the user validated; corrections set
`user_modified = 1`; deterministic re-run stays as fallback + hit attribution.

**Files:**

- `src/shared/types/ipc.ts` (MOD): extend `ConfirmPayload`.
- `src/main/import/insertStatement.ts` (MOD).
- `tests/unit/import/insertStatement.test.ts` + `tests/integration/import/insertStatement.test.ts` (MOD).

**ConfirmPayload:**

```ts
export interface ConfirmCategory {
  tx_hash: string;
  categoryId: string | null;
  userModified: boolean;
}
export interface ConfirmPayload {
  /* …existing path, accountId, selectedHashes, acknowledgedCannotVerify… */
  categories?: ConfirmCategory[]; // NEW (optional → backward-safe)
}
```

**insertStatement:** accept `opts.categories?: ConfirmCategory[]`; build
`Map<tx_hash, ConfirmCategory>`. In the per-tx loop, keep the deterministic cascade
(history→rules, with the hit-count bump) to compute `detCat`, then overlay:

```ts
const override = categoryMap.get(tx.tx_hash);
const categoryId = override !== undefined ? override.categoryId : detCat;
const userModified = override?.userModified === true ? 1 : 0;
```

Use `categoryId` + `userModified` in the INSERT (the VALUES list must now bind
`user_modified` instead of the literal `0`). `handleImportConfirm` passes
`payload.categories` through to `insertStatement`.

**Tests:**

- override present → inserts payload `categoryId`; `userModified:true` → `user_modified=1`.
- override with `categoryId:null, userModified:true` → inserts NULL, `user_modified=1`.
- no `categories` (legacy) → deterministic result, `user_modified=0` (unchanged path).
- rule hit-count still bumps for a rule-matched label even when overridden.
- **implicit learning:** import A leaves residual → confirm with an override
  (`userModified:false`) categorizing label X → import B (new file, same label X) →
  `extractStatement` now returns that category via history tier.

**Acceptance:** figures still re-extracted (TOCTOU) unchanged; atomicity unchanged.

---

## T5 — `import:categorize` IPC channel + handler

**Files:**

- `src/shared/types/ipc.ts` (MOD): contract entry + payload/response types
  (reuse `CategorizeItem`/`CategorizeResult` — re-export from `@shared/types/import`
  or define request/response here; keep `@shared` free of `@main` imports).
- `src/main/ipc/channels.ts` (MOD): `'import:categorize'` constant.
- `src/main/ipc/handlers/importCategorize.ts` (NEW).
- `src/main/ipc/register.ts` (MOD): `register(...)` the handler.
- `tests/unit/ipc/importCategorize.test.ts` (NEW).

**Contract:**

```ts
'import:categorize': {
  payload: { items: CategorizeItem[] };
  response:
    | { ok: true; results: CategorizeResult[] }
    | { ok: false; error: 'model_unavailable' | 'inference_failed' };
};
```

**Handler:** import `modelsDir` from `../../llm/modelsDir`, `getModel`/`isModelAvailable`
from `../../llm/llm`, `categorizeBatch` from `../../categorize/llm`. Read categories
from DB (`id, name` for non-deprecated categories);
`const dir = modelsDir(); if (!isModelAvailable(dir)) return { ok:false, error:'model_unavailable' }`;
`const model = await getModel(dir);` `try { results = await categorizeBatch(model, cats, payload.items) } catch { return { ok:false, error:'inference_failed' } }`;
`return { ok:true, results }`.

**Tests (mock `getModel`/`categorizeBatch` or the llm module):**

- maps payload.items → categorizeBatch → `{ ok:true, results }`.
- model absent → `model_unavailable` (mock `isModelAvailable` false).
- categorizeBatch throws → `inference_failed`.

---

## T6 — `useImport`: progressive loop + category state

**Files:** `src/renderer/hooks/useImport.ts` (MOD);
`tests/unit/renderer/useImport*.test.ts` (NEW or MOD).

**Review state additions** (lean — no source enum):

```ts
{
  step: 'review';
  /* …existing… */
  categories: Map<string, { categoryId: string | null; userModified: boolean }>;
  pending: Set<string>; // tx_hash whose batch is in flight → "IA…"
  suggested: Set<string>; // tx_hash the LLM filled → "IA" badge until touched
}
```

Seed `categories` from `extraction.transactions` (categoryId, userModified:false);
`pending`/`suggested` empty.

**New actions:** `pickCategory(tx_hash, categoryId | null)` → sets the map entry
`{categoryId, userModified:true}`, removes from `suggested`. `confirm` serializes
the map (selected, non-duplicate rows) into `payload.categories`.

**Progressive loop** (after entering `review`; no upfront model flag — absence is
detected from the first batch's result):

```ts
const residual = extraction.transactions.filter((t) => !t.isDuplicate && t.tier === null);
for (const batch of chunk(residual, LLM_BATCH_SIZE /* 12 */)) {
  if (stateRef.current.step !== 'review') break; // confirmed/closed → stop
  setPending(add batch hashes);
  const res = await ipc.invoke('import:categorize', { items: batch.map(toItem) });
  if (!res.ok && res.error === 'model_unavailable') {
    // no model → stop the whole loop
    setStateAndRef((prev) => (prev.step !== 'review' ? prev : clearPending(prev, batch)));
    break;
  }
  setStateAndRef((prev) =>
    prev.step !== 'review'
      ? prev // drop late result
      : applyResults(prev, res, batch),
  ); // merge + move pending→suggested
}
```

`applyResults`: on `res.ok`, for each `{tx_hash, categoryId}` with non-null id → set
`categories[tx_hash] = {categoryId, userModified:false}`, add to `suggested`; always
remove the batch's hashes from `pending`. On `inference_failed` → just clear the
batch's `pending` and continue the loop.

**Tests (mock `ipc.invoke`):**

- residual present → loop fills categories; pending then suggested toggle;
  deterministic rows untouched.
- `import:categorize` resolving in 2 batches updates state twice (progressive).
- `pickCategory` sets userModified:true and clears suggested.
- `confirm` builds `payload.categories` from the map for selected non-duplicates,
  and a late batch resolving after `confirming` is ignored (no throw).
- first batch → `model_unavailable` stops the loop (no further `import:categorize`
  calls; pending cleared).
- `inference_failed` on a batch → that batch stays residual, loop continues.

---

## T7 — Review table category column + modal category plumbing

**Files:** `src/renderer/components/TransactionReviewTable.tsx` (MOD);
`src/renderer/components/ImportModal.tsx` (MOD);
`tests/unit/renderer/TransactionReviewTable.test.tsx` (NEW/MOD);
`tests/unit/renderer/ImportModal.test.tsx` (MOD if present).

**Modal plumbing (real work):** `ImportModal` must fetch `categories:list` (mirror
the dashboard) into state, and pass to the table: the category list, a
`onPickCategory(tx_hash, id|null)` (→ `useImport.pickCategory`), and an
`onCreateCategory` (invoke `categories:create`, like the dashboard's
`onCreateCategory`). Resolve each row's `categoryId` → `{name,color}` from the list
for `CategoryPicker`'s required `current` prop.

**Review table:** add a **Catégorie** `<th>`/`<td>` between Libellé and Montant. For
non-duplicate rows render `CategoryPicker` (current resolved from list; `onSelect` →
`onPickCategory`; `onCreate` → `onCreateCategory`). Show the ephemeral badge:
`pending.has(hash)` → "IA…" (muted), else `suggested.has(hash)` → "IA" pill, else
nothing. Duplicates: no picker (keep current dimmed style).

**Tests (jsdom + afterEach cleanup):**

- renders deterministic category for a row whose extraction had `categoryId`.
- a `pending` row shows "IA…"; a `suggested` row shows the "IA" badge; a plain row
  shows neither.
- picking a category calls `onPickCategory(hash, id)`.
- duplicate row shows no picker.

---

## T8 — Docs: amend master spec + import-pipeline spec

**Files (doc-only, still self-review before commit):**

- `docs/superpowers/specs/2026-05-14-finance-dashboard-design.md` (§7/§9): the LLM
  tier is now live; categorization runs at **extract + review** (not insert);
  uncertainty is the ephemeral cascade tier, no score.
- `docs/superpowers/specs/2026-05-17-import-pipeline-backend-design.md` (§4): replace
  the "LLM categorization → not wired" note with the tier-3 flow (extract computes
  deterministic categories; confirm overlays validated ones).
- ADR-013 is already written; ensure §8 of the design spec matches.

**Acceptance:** no contradictions left between specs and ADR-013.

---

## Definition of done (whole branch)

Lint clean, `tsc --noEmit` clean, all unit + integration tests green,
`npm run build` succeeds. The model is never loaded in CI (mocked). Manual smoke
(optional, needs the GGUF via the `models/` symlink): import a statement with an
unseen merchant → residual fills with "IA…" then a category → correct one → confirm
→ row stored with the validated category; re-import same merchant → history tier
fills it deterministically (no "IA").
