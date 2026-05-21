# Spec-driven development (SDD) workflow

How a piece of work travels from idea to merged code in this repo.

`CONTRIBUTING.md` covers the **mechanics** — branch naming, commit format, PR
rules, Definition of Ready / Done. This document covers the **pipeline**: the
artifacts produced along the way, what each one is for, and the order they
appear in. Mechanics are referenced here, not restated.

## The pipeline at a glance

```
idea ──▶ design spec ──▶ ADR ──▶ implementation plan ──▶ task issues ──▶ PRs ──▶ merge
         (the contract)  (the    (the task-by-task      (Epic ▸ Story   (one
                          why)    breakdown)             ▸ Task)         per task)
```

Specs, ADRs and plans live in the repo under `docs/`. Epics, Stories and
Tasks are GitHub issues. The GitHub Project board tracks live status; no
document does.

## The artifacts

### Design spec — _what we are building_

The design contract for a Story. Frozen before implementation starts; it is
what the code is checked against.

- **Lives in:** `docs/superpowers/specs/YYYY-MM-DD-<name>-design.md`
- **Header fields:** Date, Status, Story link, Parent epic, Related ADR,
  References.
- **Typical sections:** Goal, Scope (in / out), Data model, behaviour,
  test plan.
- `docs/superpowers/specs/2026-05-14-finance-dashboard-design.md` is the
  **master spec** — the umbrella design. Per-Story specs are separate files
  and reference the section of the master spec they extend.

### ADR — _why we decided it this way_

An Architecture Decision Record captures one decision and the reasoning
behind it, so the choice is legible months later.

- **Lives in:** `docs/adr/NNN-<slug>.md` — sequential number, never reused.
- **Template:** `docs/adr/000-template.md` — Context, Decision, Alternatives
  considered, Consequences.
- **Status lifecycle:** `Proposed` when the work starts → `Accepted` when the
  work lands. A decision that replaces an earlier one gets its **own** number
  and sets `Supersedes: ADR-XXX`; the old ADR moves to `Superseded`.
- Not every Story needs an ADR — only one that makes an architectural choice.

### Implementation plan — _how we will build it, task by task_

Breaks a Story into a strictly ordered sequence of Tasks and maps every file
to the Task that touches it.

- **Lives in:** `docs/superpowers/plans/YYYY-MM-DD-<name>.md`
- **Contains:** goal, tech stack, Story + parent Epic refs, the Task sequence
  (`T0 → T1 → … → Tn`), a file-structure table (file ▸ task ▸ responsibility),
  and conventions carried from the codebase.
- Plans are point-in-time records. Once written they are not rewritten to
  match later reality — a superseding plan is a new file.

### Epic ▸ Story ▸ Task — _the tracked units of work_

GitHub issues. Epics, Stories, Spikes and Bugs use the templates in
`.github/ISSUE_TEMPLATE/` (blank issues are disabled); Task issues have no
dedicated template and are created directly, one per plan Task.

- **Epic** — one phase of the roadmap.
- **Story** — a user-facing slice of an Epic; the target of a design spec.
- **Task** — one PR-sized step of a Story's plan (`T0`, `T1`, …).
- **Spike** — time-boxed research with a deliverable, when a decision needs
  evidence first.

Only the **current** Epic is decomposed into Stories and Tasks — future Epics
are left coarse until their turn.

## The lifecycle of a Story

1. **Story issue** created from the template, linked to its parent Epic, and
   brought to _Ready_ (see `CONTRIBUTING.md` § Definition of Ready).
2. **Task T0 — the paper task.** Lands, in a single commit, three documents:
   the design spec, the ADR (`Proposed`), and the implementation plan. The
   plan file is `git add`-ed in this same commit — never left untracked.
3. **Tasks T1…Tn — implementation.** Each Task is its own issue, branch and
   PR, executed in order; a Task may depend on the previous one's output.
4. **The last Task** flips the ADR from `Proposed` to `Accepted` and updates
   the affected section of the master spec.

Each Task branch → PR → squash-merge follows `CONTRIBUTING.md` § Pull
Requests. The maintainer merges; an agent never does.

## Where things live

```
docs/
├── adr/                     ADRs — one decision per file, NNN-<slug>.md
└── superpowers/
    ├── specs/               design specs — the master spec + one per Story
    └── plans/               implementation plans — one per Story (or Epic)
.github/
├── ISSUE_TEMPLATE/          Epic / Story / Spike / Bug templates
└── PULL_REQUEST_TEMPLATE.md
```

## Tooling note

Plan files carry a `REQUIRED SUB-SKILL` directive pointing at the Claude Code
`superpowers` plugin (`subagent-driven-development` / `executing-plans`), and
`docs/superpowers/` is named after it. The pipeline above is plugin-agnostic —
specs, ADRs and plans are plain Markdown — but reproducing the _agentic
execution_ of plans on another project currently assumes that plugin is
installed.
