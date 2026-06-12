# Hardware-tiered model selection — Implementation Plan (Phase A: engine)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-select the LLM by VRAM — load the best model that's present (no detection needed to load), and download the VRAM-appropriate one (Qwen-7B on ≥6 GB GPUs, else Llama-3B).

**Architecture:** A model **registry** (ordered best-first) replaces the hardcoded `MODEL_FILE`/`MODEL_MANIFEST`. `selectModelSpec(gpu, vramTotal)` (pure) picks the download target; `getActiveSelection()` reads VRAM once via `getLlama().getVramState()` (lazy, cached). The model **loaded** is simply the highest-tier registry model whose file is present — so the maintainer's machine (Qwen already in `models/`) uses Qwen immediately, and a fresh install downloads the selected one. The existing download/status UI is reused unchanged.

**Tech Stack:** Electron main, `node-llama-cpp` 3.x (`getVramState`, `llama.gpu`), `node:sqlite` unaffected, Vitest 4.

**Branch:** `feat/hardware-tiered-model` (created off `main`; spec committed there).

**Spec:** `docs/superpowers/specs/2026-06-08-hardware-tiered-model-design.md`

> **Phase B (separate plan, later):** `ModelStatus` extension + opt-in **upgrade banner** (have-3B, qualify-7B) + active-model transparency display (spec §E). Not in this plan. This plan reuses the existing download UI as-is; its "~1.9 GB" copy may be momentarily stale for Qwen until Phase B makes labels dynamic — acceptable.

---

## File Structure

- **Create** `src/main/llm/modelRegistry.ts` — `ModelSpec`, `MODELS` (Qwen-7B, Llama-3B), `selectModelSpec`, `withDownloadOverrides`.
- **Modify** `src/main/llm/llm.ts` — remove `MODEL_FILE`; add `getActiveSelection`, `findBestPresentModel`; `resolveModelPath(dir, spec)`; `isModelAvailable` = any-present; `getModel` loads best-present.
- **Modify** `src/main/llm/modelsDir.ts` — dev-dir check across the registry.
- **Delete** `src/main/llm/modelManifest.ts` (replaced by the registry).
- **Modify** `src/main/llm/download.ts` — default manifest from the registry (still injectable).
- **Modify** `src/main/llm/downloadController.ts` — download the VRAM-selected spec; status/`remove` span the registry.
- **Tests:** new `modelRegistry.test.ts` + `bestPresentModel.test.ts`; update `downloadController.test.ts`, `download.test.ts`; delete `modelManifest.test.ts`.
- The categorize / learnBank handlers are **unchanged** (`getModel(dir)` / `isModelAvailable(dir)` keep their signatures).

---

## Task 1: Model registry + selection (pure, additive)

Additive — leaves `MODEL_FILE`/`MODEL_MANIFEST` in place (removed in Task 2), so the build stays green.

**Files:**

- Create: `src/main/llm/modelRegistry.ts`
- Test: `tests/unit/llm/modelRegistry.test.ts`

- [ ] **Step 1: Write the failing test** — `tests/unit/llm/modelRegistry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  MODELS,
  selectModelSpec,
  withDownloadOverrides,
} from '../../../src/main/llm/modelRegistry';

const GB = 1024 ** 3;

describe('MODELS registry', () => {
  it('lists distinct ids/filenames with 64-hex sha256 and a 7B tier above a 3B fallback', () => {
    expect(MODELS.length).toBeGreaterThanOrEqual(2);
    expect(new Set(MODELS.map((m) => m.id)).size).toBe(MODELS.length);
    expect(new Set(MODELS.map((m) => m.fileName)).size).toBe(MODELS.length);
    for (const m of MODELS) {
      expect(m.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(m.url).toMatch(/^https:\/\//);
      expect(m.sizeBytes).toBeGreaterThan(0);
    }
    // ordered best-first: a 0-minVram fallback exists and is last
    expect(MODELS[MODELS.length - 1]?.minVramBytes).toBe(0);
  });
});

describe('selectModelSpec', () => {
  it('returns the fallback (3B) on CPU / no GPU', () => {
    expect(selectModelSpec(false, 64 * GB).id).toBe('llama-3.2-3b');
  });
  it('returns the 3B below the VRAM threshold', () => {
    expect(selectModelSpec('cuda', 4 * GB).id).toBe('llama-3.2-3b');
  });
  it('returns Qwen-7B at/above 6 GB total VRAM', () => {
    expect(selectModelSpec('cuda', 6 * GB).id).toBe('qwen2.5-7b');
    expect(selectModelSpec('cuda', 8 * GB).id).toBe('qwen2.5-7b');
  });
});

describe('withDownloadOverrides', () => {
  it('is a no-op without FD_MODEL_URL', () => {
    const spec = MODELS[0]!;
    expect(withDownloadOverrides(spec)).toEqual(spec);
  });
});
```

