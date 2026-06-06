# ADR-016 — Deterministic transfer-pair neutralization

- **Status** : Accepted
- **Date** : 2026-06-06
- **Category** : Data, Accuracy
- **Related** : ADR-006 (multi-level dedup), ADR-002 (privacy-first local), migration 007 / #136
  (dropped label-based transfer auto-filing), F1 consolidated cash flow

## Context

Income/expense figures across the app (per-account dashboard, F1 consolidated cash flow, the
Reports page) **over-count inter-account transfers**. The `transactions.is_internal_transfer`
column is written `0` at import and set to `1` nowhere; the only thing excluded from
income/expense is the manual `cat-transferts` category. So when a user moves money between their
own accounts, the **receiving leg counts as fresh income** (and, asymmetrically, an outgoing leg
may or may not be caught). Real example: 2025 reported **196 911 € of "entrées"** — inflated by
internal moves counted as revenue.

Migration 007 / #136 deliberately dropped the label rules (`VIR INTERNE` / `VERS LIVRET` …)
because label-based, single-leg filing was wrong: a transfer to a **co-funded joint account** is
a genuine expense (money spent on shared life, never returns), yet a label silently neutralized
it on both sides. Their conclusion: _automatic neutralization must key off the **nature of the
accounts**, not the transaction label._

## Decision

Neutralize internal transfers by **deterministic pairing across tracked accounts** — never by
label, never on a single leg.

1. **Pairing rule.** A `−X` on account A pairs with a `+X` on account B iff: amount is **exactly
   opposite** (to the cent), the **accounts differ** (both are tracked, i.e. both legs exist in
   the data), and the **dates are within ±3 days**. Matching is **greedy, one-to-one** (closest
   dates first; each transaction used in at most one pair). This _is_ "keying off account nature":
   a movement is internal only when **both ends land in accounts the user tracks**. A transfer to
   an account the app does not track (only one leg present) stays a real expense — exactly the
   #136 requirement.

2. **Marking.** Both legs of a pair get `is_internal_transfer = 1` (the column finally used for
   its purpose). The existing `NOT_TRANSFER` predicate already excludes such rows, so **every**
   income/expense figure is corrected at once. The **category is left untouched** (a transfer can
   still be categorized).

3. **Auto, idempotent, user-overridable.** The detection pass runs after each import and is
   re-runnable. It first **resets auto-marked rows** (`is_internal_transfer = 1 AND
user_modified = 0`) back to `0`, then re-pairs from scratch — so adding/removing statements
   recomputes cleanly. A **user override is preserved**: marking or un-marking a transaction as a
   transfer sets `user_modified = 1`, and the pass never touches `user_modified = 1` rows (same
   contract as migration 007).

## Consequences

- All income/expense surfaces (dashboard per account, F1 cash flow, Reports verdict/categories)
  become correct without re-import. **Net worth is unaffected** — the two legs already net out in
  the sum of balances; only the income/expense split was wrong.
- This supersedes the label-rule approach (007) with **pair-based, account-structural** detection,
  fulfilling #136's "key off account nature."
- **Residual risk:** two unrelated, equal-and-opposite round amounts within ±3 days on different
  accounts (e.g. a 500 € rent and a 500 € reimbursement) can be mis-paired. Accepted and
  mitigated by the **manual un-mark** (`user_modified = 1`), which the pass then respects. No
  schema change is required; no network.
