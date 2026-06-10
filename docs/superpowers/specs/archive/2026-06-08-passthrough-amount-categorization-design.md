# Passthrough payees: amount-aware categorization — design

**Date:** 2026-06-08
**Status:** Proposed
**Related:** ADR-009 (LLM = classifier only), ADR-005 (human review),
`2026-06-08-categorization-dedup-quality-design` (the dedup pass this extends),
`project-llm-gpu-acceleration` (the Qwen-7B adoption this unblocks).

## Problem

**Passthrough payees** (PayPal, SumUp, Lydia…) settle many unrelated purchases
under **one identical bank label**. The same `PRLV SEPA PayPal…` is €17.20 Spotify
(→ Abonnements) one day and a €43 leisure buy (→ Loisirs) the next. The statement
label carries **no merchant**, and the LLM only ever receives the label — so **no
label-based method can categorize a passthrough**, and worse, the dedup pass's
**fan-out applies one category to every row of the label**, which is wrong by
construction for passthroughs.

This is latent today (the 3B model returns AUCUNE for PayPal, so fan-out is a
no-op) but becomes **actively harmful the moment a stronger model is adopted**:
measured, Qwen2.5-7B confidently files PayPal → "Frais bancaires", which the dedup
fan-out would then stamp onto all 24 PayPal transactions at once. **This feature is
the prerequisite for adopting Qwen-7B.**

## Insight

The label is ambiguous, but for recurring charges the **amount disambiguates**:
`(PayPal, 17.20€)` is reliably Spotify. So passthroughs are categorized by
**`label_clean` + exact amount**, learned for free from the user's own past
categorizations — exactly the existing "history tier" philosophy ("a previously
seen / user-corrected label wins"), widened to include the amount. One-off
passthrough purchases (unique amounts) never recur, so they correctly stay manual.

## Goal

1. **Detect** passthrough labels (seed list ∪ history entropy).
2. **Exclude** them from all label-based auto-categorization: history-by-label,
   label rules, the LLM, and label fan-out.
3. **Categorize** them by `label_clean` + exact amount, reusing the user's prior
   categorizations (no new storage), with an **amount-scoped fan-out** when the
   user categorizes one manually.

## Non-goals

- Adopting Qwen-7B / model selection — separate spec (unblocked by this one).
- Amount tolerance / fuzzy matching — exact amount only (chosen; price changes →
  re-learn once).
- Using recurrence/cadence as a signal — `recurring/detect.ts` may enrich later.
- Auto-filling already-pending passthroughs from learned amounts during the
  "Catégoriser" pass — covered in practice by the cascade (future imports) + the
  amount-scoped fan-out (backlog); a dedicated retro-fill is deferred (YAGNI).

## Design (no new tables — reuse transactions as the learning store)

### A. Detection — `src/main/categorize/passthrough.ts` (new)

`isPassthrough(db, labelKey): boolean` — `labelKey` is `stableLabelKey(label_clean)`.
Returns true when **either**:

- **Seed:** `labelKey` contains a known passthrough token **as a whole word**
  (token boundaries, not a raw substring). Seed set (uppercase): `PAYPAL`, `SUMUP`,
  `LEETCHI` — distinctive, no false-match risk. (`LYDIA`/`LYF` are deliberately
  excluded: `LYDIA` is also a first name, `LYF` is too short for safe matching;
  entropy catches them after the first split.) Covers cold-start before any history.
- **Entropy:** the user has filed this key under **≥ 2 distinct categories**
  (`user_modified = 1`, `category_id NOT NULL`). Self-tuning for unknown
  passthroughs. Computed by scanning user-categorized rows, grouping by
  `stableLabelKey(label_clean)`, counting distinct `category_id` — built once as a
  `Map<key, Set<categoryId>>` per pass and reused.

Intended consequence: any label the user files under ≥ 2 categories — e.g. Amazon,
which sells everything — becomes amount-driven. That is the desired behaviour for an
everything-store, not a side effect to guard against.

### B. Amount-aware history — `src/main/categorize/history.ts`

`findAmountHistoryCategory(db, labelClean, amount): string | null` — mirrors the
existing `findHistoryCategory` but matches `label_clean = ?` **and** amount equal
to the cent (`CAST(ROUND(amount*100) AS INTEGER) = CAST(ROUND(?*100) AS INTEGER)`
to avoid float pitfalls), preferring `user_modified DESC` then frequency. Returns
the learned category for this exact `(label, amount)` or null.

### C. Import cascade — `src/main/import/insertStatement.ts`

Per transaction, branch on detection:

- **passthrough** → `findAmountHistoryCategory(db, labelClean, tx.amount)`; if null,
  stays uncategorized (NO label-history, NO rules — those would mis-file it).
- **non-passthrough** → current cascade unchanged (`findHistoryCategory` → rules).

### D. LLM pass excludes passthroughs — `src/main/categorize/pending.ts`

`listPendingGroups` drops groups whose key `isPassthrough` → passthroughs **never**
reach the LLM and are **never** label-fanned-out. (This is the PayPal-fan-out fix,
and what makes Qwen-7B safe to adopt.)

### E. Learning = amount-scoped fan-out — `src/main/categorize/manage.ts`

When the user categorizes a transaction (`setTransactionCategory`) whose label
`isPassthrough`, fan the category out to every **still-uncategorized** row with the
**same `label_clean` + amount** (new `propagateCategoryByAmount`), instead of the
label-only `propagateCategory`. Correct by construction: same label **and** same
amount = same thing. The €43 one-off (unique amount) is untouched → stays manual.
(Non-passthrough manual picks keep their current behaviour.)

### F. Storage / migration

No new table. Add an index to keep the amount lookups cheap:
`CREATE INDEX idx_transactions_label_amount ON transactions(label_clean, amount);`

## Data flow

```
manual categorize (PayPal 17.20 → Abonnements)
   └─ isPassthrough? yes → propagateCategoryByAmount(label_clean, 17.20, Abonnements)
                              → all uncategorized PayPal@17.20 become Abonnements   [backlog]
next import: PayPal 17.20 (new month)
   └─ cascade: isPassthrough? yes → findAmountHistoryCategory(PayPal,17.20) → Abonnements [auto]
next import: PayPal 43.00 (new, never seen)
   └─ cascade: isPassthrough? yes → no amount history → uncategorized → manual
"Catégoriser" pass
   └─ listPendingGroups excludes PayPal entirely → LLM never guesses it
```

## Testing

- `isPassthrough`: seed match; entropy ≥ 2 distinct user categories → true; a key
  with 1 category or none → false; a normal merchant → false.
- `findAmountHistoryCategory`: matches same label+amount (cent-exact); ignores
  different amount / different label; prefers user_modified.
- Cascade (`insertStatement`): passthrough tx with prior learned amount → categorized;
  passthrough tx with unseen amount → stays null; non-passthrough → unchanged.
- `listPendingGroups`: excludes passthrough labels; keeps normal labels.
- `propagateCategoryByAmount`: applies to same label+amount uncategorized rows only;
  leaves other amounts and already-categorized rows untouched.

## Risks

- **Entropy cold-start:** a non-seed passthrough mis-files once before the user has
  split it ≥ 2 ways. Accepted; the seed covers the common French passthroughs.
- **Float amount equality:** mitigated by comparing rounded cents.
- **Depends on the dedup spec** (`listPendingGroups`): implement on top of
  `feat/categorization-dedup` (or rebase after #170 merges).