- [ ] **Step 2: Run it — verify FAIL**

Run: `npx vitest run tests/unit/llm/modelRegistry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — create `src/main/llm/modelRegistry.ts`:

```ts
/** A downloadable model + the VRAM it needs. MODELS is ordered best-first so
 *  "the best present / best the hardware can run" is a simple find(). */
export interface ModelSpec {
  id: string;
  fileName: string;
  url: string;
  sha256: string;
  sizeBytes: number;
  label: string;
  minVramBytes: number;
}

export const MODELS: readonly ModelSpec[] = [
  {
    id: 'qwen2.5-7b',
    fileName: 'qwen2.5-7b-instruct-q4_k_m.gguf',
    url: 'https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf',
    sha256: '65b8fcd92af6b4fefa935c625d1ac27ea29dcb6ee14589c55a8f115ceaaa1423',
    sizeBytes: 4683074240,
    label: 'Qwen2.5 7B',
    minVramBytes: 6 * 1024 ** 3,
  },
  {
    id: 'llama-3.2-3b',
    fileName: 'llama-3.2-3b-instruct-q4_k_m.gguf',
    url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    sha256: '6c1a2b41161032677be168d354123594c0e6e67d2b9227c84f296ad037c728ff',
    sizeBytes: 2019377696,
    label: 'Llama 3.2 3B',
    minVramBytes: 0,
  },
];

/** The universal fallback (minVramBytes 0) — the last, lowest tier. */
const FALLBACK: ModelSpec = MODELS[MODELS.length - 1] as ModelSpec;

/**
 * Pick the model the hardware can run: CPU/no-GPU → fallback (3B); otherwise the
 * highest-tier spec whose minVramBytes fits the total VRAM (MODELS is best-first).
 * Decision uses TOTAL VRAM (stable capability), not free (fluctuates).
 */
export function selectModelSpec(gpu: string | false, vramTotalBytes: number): ModelSpec {
  if (gpu === false) return FALLBACK;
  return MODELS.find((m) => m.minVramBytes <= vramTotalBytes) ?? FALLBACK;
}

/**
 * E2E-only: when FD_MODEL_URL is set, point the download at the stub server instead
 * of HuggingFace (mirrors the old MODEL_MANIFEST env hooks). Never set in production.
 */
export function withDownloadOverrides(spec: ModelSpec): ModelSpec {
  if (process.env.FD_MODEL_URL === undefined) return spec;
  return {
    ...spec,
    url: process.env.FD_MODEL_URL,
    sha256: process.env.FD_MODEL_SHA256 ?? spec.sha256,
    sizeBytes:
      process.env.FD_MODEL_SIZE !== undefined ? Number(process.env.FD_MODEL_SIZE) : spec.sizeBytes,
  };
}
```

- [ ] **Step 4: Run it — verify PASS**

Run: `npx vitest run tests/unit/llm/modelRegistry.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck` → exit 0.

```bash
git add src/main/llm/modelRegistry.ts tests/unit/llm/modelRegistry.test.ts
git commit -m "feat(llm): model registry + VRAM-based selectModelSpec"
```

---

## Task 2: Cut the model layer over to the registry

Atomic cutover: removing `MODEL_FILE`/`MODEL_MANIFEST` touches `llm.ts`, `modelsDir.ts`, `download.ts`, `downloadController.ts` and their tests together — they must change in one commit to stay green.

**Files:**

- Modify: `src/main/llm/llm.ts`, `src/main/llm/modelsDir.ts`, `src/main/llm/download.ts`, `src/main/llm/downloadController.ts`
- Delete: `src/main/llm/modelManifest.ts`, `tests/unit/llm/modelManifest.test.ts`
- Test: new `tests/unit/llm/bestPresentModel.test.ts`; update `tests/unit/llm/downloadController.test.ts`, `tests/unit/llm/download.test.ts`

- [ ] **Step 1: Rewrite `src/main/llm/llm.ts`** (replace the whole file):

```ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { LlamaModel } from 'node-llama-cpp';
import { MODELS, selectModelSpec, type ModelSpec } from './modelRegistry';

export function resolveModelPath(modelsDir: string, spec: ModelSpec): string {
  return join(modelsDir, spec.fileName);
}

