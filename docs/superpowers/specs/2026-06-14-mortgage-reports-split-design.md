# Mortgage payment split in reports — design spec

> Date: 2026-06-14. Status: implemented.
> Scope: brick 2 of the mortgage module (deferred in
> `2026-06-14-mortgage-module-design.md` §6). Source: ADR-009 Amendment 2
> (§Conséquences — "la mensualité se décompose en intérêts = dépense et capital =
> transfert vers le patrimoine"). Privacy: ADR-002. No personal data here.

## 1. Problem & decision

A mortgage monthly debit imported from the bank (e.g. `PRET IMMOBILIER −948,56 €`)
is, today, counted as a full expense in the reports — overstating spending. It is
really **interest + insurance** (a true expense) plus **capital** (forced savings,
net-worth-neutral). We already store the per-installment breakdown (brick 1), so we
can decompose the matched transaction.

**Decisions locked with the maintainer:**

1. **Decompose the real imported transaction** (the maintainer imports the paying
   account). Not generate-from-schedule (would double-count).
2. **Auto-match, then review.** Detection links a transaction to an installment by
   **amount + date**; links are applied but **visible and one-click reversible**
   (badge + per-loan counter) — never silent.
3. **Interest + insurance → a dedicated seed category "Intérêts d'emprunt"**
   (`cat-interets-emprunt`). The **capital portion is neutralized** (counts as
   neither income nor expense, like an internal transfer).
4. **Virtual decomposition at report time** (Approach A): store only a
   transaction↔installment link; the ledger keeps the faithful bank line
   (−948,56), and the **report layer** splits it. Faithful to the statement,
   reversible, no synthetic ledger rows.
5. A matched transaction shows a **badge** in the transaction list with its split.

## 2. Data model

One migration (022):

- **`transactions.loan_installment_id`** — TEXT, nullable, `REFERENCES
loan_installments(id) ON DELETE SET NULL`. The match link (a transaction matches
  at most one installment; the installment carries its loan + interest/insurance/
  capital). Indexed.
- **Seed category** `cat-interets-emprunt` ("Intérêts d'emprunt", icon/colour in the
  loan/finance family), inserted idempotently. It is a normal category row so it
  appears in the categories list and reports legend.

No change to `loan_installments` or `loans`.

## 3. Matching (detection + review)

**Algorithm** (`matchLoanPayments(db, loanId)`), pure and deterministic:

For each installment `I` of the loan, ordered by `due_date`, with payment `P`:

- Find candidate transactions `T` where:
  - `T.loan_installment_id IS NULL` (unmatched),
  - `abs(T.amount + P) <= AMOUNT_TOLERANCE` (default `0.02` €; `T.amount` is the
    negative debit, `P` the positive payment),
  - `T.date` within `±DATE_WINDOW_DAYS` (default `7`) of `I.due_date`.
- Pick the closest by date; on a tie, the closest by amount. Link it (set
  `loan_installment_id = I.id`). Each transaction and each installment is used at
  most once.

Matching runs **on demand** via a "Détecter les mensualités" action per loan
(Patrimoine page), and **after a successful import** (so a fresh statement's
payments are picked up). Detection is **idempotent** — already-linked rows are
skipped; re-running only fills gaps.

**Review / reversibility:** the result is surfaced, not hidden —

- Per loan on the Patrimoine page: `"11 / 12 mensualités appariées"` (matched vs
  installments whose `due_date <= today`), with the detect button.
- Each matched transaction carries a badge (see §5) with an **unlink** affordance
  (`loan_installment_id = NULL`).

The loan's paying account is **not** modelled; matching spans all accounts (amount

- date disambiguate, and the two loans have distinct payment amounts).

## 4. Report decomposition (the accounting rule)

A shared pure helper is the single source of the split, consumed by every report
path so SQL and JS stay consistent.

For a transaction `T` linked to installment `I`:

- **Expense part** = `I.interest + I.insurance` (authoritative, from the bank's
  table) → contributes `−(I.interest + I.insurance)` to the net, counted under
  **`cat-interets-emprunt`**.
- **Capital part** = `abs(T.amount) − (I.interest + I.insurance)` → **neutralized**
  (excluded from income and expense, like a transfer). Clamp at 0 if the debit is
  smaller than interest+insurance (shouldn't happen; logged).
- **Conservation:** expense part + capital part = `abs(T.amount)` — total cash out
  is unchanged; only its classification splits.
- The matched transaction's own `category_id` is **ignored** by the decomposition
  (the split is authoritative).

**Touch points** (both must apply the rule):

- `src/main/dashboard/consolidated.ts` — `getConsolidatedCashflow` (SQL): a
  `LEFT JOIN loan_installments` with `CASE` logic so a matched row contributes
  `−(interest+insurance)` to `expense` and 0 to income, instead of its raw amount.
- `src/renderer/lib/reports.ts` — category breakdown / top categories (JS over
  fetched transactions): a matched row is replaced by an "Intérêts d'emprunt"
  expense of `interest+insurance`; its capital part drops out.

The existing `transferFilter.ts` predicates (`INCOME_ROW`, `EXPENSE_ROW`,
`NET_ROW`) are extended/wrapped so matched rows are excluded from the raw sums and
re-added via the decomposition — no double counting.

## 5. UI

- **Transaction list badge:** a matched row shows a small badge, e.g.
  `Mensualité prêt · int. 263,13 · cap. 685,43` (amounts via `lib/euro`), with an
  unlink control. The badge stands in for the normal category chip on that row.
- **Patrimoine page (loan card):** the match counter + a **"Détecter les
  mensualités"** button. After detection, a toast: `"8 mensualités appariées"`.
- **Reports:** "Intérêts d'emprunt" appears naturally as an expense category in the
  existing breakdowns — no new report screen.

Follows the design-system rules (CLAUDE.md): `ui/*` primitives, `lib/euro`,
Lucide, French sentence case.

## 6. Edge cases

- **Unmatched installment** (date shifted, amount rounding outside tolerance): the
  transaction stays a full expense and the counter shows it as not matched. No
  silent loss.
- **Paliers** (payment amount changes over the loan's life): handled — each month
  is matched against _its_ installment's payment.
- **Re-import / dedup:** matching re-runs idempotently; if a matched transaction is
  deleted, the link drops (it lived on the transaction row). If a loan is deleted,
  `ON DELETE SET NULL` unlinks its transactions (they revert to full expense).
- **Insurance billed separately** (a second debit): out of scope — v1 assumes the
  insurance is inside the échéance (true for the maintainer's LCL loans).

## 7. Out of scope

- Modelling the loan's paying account / a rules-style matcher.
- Splitting non-LCL or insurance-separate loans.
- Showing the capital part as an explicit "savings" line in reports (it is
  neutralized; the equity it builds already shows in net worth via the CRD).

## 8. Verification & testing

- **Matching unit tests**: exact amount+date match; paliers (different payment per
  month); just-outside tolerance / window → unmatched; idempotent re-run; one
  transaction ↔ one installment.
- **Decomposition unit tests**: expense = interest+insurance under
  `cat-interets-emprunt`; capital neutralized; conservation (parts sum to the
  debit); a matched row no longer counts as a plain expense; unmatched rows
  unaffected.
- **Regression**: existing cashflow / reports tests stay green with no matched
  loans (the decomposition is a no-op when `loan_installment_id` is NULL).
- **Maintainer validation**: import a statement with real mortgage debits, detect,
  confirm the badge split matches the amortization table to the cent, and that the
  monthly "Intérêts d'emprunt" expense equals interest+insurance for that month.
