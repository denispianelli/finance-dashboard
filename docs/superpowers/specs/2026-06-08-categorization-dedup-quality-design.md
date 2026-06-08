# Categorization quality: dedup + one-label-per-call — design

**Date:** 2026-06-08
**Status:** Proposed
**Related:** ADR-009 (LLM = batch classifier only), ADR-005 (mandatory human review),
`project-llm-gpu-acceleration` (the GPU speedup that makes per-label calls affordable).

## Problem

LLM categorization produces poor, _inconsistent_ results. A real pass (136 pending
transactions) was instrumented and measured:

- **Batch anchoring:** 12 heterogeneous labels share one prompt/JSON response, so the
  small model anchors on one category and streaks it across the batch (whole batches
  came back all `Frais bancaires`, then all `Abonnements`).
- **No dedup, hence contradictions:** the _same_ label
  `"PRLV SEPA PayPal..."` (37 rows) got **5 different answers** across batches
  (24× AUCUNE, 9× Frais bancaires, 2× Restaurants, 1× Éducation, 1× Abonnements).
  `"VIREMENT MLLE LAURA AMENDOLA"` → AUCUNE / Éducation / Voyages at random.

Root cause is **structural** (the batching design), not just model weakness. Parsing
was verified correct — when the model returns a valid name it maps fine.

