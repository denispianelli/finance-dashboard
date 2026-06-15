# Investment tracking — Phase A design (per-support TRI/TTWROR, declared valuations)

**Date:** 2026-06-15
**Status:** Draft for maintainer review
**Scope anchor:** ADR-009 Amendment 3 (full investment tracking activated, two-phase).
**Privacy:** Phase A is 100% local — no network, no quotes feed. (The feed is Phase B, ADR-018.)
All figures below are synthetic; real holdings are never committed (CLAUDE.md privacy rule).

## Goal

Track investment **performance per support** (per holding line) — money-weighted return (**TRI**)
and time-weighted return (**TTWROR**) — from values and flows the user declares, with zero
network. This is the PP-style data model (wrapper → support → flows → valuations); Phase B later
adds share quantities + an opt-in price feed on top, without reshaping it.

## Glossary

- **Wrapper** (enveloppe): a tax/account envelope — a PEA, an assurance-vie (AV), a CTO.
- **Support**: one holding line inside a wrapper — an ETF, a fund, a euro-fund. The unit the user
  tracks performance on. A wrapper has one or more supports.
- **Flow**: cash the _user_ moves in or out of a support (a contribution / withdrawal). **Not** a
  thing that happens _inside_ the support: dividends reinvested, internal arbitrage, and
  unrealised gains are **not** flows — they are exactly the performance we measure.
- **Valuation**: the support's total value on a date, as the user declares it (from the broker /
  insurer statement).
- **TRI** = money-weighted return (IRR), annualised — "what I personally earned, given my timing".
- **TTWROR** = true time-weighted return — "how the holding performed, stripping out my
  contribution timing" (comparable to a benchmark).

## Worked example (synthetic — mirrors the maintainer's shape)

- Wrapper **PEA** → support _World ETF_ (a public-ISIN accumulating ETF — feedable in Phase B).
- Wrapper **AV** → support _Euro fund_ (capital-guaranteed, **no public quote** — declared
  forever) + support _World UC_ (insurer-valued unit-linked — declared).

Two of three supports are declared-only **by nature**; the feed (Phase B) only ever helps the
PEA. So declared valuation is first-class, not a fallback.

## Data model (migration: investment tables)

```sql
CREATE TABLE investment_wrappers (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,                 -- "PEA", "Assurance-vie"
  type       TEXT NOT NULL,                 -- 'pea' | 'av' | 'cto' | 'other'
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE investment_supports (
  id             TEXT PRIMARY KEY,
  wrapper_id     TEXT NOT NULL REFERENCES investment_wrappers(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,             -- "World ETF", "Euro fund"
  isin           TEXT,                      -- NULL for euro funds / unquoted UC
  valuation_mode TEXT NOT NULL DEFAULT 'declared',  -- 'declared' (Phase A) | 'quantity' (Phase B)
  class_id       TEXT REFERENCES asset_classes(id) ON DELETE SET NULL,  -- allocation (reuses #232)
  currency       TEXT NOT NULL DEFAULT 'EUR',
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The declared value series. The latest row (max as_of) is the support's current value.
CREATE TABLE support_valuations (
  id         TEXT PRIMARY KEY,
  support_id TEXT NOT NULL REFERENCES investment_supports(id) ON DELETE CASCADE,
  as_of      TEXT NOT NULL,                 -- ISO yyyy-mm-dd
  value      REAL NOT NULL,                 -- euros, total support value on that date
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_support_valuations ON support_valuations(support_id, as_of);

-- Cash the user moved in (+) or out (−) of the support.
CREATE TABLE support_flows (
  id         TEXT PRIMARY KEY,
  support_id TEXT NOT NULL REFERENCES investment_supports(id) ON DELETE CASCADE,
  flow_date  TEXT NOT NULL,                 -- ISO yyyy-mm-dd
  amount     REAL NOT NULL,                 -- + contribution, − withdrawal
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_support_flows ON support_flows(support_id, flow_date);
```

`ON DELETE CASCADE` so deleting a wrapper/support cleans its history. `class_id` uses
`ON DELETE SET NULL` to match the allocation brick.

**Phase B (reserved, not built here):** a `securities` table (isin, name, currency) + `quotes`
(isin, as_of, close) + `valuation_mode='quantity'` with a share-lots table; Phase B's price feed
(ADR-018) writes `quotes`, and a quantity-mode support's value = shares × latest quote instead of
a declared row. The Phase-A tables above do not change.

## Performance computation (`src/main/investment/performance.ts`)

Per support, from its valuation series `V = (d₀,v₀)…(dₙ,vₙ)` (sorted) and flow series
`F = (eⱼ, fⱼ)`:

### TTWROR — linked Modified Dietz across sub-periods

For each consecutive valuation pair `[d_{k−1}, d_k]`, with flows `fⱼ` falling in
`(d_{k−1}, d_k]`:

```
Fₖ   = Σⱼ fⱼ                                   (net flow in the sub-period)
wₖⱼ  = (d_k − eⱼ) / (d_k − d_{k−1})            (fraction of the sub-period AFTER flow j)
rₖ   = (v_k − v_{k−1} − Fₖ) / (v_{k−1} + Σⱼ wₖⱼ·fⱼ)
```

```
TTWROR        = Π_k (1 + rₖ) − 1
TTWROR_annual = (1 + TTWROR)^(365 / (dₙ − d₀)) − 1
```

