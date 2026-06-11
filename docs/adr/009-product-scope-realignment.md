# ADR-009 — Product scope realignment

- **Status** : Accepted
- **Date** : 2026-05-19
- **Category** : Product, Scope, LLM
- **Related** : ADR-002 (privacy-first local), ADR-004 (LLM model selection), ADR-005 (mandatory human review), ADR-008 (OFX primary / PDF backfill)

## Context

A full feature roadmap was dumped and reviewed. Unstructured, it trended toward a generic
cloud-fintech super-app (investments/patrimoine tracking, conversational chat, natural-language
search, generative insights, "wow" surfaces). On that field the product loses: incumbents
(Finary, Linxo, Bankin') have PSD2, cloud and teams.

A first-principles pass on the product's reason to exist produced a single north star:

> A private tool that, minutes after an import, tells you a true thing about your money you
> didn't know — and that you can verify — without trusting anyone.

The moat is the inverse of feature parity: be the **most trustworthy, 100% local**
bank-statement intelligence tool for users who refuse cloud finance apps. Today only those
willing to surrender privacy get financial clarity; this product gives clarity to those who
won't. Trust _is_ the product.

Two complementary value modes under that north star:

- **Operational** — "is there a leak, am I OK": reconciliation, recurring-flow radar, budgets.
- **Retrospective** — "tell me the true story of my money over time": multi-year trends,
  category drill-down, income evolution, year-over-year. (The maintainer's primary personal
  value.) Structurally ours: a PSD2 feed is capped at ~90 days–24 months; a local
  statement-based tool can own 10 years of history, privately, forever.

ADR-004 selected Llama 3.2 3B but measured **~57 s inference per call on CPU** (i7-10700KF).
That is viable for infrequent background batch work and rules out anything interactive.

## Decision

1. **The LLM is a background batch classifier only.** Its sole jobs: column mapping (once per
   bank) and transaction categorization. It never converses, never reasons over figures
   user-facing, never narrates. The intelligence the user feels (reconciliation, recurrence,
   trends) is deterministic, sitting on top of LLM-labeled data.

2. **Cut from v1** (latency wall + hallucination on figures = poison for a product whose
   credibility is rigor):
   - Conversational financial chat
   - Natural-language search (replaced by deterministic filters + saved searches)
   - Generative insights/summaries that reason over amounts

3. **Out of scope (product identity, not just deferral):** investments / patrimoine tracking
   (PEA/CTO/ETF/crypto/real-estate). Valuation requires price feeds = network calls =
   contradicts the 100%-local promise that is the entire moat. Either a separate companion
   product later, or never. Multi-window: out (no real single-user local use case).

4. **Three value pillars** (GitHub epics): Trust & Verifiability (#71), Recurring Detection &
   Budgets (#72), Retrospective Analytics (#73). The single retained "wow" feature is the
   monthly replay ("Mai 2026 en résumé"), which fits the editorial identity.

5. **Keystone sequencing.** Almost everything analytical is blocked on trustworthy categorized
   multi-year data. Therefore, before the pillars:
   - Finish the import/categorization keystone (Epic #23: #32 bank detection + mapping, #29
     default categories + cascade, #34 continuous learning).
   - **PDF historical backfill (#75)** and **stable versioned category taxonomy (#74)** are
     reclassified from technical details to **value prerequisites** — without them the
     retrospective pillar is fiction and multi-year comparisons lie with confidence.

## Consequences

- The product lives or dies on two things: auto-categorization good enough not to be a chore,
  and at least one verifiable "this told me a true thing I didn't know" moment early.
- `docs/superpowers/specs/2026-05-14-finance-dashboard-design.md` §9, §13, §17 updated to match.
- Board reorganized: epics #71/#72/#73 (Phase 3/3/4), prerequisites #74/#75 and responsive
  #76 (Phase 2). No existing issue contradicted the new scope — no closures needed.
- ADRs live in `docs/adr/` (this repo), not Notion as older spec text stated; corrected.
- Any future feature is tested against the north star sentence. If it does not serve it, it is
  cut, not parked.

## Amendment (2026-06-06) — single-user first, "patrimoine cashflow" clarified

Implementation had drifted toward making the app generic / multi-user, which scattered effort.
We re-anchor on a sharper execution target without changing the north star.

1. **Single-user first is explicit.** The MVP serves the maintainer as the one real user.
   **Multi-user is a non-goal for now** — not cut forever, but deferred to a decision taken
   only once the single-user core is solid. (ADR-009 was already single-user in spirit; this
   removes the ambiguity that let multi-user generalization creep into the code.)

2. **"Patrimoine cashflow" is in scope; market valuation stays out.** §3 cut patrimoine
   tracking _because valuation needs price feeds = network = breaks the 100%-local moat_. That
   reasoning is about **valuation**, not about the accounts existing. Therefore: **all accounts
   — current, joint, livret, PEA, AV — are in, tracked by cash flows plus a user-declared,
   non-valued balance** (extends ADR-014). Still **out**, unchanged: market valuation, price
   feeds, position/performance tracking. Net worth = sum of balances (no network, ever).

3. **Current execution target.** The pillars (#71/#72/#73) are narrowed to the maintainer-MVP
   user stories US1–US4 and a seven-analysis Reports page, built data-first (consolidation +
   transfer exclusion → declared balance → monthly/yearly gain-loss → recurring detection →
   Reports page). Budgets are deferred (recurring _detection_ kept, budgeting not). See
   `docs/superpowers/specs/2026-06-06-mvp-personal-finance-design.md`.

The north star sentence and the privacy invariant (ADR-002) are unchanged and still govern.

## Amendment 2 (2026-06-10) — personal patrimoine tool; assets & liabilities in scope

### Context

Two premises of this ADR no longer hold as stated.

**The competitive argument has dissolved.** §Context cut patrimoine tracking partly because
"on that field the product loses: incumbents (Finary, Linxo, Bankin') have PSD2, cloud and
teams." That argument presumes a market to win. The maintainer has explicitly dropped the
ambition of targeting users: the product is **a personal patrimoine tool for the maintainer**
— a private, free equivalent of what cloud apps charge for. With one deliberate user there is
no field to lose on. The remaining scope guard is **effort focus and the north star**, not
market positioning. The maintainer's real patrimoine — current and joint accounts, Livret A,
PEA, AV, primary residence, an amortizing mortgage — is the scope. Without the residence and
the mortgage, the displayed "net worth" is wrong by omission.

**The privacy invariant was being over-applied.** ADR-002 defines the invariant over _data_
("no user data ever leaves the machine"), yet §3 cut valuation with a _packets_ reading
("price feeds = network calls = contradicts the 100%-local promise"). The rhetoric hardened
to "no network, ever". This amendment corrects the wording; it does not weaken the invariant.

### Decision

1. **Product identity: personal patrimoine tool.** The north star sentence is unchanged and
   now reads over the whole patrimoine, not just bank accounts. Multi-user remains a non-goal
   (Amendment 1) — indefinitely, not just "for now".

2. **Net worth = accounts + declared assets − liabilities.** Two object classes enter the
   model:
   - **Declared-value assets** (primary residence): user-declared valuation with a revision
     history; revalued manually (e.g. yearly). No automatic estimation, no address lookup.
   - **Liabilities** (amortizing mortgage): declared once (rate, duration, payment, start
     date), then fully deterministic — amortization schedule, outstanding principal at any
     date, capital/interest split per installment, interest paid per year, total remaining
     cost, payoff date. Verifiable against the loan offer to the cent.

3. **§3 is narrowed, not reversed.** What stays out is **market valuation via price feeds**.
   What enters is patrimoine by cash flows and declared values — including performance for
   PEA/AV: **money-weighted return (TRI)** computed from imported deposits/withdrawals plus
   the declared current balance, and **time-weighted return (TTWROR)** chained from the
   declared-balance revision history (a monthly update habit is enough). Zero network,
   deterministic, verifiable — the same two metrics Portfolio Performance reports.
   Position-level PEA tracking is **not** network-gated: the sanctioned growth path
   ("level 2") is importing PEA/securities **statements** through the existing PDF pipeline —
   quantities, dividends, fees and statement-date valuations are read from the statement
   itself, 100% local. Deferred: the maintainer is a passive DCA investor on 1–3 ETFs, so
   level 1 (TRI/TTWROR) suffices; revisit only if it proves insufficient in use. Only
   **price feeds** (daily valuation, benchmark series) require the network-policy ADR (§5).

4. **Deterministic projections are in scope** (compound-interest scenarios with explicit,
   user-set assumptions; goal tracking). The §2 cut targeted _generative_ insights — an LLM
   reasoning over figures — not arithmetic. The distinction is the engine: formulas the user
   can check, never model output.

5. **Privacy wording corrected: the invariant is about data, not packets.** Restated:
   _no third party ever learns anything about the user's finances._ Offline-by-default stays —
   the app is fully functional with no network, and the network only ever adds convenience.
   The existing allowed calls (opt-in version check, model download) are unchanged. Any new
   class of network call (e.g. bulk price files for PEA valuation, benchmark series) requires
   its own ADR (reserved: ADR-018 "network policy" — ADR-017 is taken by the user-managed
   encrypted sync folder) and must be opt-in, main-process only, and structurally unable to
   reveal user data (bulk fetch, never per-asset queries). Nothing in this amendment requires
   network.

6. **Execution shortlist (ordered):** full mortgage module → declared primary residence →
   patrimoine allocation view with user-set targets and drift → TRI + TTWROR for PEA/AV →
   deterministic projections → AV fee cost (user-entered contract rates). Later:
   recurring-charge change alerts, monthly replay, level-2 PEA statement import (§3).
   **Still out, unchanged:** budgets/envelopes, price feeds and benchmark comparison (level 3,
   only via the network-policy ADR), automatic property estimation, crypto, multi-currency,
   multi-user, PSD2, conversational AI.

### Consequences

- **Spirit references:** Portfolio Performance (open source, local) for computational rigor —
  and as the UI anti-reference: we pair its rigor with this product's design system. Finary
  for the value bar of paid features we replicate deterministically (TRI, projections, fees).
- CLAUDE.md scope guard and README out-of-scope wording updated to match (same change).
- The next execution spec (patrimoine phase) supersedes the MVP spec as day-to-day target;
  the MVP spec remains the record of the shipped MVP.
- "Gained/lost" (cash flow) and net worth (balances + assets − liabilities) remain distinct
  figures; the mortgage installment splits into interest (expense) and principal (transfer to
  equity, not an expense) — the accounting treatment gets its own design doc before build.
