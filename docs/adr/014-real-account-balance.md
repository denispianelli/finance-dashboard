# ADR-014 — Real account balance from statement closing balances

- **Status** : Proposed
- **Date** : 2026-06-05
- **Category** : Data, UI
- **Related** : ADR-002 (privacy-first local), ADR-003 (deterministic extraction + arithmetic guard), ADR-008 (OFX primary / PDF backfill, frozen identity contract), ADR-009 (north star)

## Context

The per-account amount on the dashboard is computed as `SUM(transactions.amount)`
(`getAccountSummaries`). With no opening balance tracked, that figure is the net
of imported movements starting from zero — **not** the real bank balance. A user
who imported only April→May sees the April+May net flow, not what the account
actually holds.

Yet the data to anchor a real balance is already extracted and then discarded:

- **OFX** carries `<LEDGERBAL><BALAMT>` — the bank's stated ledger balance, i.e.
  the real current balance. `extractOfx` parses it as `closingBalance`.
- **PDF** (LCL) prints « nouveau solde au JJ/MM » — `extractPdf` parses it as
  `closingBalance` with `closingDate`.

`insertStatement` persists only the date range; the closing balance never
reaches the `imports` table, so the dashboard cannot use it.

## Decision

1. **An account's real balance is anchored on the most recent statement that
   carries a closing balance, plus any transactions dated strictly after that
   statement's closing date.**

   ```
   balance = closing_balance(latest anchored statement)
           + Σ amount(transactions WHERE date > closing_balance_date)
   ```

   The latest statement's closing balance already incorporates the full history
   up to its date, so this is **robust to gaps** — importing March and May but
   not April still yields a correct balance (May's closing). The delta term is
   ≈always zero in practice (transactions come from statements, none postdate the
   latest one), but it is included so a later out-of-band transaction can never
   be silently dropped, and the strict `date >` filter guarantees no
   double-count.

2. **Closing balances are persisted on `imports`.** Migration adds
   `closing_balance REAL NULL` and `closing_balance_date TEXT NULL`. They are
   nullable: a source without a usable balance (an OFX with no `LEDGERBAL`, a PDF
   whose « nouveau solde » could not be parsed) stores `NULL` and simply does not
   anchor.

3. **The closing date is the statement's last transaction date
   (`closingDate`), not the OFX `LEDGERBAL` `DTASOF`.** `DTASOF` is deliberately
   not captured: as the anchor date it would only matter when a balance's as-of
   instant is meaningfully later than the statement's last transaction _and_ a
   separate import fills that gap — a rare case that self-corrects on the next
   import. Using `closingDate` avoids touching the OFX parser for no practical
   gain (anti-over-engineering).

4. **When no statement anchors an account, the balance is `null` and the UI
   shows « — », not a sum of movements.** A sum-from-zero is a misleading number
   dressed as a balance; the honest signal is "unknown until a statement with a
   balance is imported". `AccountSummary.balance` becomes `number | null`.

5. **No LLM, no network.** Reading `LEDGERBAL` / « nouveau solde » is the same
   deterministic parsing already in place; the computation is local SQL.

## Alternatives considered

- **Opening balance of the earliest statement + Σ all transactions.** Rejected:
  correct only with a complete, gap-free transaction history from the first
  statement onward. A single missing month makes it silently wrong. The
  anchor-on-latest model degrades gracefully instead.

- **Keep `SUM(amount)` and relabel it.** Rejected: it is not a balance and no
  honest label makes it one.

- **A stored, editable opening balance per account (user-entered).** Rejected for
  now: it adds a config surface the maintainer explicitly wants to avoid
  (smart-by-default), and the statements already carry the truth. Could be added
  later as a manual fallback for accounts that never import a balance-bearing
  source.

- **Capture OFX `DTASOF` as the anchor date.** Considered; deferred as
  unnecessary precision (see decision 3).

## Consequences

- New nullable columns on `imports` (migration); existing rows keep `NULL` and
  therefore do not anchor until a balance-bearing statement is re-imported.
- `AccountSummary.balance` is now `number | null`; the dashboard renders « — »
  for un-anchored accounts. Accounts that have imported an OFX or an LCL PDF show
  a real, bank-matching balance.
- The displayed figure can differ from the old sum-of-movements — by design: it
  is now the real balance, or « — », never a sum mislabelled as one.
- Privacy unchanged: balances are read in main, stored in local SQLite, computed
  in SQL; no network.
- Independent of the import flow internals (no pipeline change) — this is a
  persistence-plus-query change.

> Not reflected in the README (stack/engine/model unchanged). Promote to Accepted
> once the implementation lands and the spec's Definition of Done is met.
