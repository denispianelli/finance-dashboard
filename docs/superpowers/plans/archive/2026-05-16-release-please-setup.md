# Chore — Automated versioning & changelog (release-please) : Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire release-please so version bumps and `CHANGELOG.md` are generated automatically from Conventional Commits. Pre-1.0 strategy: release-please maintains the Release PR + CHANGELOG continuously, but the Release PR is **left unmerged** until the app is distributable.

**Architecture:** Manifest-driven release-please via a GitHub Action on push to `main`. Two config files (`release-please-config.json`, `.release-please-manifest.json`) pin the current version and define changelog sections. `CHANGELOG.md` is reset to a release-please-compatible baseline that preserves the historical bootstrap entry; release-please owns it from then on.

**Tech Stack:** `googleapis/release-please-action@v4` · GitHub Actions · Conventional Commits (already enforced by commitlint)

**GitHub:** Issue #36 (standalone chore, no parent epic)

---

## File Structure

- Create `release-please-config.json` — release-type + changelog sections
- Create `.release-please-manifest.json` — pins current version `0.1.0`
- Create `.github/workflows/release-please.yml` — the automation
- Modify `CHANGELOG.md` — reset to a release-please-compatible baseline preserving the bootstrap entry

---

## Task 1: release-please config + manifest

**Files:**

- Create: `.release-please-manifest.json`
- Create: `release-please-config.json`

- [ ] **Step 1: Create the manifest**

Create `.release-please-manifest.json` (pins the current version so release-please does not start from 0):

```json
{
  ".": "0.1.0"
}
```

- [ ] **Step 2: Create the config**

Create `release-please-config.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
  "packages": {
    ".": {
      "release-type": "node",
      "changelog-path": "CHANGELOG.md",
      "bump-minor-pre-major": true,
      "bump-patch-for-minor-pre-major": false,
      "draft": false,
      "prerelease": false,
      "include-component-in-tag": false,
      "changelog-sections": [
        { "type": "feat", "section": "Features" },
        { "type": "fix", "section": "Bug Fixes" },
        { "type": "perf", "section": "Performance" },
        { "type": "refactor", "section": "Refactoring" },
        { "type": "docs", "section": "Documentation" },
        { "type": "spike", "section": "Spikes" },
        { "type": "ci", "section": "CI", "hidden": true },
        { "type": "chore", "section": "Chores", "hidden": true },
        { "type": "test", "section": "Tests", "hidden": true },
        { "type": "build", "section": "Build", "hidden": true },
        { "type": "style", "section": "Styles", "hidden": true }
      ]
    }
  }
}
```

Note: `bump-minor-pre-major: true` + `bump-patch-for-minor-pre-major: false` means pre-1.0 a `feat` bumps the **minor** (0.1.0 → 0.2.0) and a `fix` bumps the **patch** (0.1.0 → 0.1.1). Breaking changes stay minor pre-1.0 (SemVer-compatible 0.x behavior).

- [ ] **Step 3: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('release-please-config.json','utf8')); JSON.parse(require('fs').readFileSync('.release-please-manifest.json','utf8')); console.log('OK')"`
Expected: prints `OK`.

- [ ] **Step 4: Commit**

```bash
git add release-please-config.json .release-please-manifest.json
git commit -m "ci(release): add release-please config and manifest"
```

---

## Task 2: release-please workflow

**Files:**

- Create: `.github/workflows/release-please.yml`

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/release-please.yml`:

```yaml
name: Release Please

on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write

jobs:
  release-please:
    runs-on: ubuntu-latest
    steps:
      - uses: googleapis/release-please-action@v4
        with:
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json
```

- [ ] **Step 2: Lint the YAML by inspection**

Run: `cat .github/workflows/release-please.yml`
Confirm: 2-space indentation, `on.push.branches` is `[main]`, `permissions` block grants `contents: write` and `pull-requests: write`, action is pinned to `@v4`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release-please.yml
git commit -m "ci(release): add release-please workflow on push to main"
```

---

## Task 3: Reset CHANGELOG to a release-please-compatible baseline

**Context:** The current `CHANGELOG.md` is hand-written (Keep a Changelog, only an `[Unreleased]` bootstrap entry). release-please manages `CHANGELOG.md` in its own format and prepends new version sections at the top under an anchor comment. To hand over cleanly we replace the body with a release-please-style baseline that preserves the historical `0.0.1-bootstrap` note. On its first run release-please will prepend the next version section above this baseline.

**Files:**

- Modify: `CHANGELOG.md`

- [ ] **Step 1: Overwrite CHANGELOG.md**

Replace the entire content of `CHANGELOG.md` with exactly:

```markdown
# Changelog

All notable changes to this project are documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
From v0.1.0 onward this file is generated automatically by
[release-please](https://github.com/googleapis/release-please) from
[Conventional Commits](https://www.conventionalcommits.org/). Do not edit
released sections by hand.

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
```

- [ ] **Step 2: Verify the file**

Run: `cat CHANGELOG.md`
Confirm: no leftover `[Unreleased]` Keep-a-Changelog section; the release-please handover note and the `0.0.1-bootstrap` entry are present.

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): reset to release-please-compatible baseline"
```

---

## Task 4: Verify, document the unmerged-Release-PR strategy, open PR

**Files:** none (verification + PR)

- [ ] **Step 1: Full local checks**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all green (this change touches no source — sanity check that nothing broke).

- [ ] **Step 2: Push the branch**

```bash
git push -u origin chore/36-release-please
```

- [ ] **Step 3: Open the PR**

```bash
gh pr create --title "ci(release): automated versioning & changelog via release-please (#36)" --body "$(cat <<'EOF'
Closes #36

## Summary
- Adds release-please (manifest mode) — version bump + CHANGELOG generated from Conventional Commits
- Workflow runs on push to \`main\`; config pins current version \`0.1.0\`
- \`CHANGELOG.md\` reset to a release-please-compatible baseline (historical bootstrap entry preserved)

## Pre-1.0 strategy (important)
release-please will open and continuously update a **Release PR**. **Do NOT merge that Release PR yet.** Pre-distribution (electron-builder deferred, Sujet 2), a release would produce a tag with no installable binary. We let release-please keep the CHANGELOG fresh; the Release PR is merged only once the app is packageable.

## Known limitation (intentional, documented)
The Release PR is created by \`GITHUB_TOKEN\`, so branch-protection CI workflows do not auto-trigger on it. This is acceptable because (a) the Release PR only edits \`CHANGELOG.md\` + version metadata — no source — and (b) it is not merged pre-1.0 anyway. When distribution lands, revisit with a PAT or admin merge.

## Test Plan
- [ ] \`npm run typecheck && npm run lint && npm test\` green
- [ ] After merge: release-please workflow runs on \`main\` and opens a Release PR proposing the next version with a generated CHANGELOG section
- [ ] That Release PR is left open (not merged)
EOF
)"
```

---

## Self-Review

- **Issue coverage (#36):** workflow on push main ✓ ; config + manifest pinned to 0.1.0 ✓ ; changelog sections configured ✓ ; CHANGELOG baseline reset (handover note covers the Epic 1 + #24 gap) ✓ ; branch-protection/CI limitation documented in PR ✓ ; unmerged-Release-PR strategy documented ✓.
- **Out of scope respected:** no electron-builder, no signing, no auto-update, no release actually cut.
- **No placeholders:** every file has exact full content; every command is concrete.
- **Consistency:** config `changelog-path` = `CHANGELOG.md` matches the file reset in Task 3; manifest version `0.1.0` matches current `package.json`.
- **Branch name:** `chore/36-release-please` (consistent with the repo's `feat/24-…` convention).
