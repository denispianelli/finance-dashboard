# Plan A — Project Bootstrap (zero application code)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring up the **organizational scaffolding** of the project — repo, project board, milestones, tickets, branch/commit/PR rules, Notion sync — **without writing a single line of application code**. At the end, a recruiter could browse `denispianelli/finance-dashboard` and see a well-organized, ticketed project ready for development. Plan B (Foundation Implementation) then executes ticket-by-ticket.

**Architecture:** Minimal repo containing LICENSE, README, CHANGELOG, CONTRIBUTING, all design docs (spec, plans, ADRs mirror), and pure tooling config (commitlint, husky, GitHub workflows). No `src/`. Branch protection forces all changes through PRs, and every PR must reference an issue. GitHub Project mirrors the Notion Epics database for live work tracking.

**Tech Stack (tooling only):** Git · GitHub CLI (`gh`) · Node 20+ · npm · commitlint · husky · GitHub Actions · Notion MCP

**Inputs** :

- `docs/superpowers/specs/2026-05-14-finance-dashboard-design.md` (already exists)
- `docs/superpowers/plans/2026-05-14-epic-1-setup-foundation.md` (existing plan — will be renamed to Plan B and stripped of the bootstrap tasks once Plan A is executed)
- Notion workspace already populated (parent `360e531a-b5ff-8127-8e64-d7f7734dec10`)

**Strictness rules adopted** :

- **Niveau 1** : Branch naming convention strongly recommended, PRs **must** reference an issue (enforced by GitHub Action). Conventional Commits enforced locally via commitlint.
- **DoR (Definition of Ready)** documented in CONTRIBUTING — applies to all Stories before they enter "In Progress".

---

## File Structure (end state of Plan A)

```
finance-dashboard/
├── .github/
│   ├── workflows/
│   │   ├── pr-issue-link.yml         # enforces PR ↔ issue link
│   │   └── codeql.yml
│   ├── ISSUE_TEMPLATE/
│   │   ├── config.yml
│   │   ├── epic.yml
│   │   ├── story.yml
│   │   ├── bug.yml
│   │   └── spike.yml
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── dependabot.yml
├── .husky/
│   ├── commit-msg
│   └── pre-commit
├── .claude/
│   └── commands/                     # already exists (sync-notion-*)
├── docs/
│   ├── superpowers/
│   │   ├── specs/                    # spec already here
│   │   └── plans/                    # plan A and plan B here
│   └── adr/
│       ├── 000-template.md
│       ├── 001-electron-over-tauri.md
│       ├── 002-privacy-first-local.md
│       ├── 003-deterministic-extraction.md
│       ├── 004-llm-model-candidate.md
│       ├── 005-mandatory-human-review.md
│       └── 006-multi-level-deduplication.md
├── .gitignore
├── .prettierrc
├── commitlint.config.cjs
├── package.json                       # devDeps only : husky, commitlint, lint-staged
├── package-lock.json
├── LICENSE                            # AGPL-3.0
├── README.md
├── CHANGELOG.md
└── CONTRIBUTING.md
```

**Explicitly NOT in Plan A** : `src/`, Electron config, Vite config, React, shadcn, SQLite, LLM. All of that is Plan B.

---

## Task 1 : Local Repository — Files and Initial Commit

**Files:**

- Create: `LICENSE`, `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `.gitignore`, `.prettierrc`, `docs/adr/000-template.md`
- Verify present: `docs/superpowers/specs/2026-05-14-finance-dashboard-design.md`, `docs/superpowers/plans/2026-05-14-plan-a-project-bootstrap.md`, `docs/superpowers/plans/2026-05-14-epic-1-setup-foundation.md`

- [ ] **Step 1.1 — Initialize git**

```bash
cd /home/denis/finance-dashboard
git init -b main
git config user.name "Denis Pianelli"
git config user.email "denis.pianelli@gmail.com"
```

- [ ] **Step 1.2 — `.gitignore`**

Create `.gitignore` :

```
node_modules/
dist/
out/
.vite/
*.log
.DS_Store
.env
.env.local
.env.*.local
*.sqlite
*.sqlite-journal
*.sqlite-shm
*.sqlite-wal
.superpowers/
models/
spike-fixtures/
spike-results.txt
coverage/
.vscode/
.idea/
```

- [ ] **Step 1.3 — `LICENSE` (AGPL-3.0)**

```bash
curl -fsSL https://www.gnu.org/licenses/agpl-3.0.txt -o LICENSE
```

Verify it starts with `GNU AFFERO GENERAL PUBLIC LICENSE` and is ~34 KB.

- [ ] **Step 1.4 — `README.md`**

Create `README.md` :

```markdown
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
```

- [ ] **Step 1.5 — `CHANGELOG.md`**

Create `CHANGELOG.md` :

```markdown
# Changelog

All notable changes to this project will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial project bootstrap (Plan A) : repo, LICENSE, design spec, plans, ADRs, GitHub templates, Project board, Epic 1 + Stories tickets, branch protection, Notion sync workflow.
```

- [ ] **Step 1.6 — `CONTRIBUTING.md`** (includes the rule + DoR)

Create `CONTRIBUTING.md` :

```markdown
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
```

- [ ] **Step 1.7 — `.prettierrc`**

Create `.prettierrc` :

```json
{
  "singleQuote": true,
  "semi": true,
  "trailingComma": "all",
  "printWidth": 100,
  "endOfLine": "lf"
}
```

- [ ] **Step 1.8 — `docs/adr/000-template.md`**

Create `docs/adr/000-template.md` :

```markdown
# ADR-NNN — Title

- **Status** : Proposed | Accepted | Deprecated | Superseded
- **Date** : YYYY-MM-DD
- **Category** : Architecture | Data | UI | Security | Performance | Process | LLM
- **Supersedes** : ADR-XXX (if applicable)

## Context

What is the problem we are solving? What are the constraints?

## Decision

What did we decide?

## Alternatives considered

What did we evaluate and reject? Why?

## Consequences

