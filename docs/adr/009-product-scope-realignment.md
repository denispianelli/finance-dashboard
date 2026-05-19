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
