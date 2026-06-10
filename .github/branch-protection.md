# Branch protection — `main`

> **STATUS: ACTIVE since 2026-06-03 — light PR gate.** Every change to `main` goes through a
> branch + PR with green CI and an up-to-date branch, but **0 required reviews** (self-merge)
> and **no issue/board linkage** (see §MVP mode in `CONTRIBUTING.md`). This file is the runbook:
> edit the payload, then re-run the `gh api -X PUT` call below to keep the live config in sync.

This file documents the GitHub branch-protection ruleset applied to `main`
and the exact commands used to apply or re-apply it. Edit this file when
adjusting rules, then re-run the `gh api` call to keep the live config and
this file in sync.

## Rationale

The repo is solo. We want merge discipline that is **fast but clean**:

- A PR is **required** for every change (`required_pull_request_reviews` with
  `required_approving_review_count: 0`) — so no session can commit to `main`
  directly — but **no approval is needed**, so the author self-merges once
  green. (0 reviews, not `null`: `null` would not require a PR at all.)
- CI must be green and the branch up to date before merge — a server-side gate
  so no one (human or agent) bypasses CI by force-pushing.
- History stays linear (squash-merge only) — prevents accidental merge commits.
- `enforce_admins: true` — the maintainer is included too. This is what makes
  the multi-session "direct commit to `main`" mistake structurally impossible.
- **No issue/board linkage required** (the PR ↔ Issue Action was removed).

Optional reviewer visibility: post `pr-review-toolkit:code-reviewer` findings
as PR comments (see PR #95 for the pattern).

## Rules applied

| Rule                               | Value     | Why                                              |
| ---------------------------------- | --------- | ------------------------------------------------ |
| `required_status_checks.strict`    | `true`    | branch must be up to date before merge           |
| `required_status_checks.contexts`  | see below | the 3 CI OS checks + CodeQL this repo runs today |
| `enforce_admins`                   | `true`    | maintainer can't bypass either                   |
| `required_pull_request_reviews`    | 0 reviews | PR required (blocks direct pushes); self-merge   |
| `restrictions`                     | `null`    | no actor restriction beyond protection           |
| `required_linear_history`          | `true`    | squash-merge only, no merge commits              |
| `allow_force_pushes`               | `false`   | no rewriting history on `main`                   |
| `allow_deletions`                  | `false`   | can't delete `main`                              |
| `block_creations`                  | `false`   | tags etc. still allowed                          |
| `required_conversation_resolution` | `false`   | adds friction; revisit if PR comments are common |

Status check contexts (must all pass before merge):

- `ubuntu-latest`, `macos-latest`, `windows-latest` — CI matrix (typecheck, tests, build);
  the full matrix runs on every PR and push (the repo is public, so Actions minutes are free).
- `Analyze (JS/TS)` — CodeQL code-scanning (`codeql.yml`).

> CodeQL was dropped while the repo was private (code scanning needs GitHub Advanced Security
> on private repos, so it couldn't upload results and failed every run). The repo is now
> **public**, so `codeql.yml` is restored and `Analyze (JS/TS)` is a required check again.

## Apply / re-apply

```bash
gh api -X PUT \
  /repos/denispianelli/finance-dashboard/branches/main/protection \
  --input .github/branch-protection.payload.json
```

The payload is checked in alongside this doc (see `branch-protection.payload.json`).
The call is idempotent — re-running with the same payload returns the same
state.

## Verify the live config matches this doc

```bash
gh api /repos/denispianelli/finance-dashboard/branches/main/protection
```
