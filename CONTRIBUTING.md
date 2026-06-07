# Contributing

This project follows a structured workflow even though it currently has a single contributor. The rigor exists so the project remains legible and maintainable, and so it can serve as a portfolio piece.

> ## ⚡ MVP mode (current — since 2026-06-01)
>
> To reach a working model fast, the full process below is **temporarily relaxed**. The rigor
> gets restored once the MVP is functional (the polish phase).
>
> **Suspended for now:**
>
> - **The heavy PR ceremony** — required reviews, issue-linking, the PR template,
>   one-Story-per-PR. `main` _is_ protected (since 2026-06-03), but with a **light** gate:
>   branch + PR + green CI + branch up to date, **0 required reviews**, **no issue/board
>   linkage** — open the PR and self-merge once green. Config lives in
>   `.github/branch-protection.payload.json`.
> - **Epic → Story → Task decomposition** and the DoR ceremony. Work off a lightweight TODO.
> - **Notion / GitHub Project board sync** (`/sync-notion-*`). Don't gate work on board state.
>
> **Still in force (cheap, high value):**
>
> - Conventional Commits + `commitlint`/husky hooks, and the DoD's green-bar checks
>   (`typecheck` / `lint` / `test`, `npm run build`).
> - ADRs/specs for **hard-to-reverse** decisions only — not for every change.
> - Review agents (`pr-review-toolkit:*`, `/code-review`) on code that matters.
> - Privacy invariants (ADR-002) — never relaxed.
>
> Everything below is the **target process** for the post-MVP phase; keep it for reference.

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
- _(Post-MVP)_ The PR description should link an issue (`Closes #N` / `Refs #N`). **Not enforced during MVP** — the issue-link Action was removed and no issue is required.
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

## Local development

### Optional: GPU acceleration for the LLM (NVIDIA, WSL2/Linux)

LLM categorization runs ~10× faster on an NVIDIA GPU. The CUDA prebuilt binary
ships with `node-llama-cpp`; it only needs the CUDA 12 runtime libs locally:

```bash
npm run setup:cuda   # downloads libcudart/libcublas into .cuda-libs/ (gitignored)
```

`npm run dev` then adds `.cuda-libs` to `LD_LIBRARY_PATH` automatically. Confirm
it worked: the dev terminal logs `[llm] inference backend: "cuda"` on the first
categorization. Without this step (or on a machine with no NVIDIA GPU) the app
falls back to CPU automatically — everything still works, just slower.

The packaged Windows app bundles the CUDA backend and needs no setup beyond the
NVIDIA driver.

## Documentation

- **Specs** (single source of truth) : `docs/superpowers/specs/`
- **ADRs** (single source of truth) : `docs/adr/`
- **Plans** : `docs/superpowers/plans/` (one per Epic or sub-project)

## Issue types

Use the templates. Blank issues are disabled.

- **Epic** — phase-level work, one per phase of the roadmap
- **Story** — user-facing slice of an Epic
- **Bug** — something is broken
- **Spike** — time-boxed research with a deliverable