What becomes easier? What becomes harder? What new risks does this introduce?
```

- [ ] **Step 1.9 — Mirror ADRs from Notion to `docs/adr/`**

Create one file per existing ADR in Notion. Use the Notion MCP to fetch each one and write its content to `docs/adr/<nnn>-<slug>.md` using the template format. Files to create :

- `docs/adr/001-electron-over-tauri.md`
- `docs/adr/002-privacy-first-local.md`
- `docs/adr/003-deterministic-extraction.md`
- `docs/adr/004-llm-model-candidate.md`
- `docs/adr/005-mandatory-human-review.md`
- `docs/adr/006-multi-level-deduplication.md`

For each, copy the content from the corresponding Notion ADR. Keep the Notion entry as the source of truth — the repo files are mirrors. The footer of each markdown file should be :

```markdown
---

_Mirrored from Notion : [ADR-NNN](https://www.notion.so/<page-id>)_
```

- [ ] **Step 1.10 — Stage everything and prepare first commit**

```bash
git status
git add LICENSE README.md CHANGELOG.md CONTRIBUTING.md .gitignore .prettierrc docs/
```

Verify `git status` shows the staged files cleanly and nothing else.

> Don't commit yet — Tasks 2-5 add more files. We commit once everything is in place.

---

## Task 2 : Tooling Bootstrap — package.json, commitlint, husky

**Files:**

- Create: `package.json`, `commitlint.config.cjs`, `.husky/commit-msg`, `.husky/pre-commit`

The only npm dependencies installed in Plan A are **tooling** (commitlint, husky, lint-staged, prettier). No Electron, no React. Those come in Plan B.

- [ ] **Step 2.1 — Initialize `package.json`**

```bash
npm init -y
```

Then replace the generated `package.json` with :

```json
{
  "name": "finance-dashboard",
  "version": "0.0.1",
  "description": "Privacy-first desktop finance dashboard with embedded local LLM",
  "license": "AGPL-3.0-only",
  "author": "Denis Pianelli <denis.pianelli@gmail.com>",
  "repository": {
    "type": "git",
    "url": "https://github.com/denispianelli/finance-dashboard.git"
  },
  "engines": {
    "node": ">=20.0.0"
  },
  "private": true,
  "type": "module",
  "scripts": {
    "prepare": "husky"
  },
  "devDependencies": {},
  "lint-staged": {
    "*.{json,md,yml,yaml}": ["prettier --write"]
  }
}
```

- [ ] **Step 2.2 — Install tooling**

```bash
npm i -D @commitlint/cli @commitlint/config-conventional husky lint-staged prettier
```

This creates `package-lock.json` and `node_modules/`.

- [ ] **Step 2.3 — `commitlint.config.cjs`**

Create `commitlint.config.cjs` :

```javascript
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'chore', 'docs', 'test', 'refactor', 'ci', 'perf', 'style', 'build', 'spike'],
    ],
    'subject-case': [0],
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
  },
};
```

- [ ] **Step 2.4 — Initialize husky**

```bash
npm run prepare
```

This creates `.husky/` directory with `_/` internal files.

- [ ] **Step 2.5 — `commit-msg` hook**

Create `.husky/commit-msg` :

```bash
npx --no -- commitlint --edit "$1"
```

Make it executable :

```bash
chmod +x .husky/commit-msg
```

- [ ] **Step 2.6 — `pre-commit` hook**

Create `.husky/pre-commit` :

```bash
npx lint-staged
```

Make it executable :

```bash
chmod +x .husky/pre-commit
```

- [ ] **Step 2.7 — Smoke-test commitlint locally (before we commit anything real)**

```bash
echo "not a conventional commit" | npx commitlint
```

Expected : exit code 1, error mentioning `type-enum`. Then :

```bash
echo "chore: verify commitlint works" | npx commitlint
```

Expected : exit code 0, no output.

> If both tests pass, commitlint is wired correctly. The husky `commit-msg` hook will run it on every git commit going forward.

---

## Task 3 : `.github/` — PR Template, Issue Templates, Dependabot, CodeQL, PR-Issue-Link

**Files:**

- Create: `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/config.yml`, `.github/ISSUE_TEMPLATE/epic.yml`, `.github/ISSUE_TEMPLATE/story.yml`, `.github/ISSUE_TEMPLATE/bug.yml`, `.github/ISSUE_TEMPLATE/spike.yml`, `.github/dependabot.yml`, `.github/workflows/codeql.yml`, `.github/workflows/pr-issue-link.yml`

- [ ] **Step 3.1 — `.github/PULL_REQUEST_TEMPLATE.md`**

```markdown
## Summary

<!-- 1-3 lines : what and why -->

## Linked issue

Closes #

<!-- A PR must reference an issue. Use "Closes #N" to auto-close on merge, or "Refs #N" if it's only related. -->

## Type of change

- [ ] feat — new feature
- [ ] fix — bug fix
- [ ] refactor — code change neither feat nor fix
- [ ] docs / ADR
- [ ] test
- [ ] ci / build
- [ ] chore / perf / style

## Checklist

- [ ] Branch named `<type>/<issue-number>-<slug>`
- [ ] Commits follow Conventional Commits
- [ ] Tests added or updated (or N/A — explain)
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm test` passes
- [ ] Spec / ADR updated if architecture changed
- [ ] Notion (Epic / ADR / Decision / parent page) updated

## Screenshots (UI changes only)

<!-- drag & drop -->
```

- [ ] **Step 3.2 — `.github/ISSUE_TEMPLATE/config.yml`**

```yaml
blank_issues_enabled: false
contact_links:
  - name: 💬 Discussions
    url: https://github.com/denispianelli/finance-dashboard/discussions
    about: Questions, ideas, RFCs that don't need a ticket.
```

- [ ] **Step 3.3 — `.github/ISSUE_TEMPLATE/epic.yml`**

