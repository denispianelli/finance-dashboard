# Desktop packaging — personal build (Windows + macOS)

**Date:** 2026-06-07
**Status:** Design (awaiting maintainer review)
**Scope:** Produce installable builds of Finance Dashboard for the maintainer's own two
machines (a Windows PC and a Mac). **Not** a public distribution — see ADR-009 single-user
amendment ([[project-mvp-pivot]]); the multi-user phase stays a deferred non-goal.

## Goal

Let the maintainer run Finance Dashboard as a real installed desktop app (outside
`electron-vite dev`) on his Windows PC and his Mac, so he can validate the app — notably the
unmerged Reports income/expense model — on real data in production conditions.

## Non-goals (YAGNI)

- **No auto-update** (no `electron-updater`). The maintainer rebuilds manually when he wants a
  new version. Keeps zero outbound network surface and no publish infrastructure — consistent
  with the privacy invariant (ADR-002).
- **No code signing / notarization.** Unsigned builds; OS security prompts are bypassed once
  per machine at first launch.
- **No Linux target**, no GitHub Releases publishing, no packaging CI.

## Approach

Add `electron-builder` (the standard Electron packager: handles asar, native modules, and
per-OS installers). Configuration lives in a declarative `electron-builder.yml` at the repo
root, committed once. `electron-vite build` remains the bundling step (outputs to `out/`);
`electron-builder` then packages `out/` into an installer.

Each OS target is built on its own native machine — no cross-building (see Native module
constraint below). This matches the maintainer's PC + Mac setup.

## Native module constraint — `node-llama-cpp`

`node-llama-cpp` ships platform-specific native binaries (`@node-llama-cpp/*` packages). Native
binaries cannot execute from inside an asar archive, so the config must unpack them:

- `asarUnpack` covering `node-llama-cpp` and its `@node-llama-cpp/*` binary packages, following
  the module's official Electron packaging guidance (verify current guidance at implementation
  time).
- Because the unpacked binaries are platform-specific, **each target builds on its native OS**:
  the Mac produces the macOS binaries, the PC produces the Windows binaries. No cross-build.

`node:sqlite` (DatabaseSync) is built into Node/Electron — no extra packaging concern.

## Configuration (`electron-builder.yml`)

- `appId: com.denispianelli.finance-dashboard`
- `productName: Finance Dashboard`
- `directories.output: release/` (added to `.gitignore`)
- `directories.buildResources: build/` (holds the icon source)
- `files`: the electron-vite output (`out/**`) plus `package.json`. **The LLM model is NOT
  bundled** — it lives in `userData/models` and is downloaded on demand (PR #163,
  [[project-llm-download-opt-in]]). Ensure no `models/` directory is included.
- `asarUnpack`: `node-llama-cpp` + `@node-llama-cpp/*` (see constraint above).
- **macOS target:** `dmg`. Architecture is **not pinned** — electron-builder builds for the
  host arch, so running `dist:mac` on the maintainer's Mac yields the correct binary whether it
  is Intel (x64) or Apple Silicon (arm64). `mac.identity: null` to skip signing without
  aborting the build.
- **Windows target:** `nsis` (installer). Unsigned.
- No `publish` block, no updater configuration.

## Scripts (`package.json`)

- `dist`: `electron-vite build && electron-builder` — packages for the current platform.
- `dist:mac`: `electron-vite build && electron-builder --mac`.
- `dist:win`: `electron-vite build && electron-builder --win`.

## Icon

No icon asset exists today. Generate one brand icon from the Finance Dashboard identity (via
the `finance-dashboard-design` skill), saved as `build/icon.png` (≥512×512). electron-builder
derives the platform formats (`.icns`, `.ico`) automatically from this single source.

## First-launch friction (expected, documented)

- **macOS:** unsigned → Gatekeeper blocks. Right-click ▸ Open (or
  `xattr -d com.apple.quarantine <app>`), once.
- **Windows:** unsigned → SmartScreen. "More info" ▸ "Run anyway", once.

These are acceptable for a personal build and will be noted in the PR description.

## Verification

- **Local gate** (CI is suspended for billing — [[project-ci-billing-and-local-e2e]]): `lint`,
  `tsc --noEmit`, unit tests, `npm run build` all green. (Packaging touches no app source, so
  the pre-existing unrelated `tests/integration/import/extractStatement.test.ts` failure is out
  of scope.)
- **Real build per machine:** run `dist:win` on the PC and `dist:mac` on the Mac, install, and
  launch the packaged app on real data — which doubles as the pending Reports real-data
  smoke-test ([[project-reports-accounting-rethink]]) and a check that on-demand LLM download
  still works from the packaged app.

## Process

Branch `feat/desktop-packaging` → PR → maintainer validates by building on each machine →
self-merge once the local gate is green (light PR gate, CLAUDE.md MVP mode).
