# MVP — Personal finance for the maintainer (single-user first)

- **Date** : 2026-06-06
- **Status** : Draft (pending review)
- **Related** : ADR-009 (product scope — amended by this work), ADR-002 (privacy-first local),
  ADR-006 (multi-level dedup / transfers), ADR-014 (real account balance)
- **Supersedes day-to-day priority of** : the generic multi-user direction that crept into
  implementation.

## Why this document

Implementation had drifted toward making the app work _for everyone_ (generic, multi-user),
which scattered effort. We re-anchor on a sharper target: **an MVP that works for the
maintainer first.** One real user (me), concrete success criteria ("do I actually open it every
month and trust the numbers?"), and a clean cut of everything that isn't that. Multi-user
becomes a _later_ decision, only once the core is solid.

This aligns with — and does not contradict — ADR-009's north star:

> A private tool that, minutes after an import, tells you a true thing about your money you
> didn't know — and that you can verify — without trusting anyone.

ADR-009 already names the **Retrospective** mode (multi-year trends, category drill-down,
income evolution, year-over-year) as _"the maintainer's primary personal value."_ This MVP is
the concrete, single-user execution of exactly that.

## Scope decisions (the cuts are the point)

### In scope — the MVP user stories

| #       | User story                                                                                                                                      |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **US1** | As a user, I want to see, **month by month and year by year**, whether I gained or lost money (net cash flow over the period).                  |
| **US2** | As a user, I want to see my **accounts as a whole** (consolidated net), and an **internal transfer must not appear as an expense** (or income). |
| **US3** | As a user, I want a **Reports page** with analyses relevant to my situation (the seven below).                                                  |
| **US4** | As a user, I want to **detect my subscriptions / recurring expenses** (list, monthly total, next due date).                                     |

**Account model — "patrimoine cashflow":** all of my accounts are in — current (perso),
joint, livret A, **PEA, AV**. They are tracked by **cash flows** (deposits/withdrawals) plus a
**declared balance** (extending ADR-014). There is **no market valuation** — no price feeds,
no position/performance tracking. The consolidated "net worth" is the sum of account balances
(real closing balance where statements exist; declared balance otherwise). "Gained/lost" is a
**cash-flow** figure (income − expense, internal transfers excluded), distinct from net-worth
which is read from balances.

### The Reports page (US3) — exactly seven analyses

1. **Net worth over time** — curve of consolidated patrimoine.
2. **Gained/lost per month and per year** — the core of US1 (bars/curve).
3. **Top spending categories** — where the money actually goes (this month / this year).
4. **Savings rate** — income vs expense, % set aside.
5. **Subscriptions & recurring** — monthly total + upcoming due dates (output of US4).
6. **Year vs N-1** — this year against last year, global and by category.
7. **Biggest movements** — exceptional expenses/income of the period.

### Out of scope (explicit, deferred — assume NOT in MVP)

- **Multi-user** — the whole point of the pivot; revisited only after the core is solid.
- **Market valuation** of PEA/AV / investment tracking (positions, performance) — keeps the
  no-network promise (ADR-002). This refines, not reverses, ADR-009 §3 (see ADR amendment).
- **Budgets / envelopes / overspend alerts** — we keep recurring _detection_, not budgeting.
- Export, advanced search/saved-searches, reminders/scheduling, monthly "replay" editorial
  surface — all post-MVP.

## What already exists (reuse, don't rebuild)

- Multi-file import + learned account routing (#141/#142/#144); accounts management
  (#133/#135); dashboard wired to real data (#121); deterministic + user-triggered LLM
  categorization (#146); versioned taxonomy (#74 line); inter-account transfer detection
  (#136, ADR-006); real account balance from closing balances (ADR-014).
- Pages present: Dashboard, Transactions, Accounts, Categories, Settings.
  **No Reports page exists yet** — US3 is genuinely new.

## Build sequencing — Approach A ("trustworthy data first")

A finance app lives or dies on the correctness of its numbers, so we build the reliable data
layer before the analyses that read it. Each brick ships something independently verifiable;
dependencies are linear (well-suited to autonomous, checkpointed execution).

```
F1  ──▶  F2  ──▶  A1  ──▶  D1  ──▶  A2
```

### F1 — Consolidation + transfer exclusion _(backbone of US2)_

Aggregate across all accounts; an internal transfer is excluded from income/expense totals.

- **Reuses:** transfer detection (#136, ADR-006).
- **Acceptance:** a 500 € perso→livret transfer shows as neither income nor expense in any
  period total; consolidated net = sum of account balances; per-account drill-down still shows
  the movement as a transfer, not a spend. Unit tests cover the transfer-pair exclusion in the
  period aggregates.

### F2 — Declared balance for non-imported accounts _(extends ADR-014)_

Let an account (typically AV/PEA/livret with no statement import) carry a **user-declared
balance** that feeds net worth.

- **Acceptance:** an account with no transactions but a declared balance contributes to
  consolidated net worth; editing the declared balance updates net worth; declared vs
  statement-derived balance is distinguishable. No network call anywhere.

### A1 — Gained/lost, monthly and yearly _(US1)_

Net cash flow (income − expense, transfers excluded) per month and per calendar year.

- **Depends on:** F1 (else transfers poison the figure).
- **Acceptance:** monthly and yearly net figures are correct on a fixture spanning ≥2 calendar
  years; transfers never move the figure; a month with no data reads 0, not error.

### D1 — Recurring / subscription detection _(US4)_

Detect recurring outflows: stable payee + amount within tolerance + regular cadence
(monthly/annual) → subscription with amount and next due date. Largely independent.

- **Acceptance:** on a fixture with a monthly Netflix-like charge and an annual insurance
  charge, both are detected with correct cadence, monthly-equivalent total, and a plausible
  next due date; one-off charges are not flagged.

### A2 — Reports page _(US3)_

A new Reports page composing the seven analyses, reading F1/F2/A1/D1.

- **Acceptance:** all seven sections render against a multi-year fixture with correct numbers;
  net worth uses F2 balances; recurring uses D1; year-vs-N-1 compares calendar years; empty
  states are graceful; renderer does no I/O (typed IPC only, CSP `'self'`).

## Testing & non-functionals

- Vitest unit tests per brick (jsdom directive + explicit `cleanup()` per CLAUDE.md); E2E for
  the Reports page reading a seeded multi-year fixture.
- **Privacy invariant holds throughout:** no user data leaves the machine; declared balances
  and valuations are user-entered, never fetched. CSP stays `'self'`; renderer does no I/O.
- TypeScript strict; lint clean; `tsc --noEmit` clean; `npm run build` succeeds (CLAUDE.md DoD).

## Open questions

_None blocking._ Calendar-year basis is assumed for "year by year" (vs rolling 12 months);
revisit only if it reads wrong in use.