```yaml
name: 🎯 Epic
description: Phase-level work item. Mirrors a Notion EPIC entry.
title: 'Epic — '
labels: ['epic']
body:
  - type: input
    id: notion
    attributes:
      label: Notion EPIC URL
      placeholder: https://www.notion.so/...
    validations:
      required: true
  - type: dropdown
    id: phase
    attributes:
      label: Phase
      options:
        - 'Phase 0 — Foundation'
        - 'Phase 1 — Import'
        - 'Phase 2 — Dashboard'
        - 'Phase 3 — Catégorisation'
        - 'Phase 4 — IA'
        - 'Phase 5 — Robustesse'
        - 'Phase 6 — Distribution'
    validations:
      required: true
  - type: textarea
    id: description
    attributes:
      label: Description
      description: Why this Epic exists and what it delivers.
    validations:
      required: true
  - type: textarea
    id: dod
    attributes:
      label: Definition of Done
      value: |
        - [ ] All linked stories closed
        - [ ] CI green on all OS
        - [ ] Notion EPIC entry set to "Done"
        - [ ] Relevant ADRs created / updated
      render: markdown
    validations:
      required: true
```

- [ ] **Step 3.4 — `.github/ISSUE_TEMPLATE/story.yml`**

```yaml
name: 📘 Story
description: User-facing slice of an Epic. Single PR target.
title: 'Story — '
labels: ['story']
body:
  - type: input
    id: epic
    attributes:
      label: Parent Epic
      placeholder: '#N'
    validations:
      required: true
  - type: textarea
    id: user-story
    attributes:
      label: User story
      value: |
        En tant qu'**[utilisateur]**, je veux **[action]** afin de **[bénéfice]**.
    validations:
      required: true
  - type: textarea
    id: acceptance
    attributes:
      label: Acceptance criteria
      value: |
        - [ ] (Criterion 1)
        - [ ] (Criterion 2)
      render: markdown
    validations:
      required: true
  - type: textarea
    id: tasks
    attributes:
      label: Implementation outline
      description: Bullet list of tasks. Detailed code lives in Plan B.
  - type: dropdown
    id: estimate
    attributes:
      label: Rough estimate
      options:
        - 'S — ≤ half a day'
        - 'M — 1-2 days'
        - 'L — 3-5 days'
        - 'XL — > 1 week (consider splitting)'
    validations:
      required: true
  - type: input
    id: ref
    attributes:
      label: Reference (Plan B task, spec section, ADR)
      placeholder: 'Plan B — Task N · Spec §M'
```

- [ ] **Step 3.5 — `.github/ISSUE_TEMPLATE/bug.yml`**

```yaml
name: 🐛 Bug
description: Something is broken.
title: 'Bug — '
labels: ['bug']
body:
  - type: textarea
    id: expected
    attributes:
      label: Expected behavior
    validations:
      required: true
  - type: textarea
    id: actual
    attributes:
      label: Actual behavior
    validations:
      required: true
  - type: textarea
    id: repro
    attributes:
      label: Steps to reproduce
      value: |
        1.
        2.
        3.
      render: markdown
    validations:
      required: true
  - type: input
    id: env
    attributes:
      label: Environment
      placeholder: 'OS · app version · Node version'
    validations:
      required: true
```

- [ ] **Step 3.6 — `.github/ISSUE_TEMPLATE/spike.yml`**

```yaml
name: 🔬 Spike
description: Time-boxed research with a deliverable.
title: 'Spike — '
labels: ['spike']
body:
  - type: input
    id: timebox
    attributes:
      label: Time-box
      placeholder: 'ex: 2 days'
    validations:
      required: true
  - type: textarea
    id: question
    attributes:
      label: Question being answered
    validations:
      required: true
  - type: textarea
    id: deliverable
    attributes:
      label: Deliverable that closes this spike
      description: ADR, decision in the Decision Log, doc, etc.
    validations:
      required: true
```

- [ ] **Step 3.7 — `.github/dependabot.yml`**

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: '/'
    schedule:
      interval: weekly
      day: monday
    open-pull-requests-limit: 5
    groups:
      dev-deps:
        dependency-type: development
        update-types: [minor, patch]
      prod-deps:
        dependency-type: production
        update-types: [patch]
  - package-ecosystem: github-actions
    directory: '/'
    schedule:
      interval: monthly
```

- [ ] **Step 3.8 — `.github/workflows/codeql.yml`**

```yaml
name: CodeQL

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 8 * * 1'

permissions:
  actions: read
  contents: read
  security-events: write

jobs:
  analyze:
    name: Analyze (JS/TS)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with:
          languages: javascript-typescript
      - uses: github/codeql-action/autobuild@v3
      - uses: github/codeql-action/analyze@v3
```

- [ ] **Step 3.9 — `.github/workflows/pr-issue-link.yml`** (enforces the rule)

```yaml
name: PR ↔ Issue link

on:
  pull_request:
    types: [opened, edited, synchronize, reopened]

permissions:
  pull-requests: read

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - name: Verify PR body references an issue
        uses: actions/github-script@v7
        with:
          script: |
            const body = context.payload.pull_request.body || '';
            const pattern = /(closes|close|closed|fixes|fix|fixed|resolves|resolve|resolved|refs|ref)\s+#\d+/i;
            if (!pattern.test(body)) {
              core.setFailed(
                'PR description must reference an issue. ' +
                'Add "Closes #N", "Fixes #N", or "Refs #N" to the PR body.'
              );
            } else {
              core.info('PR references an issue ✓');
            }
```

> When CI requires this check (set in Task 6), no PR can merge without referencing an issue.

---

## Task 4 : Create the GitHub Repository and Push

**Files:** none locally. Output : `https://github.com/denispianelli/finance-dashboard`.

- [ ] **Step 4.1 — Verify gh authentication**

```bash
gh auth status
```

Expected : logged in as `denispianelli`.

- [ ] **Step 4.2 — First commit (everything from Tasks 1-3)**

```bash
git add .
git status
```

Verify all expected files are staged : LICENSE, README, CHANGELOG, CONTRIBUTING, .gitignore, .prettierrc, package.json, package-lock.json, commitlint.config.cjs, .husky/, .github/, docs/, .claude/.

```bash
git commit -m "chore: bootstrap project — license, docs, github templates, commitlint, husky"
```

The husky hooks run on this commit. Commitlint validates the message. If anything fails, fix and retry.

- [ ] **Step 4.3 — Create remote repo + push**