/**
 * The highest-tier registry model whose file is present (MODELS is best-first), or
 * null. This is what we actually load — no VRAM detection needed to use what's on
 * disk (a downloaded Qwen-7B is used even on a machine we'd never pick it for).
 */
export function findBestPresentModel(modelsDir: string): ModelSpec | null {
  return MODELS.find((m) => existsSync(join(modelsDir, m.fileName))) ?? null;
}

/** Whether any model is downloaded (drives the categorize guard + status). */
export function isModelAvailable(modelsDir: string): boolean {
  return findBestPresentModel(modelsDir) !== null;
}

let selectionPromise: Promise<ModelSpec> | null = null;

/**
 * The model the hardware can run (download target). Lazy: loads the node-llama-cpp
 * backend once to read VRAM (never the multi-GB model), then caches. Any detection
 * failure falls back to the 3B — never throws.
 */
export async function getActiveSelection(): Promise<ModelSpec> {
  selectionPromise ??= detectSelection().catch(() => MODELS[MODELS.length - 1] as ModelSpec);
  return selectionPromise;
}

async function detectSelection(): Promise<ModelSpec> {
  const { getLlama } = await import('node-llama-cpp');
  const llama = await getLlama();
  const vram = await llama.getVramState();
  const spec = selectModelSpec(llama.gpu, vram.total);
  console.log(
    `[llm] hardware: gpu=${JSON.stringify(llama.gpu)} vramTotal=${String(vram.total)} → ${spec.id}`,
  );
  return spec;
}

let modelPromise: Promise<LlamaModel> | null = null;

/** Load the best-present model once and cache it (node-llama-cpp imported dynamically
 *  so the native addon stays off the launch path). Throws if no model is downloaded. */
export async function getModel(modelsDir: string): Promise<LlamaModel> {
  modelPromise ??= loadModel(modelsDir).catch((e: unknown) => {
    modelPromise = null;
    throw e;
  });
  return modelPromise;
}

async function loadModel(modelsDir: string): Promise<LlamaModel> {
  const spec = findBestPresentModel(modelsDir);
  if (spec === null) {
    throw new Error(`No LLM model present in ${modelsDir} — download one first`);
  }
  const { getLlama } = await import('node-llama-cpp');
  const llama = await getLlama();
  console.log(`[llm] loading ${spec.id}; inference backend: ${JSON.stringify(llama.gpu)}`);
  return llama.loadModel({ modelPath: join(modelsDir, spec.fileName) });
}

/**
 * Run a single deterministic prompt (temperature 0) and return the trimmed text.
 * A fresh context per call keeps prompts independent (no shared chat history).
 */
export async function runPrompt(model: LlamaModel, text: string): Promise<string> {
  const { LlamaChatSession } = await import('node-llama-cpp');
  const context = await model.createContext();
  try {
    const session = new LlamaChatSession({ contextSequence: context.getSequence() });
    const out = await session.prompt(text, { temperature: 0 });
    return out.trim();
  } finally {
    await context.dispose();
  }
}
```

- [ ] **Step 2: Update `src/main/llm/modelsDir.ts`** — replace the `MODEL_FILE` import + dev-dir check:

Change the import line `import { MODEL_FILE } from './llm';` to:

```ts
import { MODELS } from './modelRegistry';
```

and change the dev-dir line `if (existsSync(join(devDir, MODEL_FILE))) return devDir;` to:

```ts
if (MODELS.some((m) => existsSync(join(devDir, m.fileName)))) return devDir;
```

- [ ] **Step 3: Delete `src/main/llm/modelManifest.ts` and update `src/main/llm/download.ts`**

Run: `git rm src/main/llm/modelManifest.ts tests/unit/llm/modelManifest.test.ts`

In `download.ts`, replace the import `import { MODEL_MANIFEST } from './modelManifest';` with:

```ts
import { MODELS } from './modelRegistry';
```

and change the `defaultDeps.manifest` value from `MODEL_MANIFEST` to the 3B spec (the fallback default; the controller always injects the selected spec anyway):

```ts
  manifest: MODELS[MODELS.length - 1] as { url: string; sha256: string; sizeBytes: number; fileName: string },
