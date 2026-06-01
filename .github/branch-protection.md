# Branch protection — `main`

> **STATUS: SUSPENDED during MVP mode (since 2026-06-01).** Protection is intentionally off so
> work can land directly on `main` while we race to a functional model (see §MVP mode in
> `CONTRIBUTING.md`). This file is the runbook to **re-apply** it in the post-MVP polish phase —
> run the `gh api -X PUT` call below.

This file documents the GitHub branch-protection ruleset applied to `main`
and the exact commands used to apply or re-apply it. Edit this file when
adjusting rules, then re-run the `gh api` call to keep the live config and
this file in sync.

## Rationale

The repo is solo / vitrine. We need the merge discipline to be **visible**
without blocking the solo workflow (GitHub forbids self-approving PRs, so a
"≥1 approving review required" rule would block 100% of merges). Instead:

- CI must be green on every PR — already enforced locally via the husky
  pre-push hook, but a server-side gate prevents anyone (human or agent)
  from bypassing CI by force-pushing.
- History stays linear (squash-merge only) — we already do this in
  practice; the rule prevents accidental merge commits.
- Direct pushes to `main` are blocked — every change goes through a PR.
- `enforce_admins: true` — the maintainer is included. Vitrine discipline.

Reviewer visibility comes from posting `pr-review-toolkit:code-reviewer`
findings as PR comments (see PR #95 for the pattern).

## Rules applied

| Rule                               | Value     | Why                                              |
| ---------------------------------- | --------- | ------------------------------------------------ |
| `required_status_checks.strict`    | `true`    | branch must be up to date before merge           |
| `required_status_checks.contexts`  | see below | the 6 CI checks this repo runs today             |
| `enforce_admins`                   | `true`    | maintainer can't bypass either                   |
| `required_pull_request_reviews`    | `null`    | no approval — solo project, can't self-approve   |
| `restrictions`                     | `null`    | no actor restriction beyond protection           |
| `required_linear_history`          | `true`    | squash-merge only, no merge commits              |
| `allow_force_pushes`               | `false`   | no rewriting history on `main`                   |
| `allow_deletions`                  | `false`   | can't delete `main`                              |
| `block_creations`                  | `false`   | tags etc. still allowed                          |
| `required_conversation_resolution` | `false`   | adds friction; revisit if PR comments are common |

Status check contexts (must all pass before merge):

- `check` — PR ↔ Issue link workflow
- `ubuntu-latest`, `macos-latest`, `windows-latest` — CI matrix
- `Analyze (JS/TS)` — CodeQL JS/TS analyzer
- `CodeQL` — CodeQL umbrella check

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