```bash
gh repo create denispianelli/finance-dashboard \
  --public \
  --source=. \
  --remote=origin \
  --description "Privacy-first desktop finance dashboard with embedded local LLM. 100% local, no login, no bank connection." \
  --homepage "https://github.com/denispianelli/finance-dashboard" \
  --push
```

Expected output : repo URL printed, branch `main` pushed.

- [ ] **Step 4.4 — Verify the repo**

```bash
gh repo view denispianelli/finance-dashboard --web
```

Browser opens. Verify : LICENSE detected as AGPL-3.0, README renders, `docs/`, `.github/` visible.

---

## Task 5 : Repository Settings

- [ ] **Step 5.1 — Configure repo settings**

```bash
gh repo edit denispianelli/finance-dashboard \
  --enable-issues \
  --enable-discussions \
  --enable-wiki=false \
  --enable-projects \
  --delete-branch-on-merge \
  --enable-auto-merge \
  --enable-squash-merge \
  --enable-merge-commit=false \
  --enable-rebase-merge=false \
  --allow-update-branch
```

- [ ] **Step 5.2 — Verify**

```bash
gh repo view denispianelli/finance-dashboard --json deleteBranchOnMerge,squashMergeAllowed,mergeCommitAllowed,rebaseMergeAllowed,hasWikiEnabled,hasIssuesEnabled,hasDiscussionsEnabled
```

Expected JSON :

```json
{
  "deleteBranchOnMerge": true,
  "squashMergeAllowed": true,
  "mergeCommitAllowed": false,
  "rebaseMergeAllowed": false,
  "hasWikiEnabled": false,
  "hasIssuesEnabled": true,
  "hasDiscussionsEnabled": true
}
```

---

## Task 6 : Branch Protection on `main`

CI gets first-class status. PRs that don't link to an issue are blocked.

- [ ] **Step 6.1 — Trigger the workflows once (so they appear as known status checks)**

Make a tiny no-op commit on `main` just to fire the workflows so GitHub registers them. Actually, since pushing to main is now allowed pre-protection, the codeql workflow already ran on the initial push. Verify :

```bash
gh run list --limit 5
```

Wait until CodeQL has run at least once before applying branch protection.

- [ ] **Step 6.2 — Apply branch protection**

```bash
gh api -X PUT repos/denispianelli/finance-dashboard/branches/main/protection \
  --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Analyze (JS/TS)", "PR ↔ Issue link / check"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 0
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": true,
  "required_conversation_resolution": true,
  "lock_branch": false,
  "allow_fork_syncing": false
}
EOF
```

> `required_approving_review_count: 0` because solo dev. Set to 1 if you ever want to enforce a self-review pass before merge.

- [ ] **Step 6.3 — Verify**

```bash
gh api repos/denispianelli/finance-dashboard/branches/main/protection \
  | jq '{contexts: .required_status_checks.contexts, linear: .required_linear_history.enabled, force: .allow_force_pushes.enabled}'
```

Expected :

```json
{
  "contexts": ["Analyze (JS/TS)", "PR ↔ Issue link / check"],
  "linear": true,
  "force": false
}
```

---

## Task 7 : Labels

Labels drive filtering, the kanban, automation. Create them all upfront.

- [ ] **Step 7.1 — Delete the default labels (clean slate)**

```bash
for l in bug documentation duplicate enhancement "good first issue" "help wanted" invalid question wontfix; do
  gh label delete "$l" --yes --repo denispianelli/finance-dashboard 2>/dev/null || true
done
```

- [ ] **Step 7.2 — Create the project labels**

```bash
# Types
gh label create epic        --color "8B5CF6" --description "Phase-level work item"
gh label create story       --color "3B82F6" --description "User-facing slice of an Epic"
gh label create task        --color "10B981" --description "Concrete task inside a Story"
gh label create spike       --color "F59E0B" --description "Time-boxed research"
gh label create bug         --color "EF4444"
gh label create chore       --color "6B7280"
gh label create docs        --color "6366F1"

# Phases
gh label create "phase:foundation"     --color "374151" --description "Phase 0"
gh label create "phase:import"         --color "1D4ED8" --description "Phase 1"
gh label create "phase:dashboard"      --color "7C3AED" --description "Phase 2"
gh label create "phase:categorization" --color "DB2777" --description "Phase 3"
gh label create "phase:ia"             --color "059669" --description "Phase 4"
gh label create "phase:robustesse"     --color "D97706" --description "Phase 5"
gh label create "phase:distribution"   --color "DC2626" --description "Phase 6"

# Estimates
gh label create "est:S"  --color "DCFCE7" --description "≤ half a day"
gh label create "est:M"  --color "BAE6FD" --description "1-2 days"
gh label create "est:L"  --color "FED7AA" --description "3-5 days"
gh label create "est:XL" --color "FECACA" --description "> 1 week — consider splitting"

# Status modifiers (rarely used — Project does most of this)
gh label create blocked   --color "991B1B" --description "Awaiting external decision"
gh label create "good-first-issue" --color "84CC16" --description "Easy entry point for contributors"
```

- [ ] **Step 7.3 — Verify**

```bash
gh label list --repo denispianelli/finance-dashboard
```

Expected : ~23 labels total. No leftover defaults.

---

## Task 8 : Milestones — One per Phase

Milestones are scoped to a repo and give a time-bound view of issues. One per Phase.

- [ ] **Step 8.1 — Create milestones**

```bash
gh api repos/denispianelli/finance-dashboard/milestones -X POST -f title="Phase 0 — Foundation" -f description="Bootstrap, skeleton, LLM spike."
gh api repos/denispianelli/finance-dashboard/milestones -X POST -f title="Phase 1 — Import"     -f description="Import pipeline, deterministic extraction, review page."
gh api repos/denispianelli/finance-dashboard/milestones -X POST -f title="Phase 2 — Dashboard"  -f description="Dashboard UI, charts, filters."
gh api repos/denispianelli/finance-dashboard/milestones -X POST -f title="Phase 3 — Categorization" -f description="Rules, history, LLM categorization, learning."
gh api repos/denispianelli/finance-dashboard/milestones -X POST -f title="Phase 4 — AI Features"    -f description="Chat, insights, projections."
gh api repos/denispianelli/finance-dashboard/milestones -X POST -f title="Phase 5 — Robustness"     -f description="OCR on-demand, backup, settings."
gh api repos/denispianelli/finance-dashboard/milestones -X POST -f title="Phase 6 — Distribution"   -f description="Packaging, signing, auto-update."
```

