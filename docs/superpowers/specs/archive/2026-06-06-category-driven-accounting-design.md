# Category-driven income / expense / refund model — design

**Date:** 2026-06-06
**Status:** approved (maintainer confirmed the three forks below)
**Supersedes:** the flag-based refund detection added on branch
`feat/reports-period-filter-charts` (migration 013 `is_refund`, `src/main/refunds/`).
Keeps the cross-account transfer-pair detection (ADR-016).

## Problem

After transfer-pair neutralization, 2025 income was still ~121 k€ vs ~82 k€ of real
external income. The ~39 k€ gap is **single-leg person-to-person inflows** (the maintainer's
own money from untracked accounts, his partner's contributions, family, friends' repayments)
that pair-detection structurally cannot catch (ADR-016 / #136: never neutralize on one leg or
by a blind label rule). Separately, the exact-pair refund flag could not handle **partial
refunds** (buy 500, get 250 back) — the common case.

## Model

Accounting is driven by **two special categories**, not flags:

- **« Transfert »** = existing `cat-transferts`. Neither income nor expense — excluded both sides.
- **« Remboursement »** = new `cat-remboursement`. Not income; **subtracted from expenses**.

For a set of transactions in a period (with signed `amount`):

```
isTransfer(t) = t.is_internal_transfer = 1  OR  t.category_id = 'cat-transferts'
isRefund(t)   = t.category_id = 'cat-remboursement'

Revenu   = Σ amount  where amount > 0 AND not transfer AND not refund
Résultat = Σ amount  where not transfer                      (refunds + expenses + income net out)
Dépense  = Résultat − Revenu                                 (signed ≤ 0; magnitude = −Dépense)
```

Shoes example (1000 income, −500 shoes, +250 refund tagged Remboursement):
Revenu = 1000, Résultat = 1000 − 500 + 250 = 750, Dépense = 750 − 1000 = −250 → 250 €. ✓
The **net result never changes** when you tag a refund — only the income/expense split does.

## Auto-apply to similar (user-initiated label rule)

Assigning **Transfert or Remboursement** to a transaction (only these two — fork 3):

1. Derive a **stable label key** from `label_clean`: uppercase, strip trailing date tokens
   (`dd/mm/yy[yy]`) and long digit runs (transaction refs), collapse whitespace. Must retain a
   significant token (len ≥ 4, not in {VIREMENT, VIR, SEPA, PRLV, CB, INST, …}); else fall back
   to the full cleaned label. Examples: `VIREMENT M JEAN DUPONT 12/03/25` → `VIREMENT M JEAN
DUPONT`; `CB TICKETMASTER 13/10/25` → `CB TICKETMASTER`.
2. **Bulk-apply** the category to every transaction whose `label_clean` contains the key, except
   rows already manually placed in a _different_ category (`user_modified = 1` AND a different
   `category_id`). Each touched row gets `user_modified = 1`.
3. **Upsert a `categorization_rules` row** (`match_type='contains'`, `match_value=key`) so future
   imports of the same payee inherit the category. This is the **user-initiated** revival of the
   transfer label rules migration 007 removed — safe because the human asked for it (fork 1:
   silent, no confirm).

## Removed (fork 2)

- The exact-pair refund detector (`src/main/refunds/detect.ts` + test), its calls in
  `importConfirm.ts` / `index.ts`, the `is_refund` column (migration 014 drops it), and the
  `isRefund` field on `DashboardTransaction`. Refund-ness is now `category_id = 'cat-remboursement'`.
- The per-row **⇄ "marquer transfert"** button and its `transactions:setTransfer` plumbing in
  the renderer. The existing **category picker** in the transactions list is the single way to
  tag Transfert / Remboursement.

## Touch list

- **Migration 014:** seed `cat-remboursement`; `ALTER TABLE transactions DROP COLUMN is_refund`.
- **`transferFilter.ts`:** redefine `TRANSFER` (flag OR cat), add `REFUND` (cat), and the
  income / net SQL predicates. Drop `NOT_REFUND` / `COUNTABLE`-via-flag.
- **Aggregation:** `consolidated.ts`, `metrics.ts`, `recurringList.ts` (backend) and
  `lib/reports.ts` `periodTotals` / `isSpend` split / `countableTransactions` (renderer) move to
  the Revenu / Résultat / Dépense math above.
- **Propagation:** `categorize/manage.ts setTransactionCategory` gains key-derivation + bulk +
  rule upsert; new pure `stableLabelKey()` (unit-tested).
- **Plumbing cleanup:** `queries.ts`, `shared/types/dashboard.ts`, `filterTransactions.ts`,
  `TxTable.tsx`, `useDashboard.ts`, `TransactionsPage.tsx`.

## Out of scope

Full categorization-rule management UI (list / edit / delete rules); the perso/joint account
nature model (tracked separately). Un-propagation beyond reassigning individual transactions.
