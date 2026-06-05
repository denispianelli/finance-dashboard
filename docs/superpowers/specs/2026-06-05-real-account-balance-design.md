# Real account balance — Design spec

**Date:** 2026-06-05
**Status:** Draft, pending implementation
**Related ADR:** [ADR-014 — Real account balance from statement closing balances](../../adr/014-real-account-balance.md) (Proposed)
**References:** ADR-008 (OFX primary / PDF backfill), ADR-003 (deterministic extraction + arithmetic guard), ADR-002 (privacy-first local)

---

## 1. Goal

Show the **real** account balance on the dashboard — the figure that matches the
bank — instead of `SUM(transactions.amount)` (a sum of movements from zero).

## 2. Model

```
balance(account) =
  closing_balance(latest anchored statement)
  + Σ amount(transactions WHERE account = account AND date > closing_balance_date)
```

- **Anchor** = the `imports` row for the account with the greatest
  `closing_balance_date` among rows where `closing_balance IS NOT NULL` and
  `status = 'validated'`. Ties broken by most recent `imported_at`.
- **Delta** = transactions strictly after the anchor date (≈always empty; a
  guard, never a double-count thanks to `date >`).
- **No anchor** → `balance = null` → UI renders « — ».

OFX is unaffected by the period-overlap concern; for balance, the anchor date is
the statement's last transaction date (`closingDate`), the same value already
extracted. `DTASOF` is not captured (ADR-014 §3).

## 3. Data

Migration `011_account_closing_balance.sql`:

```sql
ALTER TABLE imports ADD COLUMN closing_balance REAL;
ALTER TABLE imports ADD COLUMN closing_balance_date TEXT;
```

Both nullable. Existing rows stay `NULL` (no anchor until re-import).

> **Migration number** — main is at 009; PR #141 (account routing) adds 010.
> This takes **011** to avoid a collision regardless of merge order (the runner
> applies by version, gaps are inert). Likewise this is **ADR-014** (PR #141
> holds 013).

## 4. Extraction → persistence

- `StatementExtraction` gains `closingBalance: number | null` and
  `closingBalanceDate: string | null`, populated in `extractStatement` from the
  normalized statement (`stmt.closingBalance`, `stmt.closingDate`).
- `insertStatement` writes both into the new columns (NULL-safe).

No change to the OFX/PDF parsers — the values are already extracted.

## 5. Query

`getAccountSummaries` replaces `COALESCE(SUM(t.amount), 0) AS balance` with the
anchor-plus-delta computation. Sketch:

```sql
WITH ranked AS (
  SELECT account_id, closing_balance, closing_balance_date,
         ROW_NUMBER() OVER (PARTITION BY account_id
           ORDER BY closing_balance_date DESC, imported_at DESC) AS rn
  FROM imports
  WHERE status = 'validated' AND closing_balance IS NOT NULL
),
anchor AS (SELECT account_id, closing_balance, closing_balance_date FROM ranked WHERE rn = 1)
SELECT a.id, a.name, a.type, a.bank_id, a.currency,
       (SELECT COUNT(*) FROM transactions t WHERE t.account_id = a.id) AS tx_count,
       an.closing_balance AS anchor_balance,
       (SELECT COALESCE(SUM(t.amount), 0) FROM transactions t
          WHERE t.account_id = a.id AND t.date > an.closing_balance_date) AS later_sum,
       an.account_id IS NOT NULL AS has_anchor
FROM accounts a
LEFT JOIN anchor an ON an.account_id = a.id
ORDER BY a.created_at ASC, a.name ASC;
```

In TS: `balance = has_anchor ? anchor_balance + later_sum : null`.

## 6. Types & UI

- `AccountSummary.balance: number | null` (doc updated).
- `dashboardMap.toAccount`: `summary.balance === null ? '—' : formatBalance(...)`.
- `AccountTabs` already renders « — » for the `'—'` sentinel — no change.

## 7. Testing strategy

- **Unit — query (`getAccountSummaries`):**
  - OFX-style anchor only (no later tx) → balance = closing_balance.
  - Anchor + a transaction dated after the anchor → balance = closing + later.
  - History gap (March + May imports) → balance = May's closing (not the sum).
  - PDF backfill imported after an OFX (older closing date) → OFX stays the
    anchor; no double-count.
  - Account with transactions but no closing balance on any import → `null`.
  - Account with no imports → `null`.
- **Unit — `insertStatement`:** persists `closing_balance` / `closing_balance_date`
  from the extraction; stores `NULL` when the statement has no closing balance.
- **Mapping:** `toAccount(null balance)` → `'—'`.

## 8. Definition of Done

- Dashboard shows a real, bank-matching balance for accounts with an
  OFX/LCL-PDF import; « — » for un-anchored accounts.
- Gap-in-history still yields the correct balance.
- No double-count across mixed OFX/PDF sources.
- Lint / `tsc --noEmit` / unit tests / `npm run build` green.
- ADR-014 promoted to Accepted.
