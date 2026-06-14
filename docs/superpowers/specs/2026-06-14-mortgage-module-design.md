# Mortgage module — design spec

> Date: 2026-06-14. Status: approved (maintainer), ready for implementation plan.
> Scope source: ADR-009 Amendment 2 (§2 liabilities, §6 shortlist). First brick
> of the patrimoine line. Privacy: ADR-002 (no data leaves the machine).
>
> **No personal data in this document.** All figures below are illustrative /
> synthetic. The maintainer's real amortization tables live only in
> `spike-fixtures/` (gitignored) and are never committed.

## 1. Problem & decision

A mortgage monthly payment is **not** a single expense: it splits into capital
(a transfer that builds equity — net-worth-neutral at payment time), interest
(a real expense), and borrower insurance (a real expense). To show net worth
correctly and let the maintainer verify every figure to the cent (north star),
the app needs the current **capital restant dû (CRD)** per loan and the
per-installment split.

**Key finding (2026-06-14).** The maintainer's two real LCL loans are
**multi-phase**, which rules out deriving the schedule from a single
rate + duration + payment:

- A ~1.7% amortizing loan whose monthly payment **changes in steps (paliers)**
  over its life (constant _within_ a step, different between steps), plus a
  partial-deferral (franchise partielle) head.
- A **0% PTZ** with a long **deferral**: years of insurance-only payments with
  the balance frozen, then amortization starting much later.

The standard constant-payment amortization formula reproduces a single
amortizing segment to the cent, but **not** deferral + paliers without bespoke
phase modelling per loan.

**Decision: import the bank's definitive amortization table as the source of
truth**, rather than compute it (brief Q8 resolved by reading the documents).
The bank's "tableau définitif" is exact by construction, already accounts for
deferral / paliers / 0% / co-borrower insurance, and is static — a renegotiation
or early repayment makes the bank **reissue a new table** (exactly what the
maintainer's "MODIFICATION FINANCIERE" reissue is), which is simply re-imported.

### Decisions locked with the maintainer

1. **Approach:** import & store the amortization table; do not compute it.
2. **Quote-part:** net worth counts the maintainer's **share** of both the asset
   and the debt. Store a `share` per loan/asset (default `0.5`, editable). Not to
   be confused with the 75% insurance coverage per co-borrower, which is unrelated
   to ownership.
3. **v1 scope:** import the loan table(s) **and** add a simple declared property
   value, both at the maintainer's share, folded into net worth — so the headline
   stays correct from v1 (the −CRD is offset by the +property). Full résidence
   principale (purchase price, fees, etc.) is a later brick.
4. **Deferred to brick 2:** reconciling an imported installment with the actual
   bank transaction to split the payment in the **reports** (interest = expense,
   capital = forced savings, insurance = expense). In v1 the payment transaction
   stays categorized as-is; the module's net worth is independent of it.
5. **CI fixture:** commit a synthetic anonymized amortization table in the LCL
   format for the parser tests; the real PDFs stay local-only for extra validation.

## 2. Data model

Money is stored as **REAL euros** throughout the repo (`amount`,
`declared_balance`, `closing_balance` are all `REAL`); the new tables follow
that convention. One migration adds three tables.

### `loans` — declared loan header

| Column         | Type                      | Notes                        |
| -------------- | ------------------------- | ---------------------------- |
| `id`           | TEXT PK                   |                              |
| `name`         | TEXT NOT NULL             | e.g. "Prêt principal", "PTZ" |
| `lender`       | TEXT                      | e.g. "LCL"; nullable         |
| `principal`    | REAL NOT NULL             | montant du prêt (euros)      |
| `nominal_rate` | REAL NOT NULL             | annual %, e.g. 1.70, 0.00    |
| `start_date`   | TEXT NOT NULL             | ISO date (date de départ)    |
| `term_months`  | INTEGER NOT NULL          | durée totale                 |
| `share`        | REAL NOT NULL DEFAULT 0.5 | quote-part [0..1]            |
| `notes`        | TEXT                      | nullable                     |
| `created_at`   | TEXT NOT NULL             |                              |

### `loan_installments` — the imported schedule (source data, not derived)

| Column          | Type                    | Notes                                     |
| --------------- | ----------------------- | ----------------------------------------- |
| `id`            | TEXT PK                 |                                           |
| `loan_id`       | TEXT NOT NULL           | FK → `loans(id)` ON DELETE CASCADE        |
| `seq`           | INTEGER NOT NULL        | installment number (échéance)             |
| `due_date`      | TEXT NOT NULL           | ISO date                                  |
| `capital`       | REAL NOT NULL           | amortissement (euros)                     |
| `interest`      | REAL NOT NULL           | intérêts                                  |
| `insurance`     | REAL NOT NULL           | assurance                                 |
| `fees`          | REAL NOT NULL DEFAULT 0 | frais divers                              |
| `payment`       | REAL NOT NULL           | montant échéance                          |
| `balance_after` | REAL NOT NULL           | capital restant dû after this installment |

`UNIQUE(loan_id, seq)`. Index on `(loan_id, due_date)`.

**CRD at a date** = `balance_after` of the latest installment with
`due_date <= date`, or `principal` if `date` precedes the first installment. A
pure lookup — no recomputation, no drift.

### `assets` — declared asset value (generic, ready for the allocation brick)

| Column           | Type                      | Notes                       |
| ---------------- | ------------------------- | --------------------------- |
| `id`             | TEXT PK                   |                             |
| `name`           | TEXT NOT NULL             | e.g. "Résidence principale" |
| `kind`           | TEXT NOT NULL             | v1: `'property'`            |
| `declared_value` | REAL NOT NULL             | euros, 100% value           |
| `share`          | REAL NOT NULL DEFAULT 0.5 | quote-part [0..1]           |
| `valued_at`      | TEXT NOT NULL             | ISO date the value was set  |
| `notes`          | TEXT                      | nullable                    |

## 3. LCL amortization-table parser

A parser dedicated to the LCL "TABLEAU D'AMORTISSEMENT" PDF format, reusing the
existing `extractPdfText` (pdfjs) machinery from the statement-import pipeline.

**Header fields** read from page 1: intitulé du prêt → `name`, montant du prêt →
`principal`, taux débiteur → `nominal_rate`, durée totale → `term_months`, date
de départ → `start_date`.

**Installment rows** across all pages: each data row has the fixed columns
`N° ECH | DATE | AMORTISSEMENT | INTERETS | ASSURANCE | FRAIS DIVERS | MONTANT
ECHEANCE | CAPITAL RESTANT DU`. The parser maps them to `loan_installments`
columns. French number format (`151 464,50`) is normalized to a JS number. The
table also prints a `TOTAL` line (Σ capital / Σ interest / Σ insurance) used as a
parse self-check.

The parser is **LCL-specific and bounded**. If a future document shape breaks it,
a guided manual/CSV table entry is the fallback — out of scope for v1.

### Import flow (UI)

1. Patrimoine page → **"Ajouter un prêt"** → file picker for the LCL PDF.
2. Parse → **confirmation screen**: header + first row + last row + totals, for
   the maintainer to verify against the PDF before saving (verifiability gate).
   Editable `name` and `share`.
3. Save `loans` row + all `loan_installments` rows in one transaction.
4. Re-import of an updated table replaces the loan's installments (renegotiation
   / early repayment → new bank table).