**Honest caveat (documented in-app):** true TWR needs a valuation at _every_ flow date. With
valuations only at the user's update dates, each sub-period uses Modified Dietz (money-weighted
_within_ the sub-period). For small, regular DCA flows the difference from true TWR is negligible;
it only grows if a large flow lands far from an update date. Monthly updates keep it tight.

### TRI — money-weighted (IRR), annualised

Cashflows from the investor's perspective (contribution = cash out of pocket = negative; final
value = liquidation = positive):

```
at d₀ :  −v₀                       (open at the starting value)
at eⱼ :  −fⱼ                       (contribution fⱼ>0 → outflow; withdrawal fⱼ<0 → inflow)
at dₙ :  +vₙ                       (current value)
```

Solve for annual rate `r`: `Σᵢ CFᵢ / (1 + r)^((tᵢ − d₀)/365) = 0`.
Newton–Raphson with a bisection fallback on `r ∈ (−0.9999, 10)`; return `null` if no sign change
(degenerate input). `v₀ = 0` (account opened empty) is fine — the series simply starts at the
first contribution.

### Aggregation

Wrapper-level and global TRI/TTWROR are computed by **pooling all supports' flows and
valuations** (sum the valuation series by date, concatenate flows), not by averaging
sub-returns — so the aggregate is itself a correct TRI/TTWROR over the combined cashflows.

### Cross-checks (verification, baked as tests)

- A single lump sum (only `d₀`, `dₙ`, no intermediate flow): `TRI = (vₙ/v₀)^(365/Δ) − 1` = CAGR.
- No intermediate flows ⇒ `TRI_annual = TTWROR_annual` (the two only diverge because of flow
  timing).
- A flat support (no gain, `vₙ = v₀ + ΣF`): both returns = 0.

## Integration with existing patrimoine

- **Net worth** (`getNetWorth`): add `+ Σ (latest support valuation)`. A tracked wrapper's value
  is the sum of its supports. To avoid double counting, a wrapper supersedes any ad-hoc declared
  asset the user had for it — on creating a wrapper we offer to remove a matching declared asset
  (or just document the rule; no silent deletion).
- **Allocation** (#232): each support carries `class_id`, so `listHoldings` / `getAllocation`
  include supports as holdings (alongside accounts, assets, loans). A support's allocation value =
  its latest valuation. This is the natural place the euro-fund lands in "Fonds €/Obligations" and
  the ETFs in "Actions".

## UI surface (Patrimoine page)

A new **« Placements »** card (its own overline), listing wrappers → supports. Per support row:
current value `<Money>`, **TRI** and **TTWROR** (annualised, coloured sage/coral by sign), and a
"Mettre à jour" action. The monthly update is the core interaction: per support, enter the new
**value** + the **net flow** since last time (two numbers) — written as a `support_valuation` and
(if non-zero) a `support_flow`. A support detail view shows the full **valuation + flow history
table** (the verification surface) and the computed returns with their cashflow table. Built only
from `ui/*` primitives, `lib/euro`, Lucide — no `Intl.NumberFormat`, no `fixed inset-0`.

## Verification path (north star)

Every figure is recomputable by hand:

- Each sub-period return `rₖ` from the visible history table (value start, value end, flows).
- TTWROR = product of the `(1+rₖ)`; TRI shows its dated cashflow table.
- The cross-checks above (lump-sum = CAGR; no-flow TRI = TTWROR) give the user a sanity anchor.

## Phase boundary

- **Phase A (this spec):** wrappers, supports, declared valuations, flows, TRI/TTWROR, the
  Placements card + update flow + history view. 100% local. No securities/quotes/shares/network.
- **Phase B (separate spec + ADR-018):** `securities` + `quotes`, `valuation_mode='quantity'` with
  share lots, the opt-in price feed, auto-valuation of feedable supports.

## Out of scope (Phase A and, where noted, the brick)

- Dividends (holdings are accumulating — add a flow/transaction type when a distributing holding
  appears).
- Multi-currency (EUR share classes only; FX is a later concern).
- Sell/arbitrage UI (the model stores signed flows; a dedicated sell flow lands when needed).
- Benchmark comparison, projections (a separate patrimoine brick), price feed (Phase B).

## Resolved decisions (maintainer, 2026-06-15)

1. **Flow timing — Modified Dietz** (weights each flow by where it lands in the sub-period), as in
   the TTWROR formula above. Confirmed.
2. **Returns display — annualised headline, cumulative fallback for short history.** The headline
   figure per support/wrapper is the **annualised** TRI/TTWROR. **But** when a support has **less
   than ~1 year** of history, annualising extrapolates and misleads, so the headline shows the
   **cumulative return since inception**, explicitly labelled « depuis l'origine » (no annualised
   number until ≥ 1 year). The detail view always shows both (annualised + cumulative). Rationale:
   never display a figure the maintainer can't trust (north star); matches PP not annualising short
   periods.
3. **Wrappers are separate objects — not linked to accounts.** A wrapper's value is the sum of its
   supports' latest valuations, never a declared account balance. Net worth gains a fourth,
   distinct contributor: `accounts (bank) + declared assets (RP) + investment supports − loans`.
   **Double-count guard:** if a declared asset or declared-balance account already represents a
   wrapper (e.g. an "AV" asset created during the allocation brick), creating the wrapper offers to
   remove it — no silent deletion, but the user is steered away from counting it twice.
