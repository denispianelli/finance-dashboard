# Finance Dashboard

> **Privacy-first desktop finance dashboard with an embedded local LLM.**
> Your bank statements stay on your machine. No login, no bank connection, no cloud, no telemetry.

## North star

> A private tool that, minutes after an import, tells you a true thing about your money you
> didn't know — and that you can verify — without trusting anyone.

The moat is trust, not feature parity: the most trustworthy, 100% local bank-statement
intelligence tool for people who refuse cloud finance apps. A PSD2 feed is capped at ~24 months
of history; a local statement-based tool can own 10 years of it, privately, forever.
[ADR-009](docs/adr/009-product-scope-realignment.md) is the authoritative scope document.

## Status

**Working MVP, in real use.** The app currently serves a single user — the maintainer —
by deliberate decision (single-user first, see ADR-009 amendment). Import, categorization,
consolidated dashboard, Reports and recurring detection are functional; releases are cut
continuously (see [Changelog](CHANGELOG.md)). It is not yet a polished general-audience product.

## What it does

You import your bank statements (**OFX** primary, **PDF** for multi-year historical backfill).
The app:

- **extracts transactions deterministically** — the LLM never touches numbers, and arithmetic
  is verified against statement balances;
- **categorizes them** via an embedded local LLM running as a background batch classifier,
  with deterministic rules and learned history doing most of the work — every label is
  human-reviewable;
- **consolidates all accounts** (current, joint, savings, PEA, AV) by cash flows plus
  user-declared balances — internal transfers are neutralized, never counted as income or
  expense;
- **answers the retrospective questions**: a Reports page with net worth over time,
  gained/lost per month and year, top categories, savings rate, subscriptions & recurring
  charges, year-vs-N-1, biggest movements.

**All on your machine. Source code is public so the privacy promise is verifiable.**

**Deliberately out of scope** (ADR-009 — identity, not backlog): conversational chat,
natural-language search, generative insights, market valuation / investment performance
tracking (price feeds = network calls = breaks the local promise). The LLM classifies in the
background; it never converses.

## Stack

Electron · TypeScript · React · shadcn/ui · Tailwind · Recharts · `pdfjs-dist` ·
`node-llama-cpp` · `node:sqlite`.

> Persistence engine and the embedded LLM are deliberate decisions, not casual choices — the
> **[Architecture Decision Records](docs/adr/)** are authoritative (notably ADR-002 privacy,
> ADR-003 deterministic extraction, ADR-009 product scope). This line is a high-level overview
> only; don't restate ADR specifics here.

## Documentation

- [🏛️ Architecture Decision Records](docs/adr/) — authoritative decisions
- [🎯 Product scope & north star](docs/adr/009-product-scope-realignment.md) — ADR-009
- [📘 Design Spec](docs/superpowers/specs/2026-05-14-finance-dashboard-design.md) — living design source of truth
- [📐 MVP spec](docs/superpowers/specs/2026-06-06-mvp-personal-finance-design.md) — current execution target
- [🤝 Contributing guide](CONTRIBUTING.md)
- [📜 Changelog](CHANGELOG.md)

Specs and plans for shipped work are archived under
[`docs/superpowers/specs/archive/`](docs/superpowers/specs/archive/) and
[`docs/superpowers/plans/archive/`](docs/superpowers/plans/archive/).

## Roadmap

The MVP (import → categorization → consolidated dashboard → Reports → recurring detection) is
**done**. Current work is post-MVP hardening: categorization quality, desktop packaging,
cross-machine sync. Any future feature is tested against the north star sentence — if it does
not serve it, it is cut, not parked (ADR-009). During MVP mode work is tracked on a
lightweight TODO, not a public board.

## License

AGPL-3.0-only. See [LICENSE](LICENSE).