## 4. Net worth extension

`getNetWorth` (today: Σ account balances) becomes:

```
total = Σ account.balance
      + Σ (asset.declared_value × asset.share)
      − Σ (CRD_today(loan) × loan.share)
```

The returned `NetWorth` shape gains an assets breakdown and a loans (liabilities)
breakdown alongside the existing accounts breakdown, so the UI can show the
composition. `CRD_today` uses the lookup from §2.

**Known approximation (documented, not blocking v1):** if a loan payment leaves a
_joint_ account that the maintainer imports at 100%, the cash side drops by the
full payment while the debt drops by only the share. Net worth remains a declared
approximation in v1; revisit if it proves material.

## 5. UI — Patrimoine page

New sidebar entry **"Patrimoine"** and page with:

- **Loan card** (×n): CRD today, next installment (date + amount + capital /
  interest / insurance split), interest paid this calendar year, remaining cost
  (Σ remaining interest), end date.
- **Property card**: declared value + share, editable.
- **Net worth summary**: accounts + property − loans (at share).
- **Amortization table viewer**: the full schedule, consultable (modal or
  expandable) — the verifiability surface.

Follows existing shadcn/Card patterns and design tokens. Lucide icons, no emoji.

## 6. Verification & testing

- **Parser unit tests** against a committed **synthetic** LCL-format fixture
  (fake figures): assert header fields, a sample of rows, and the `TOTAL`
  self-check, to the cent.
- **CRD lookup tests**: dates before first installment, between installments, on
  an installment date, after the last (→ 0).
- **Local-only validation** (not in CI): the maintainer's real PDFs in
  `spike-fixtures/` parsed end-to-end, asserting first / median / last rows and
  totals match the documents to the cent. Guarded to skip when the fixtures are
  absent (CI).
- Net worth math tested with synthetic loans/assets and shares.

## 7. Out of scope (later bricks)

- Reports split via transaction↔installment reconciliation (brick 2).
- Full résidence principale (purchase price, notaire fees, valuation history).
- Allocation / targets, TRI / TTWROR, projections (later shortlist items).
- What-if simulations / renegotiation modelling (no formula engine in v1 —
  re-import the bank's new table instead).
- Non-LCL amortization formats.

## 8. Risks

- **Parser brittleness** across LCL table variants (deferral pages, palier
  boundaries, the partial first "ECH" row). Mitigation: validate against both
  real loans locally; `TOTAL` self-check; confirmation screen before save.
- **Net worth drop perception** if the property value is omitted — mitigated by
  including the declared property value in v1 (decision 3).
