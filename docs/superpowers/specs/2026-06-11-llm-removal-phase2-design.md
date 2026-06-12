# LLM removal phase 2 — design

**Date:** 2026-06-11
**Status:** validated by maintainer (session 2026-06-11)
**Context:** ADR-019 decided to remove the embedded LLM. Phase 1a (rules from
corrections + rules audit, #212) and phase 1b (manual bank mapping assistant,
#214) shipped the deterministic replacements. This phase removes the
categorization classifier and every remaining piece of LLM machinery.

## Goal

After this change the app contains **zero LLM code**: no model download, no
inference, no model settings, no `node-llama-cpp`. Categorization is fully
deterministic — history + rules at import, manual correction, retroactive
rules. The only outbound network call left in the product is the opt-in
version check.

No user data is touched: existing transaction categories stay exactly as they
are; history-based and rule-based categorization keep working unchanged.

## Removal scope (dependency order: renderer → IPC → main)

### 1. Renderer

Delete:

- `src/renderer/components/model/` — `CategorizationPrompt.tsx`,
  `ModelDownloadIndicator.tsx`, `ModelSettingsSection.tsx`, `triggerLogic.ts`
- `src/renderer/hooks/useBackgroundCategorization.ts`
- `src/renderer/hooks/useModelStatus.ts`
- `src/renderer/lib/modelFormat.ts`

Unwire from `AppShell.tsx` (prompt, indicator, background pass, model status)
and `SettingsPage.tsx` (model section). The Settings page keeps its other
sections. There is no background categorization pass anymore — import-time
history+rules (`resolveImportCategory`) and retroactive rules (#212) cover it.

### 2. IPC contract & main process

Delete:

- IPC channels `model:status`, `model:download:start`, `model:download:cancel`,
  `model:remove`, `model:selection:detect`, `categorize:pending`,
  `categorize:batch` (channels.ts, register.ts, preload.ts, renderer client,
  `IpcContract` in `src/shared/types/ipc.ts`)
- The `model:progress` webContents push in `src/main/index.ts`
- `src/main/ipc/handlers/model.ts`, `src/main/ipc/handlers/categorize.ts`
- `src/main/llm/` entirely (download, downloadController, llm, modelController,
  modelRegistry, modelsDir)
- `src/main/categorize/llm.ts`, `pending.ts`, `attempts.ts`
- `src/shared/types/model.ts`

TypeScript strict guarantees no orphan caller survives the contract purge.

### 3. Database

Migration `019_drop_llm_attempts.sql`: `DROP TABLE llm_attempts;`. Nothing
else — no user data is involved.

### 4. Disk cleanup (maintainer-chosen: automatic)

One-shot routine at app startup in main: if `<userData>/models` exists, remove
that directory recursively (`fs.rmSync(dir, { recursive: true, force: true })`
on exactly that path). It stays in the codebase permanently — cost is one
`existsSync` per launch. Unit-tested with a temp dir standing in for userData.

The dev repo's `models/` (~15 GB) is deleted manually at the end of the
chantier. `FD_MODELS_DIR` (E2E override) disappears with the code that read
it; worktree symlink guidance for `models/` is dropped from CLAUDE.md.

### 5. Dependencies & packaging

- Remove `node-llama-cpp` from `package.json` dependencies.
- `electron-builder.yml`: remove the node-llama-cpp asarUnpack/native-binary
  blocks (the globs sourced from the upstream electron scaffold). **Keep** the
  `!models/**` exclusion as belt-and-braces while model files may still exist
  on machines.

### 6. Tests

Delete the LLM test files (unit: `tests/unit/llm/*`, `categorize/llm`,
`categorize/pending`, `categorize/attempts`, `ipc/model`, `ipc/categorize`,
renderer model components, `useBackgroundCategorization`, `triggerLogic`,
`modelFormat`; E2E: `tests/e2e/model-download.test.ts`). Amend the survivors
that only referenced the removed surface in passing (`AppShell.test.tsx`,
`SettingsPage.test.tsx`, migrate tests for migration 019). Add the startup
cleanup unit test.

### 7. Docs (same PR)

- `README.md`: remove the model download / categorization-LLM sections;
  privacy statement becomes "the only outbound call is the opt-in version
  check".
- `CLAUDE.md`: drop "until the removal lands the classifier is frozen" and the
  model-download outbound-call mention; drop `models/` from the
  worktrees/fixtures section.
- `docs/adr/019-*`: mark the removal executed (phases 1a/1b/2 with PR
  numbers).

## Out of scope

- Any change to categorization behavior (history, rules, refunds).
- Removing the `!models/**` packaging exclusion.
- The slow-native-selects follow-up (separate small PR).

## Validation (maintainer, in-app)

1. App starts; Settings shows no model section; no download indicator or
   categorization prompt anywhere.
2. Import a PDF: transactions still get categorized by history+rules; manual
   correction still offers rule creation.
3. On the Windows machine: after first launch, `%APPDATA%/<app>/models` is
   gone.
4. `npm run build` succeeds and the package contains no node-llama-cpp.