- [ ] **Step 8.2 — Verify**

```bash
gh api repos/denispianelli/finance-dashboard/milestones | jq '.[] | .title'
```

Expected : 7 milestones.

---

## Task 9 : GitHub Project (Kanban Board)

The Project unifies all issues across phases into a single board for daily work.

- [ ] **Step 9.1 — Create the project**

```bash
gh project create --owner denispianelli --title "Finance Dashboard"
```

Note the project number (e.g. `2`) and URL. Save them aside — they're referenced in subsequent steps.

- [ ] **Step 9.2 — Locate the Status field and customize columns**

```bash
PROJECT_NUMBER=<number-from-step-9.1>
gh project field-list $PROJECT_NUMBER --owner denispianelli --format json
```

Identify the `Status` field ID. By default it has options "Todo / In Progress / Done". We want : `Backlog / Next / In Progress / Review / Done / Blocked`.

> The GitHub Projects API for editing field options is not exposed cleanly via `gh project` yet. Do this once via the **web UI** :
>
> 1. Open the project page
> 2. Click Status column → Edit
> 3. Rename / add / reorder options to : `Backlog`, `Next`, `In Progress`, `Review`, `Done`, `Blocked`
> 4. Save

- [ ] **Step 9.3 — Add custom fields**

In the web UI, on the project :

- Add field **Phase** (single-select) with options `Phase 0` through `Phase 6`
- Add field **Estimate** (single-select) with `S`, `M`, `L`, `XL`
- Add field **Priority** (single-select) with `P0`, `P1`, `P2`

These mirror the Notion Epics DB and allow grouped views.

- [ ] **Step 9.4 — Create useful views**

In the web UI, add views beside the default Board :

- **Board by Status** (default kanban — already exists)
- **Table all** (flat table of every item)
- **Board by Phase** (group cards by Phase field)
- **Roadmap by Milestone** (group by milestone, sort by date)

---

## Task 10 : Create the Epic 1 Issue

- [ ] **Step 10.1 — Create the Epic ticket**

```bash
gh issue create --repo denispianelli/finance-dashboard \
  --title "Epic — Setup & Foundation" \
  --label "epic,phase:foundation" \
  --milestone "Phase 0 — Foundation" \
  --body "$(cat <<'EOF'
## Notion EPIC URL

https://www.notion.so/360e531ab5ff817ba4f0e65999e5d78b (EPIC-1)

## Phase

Phase 0 — Foundation

## Description

Bring up the technical foundation of the project : working Electron + React + TypeScript skeleton with shadcn/ui, SQLite, typed IPC, CI, tests, and a documented LLM model selection. After this Epic, Plan B is fully scaffolded and Phase 1 (Import Pipeline) can start without infra work.

## Stories

Linked stories will be added as they are created (Task 11 of Plan A).

## Definition of Done

- [ ] App launches in dev and in prod build
- [ ] Navigation between 2 stub pages working
- [ ] SQLite DB created on first launch with all 7 tables
- [ ] LLM model chosen, documented in ADR-004, mirrored to Notion
- [ ] CI pipeline green on Linux + macOS + Windows
- [ ] Notion EPIC entry set to "Done" with all sub-stories closed
- [ ] All Stories' DoD satisfied (see linked stories)

## Reference

- [Plan A — Project Bootstrap](docs/superpowers/plans/2026-05-14-plan-a-project-bootstrap.md)
- [Plan B — Foundation Implementation](docs/superpowers/plans/2026-05-14-epic-1-setup-foundation.md)
- [Design Spec](docs/superpowers/specs/2026-05-14-finance-dashboard-design.md)
EOF
)"
```

Note the issue number (likely `#1`). Save it aside as `EPIC_ISSUE`.

- [ ] **Step 10.2 — Add Epic to the Project**

```bash
EPIC_URL=$(gh issue view 1 --repo denispianelli/finance-dashboard --json url -q .url)
gh project item-add $PROJECT_NUMBER --owner denispianelli --url "$EPIC_URL"
```

In the web UI, set this card's `Phase = Phase 0`, `Status = In Progress`, `Estimate = (leave empty for Epic)`.

---

## Task 11 : Create Story Issues for Epic 1

We create **8 Stories** matching the implementation tasks of Plan B. Each story uses the story template fields (parent Epic, user story, acceptance criteria, estimate, reference).

For each story below, run a `gh issue create` command. Use `--body-file` with a heredoc or inline `--body`. After creation, link to the Epic in a comment, add to Project, set milestone.

Substitute `EPIC=1` (or whatever number the Epic got).

- [ ] **Step 11.1 — Story 1 : Electron + Vite + React + TypeScript skeleton**

```bash
EPIC=1
gh issue create --repo denispianelli/finance-dashboard \
  --title "Story — Electron + Vite + React + TypeScript skeleton" \
  --label "story,phase:foundation,est:M" \
  --milestone "Phase 0 — Foundation" \
  --body "$(cat <<EOF
## Parent Epic

#$EPIC

## User story

En tant que **développeur**, je veux **un squelette Electron + Vite + React + TypeScript fonctionnel avec CSP stricte**, afin de **pouvoir commencer à construire l'app sur une base saine**.

## Acceptance criteria

- [ ] \`npm run dev\` lance une fenêtre Electron qui affiche une page React minimale
- [ ] \`npm run build\` produit un build de prod fonctionnel
- [ ] CSP stricte en place dans index.html (\`default-src 'self'\`)
- [ ] \`nodeIntegration: false\`, \`contextIsolation: true\`, preload script en place
- [ ] Alias path \`@main\`, \`@renderer\`, \`@shared\` configurés
- [ ] tsconfig en mode strict

## Implementation outline

- Init package.json + scripts dev/build/typecheck
- Installer electron, electron-vite, vite, @vitejs/plugin-react, react, react-dom, typescript
- Configurer electron.vite.config.ts
- Créer src/main/index.ts, src/main/preload.ts, src/renderer/main.tsx, src/renderer/App.tsx
- tsconfig.json + tsconfig.node.json

## Estimate

M — 1-2 days

## Reference

- [Plan B — Task 2](../blob/main/docs/superpowers/plans/2026-05-14-epic-1-setup-foundation.md#task-2--electron--vite--react--typescript-skeleton)
- [Design Spec §3 — Architecture](../blob/main/docs/superpowers/specs/2026-05-14-finance-dashboard-design.md)
EOF
)"
```

