# Changelog

All notable changes to this project are documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
From v0.1.0 onward this file is generated automatically by
[release-please](https://github.com/googleapis/release-please) from
[Conventional Commits](https://www.conventionalcommits.org/). Do not edit
released sections by hand.

## [0.2.0](https://github.com/denispianelli/finance-dashboard/compare/v0.1.0...v0.2.0) (2026-05-19)


### Features

* add arithmetic verification guard ([#30](https://github.com/denispianelli/finance-dashboard/issues/30)) ([#52](https://github.com/denispianelli/finance-dashboard/issues/52)) ([5ec15cb](https://github.com/denispianelli/finance-dashboard/commit/5ec15cb326be2279cf8dd557d0603068dfc43930))
* add deduplication levels 2 and 3 (period overlap + transaction hash) ([#51](https://github.com/denispianelli/finance-dashboard/issues/51)) ([c486356](https://github.com/denispianelli/finance-dashboard/commit/c486356d5358f6082aa6ae98eaa5d5b3d1947838))
* app shell with sidebar navigation and routing ([#9](https://github.com/denispianelli/finance-dashboard/issues/9)) ([#19](https://github.com/denispianelli/finance-dashboard/issues/19)) ([06bab1e](https://github.com/denispianelli/finance-dashboard/commit/06bab1e230b0d4bdc672f075a07b4eea75f197ce))
* apply design system — tokens, Lucide icons, shell structure, self-hosted fonts (Story [#65](https://github.com/denispianelli/finance-dashboard/issues/65)) ([#67](https://github.com/denispianelli/finance-dashboard/issues/67)) ([893baaa](https://github.com/denispianelli/finance-dashboard/commit/893baaa0fe6d1df7cc52444a627dc107174f0790))
* **db:** seed LCL bank and column mapping via migration 002 ([#26](https://github.com/denispianelli/finance-dashboard/issues/26)) ([#40](https://github.com/denispianelli/finance-dashboard/issues/40)) ([33c5f83](https://github.com/denispianelli/finance-dashboard/commit/33c5f83a34f781f78ffd94d0d43a696a9370292a))
* design system primitives + populated dashboard (Story [#69](https://github.com/denispianelli/finance-dashboard/issues/69)) ([#70](https://github.com/denispianelli/finance-dashboard/issues/70)) ([307e62d](https://github.com/denispianelli/finance-dashboard/commit/307e62d6581de1cfb90b43ae90beeb478dc6fbf7))
* Electron + Vite + React + TypeScript skeleton ([#5](https://github.com/denispianelli/finance-dashboard/issues/5)) ([#15](https://github.com/denispianelli/finance-dashboard/issues/15)) ([6c22752](https://github.com/denispianelli/finance-dashboard/commit/6c2275220da2e5300dac6a921f1a2b1af5ffa553))
* ESLint strict + Playwright E2E ([#10](https://github.com/denispianelli/finance-dashboard/issues/10)) ([#20](https://github.com/denispianelli/finance-dashboard/issues/20)) ([308658d](https://github.com/denispianelli/finance-dashboard/commit/308658d4c9c85ee6a491d1670916209017e8f92a))
* import pipeline backend — extract + atomic INSERT ([#31](https://github.com/denispianelli/finance-dashboard/issues/31)a) ([#53](https://github.com/denispianelli/finance-dashboard/issues/53)) ([40277aa](https://github.com/denispianelli/finance-dashboard/commit/40277aa8d146297e002e4fd1bcb6993808755f9d))
* import review UI (Story [#31](https://github.com/denispianelli/finance-dashboard/issues/31)b) ([#64](https://github.com/denispianelli/finance-dashboard/issues/64)) ([710c2d1](https://github.com/denispianelli/finance-dashboard/commit/710c2d12a7cf0bb085b1428b5e9dffdc31a2fccf))
* **import:** add deterministic table extraction from LCL PDF tokens ([#27](https://github.com/denispianelli/finance-dashboard/issues/27)) ([#41](https://github.com/denispianelli/finance-dashboard/issues/41)) ([562676a](https://github.com/denispianelli/finance-dashboard/commit/562676ad6d7d263a87c0b88db95b14d6f67294d8))
* **import:** add PDF text extraction with pdfjs and coordinate tokens ([#39](https://github.com/denispianelli/finance-dashboard/issues/39)) ([90e1870](https://github.com/denispianelli/finance-dashboard/commit/90e1870a2e7f0cb405bf75fad0605af00ed809d0))
* **import:** file ingestion + type detection + SHA-256 ([#24](https://github.com/denispianelli/finance-dashboard/issues/24)) ([#35](https://github.com/denispianelli/finance-dashboard/issues/35)) ([5a54268](https://github.com/denispianelli/finance-dashboard/commit/5a54268d9f3fc9cbcf415335a7dd5332e81c3ef2))
* OFX ingestion as primary import path ([#58](https://github.com/denispianelli/finance-dashboard/issues/58)) ([#59](https://github.com/denispianelli/finance-dashboard/issues/59)) ([d9f0717](https://github.com/denispianelli/finance-dashboard/commit/d9f0717ffb5cf8cd07149a035ef54ca0b226f890))
* SQLite setup with node:sqlite, migration runner, initial schema ([#8](https://github.com/denispianelli/finance-dashboard/issues/8)) ([#18](https://github.com/denispianelli/finance-dashboard/issues/18)) ([3037cf0](https://github.com/denispianelli/finance-dashboard/commit/3037cf041d8759e254ec603313d794b2244aecb0))
* Tailwind + shadcn/ui + dark theme ([#6](https://github.com/denispianelli/finance-dashboard/issues/6)) ([#16](https://github.com/denispianelli/finance-dashboard/issues/16)) ([53e593e](https://github.com/denispianelli/finance-dashboard/commit/53e593e91ac54e712cdf624c87c8db913419efb7))
* typed IPC bridge between main and renderer ([#7](https://github.com/denispianelli/finance-dashboard/issues/7)) ([#17](https://github.com/denispianelli/finance-dashboard/issues/17)) ([11de4b1](https://github.com/denispianelli/finance-dashboard/commit/11de4b1104caa0939838cf17c15216bc13f8a4f9))


### Documentation

* add import review UI design spec ([#31](https://github.com/denispianelli/finance-dashboard/issues/31)b) ([210e907](https://github.com/denispianelli/finance-dashboard/commit/210e907d120adc24aa7a13b4cdf375868ac0c359))
* product scope realignment — ADR-009 + reslim master spec ([#77](https://github.com/denispianelli/finance-dashboard/issues/77)) ([074eab2](https://github.com/denispianelli/finance-dashboard/commit/074eab284548633c292a2f01ba1a91218b8bdfdc))
* surface branch + commit conventions in CLAUDE.md ([#89](https://github.com/denispianelli/finance-dashboard/issues/89)) ([9594466](https://github.com/denispianelli/finance-dashboard/commit/959446630406be4420f6f9dec216df4173a9dd51)), closes [#88](https://github.com/denispianelli/finance-dashboard/issues/88)
* update README to match accepted ADRs and current phase ([#43](https://github.com/denispianelli/finance-dashboard/issues/43)) ([#44](https://github.com/denispianelli/finance-dashboard/issues/44)) ([422ceb3](https://github.com/denispianelli/finance-dashboard/commit/422ceb32e44709530aa6b0e471d7f2a05cc163c0))


### Spikes

* LLM model selection — Llama 3.2 3B Q4_K_M ([#12](https://github.com/denispianelli/finance-dashboard/issues/12)) ([#22](https://github.com/denispianelli/finance-dashboard/issues/22)) ([7293a2a](https://github.com/denispianelli/finance-dashboard/commit/7293a2ad16e58eeac6ee28e8719bf6b95a72490e))

## 0.0.1-bootstrap (2026-05-14)

### Features

- Initial project bootstrap (Plan A): repo, LICENSE, design spec, plans, ADRs,
  GitHub issue/PR templates, Project board, Epic 1 + Stories, branch
  protection, Notion sync workflow.

### Notes

- Epic 1 (Setup & Foundation, Stories #5–#12) and Epic 2 Story #24 (file
  ingestion) were merged before release-please was wired. Their changes are
  captured in git history under Conventional Commits and will appear in the
  first release-please-generated section the next time a release is cut.
