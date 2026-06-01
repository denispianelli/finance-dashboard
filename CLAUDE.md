# CLAUDE.md — Agent operating guide

Durable rules for working in this repo. **Pointers, not duplication** — product scope,
roadmap and phase are volatile and live in their sources of truth (below), never restate them
here.

## Sources of truth (read before proposing work)

- **Product scope & north star:** `docs/adr/009-product-scope-realignment.md` (authoritative).
- **Design spec:** `docs/superpowers/specs/2026-05-14-finance-dashboard-design.md`.
- **Decisions:** `docs/adr/`.
- **Live roadmap / phase / status:** lightweight TODO during MVP (board/Notion sync paused —
  see MVP mode under §Git & process). ADR-009 still bounds product scope.

## Privacy is non-negotiable

100% local. No network calls, no telemetry, no cloud, no bank connections. Renderer does no
I/O — everything via typed IPC to main. CSP stays `'self'`. See ADR-002.

**Scope guard:** ADR-009 cut conversational AI, NL search, generative insights, investments
tracking, multi-window. Do not re-propose them. The LLM is a background batch classifier only
(column mapping + categorization) — it never converses or reasons over figures user-facing.

## Code

- TypeScript strict. `@typescript-eslint/no-explicit-any` and the `no-unsafe-*` family are
  **errors**. `noUncheckedIndexedAccess` is on.
- Vitest 4: per-file `// @vitest-environment jsdom` directive **plus** an explicit
  `afterEach(() => { cleanup(); })` (auto-cleanup does not run with the per-file directive).
- UI: shadcn/ui + Tailwind, `cn()` + variant pattern. Lucide for icons, never emoji in UI
  chrome. Respect the design tokens (identity scale in `tailwind.config.ts` / `globals.css`).
- Fonts are self-hosted via `@fontsource` (no CDN) — keep it that way.

## Git & process

> **MVP mode (since 2026-06-01).** Process is deliberately lightened to reach a working model
> fast, then tighten the rigor back afterwards. **Suspended:** PR-per-task + branch protection
> (commit directly to `main`), Epic→Story→Task decomposition, Notion/board sync. **Kept:**
> ADRs/specs for genuinely hard-to-reverse decisions, review agents on code that matters, and
> the husky/commitlint gates (they cost nothing). The full process stays documented in
> `CONTRIBUTING.md` for when we restore it post-MVP.

- **Commit directly to `main`** during MVP — no branch/PR required for routine work. Still
  branch + PR for anything risky or worth a review trail.
- **Branch naming + commit format (when you do branch): see `CONTRIBUTING.md`.** Commits
  follow Conventional Commits — enforced by `commitlint` via husky `commit-msg`.
- Commit subjects and PR/issue/ADR/code text: **English**, imperative present
  ("add X", "fix Y" — not noun phrases). When a change has a plan file, `git add` it in the
  same commit; never leave it untracked.
- **No formal Epic→Story→Task decomposition** during MVP — work off a lightweight TODO. Write
  an ADR/spec only for decisions that are hard to reverse.
- Husky: pre-commit runs eslint --fix + prettier (lint-staged); pre-push runs typecheck +
  tests. Expect staged files to be reformatted — re-add and retry the commit.

## Worktrees & fixtures

- Isolated worktrees live under `.worktrees/` (gitignored). Do not use other locations.
- `spike-fixtures/` is gitignored and holds real bank data — **never commit it**. New
  worktrees need a symlink: `ln -sfn <repo>/spike-fixtures <worktree>/spike-fixtures`.

## Definition of done

Lint clean, `tsc --noEmit` clean, unit tests green, E2E green where relevant, `npm run build`
succeeds. Verify before pushing to `main` (pre-push runs typecheck + tests).