The GPU work (`project-llm-gpu-acceleration`, PR #168) cut inference ~10× (≈90 ms/label),
which makes classifying **one label per call** affordable — the fix that removes anchoring.

## Goal

Each **distinct** transaction label is classified **once**, in its **own** LLM call,
and the result is applied to **all** transactions sharing that label. This removes both
root causes (anchoring + cross-batch contradiction) and cuts inference work.

Plus a **skeleton loading effect**: rows being categorized shimmer in their category
cell, resolving as each label lands.

## Non-goals (explicit)

- **AI proposing new categories** when none fit → **separate spec (B)** with its own ADR
  note (expands the LLM's output space). In this spec, `AUCUNE` rows stay uncategorized
  ("À catégoriser"), classified by hand via the existing inline picker.
- Pre-filtering intrinsically-unclassifiable labels (person transfers, PayPal passthroughs)
  out of the LLM — deferred. Dedup already makes them _consistent_ (one answer, not five).
- Larger/hardware-tiered model — separate effort.
- Re-asking `AUCUNE` keys: they stay pending and are re-classified on the next run (cheap
  on GPU). Not optimized here.

## Design

### Data flow

```
listPendingGroups(db)                         main: group pending rows by
   → [{ key, label, count }]  (oldest-first)     stableLabelKey(label_clean)
        │  renderer iterates ONE group per call
        ▼
ipc 'categorize:pending'  → { groups }
ipc 'categorize:batch'    { key, label }      one label → one LLM call (no anchoring)
        │
        ├─ categorizeBatch(model, cats, [{ id: key, label }])   (prompt/parse reused as-is)
        └─ applyCategoryToKey(db, key, categoryId)              apply to ALL rows of the key
   → { ok, applied }                                            (still-NULL only; user_modified=0)
```

### Components (each small, single-purpose, independently testable)

**Main — `src/main/categorize/pending.ts`** (replaces `listUncategorized` / `applyCategory`)

- `listPendingGroups(db): PendingGroup[]` — load pending rows (`category_id IS NULL AND
is_internal_transfer = 0`), group in JS by `stableLabelKey(label_clean)`. Each group:
  `key`, `label` (the `label_raw` of the group's oldest row — faithful for the LLM),
  `count`. Ordered by the group's oldest row (date, then rowid) → oldest-first.
- `applyCategoryToKey(db, key, categoryId): number` — re-load pending rows `(id,
label_clean)`, keep those whose `stableLabelKey(label_clean) === key`, set them to
  `categoryId` where still `NULL`. Returns rows changed. `stableLabelKey` (JS) is the
  **single source of truth** for grouping — exact, no SQL `INSTR` substring matching.
  `user_modified` stays `0` (auto), so the history tier reuses it on the next import; no
  rule is created (LLM suggestions are not user-confirmed).

**Main — `src/main/ipc/handlers/categorize.ts`**

- `handleCategorizePending(): { groups: PendingGroup[] }`.
- `handleCategorizeBatch({ key, label })`: model-availability guard (unchanged); load
  categories + model; `categorizeBatch(model, categories, [{ id: key, label }])`; if
  `results[0].categoryId` non-null → `applyCategoryToKey(db, key, categoryId)`; return
  `{ ok: true, applied }`. Error codes unchanged (`model_unavailable` / `inference_failed`).

**Main — `src/main/categorize/llm.ts`** — unchanged (now called with a single-item array).

**Shared types**

- `src/shared/types/import.ts`: add `PendingGroup { key: string; label: string; count: number }`.
- `src/shared/types/ipc.ts`: `CategorizePendingResponse = { groups: PendingGroup[] }`;
  `CategorizeBatchPayload = { key: string; label: string }`; `CategorizeBatchResponse`
  unchanged (`{ ok: true; applied: number } | { ok: false; error: ... }`).

**Renderer — `src/renderer/hooks/useBackgroundCategorization.ts`**

- `refresh()`: fetch groups; `pending` = **Σ group.count** (uncategorized transaction
  count — drives the Topbar "Catégoriser (N)" button, familiar to the user).
- `run()`: fetch groups; `remaining` = **groups.length** (distinct labels — drives
  "Catégorisation IA… (N)"); iterate groups oldest-first, **one `categorize:batch` call
  per group**, call `onApplied()` after each (progressive refetch), decrement `remaining`.
  Remove `chunk` / `LLM_BATCH_SIZE`. Keep the idempotency guard and error handling
  (`model_unavailable` stops the pass; `inference_failed` skips the group).

**Renderer — skeleton effect**

- Add the shadcn `Skeleton` primitive: `src/renderer/components/ui/skeleton.tsx`
  (respect design tokens; no new colors).
- Thread `categorizing: boolean` (= `bg.running`) from `AppShell` through
  `AppOutletContext` (`src/renderer/lib/outletContext.ts`) to the Transactions view, and
  as a prop into `TxTable`.
- In `TxTable`'s category cell: when `categorizing` is true **and** the row is
  uncategorized (`categoryId === null`), render `<Skeleton>` instead of the picker/badge.
  As each group lands, the existing refetch flips those rows to their category; `AUCUNE`
  rows stop shimmering at pass end and show "À catégoriser" again. No per-row in-flight
  tracking needed.

### Testing

- `listPendingGroups`: identical keys collapse to one group; representative `label` is the
  oldest row's `label_raw`; `count` correct; excludes categorized + internal-transfer rows;
  oldest-first ordering.
- `applyCategoryToKey`: applies to **all** still-NULL rows of the key; skips rows already
  categorized; returns the count; leaves `user_modified = 0`; creates no rule.
- `handleCategorizeBatch({key,label})`: applies via the key; honors `model_unavailable` /
  `inference_failed`.
- Hook: one call per group; `pending` = Σ counts; `remaining` = group count decrementing;
  `onApplied` per group; idempotency guard; error paths.
- `TxTable`: category cell renders `<Skeleton>` when `categorizing && categoryId === null`,
  and the normal picker/badge otherwise.
- Update existing tests: `tests/unit/categorize/pending.test.ts`,
  `tests/unit/renderer/useBackgroundCategorization.test.ts`, `tests/unit/ipc/categorize.test.ts`.

### Performance

~N distinct labels × one GPU call (~90 ms) instead of ⌈rows/12⌉ multi-item calls. On the
measured data, 136 rows collapse to far fewer distinct labels; a full pass is a few seconds
on GPU and still well below the old CPU time even on CPU fallback (dedup helps both).

## Risks

- **Key over/under-grouping:** `stableLabelKey` strips dates/long digit runs. Two genuinely
  different payees could share a key (rare), or one payee could split across keys. Mitigation:
  the key already powers the existing `propagateCategory` user flow, so behavior is consistent
  with a shipped, tested primitive; covered by `labelKey` tests.
- **`AUCUNE` keys re-processed each run** — accepted (cheap on GPU), noted as a non-goal.