After creation, add to Project and set Phase :

```bash
ISSUE_URL=$(gh issue view --repo denispianelli/finance-dashboard --json url -q .url $(gh issue list --repo denispianelli/finance-dashboard --search "Electron + Vite + React" --json number -q '.[0].number'))
gh project item-add $PROJECT_NUMBER --owner denispianelli --url "$ISSUE_URL"
```

(Field updates `Phase=Phase 0`, `Status=Backlog`, `Estimate=M` via web UI or `gh project item-edit`.)

- [ ] **Step 11.2 — Story 2 : Tailwind + shadcn/ui + dark theme**

```bash
gh issue create --repo denispianelli/finance-dashboard \
  --title "Story — Tailwind + shadcn/ui + dark theme" \
  --label "story,phase:foundation,est:S" \
  --milestone "Phase 0 — Foundation" \
  --body "$(cat <<EOF
## Parent Epic

#$EPIC

## User story

En tant que **utilisateur**, je veux **une UI à thème sombre cohérent dès l'ouverture de l'app**, afin de **bénéficier d'une expérience visuelle moderne et reposante pour les yeux**.

## Acceptance criteria

- [ ] Tailwind configuré avec dark theme par défaut
- [ ] shadcn/ui initialisé, Button + Card + Separator installés
- [ ] Variables CSS HSL pour theming
- [ ] Renderer charge globals.css

## Implementation outline

- Installer tailwindcss, postcss, autoprefixer
- Configurer tailwind.config.ts avec couleurs HSL
- Créer globals.css avec variables CSS
- npx shadcn init + add button card separator

## Estimate

S — ≤ half a day

## Reference

- [Plan B — Task 3](../blob/main/docs/superpowers/plans/2026-05-14-epic-1-setup-foundation.md#task-3--tailwind--shadcnui-setup-with-dark-theme)
EOF
)"
```

(Add to Project, fields.)

- [ ] **Step 11.3 — Story 3 : Typed IPC bridge**

```bash
gh issue create --repo denispianelli/finance-dashboard \
  --title "Story — Typed IPC bridge between main and renderer" \
  --label "story,phase:foundation,est:M" \
  --milestone "Phase 0 — Foundation" \
  --body "$(cat <<EOF
## Parent Epic

#$EPIC

## User story

En tant que **développeur**, je veux **un pont IPC typé end-to-end entre le main et le renderer**, afin de **garantir que toutes les requêtes cross-boundary respectent un contrat partagé en TypeScript**.

## Acceptance criteria

- [ ] Types partagés \`IpcContract\` dans \`src/shared/types/ipc.ts\`
- [ ] Channel \`app:ping\` implémenté et testé en bout-en-bout
- [ ] Renderer ne fait que des \`ipc.invoke\` — pas d'accès direct à Node
- [ ] Le type de réponse est inféré du channel sans cast

## Implementation outline

- Créer IpcContract typé
- Préload bridge via contextBridge.exposeInMainWorld
- register.ts pour enregistrer tous les handlers
- Client typé côté renderer
- Tester avec un bouton \"Ping main\" qui mesure le roundtrip

## Estimate

M — 1-2 days

## Reference

- [Plan B — Task 4](../blob/main/docs/superpowers/plans/2026-05-14-epic-1-setup-foundation.md#task-4--typed-ipc-bridge)
- [Design Spec §3 — IPC](../blob/main/docs/superpowers/specs/2026-05-14-finance-dashboard-design.md)
EOF
)"
```

- [ ] **Step 11.4 — Story 4 : SQLite + migrations + tests**

```bash
gh issue create --repo denispianelli/finance-dashboard \
  --title "Story — SQLite setup with initial schema and migration runner" \
  --label "story,phase:foundation,est:M" \
  --milestone "Phase 0 — Foundation" \
  --body "$(cat <<EOF
## Parent Epic

#$EPIC

## User story

En tant que **utilisateur**, je veux **que mes données soient stockées localement dans une base SQLite avec un schéma versionné**, afin de **garantir l'intégrité et la portabilité de mes données financières**.

## Acceptance criteria

- [ ] \`better-sqlite3\` installé, native build OK sur 3 OS
- [ ] DB créée au premier lancement dans \`app.getPath('userData')\`
- [ ] 7 tables créées : accounts, banks, bank_column_mappings, imports, transactions, categories, categorization_rules
- [ ] Migration runner idempotent (re-run safe)
- [ ] Tests Vitest passent pour le migration runner
- [ ] Contrainte \`UNIQUE(account_id, tx_hash)\` sur transactions
- [ ] \`UNIQUE\` sur \`imports.file_hash\`
- [ ] WAL mode activé

## Implementation outline

- Installer better-sqlite3 + types
- Créer 001_initial.sql avec DDL complet
- migrate.ts : scan migrations/, applique celles non appliquées
- index.ts : singleton getDb()
- Tests Vitest sur migrate

## Estimate

M — 1-2 days

## Reference

- [Plan B — Task 5](../blob/main/docs/superpowers/plans/2026-05-14-epic-1-setup-foundation.md#task-5--sqlite-setup-with-migrations)
- [Design Spec §10 — Schéma SQLite](../blob/main/docs/superpowers/specs/2026-05-14-finance-dashboard-design.md)
- ADR-006 — Multi-level deduplication
EOF
)"
```

- [ ] **Step 11.5 — Story 5 : App shell + sidebar + routing**

