# Contributing

This project follows a structured workflow even though it currently has a single contributor. The rigor exists so the project remains legible and maintainable, and so it can serve as a portfolio piece.

## Workflow overview

```
Issue (Story) created → DoR satisfied → moved to "Next" → moved to "In Progress"
   → branch created → commits → PR opened (Closes #N) → CI green → squash-merged
   → issue auto-closes → card moves to "Done"
```

## Branch naming

`<type>/<issue-number>-<short-slug>` — examples :

- `feat/12-electron-skeleton`
- `fix/47-categorization-rule-bug`
- `docs/35-update-readme`
- `spike/9-llm-benchmark`
- `chore/3-bump-deps`

Allowed types : `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `ci`, `perf`, `style`, `build`, `spike`.

## Commit messages — Conventional Commits

Format : `<type>(<optional-scope>): <subject>`

- `feat: add sidebar navigation`
- `fix(import): handle empty PDF table`
- `chore: bump electron to 32.1.0`
- `docs: clarify deduplication strategy`

`commitlint` enforces this format locally via a husky `commit-msg` hook. A commit that doesn't match will be rejected.

## Pull Requests

- One Story (or one focused Task) per PR.
- The PR description **must** contain `Closes #<issue-number>` or `Refs #<issue-number>` — enforced by a GitHub Action.
- The PR template must be filled in.
- CI on Linux / macOS / Windows must be green.
- Squash-merge only — `main` keeps a clean linear history.
- Auto-delete head branches after merge.

## Definition of Ready (DoR)

A Story is **Ready** to be picked up only when **all** of the below are true. Until then, it stays in the Backlog. Don't pick up an unready story.

- [ ] Description is clear (1-3 short paragraphs)
- [ ] Acceptance criteria are explicit (testable checkboxes)
- [ ] Linked to an Epic
- [ ] Spec section / ADR referenced if architectural
- [ ] Rough estimation set (label `est:S`, `est:M`, `est:L`)
- [ ] No known blockers

## Definition of Done (DoD)

A Story is **Done** when :

- [ ] All acceptance criteria checked
- [ ] Tests added (or N/A and stated why)
- [ ] `npm run typecheck`, `npm run lint`, `npm test` pass
- [ ] CI green on PR
- [ ] Spec or ADR updated if architecture changed
- [ ] Linked Notion entity (Epic / ADR / Decision) updated to reflect the new state

## Documentation

- **Specs** (single source of truth) : Notion + mirrored in `docs/superpowers/specs/`
- **ADRs** : Notion ADRs database + mirrored in `docs/adr/`
- **Plans** : `docs/superpowers/plans/` (one per Epic or sub-project)

## Issue types

Use the templates. Blank issues are disabled.

- **Epic** — phase-level work, one per Epic in the Notion Epics database
- **Story** — user-facing slice of an Epic
- **Bug** — something is broken
- **Spike** — time-boxed research with a deliverable

## Slash commands (Claude Code)

Available at the start and end of each working session :

- `/sync-notion-start` — audit drift between Notion and the repo
- `/sync-notion-end` — propose Notion updates based on the session's commits

The commands live in `.claude/commands/` and are project-scoped.
