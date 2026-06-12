# Desktop Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce unsigned, installable builds of Finance Dashboard (Windows `nsis`, macOS `dmg`) for the maintainer's two personal machines, with rebuild-on-demand (no auto-update).

**Architecture:** Keep `electron-vite build` as the bundling step (outputs to `out/`). Add `electron-builder` driven by a declarative `electron-builder.yml`, committed once; each OS target is built on its own native machine (required because `node-llama-cpp` ships per-platform native binaries that must be unpacked from asar). The LLM model is never bundled — it downloads on demand into `userData/models` (PR #163).

**Tech Stack:** electron-builder, electron-vite, Electron 42, node-llama-cpp (native), `finance-dashboard-design` skill (icon).

**Note on TDD:** This is packaging configuration — there is no unit-testable surface. Each task's verification is running a real command and observing its output (build succeeds, config parses, files land where expected). Treat the "verify" steps as the evidence gate.

---

### Task 1: Add electron-builder dev dependency

**Files:**

- Modify: `package.json` (devDependencies)

- [ ] **Step 1: Install electron-builder**

```bash
npm install --save-dev electron-builder
```

- [ ] **Step 2: Verify it installed and the CLI runs**

Run: `npx electron-builder --version`
Expected: a version number prints (e.g. `26.x.x`), no error.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add electron-builder dev dependency"
```

---

### Task 2: Add `release/` to .gitignore

**Files:**

- Modify: `.gitignore`

- [ ] **Step 1: Append the build output directory**

Add these lines to `.gitignore` (electron-builder writes installers here):

```gitignore

# Packaged app installers (electron-builder)
release/
```

- [ ] **Step 2: Verify the entry is present**

Run: `git check-ignore release/ && echo OK`
Expected: prints `release/` then `OK`.

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore electron-builder release output"
```

---

### Task 3: Write the electron-builder config

**Files:**

- Create: `electron-builder.yml`

- [ ] **Step 1: Confirm the current node-llama-cpp asarUnpack guidance**

Native binaries cannot run from inside asar. Before writing the config, fetch the current Electron-packaging guidance for `node-llama-cpp` to confirm the unpack globs (the module's docs site has an "electron support" section):

Run: `npx --no node-llama-cpp source --help 2>/dev/null | head -5 || true`
Then WebFetch `https://node-llama-cpp.withcat.ai/guide/electron` (electron support guide) and confirm the recommended `asarUnpack` globs. The defaults below (`node-llama-cpp` + `@node-llama-cpp/*`) are the expected answer; adjust only if the docs say otherwise.

- [ ] **Step 2: Create `electron-builder.yml`**

```yaml
appId: com.denispianelli.finance-dashboard
productName: Finance Dashboard

directories:
  output: release
  buildResources: build

# electron-vite emits the bundled app into out/. Ship that plus package.json;
# production node_modules are included by electron-builder's defaults.
files:
  - out/**
  - package.json
  # Safety: never bundle the ~1.9 GB GGUF model — it lives in userData/models
  # and downloads on demand (PR #163).
  - '!models'
  - '!models/**'

# node-llama-cpp ships per-platform native binaries that must run from disk,
# not from inside the asar archive.
asarUnpack:
  - node_modules/node-llama-cpp/**
  - node_modules/@node-llama-cpp/**

mac:
  target: dmg
  # No arch pinned: builds for the host arch (x64 on Intel, arm64 on Apple Silicon).
  identity: null # unsigned — skip signing without aborting the build

win:
  target: nsis

# No `publish:` block and no updater — rebuild is manual.
```

- [ ] **Step 3: Verify the config parses**

Run: `npx electron-builder --help >/dev/null && node -e "import('js-yaml').then(()=>{}).catch(()=>{})" ; npx js-yaml electron-builder.yml >/dev/null 2>&1 || node -e "const fs=require('fs');console.log(fs.readFileSync('electron-builder.yml','utf8').length>0?'readable':'empty')"`
Expected: no YAML parse error (prints `readable` at minimum). The real config validation happens in Task 6's `--dir` build.

- [ ] **Step 4: Commit**

```bash
git add electron-builder.yml
git commit -m "chore: add electron-builder config (win nsis + mac dmg, unsigned)"
```

---

### Task 4: Add packaging scripts

**Files:**

- Modify: `package.json` (scripts)

- [ ] **Step 1: Add `dist`, `dist:mac`, `dist:win` scripts**

In `package.json` `"scripts"`, after the existing `"preview"` line, add:

```json
    "dist": "electron-vite build && electron-builder",
    "dist:mac": "electron-vite build && electron-builder --mac",
    "dist:win": "electron-vite build && electron-builder --win",
```

- [ ] **Step 2: Verify the scripts are registered**

Run: `npm run dist:mac --help 2>/dev/null; node -e "const p=require('./package.json');['dist','dist:mac','dist:win'].forEach(s=>{if(!p.scripts[s])throw new Error('missing '+s);});console.log('scripts OK')"`
Expected: prints `scripts OK`.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add dist packaging scripts"
```

---

### Task 5: Generate and wire the brand icon

**Files:**

- Create: `build/icon.png` (≥512×512, square)

- [ ] **Step 1: Generate a brand icon**

Use the `finance-dashboard-design` skill (Skill tool) to produce a single square brand icon PNG, at least 512×512 (1024×1024 preferred so electron-builder can derive crisp `.icns`/`.ico`). Save it to `build/icon.png`. The icon must reflect the Finance Dashboard identity (design tokens / logo from the skill) — not a generic placeholder.

- [ ] **Step 2: Verify the icon meets electron-builder's minimum**

Run: `node -e "const fs=require('fs');const b=fs.readFileSync('build/icon.png');if(b.slice(1,4).toString()!=='PNG')throw new Error('not a PNG');const w=b.readUInt32BE(16),h=b.readUInt32BE(20);console.log('icon',w+'x'+h);if(w<512||h<512)throw new Error('icon too small');if(w!==h)throw new Error('icon must be square')"`
Expected: prints `icon 1024x1024` (or ≥512 square), no error. electron-builder auto-discovers `build/icon.png` via `buildResources` — no extra config needed.

- [ ] **Step 3: Commit**

```bash
git add build/icon.png
git commit -m "chore: add brand app icon for packaging"
```

---

### Task 6: Validate the config with a local unpacked build

**Files:** none (verification only)

This runs in WSL/Linux and proves the config + asarUnpack are wired correctly, without producing a shippable installer (Linux is not a target). It is a smoke test, not a deliverable.

- [ ] **Step 1: Ensure the Linux native binary for node-llama-cpp is present**

`node-llama-cpp` may have moved its prebuilt binaries out (`bins/_linux-x64.moved.txt`). Fetch the Linux binary so the unpacked build is runnable:

Run: `npx --no node-llama-cpp source download 2>&1 | tail -5 || true`
Expected: either it downloads/builds the binary, or reports one already present. Non-fatal if it warns — the `--dir` build still validates packaging mechanics.

- [ ] **Step 2: Produce an unpacked Linux build**

Run: `npm run build && npx electron-builder --linux dir`
Expected: completes without error; creates `release/linux-unpacked/` (or `release/linux-*-unpacked/`).

- [ ] **Step 3: Verify the model was NOT bundled and native binaries were unpacked**

Run: `du -sh release/linux-unpacked 2>/dev/null; find release -ipath '*node-llama-cpp*' -name '*.node' | head; find release -name '*.gguf' | head`
Expected: the `*.node` find prints at least one unpacked native binary path under `app.asar.unpacked`; the `*.gguf` find prints **nothing** (model not bundled).

- [ ] **Step 4: Clean up the smoke-test output**

Run: `rm -rf release && echo cleaned`
Expected: prints `cleaned` (release/ is gitignored; nothing to commit).

---

### Task 7: Run the full local gate

**Files:** none (verification only)

- [ ] **Step 1: Lint, typecheck, unit tests, build**

Run: `npm run lint && npm run typecheck && npm run test && npm run build`
Expected: all four pass. (The pre-existing unrelated `tests/integration/import/extractStatement.test.ts` failure is in `test:integration`, not in `test` — out of scope here.)

- [ ] **Step 2: No commit**

This task adds no files. If lint/prettier reformatted anything during prior commits, that was already staged then.

---

### Task 8: Document the per-machine build steps in the PR

**Files:** none (PR description — written when opening the PR)

The actual `dmg`/`nsis` artifacts can only be produced on the maintainer's native machines (native binary constraint). Capture these as maintainer instructions in the PR body:

- [ ] **Step 1: Record the build + first-launch instructions**

Include in the PR description:

```
## Building your personal installer

On the **Mac**:  `npm install && npm run dist:mac`  → release/Finance Dashboard-<ver>.dmg
On the **PC**:   `npm install && npm run dist:win`  → release/Finance Dashboard Setup <ver>.exe

First launch (unsigned, once per machine):
- macOS: right-click the app ▸ Open (or `xattr -d com.apple.quarantine "/Applications/Finance Dashboard.app"`)
- Windows: SmartScreen ▸ "More info" ▸ "Run anyway"

The LLM model is not bundled; it downloads on demand on first need (PR #163).
```

- [ ] **Step 2: Open the PR**

```bash
git push -u origin feat/desktop-packaging
gh pr create --title "feat: desktop packaging for personal Windows + macOS builds" --body "<the body above + link to docs/superpowers/specs/2026-06-07-desktop-packaging-design.md>"
```

Then the maintainer builds on each machine to validate before self-merge (light PR gate, CLAUDE.md MVP mode).

---

## Self-Review

**Spec coverage:** electron-builder added (T1); `release/` ignored (T2); config with appId/productName/files/asarUnpack/mac-dmg-unsigned/win-nsis/no-publish (T3); dist scripts (T4); brand icon (T5); local config validation + model-not-bundled check (T6); local gate (T7); per-machine build + first-launch friction documented in PR (T8). Mac arch left to host — covered in T3 config comment. All spec sections map to a task.

**Placeholder scan:** No TBD/TODO. The only deferred-to-runtime item is the PR body link text in T8, which is content the engineer fills from the named spec path — acceptable.

**Type/name consistency:** Script names `dist`/`dist:mac`/`dist:win`, config keys, and file paths (`electron-builder.yml`, `build/icon.png`, `release/`) are used identically across T3/T4/T5/T6/T8.