```bash
gh issue create --repo denispianelli/finance-dashboard \
  --title "Story — App shell with sidebar navigation and routing" \
  --label "story,phase:foundation,est:S" \
  --milestone "Phase 0 — Foundation" \
  --body "$(cat <<EOF
## Parent Epic

#$EPIC

## User story

En tant que **utilisateur**, je veux **naviguer entre les sections principales de l'app via une sidebar persistante**, afin de **comprendre la structure et accéder rapidement à chaque écran**.

## Acceptance criteria

- [ ] Sidebar à gauche avec items Dashboard + Paramètres
- [ ] HashRouter pour la compatibilité avec \`file://\` en prod
- [ ] Pages stub Dashboard + Paramètres rendues
- [ ] Active link mis en évidence visuellement
- [ ] Layout responsive (min-width 1024)

## Implementation outline

- Installer react-router-dom
- Créer AppShell.tsx avec Outlet
- Créer Sidebar.tsx avec NavLinks
- Stub DashboardPage.tsx, SettingsPage.tsx
- HashRouter dans App.tsx

## Estimate

S — ≤ half a day

## Reference

- [Plan B — Task 6](../blob/main/docs/superpowers/plans/2026-05-14-epic-1-setup-foundation.md#task-6--app-shell--sidebar--stub-pages--routing)
EOF
)"
```

- [ ] **Step 11.6 — Story 6 : E2E + ESLint + Prettier**

```bash
gh issue create --repo denispianelli/finance-dashboard \
  --title "Story — E2E test, ESLint, Prettier" \
  --label "story,phase:foundation,est:S" \
  --milestone "Phase 0 — Foundation" \
  --body "$(cat <<EOF
## Parent Epic

#$EPIC

## User story

En tant que **développeur**, je veux **un test E2E qui lance l'app et vérifie qu'elle s'ouvre, plus du lint + format strict**, afin de **détecter automatiquement les régressions critiques et garder une codebase propre**.

## Acceptance criteria

- [ ] \`playwright\` installé pour Electron
- [ ] Test \`tests/e2e/app-launch.test.ts\` passe — lance Electron, vérifie heading \"Dashboard\"
- [ ] \`npm run test:e2e\` ajouté à package.json
- [ ] ESLint configuré avec \`typescript-eslint/strict-type-checked\`
- [ ] Prettier configuré, pas de conflit avec ESLint
- [ ] \`npm run lint\` retourne 0 warnings

## Implementation outline

- Installer @playwright/test
- Créer playwright.config.ts
- Test : lance \`out/main/index.js\`, attend la window, check h1
- Installer eslint, typescript-eslint, prettier, eslint-config-prettier
- eslint.config.js avec strict + stylistic
- .prettierrc déjà créé en Plan A

## Estimate

S — ≤ half a day

## Reference

- [Plan B — Task 7](../blob/main/docs/superpowers/plans/2026-05-14-epic-1-setup-foundation.md#task-7--e2e-test-with-playwright--eslintprettier)
EOF
)"
```

- [ ] **Step 11.7 — Story 7 : GitHub Actions CI**

```bash
gh issue create --repo denispianelli/finance-dashboard \
  --title "Story — GitHub Actions CI on Linux / macOS / Windows" \
  --label "story,phase:foundation,est:S" \
  --milestone "Phase 0 — Foundation" \
  --body "$(cat <<EOF
## Parent Epic

#$EPIC

## User story

En tant que **développeur**, je veux **un pipeline CI multi-OS qui vérifie typecheck, lint, tests et build à chaque PR**, afin de **prévenir les régressions cross-platform avant tout merge sur main**.

## Acceptance criteria

- [ ] \`.github/workflows/ci.yml\` créé
- [ ] Matrix : ubuntu-latest, macos-latest, windows-latest
- [ ] Étapes : checkout, setup-node 20, npm ci, typecheck, lint, test, build
- [ ] E2E uniquement sur Linux (avec xvfb-run)
- [ ] Required status checks ajoutés à la branch protection de main

## Implementation outline

- Créer ci.yml avec matrix 3 OS
- xvfb-run pour Linux E2E
- Mettre à jour la branch protection pour exiger les 3 contextes

## Estimate

S — ≤ half a day

## Reference

- [Plan B — Task 8](../blob/main/docs/superpowers/plans/2026-05-14-epic-1-setup-foundation.md#task-8--github-actions-ci)
EOF
)"
```

- [ ] **Step 11.8 — Story 8 (Spike) : LLM model benchmark**

```bash
gh issue create --repo denispianelli/finance-dashboard \
  --title "Spike — LLM model benchmark on real bank PDFs" \
  --label "spike,phase:foundation,est:M" \
  --milestone "Phase 0 — Foundation" \
  --body "$(cat <<EOF
## Parent Epic

#$EPIC

## Time-box

2 days max

## Question being answered

Lequel de Qwen2.5 3B Instruct, Phi-3.5 Mini, ou Llama 3.2 3B en Q4_K_M offre le meilleur compromis qualité (FR + JSON) / vitesse / RAM pour notre cas d'usage (mapping de colonnes + catégorisation) sur 3 PDFs réels de relevés bancaires français ?

## Deliverable

- Mise à jour ADR-004 (Notion + repo) de \"Proposed\" à \"Accepted\" avec le modèle gagnant et les chiffres mesurés
- README dans \`src/main/llm/README.md\` avec le tableau comparatif (load time, inference time, FR quality /5, JSON quality /5, RAM)
- Conclusion claire : modèle choisi + raison

## Acceptance criteria

- [ ] 3 modèles testés sur 3 PDFs identiques
- [ ] Mesures reproductibles (script \`scripts/spike-llm.ts\` commit dans le repo)
- [ ] ADR-004 mis à jour dans Notion ET dans \`docs/adr/004-llm-model-candidate.md\`
- [ ] Decision Log : ajouter une entrée \"Modèle LLM final : X\" avec lien vers l'ADR

## Reference

- [Plan B — Task 9](../blob/main/docs/superpowers/plans/2026-05-14-epic-1-setup-foundation.md#task-9--llm-spike--benchmark-and-decide)
- ADR-004 actuel : https://www.notion.so/360e531ab5ff81179b35d801413a1553
EOF
)"
```