```

- [ ] **Step 4: Update `src/main/llm/downloadController.ts`** — select the spec to download; status/remove span the registry.

Replace the imports:

```ts
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { ModelStatus } from '@shared/types/model';
import { MODELS, withDownloadOverrides } from './modelRegistry';
import { getActiveSelection, findBestPresentModel } from './llm';
import { downloadModel, type DownloadProgress } from './download';
```

Replace `fsState` (registry-wide presence / `.part`):

```ts
function fsState(): ModelStatus {
  const dir = modelsDir();
  if (findBestPresentModel(dir) !== null) return { state: 'ready' };
  if (MODELS.some((m) => existsSync(join(dir, `${m.fileName}.part`)))) return { state: 'paused' };
  return { state: 'absent' };
}
```

Replace the `downloadModel(...)` call inside `start()` so it targets the VRAM-selected spec:

```ts
runPromise = (async () => {
  try {
    const spec = withDownloadOverrides(await getActiveSelection());
    const res = await downloadModel(
      modelsDir(),
      (p: DownloadProgress) => {
        set({ state: 'downloading', receivedBytes: p.receivedBytes, totalBytes: p.totalBytes });
      },
      ac.signal,
      { manifest: spec },
    );
    if (res.ok) set(null);
    else if (res.error === 'cancelled') set(null);
    else set({ state: 'error', error: res.error });
  } catch (e) {
    set({ state: 'error', error: e instanceof Error ? e.message : 'download_failed' });
  } finally {
    active = null;
  }
})();
```

Replace `remove()` to clear every registry model + `.part`:

```ts
async function remove(): Promise<void> {
  cancel();
  if (runPromise) {
    try {
      await runPromise;
    } catch {
      /* already handled in start */
    }
  }
  const dir = modelsDir();
  for (const m of MODELS) {
    await rm(join(dir, m.fileName), { force: true });
    await rm(join(dir, `${m.fileName}.part`), { force: true });
  }
  set(null); // → 'absent'
}
```

(The `resolveModelPath` import is no longer used in this file — ensure it's removed from the import list.)

- [ ] **Step 5: Add `tests/unit/llm/bestPresentModel.test.ts`**:

```ts
import { it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MODELS } from '../../../src/main/llm/modelRegistry';
import { findBestPresentModel, isModelAvailable } from '../../../src/main/llm/llm';

const QWEN = MODELS.find((m) => m.id === 'qwen2.5-7b')!;
const LLAMA = MODELS.find((m) => m.id === 'llama-3.2-3b')!;

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bpm-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

it('returns null and isModelAvailable=false when nothing is present', () => {
  expect(findBestPresentModel(dir)).toBeNull();
  expect(isModelAvailable(dir)).toBe(false);
});

it('returns the 3B when only the 3B is present', () => {
  writeFileSync(join(dir, LLAMA.fileName), 'x');
  expect(findBestPresentModel(dir)?.id).toBe('llama-3.2-3b');
  expect(isModelAvailable(dir)).toBe(true);
});

it('prefers the higher-tier model when both are present', () => {
  writeFileSync(join(dir, LLAMA.fileName), 'x');
  writeFileSync(join(dir, QWEN.fileName), 'x');
  expect(findBestPresentModel(dir)?.id).toBe('qwen2.5-7b');
});
```

- [ ] **Step 6: Update `tests/unit/llm/downloadController.test.ts`**

It imports `MODEL_FILE` (removed). Replace the import line `import { MODEL_FILE } from '../../../src/main/llm/llm';` with:

```ts
import { MODELS } from '../../../src/main/llm/modelRegistry';
const MODEL_FILE = MODELS.find((m) => m.id === 'llama-3.2-3b')!.fileName;
```

(That single local `MODEL_FILE` const keeps the rest of the test file unchanged — it writes/reads a real registry filename, so `fsState` sees it as present.)

- [ ] **Step 7: Update `tests/unit/llm/download.test.ts`**

It imports `MODEL_FILE` only to use as a `fileName` string in its injected manifest. Replace `import { MODEL_FILE } from '../../../src/main/llm/llm';` with:

```ts
import { MODELS } from '../../../src/main/llm/modelRegistry';
const MODEL_FILE = MODELS.find((m) => m.id === 'llama-3.2-3b')!.fileName;
```

- [ ] **Step 8: Typecheck, lint, run the llm + ipc + import suites**

Run: `npm run typecheck` → exit 0.
Run: `npm run lint` → exit 0 (confirm no unused `resolveModelPath` import left in downloadController).
Run: `npx vitest run tests/unit/llm tests/unit/ipc tests/unit/import`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add -A src/main/llm tests/unit/llm
git commit -m "feat(llm): load best-present model; download the VRAM-selected one"
```

---

## Task 3: ADR-004 addendum

**Files:**

- Modify: `docs/adr/004-*.md` (the LLM model-selection ADR)

- [ ] **Step 1: Append an update section**

Find the ADR file (`ls docs/adr/ | grep 004`) and append at the end:

