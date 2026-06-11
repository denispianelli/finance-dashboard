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

**The invariant: no user data ever leaves the machine.** 100% local processing, no telemetry,
no analytics, no cloud, no bank connections. Renderer does no I/O — everything via typed IPC to
main. CSP stays `'self'`. See ADR-002.

The rule is about _data_, not packets: the only outbound call allowed is an opt-in version
check (sends no data, receives a version number), from the main process only, never the
renderer. Anything that would transmit user/financial data is forbidden, full stop.

**Scope guard:** ADR-009 (as amended 2026-06-10) cut conversational AI, NL search, generative
insights, multi-window, budgets, and market price feeds / position-level investment tracking.
Do not re-propose them. **In scope** since Amendment 2: full patrimoine by cash flows +
declared values — mortgage (deterministic amortization), declared assets (primary residence),
allocation with targets, TRI/TTWROR from flows + declared balances, deterministic projections.
**No LLM** (ADR-019,
2026-06-11): the embedded model was removed (phases #212/#214 + this PR) — categorization and
bank mapping are deterministic (history/rules + a manual mapping assistant). Do not propose
LLM-powered features.

## Working loop (single maintainer)

How to run a build session for this project's one real user. A brick request may be a
one-liner ("go for the mortgage module") — these rules fill in the rest.

- **Challenge before you comply.** If a request contradicts an ADR, over-extrapolates a
  constraint, or adds complexity the real usage doesn't justify (one user, passive DCA
  investor, monthly balance updates), say so and propose simpler **before** coding. The repo
  (ADRs, this file) outranks the day's phrasing. Symmetrically: if mid-work the agreed scope
  turns out wrong or incomplete, stop and say it — never route around it silently.
- **Every displayed figure needs a visible verification path** — against a statement, a loan
  offer, a formula the user can recompute, to the cent. A brick that shows a number the user
  can't check is not done, even with CI green (north star, ADR-009).
- **Hard-to-reverse decisions get a design doc first** (data model, accounting treatment, DB
  schema) and maintainer validation before code; everything else gets a short plan. Don't ask
  validation for the obvious.
- **End every brick with a validation script:** what to check in the app, with which data,
  expecting what result. Visual/UI changes: the maintainer validates in-app **before** merge;
  backend/docs PRs may self-merge once CI is green.
- **Docs move with the code:** README / ADR / CLAUDE.md updates land in the same PR as the
  change that makes them true. Doc/reality drift is this project's known failure mode.

## Code

- TypeScript strict. `@typescript-eslint/no-explicit-any` and the `no-unsafe-*` family are
  **errors**. `noUncheckedIndexedAccess` is on.
- Vitest 4: per-file `// @vitest-environment jsdom` directive **plus** an explicit
  `afterEach(() => { cleanup(); })` (auto-cleanup does not run with the per-file directive).
- UI: shadcn/ui + Tailwind, `cn()` + variant pattern. Lucide for icons, never emoji in UI
  chrome. Respect the design tokens (identity scale in `tailwind.config.ts` / `globals.css`).
- Fonts are self-hosted via `@fontsource` (no CDN) — keep it that way.

## Git & process

> **MVP mode (since 2026-06-01, refined 2026-06-03).** Process is deliberately lightened to
> ship **fast but clean**. **Suspended:** Epic→Story→Task decomposition, Notion/board sync, and
> forced issue-linking on PRs (no issues required). **Kept / restored:** `main` is protected by
> a **light PR gate** — every change goes through a branch + PR, with CI green and the branch up
> to date, but **0 required reviews** (open it and self-merge once green) and **no issue/board
> gate**. ADRs/specs for hard-to-reverse decisions and the husky/commitlint gates stay. The
> heavier full process stays documented in `CONTRIBUTING.md` for when we restore it post-MVP.

- **`main` is protected — branch + PR for every change.** No direct commits/pushes to `main`
  (any session). No review required: open the PR and **self-merge once CI is green and the
  branch is up to date**. No issue or board linkage needed.
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

- **Use the `EnterWorktree` tool for isolated work.** It creates the worktree under
  `.claude/worktrees/` (gitignored) and tears it down automatically on exit — don't hand-roll
  `git worktree add/remove`. **Never delete the worktree you're running in**; let the tool own
  the lifecycle (this avoids cutting your own session's working directory out from under it).
  The legacy hand-managed `.worktrees/` path stays gitignored if you ever need it, but the tool
  is the default.
- `spike-fixtures/` is gitignored (real bank data) — **never commit it**. A worktree that
  needs it gets a symlink, e.g. `ln -sfn <repo>/spike-fixtures <worktree>/spike-fixtures`.

## Definition of done

Lint clean, `tsc --noEmit` clean, unit tests green, E2E green where relevant, `npm run build`
succeeds. Verify before pushing to `main` (pre-push runs typecheck + tests).