- [ ] **Step 11.9 — Add all Story issues to the Project**

```bash
for n in 2 3 4 5 6 7 8 9; do
  url=$(gh issue view $n --repo denispianelli/finance-dashboard --json url -q .url)
  gh project item-add $PROJECT_NUMBER --owner denispianelli --url "$url"
done
```

Then in the web UI, for each card :

- Set `Phase = Phase 0`
- Set `Status = Backlog`
- Set `Estimate` to the value from the issue title (S / M / L)

- [ ] **Step 11.10 — Mark Story 1 as "Next"**

In the web UI on the Project board, drag Story 1 (Electron skeleton) from `Backlog` to `Next`. This is the first story we'll pick up when executing Plan B.

---

## Task 12 : Notion Sync — Reflect the GitHub State

- [ ] **Step 12.1 — Update Notion EPIC-1**

Via Notion MCP, update the Epics database entry for EPIC-1 :

- `GitHub` → `https://github.com/denispianelli/finance-dashboard/issues/1`
- `Status` → `In Progress`

- [ ] **Step 12.2 — Update DEC-003 (repo URL)**

Update the Decisions DB entry "Repo GitHub public dès le départ" :

- Reasoning : add a line at the end with the actual URL `https://github.com/denispianelli/finance-dashboard`

- [ ] **Step 12.3 — Update the parent page "État actuel" table**

Use the Notion MCP to update the parent page table. Final state :

```
| Item | Statut |
|---|---|
| Spec design | ✅ Validé |
| Architecture | ✅ Validée |
| Workspace Notion | ✅ Mis en place |
| Sync workflow (slash commands) | ✅ Installé |
| Repo GitHub | ✅ Créé |
| GitHub Project | ✅ Créé + colonnes configurées |
| Branch protection + règles | ✅ Actives |
| Epic 1 + 8 Stories | ✅ Tickets créés |
| Phase 0 — Foundation | 🟢 En cours (Story 1 next) |
```

- [ ] **Step 12.4 — Add a new Decision in Notion : "Niveau 1 + DoR adoptés"**

Via Notion MCP, create a new Decision Log entry :

- Title : "Workflow strictness : Niveau 1 + Definition of Ready adoptés"
- Date : 2026-05-14
- Category : Process
- Status : Active
- Reasoning : "Branch naming convention + Conventional Commits enforcés localement (commitlint/husky). PR-to-issue link enforcé par GitHub Action (workflow `pr-issue-link.yml`). DoR documentée dans CONTRIBUTING. Strictness peut être relevée en Niveau 2 si nécessaire."

---

## Task 13 : Final Verification (Plan A DoD)

Walk through the checklist below. Every item must be ticked before declaring Plan A complete.

**Repo & files**

- [ ] Repo public à `https://github.com/denispianelli/finance-dashboard` avec description et homepage
- [ ] LICENSE détectée comme AGPL-3.0 par GitHub
- [ ] README rendu correctement avec le tableau roadmap
- [ ] CHANGELOG.md, CONTRIBUTING.md présents à la racine
- [ ] `docs/superpowers/specs/` contient la spec
- [ ] `docs/superpowers/plans/` contient Plan A et Plan B
- [ ] `docs/adr/` contient le template + 6 ADRs mirrorées depuis Notion
- [ ] `.github/` contient PR template, 4 issue templates, dependabot, codeql, pr-issue-link
- [ ] `.husky/` contient commit-msg et pre-commit, exécutables
- [ ] `commitlint.config.cjs`, `package.json`, `package-lock.json` présents
- [ ] `.claude/commands/` contient les 2 slash commands

**Tests fumigatoires**

- [ ] Un commit avec message non-conventionnel est rejeté localement
- [ ] Un commit avec `chore: ...` passe
- [ ] CodeQL workflow s'est exécuté avec succès sur main

**GitHub project management**

- [ ] Repo settings : squash-only, no wiki, auto-delete branches
- [ ] Branch protection sur main : CI required, linear history, no force-push
- [ ] 23 labels créés
- [ ] 7 milestones créées
- [ ] Project "Finance Dashboard" créé avec Status (Backlog/Next/In Progress/Review/Done/Blocked), Phase, Estimate, Priority fields
- [ ] Au moins 4 views : Board by Status, Table all, Board by Phase, Roadmap by Milestone
- [ ] Epic 1 issue créée et ajoutée au Project, status In Progress, Phase 0
- [ ] 8 Story / Spike issues créées et ajoutées au Project, status Backlog (Story 1 en Next), Phase 0, milestone Phase 0
- [ ] Toutes les issues référencent l'Epic dans leur body

**Notion ↔ GitHub sync**

- [ ] EPIC-1 dans la Epics DB Notion : Status `In Progress`, GitHub URL renseigné
- [ ] DEC-003 mis à jour avec l'URL réelle du repo
- [ ] Nouvelle entrée Decision Log "Niveau 1 + DoR adoptés" créée
- [ ] Parent page "État actuel" mise à jour

**Tag de bootstrap**

- [ ] Tag annoté `v0.0.1-bootstrap` créé : `git tag -a v0.0.1-bootstrap -m "chore: project bootstrap complete (Plan A)"` puis `git push --tags`

---

## After Plan A : Renaming the existing plan to Plan B

Once Plan A is fully executed, **the existing plan file `2026-05-14-epic-1-setup-foundation.md`** needs cleanup. Open a new PR (referencing a docs issue you'll create) that :

1. Renames `2026-05-14-epic-1-setup-foundation.md` → `2026-05-14-plan-b-foundation-implementation.md`
2. Removes Tasks 1, 1.5, 8.5, and 10 from it (those are now in Plan A)
3. Reformats remaining Tasks as **8 Stories** (numbered 2-9 → S1-S8), each section starting with "Linked issue : #N" so the agent knows what to close

This rename + cleanup is itself a Plan B story (call it Story 0 — "Restructure plan documents post-bootstrap"). Create the ticket for it during Step 11 if you want it tracked separately, or fold it into the first commit of Plan B execution.
