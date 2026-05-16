# Finance Dashboard

> **Privacy-first desktop finance dashboard with embedded local LLM.**
> Your bank statements stay on your machine. No login, no bank connection, no cloud, no telemetry.

## Status

🚧 **Not yet usable end-to-end.** Live status and the current phase are tracked on the [GitHub Project board](https://github.com/users/denispianelli/projects/5) — the authoritative source.

## Promise

You import your bank statements (PDF / CSV / OFX). The app extracts transactions deterministically (no LLM hallucination on numbers), categorizes them via an embedded LLM, and gives you a multi-account dashboard plus AI features (chat with your finances, automatic insights, projections). **All on your machine. Source code is public so the privacy promise is verifiable.**

## Stack

Electron · TypeScript · React · shadcn/ui · Tailwind · `pdfjs-dist`. Planned: Recharts, `papaparse`, `ofx-js`, `tesseract.js` (OCR, on-demand).

> Persistence engine and the embedded LLM are deliberate decisions, not casual choices — the **[Architecture Decision Records](docs/adr/)** are authoritative (notably ADR-002 privacy, ADR-003 deterministic extraction, ADR-004 LLM model). This line is a high-level overview only; don't restate ADR specifics here.

## Documentation

- [📘 Design Spec](docs/superpowers/specs/2026-05-14-finance-dashboard-design.md) — single source of truth
- [📋 Plan A — Project Bootstrap](docs/superpowers/plans/2026-05-14-plan-a-project-bootstrap.md)
- [📋 Plan B — Foundation Implementation](docs/superpowers/plans/2026-05-14-epic-1-setup-foundation.md)
- [🏛️ Architecture Decision Records](docs/adr/)
- [🤝 Contributing guide](CONTRIBUTING.md)
- [📜 Changelog](CHANGELOG.md)

## Roadmap

Foundation → Import Pipeline → Dashboard → Categorization & Rules → AI Features → Robustness (OCR + Backup) → Distribution.

**Where we are now and what's in progress:** the [GitHub Project board](https://github.com/users/denispianelli/projects/5) is the single source of truth. Per-phase status is intentionally not duplicated here to avoid drift.

## License

AGPL-3.0-only. See [LICENSE](LICENSE).
