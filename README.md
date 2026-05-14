# Finance Dashboard

> **Privacy-first desktop finance dashboard with embedded local LLM.**
> Your bank statements stay on your machine. No login, no bank connection, no cloud, no telemetry.

## Status

🚧 **Phase 0 — Foundation.** Not yet usable. Roadmap below.

## Promise

You import your bank statements (PDF / CSV / OFX). The app extracts transactions deterministically (no LLM hallucination on numbers), categorizes them via an embedded LLM, and gives you a multi-account dashboard plus AI features (chat with your finances, automatic insights, projections). **All on your machine. Source code is public so the privacy promise is verifiable.**

## Stack

Electron · TypeScript · React · shadcn/ui · Tailwind · Recharts · SQLite (`better-sqlite3`) · `node-llama-cpp` · Qwen2.5 3B Instruct · pdfjs-dist · papaparse · ofx-js · tesseract.js (on-demand)

## Documentation

- [📘 Design Spec](docs/superpowers/specs/2026-05-14-finance-dashboard-design.md) — single source of truth
- [📋 Plan A — Project Bootstrap](docs/superpowers/plans/2026-05-14-plan-a-project-bootstrap.md)
- [📋 Plan B — Foundation Implementation](docs/superpowers/plans/2026-05-14-epic-1-setup-foundation.md)
- [🏛️ Architecture Decision Records](docs/adr/)
- [🤝 Contributing guide](CONTRIBUTING.md)
- [📜 Changelog](CHANGELOG.md)

## Roadmap

| Phase                               | Status         |
| ----------------------------------- | -------------- |
| Phase 0 — Foundation                | 🟡 In progress |
| Phase 1 — Import Pipeline           | ⚪ Backlog     |
| Phase 2 — Dashboard                 | ⚪ Backlog     |
| Phase 3 — Categorization & Rules    | ⚪ Backlog     |
| Phase 4 — AI Features               | ⚪ Backlog     |
| Phase 5 — Robustness (OCR + Backup) | ⚪ Backlog     |
| Phase 6 — Distribution              | ⚪ Backlog     |

Live tracking : [GitHub Project](https://github.com/users/denispianelli/projects) (link added after Task 10).

## License

AGPL-3.0-only. See [LICENSE](LICENSE).