```markdown
## Update (2026-06-08) — hardware-tiered selection

The single pinned model is superseded by a small **registry** with VRAM-based
selection (see `docs/superpowers/specs/2026-06-08-hardware-tiered-model-design.md`):

- **Llama-3.2-3B** remains the universal fallback (CPU / no GPU / < 6 GB VRAM).
- **Qwen2.5-7B-Instruct (Q4_K_M)** is auto-selected on GPUs with ≥ 6 GB total VRAM —
  it categorizes far better (measured 27/37 vs 0/37 of the residual) and the GPU
  work (ADR-002-compatible, opt-in download, main-process-only) makes it fast.

The model **loaded** is the highest-tier model already present on disk; the model
**downloaded** is the VRAM-selected one. Privacy invariant (ADR-002) is unchanged.
```

- [ ] **Step 2: Commit**

```bash
git add docs/adr/
git commit -m "docs(adr-004): record hardware-tiered model selection"
```

---

## Task 4: Full gate + push + PR

- [ ] **Step 1: Full local gate**

Run: `npm run typecheck && npm run lint && npm run test && npm run build`
Expected: all four succeed.

- [ ] **Step 2: Push**

Run: `git push -u origin feat/hardware-tiered-model`

- [ ] **Step 3: Open the PR**

```bash
gh pr create --title "feat(llm): hardware-tiered model selection (adopt Qwen-7B)" --body "$(cat <<'EOF'
## What (Phase A: engine)
Pick the LLM by VRAM: load the best model already present, and download the
VRAM-appropriate one — Qwen2.5-7B on ≥6 GB GPUs, Llama-3.2-3B otherwise / on CPU.

## Why
The 3B categorizes poorly (0/37 of the real residual); Qwen-7B does 27/37 and runs
fast on the maintainer's 4060 Ti. See
`docs/superpowers/specs/2026-06-08-hardware-tiered-model-design.md`.

## How
- `modelRegistry.ts` (replaces `MODEL_FILE`/`MODEL_MANIFEST`): `MODELS` + pure
  `selectModelSpec(gpu, vramTotal)` (≥6 GB → Qwen-7B).
- `getActiveSelection()` reads VRAM once via `getLlama().getVramState()` (lazy,
  cached, falls back to 3B on any error — never throws).
- `getModel` loads the highest-tier **present** model (no detection needed to use
  what's on disk); the download targets the **selected** spec.
- Existing download/status UI reused unchanged.

## Validation
- [x] Unit tests: selection, best-present resolution, download controller, registry.
- [x] Full local gate green: typecheck, lint, tests, build.
- [ ] Maintainer in-app: confirm the dev app logs `→ qwen2.5-7b` / loads Qwen, and a
      CPU/no-GPU machine still falls back to 3B.

## Notes / follow-ups
- **Phase B** (separate): opt-in upgrade banner (have-3B, qualify-7B) + active-model
  transparency display; until then the download prompt's size copy may read stale.
- **Metal (Apple Silicon):** unified memory may over-report VRAM → could over-select
  7B; flag for Mac validation (secondary). Detection failure safely falls back to 3B.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

> **Do not self-merge** — changes which model the app uses; validate in-app first.

---

## Self-Review

**Spec coverage (Phase A scope):**

- §A registry → Task 1. ✓
- §B `selectModelSpec` (CPU→3B, ≥6 GB→Qwen) → Task 1 (tested at boundary). ✓
- §C lazy cached `getActiveSelection` (getLlama+getVramState, fallback) → Task 2. ✓
- §D model layer keys off selection; load best-present → Task 2 (`findBestPresentModel`, `getModel`, `isModelAvailable`, `resolveModelPath(spec)`). ✓
- §E download targets selected spec → Task 2 (controller). **Upgrade banner + transparency display = Phase B** (explicitly deferred; noted in header + PR).
- §F ADR-004 addendum → Task 3. ✓
- E2E `FD_MODEL_*` overrides preserved → `withDownloadOverrides` (Task 1) used in the controller (Task 2). ✓

**Placeholder scan:** No TBD/TODO; full code in every step; the one "find the ADR file" (Task 3) is a concrete `ls` lookup, not vague.

**Type/name consistency:** `ModelSpec`, `MODELS`, `selectModelSpec`, `withDownloadOverrides` (Task 1) used identically in Task 2. `resolveModelPath(dir, spec)` signature changed → only `downloadController` used it and that import is removed (noted). `getModel(modelsDir)` / `isModelAvailable(modelsDir)` signatures unchanged → categorize/learnBank handlers untouched (verified). `downloadModel(dir, onProgress, signal, { manifest })` matches the existing signature (deps injected). ✓
