# LLM GPU acceleration (CUDA offload) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make LLM categorization run on the NVIDIA GPU (CUDA) instead of CPU — ~10× faster — on both the WSL2 dev runtime and the packaged Windows app, while keeping a safe CPU fallback for machines without an NVIDIA GPU.

**Architecture:** No backend is forced in app code — `getLlama()` already auto-selects CUDA when the prebuilt CUDA binary + CUDA runtime libs are present, and falls back to CPU otherwise. The work is plumbing: vendor the CUDA runtime libs for WSL2 dev (gitignored, fetched by a setup script, exposed via `LD_LIBRARY_PATH` at dev launch), and stop excluding the `win-x64-cuda` backend from the Windows package build. A perf bench script verifies the speedup.

**Tech Stack:** Electron + `node-llama-cpp` 3.18.1 (prebuilt `*-cuda` binaries already in `node_modules`), `electron-builder`, `electron-vite`, CUDA 12 runtime libs from PyPI wheels (`nvidia-cuda-runtime-cu12`, `nvidia-cublas-cu12`), Python 3 (stdlib only) for the fetch script.

**Branch:** `feat/llm-gpu-acceleration` (already created; spec already committed there).

**Spec:** `docs/superpowers/specs/2026-06-08-llm-gpu-acceleration-design.md`

> **Note on TDD:** This feature adds almost no unit-testable app logic (one diagnostic log line; the rest is build config + a dev setup script). Per the spec, verification is empirical: the bench's backend/timing output and a CPU-fallback check. Each task therefore carries exact verification commands with expected output rather than forced unit tests. The existing 70 LLM/categorize unit tests must stay green throughout.

---

## File Structure

- **Create** `scripts/setup-cuda-libs.py` — fetches + extracts the pinned CUDA 12 runtime libs into `.cuda-libs/` (gitignored). One responsibility: make the libs available locally.
- **Create** `scripts/dev.mjs` — dev launcher that prepends `.cuda-libs` to `LD_LIBRARY_PATH` on Linux, then runs `electron-vite dev`. One responsibility: wire the libs into the dev process env.
- **Keep/clean** `scripts/bench-categorize.ts` — perf-regression tool (already exists, untracked; needs tidy + commit).
- **Modify** `src/main/llm/llm.ts:33-40` — log the selected inference backend once in `loadModel`.
- **Modify** `electron-builder.yml` — keep `win-x64-cuda*` in the Windows package; still drop Vulkan + non-Windows CUDA backends.
- **Modify** `package.json` (scripts) — add `setup:cuda`; point `dev` at `scripts/dev.mjs`.
- **Modify** `CONTRIBUTING.md` — document the one-time `npm run setup:cuda` step.

`.cuda-libs/` and `.cuda-spike/` are already in `.gitignore` (committed with the spec).

---

## Task 1: Tidy and commit the perf bench tool

**Files:**

- Modify: `scripts/bench-categorize.ts` (remove the throwaway `gpuLayers: undefined : undefined` hack and the fragile introspection; keep it clean)

`scripts/` is outside `tsconfig.json` `include` and outside the `lint` glob, so this file is not subject to the typecheck/lint gate — but keep it clean TypeScript anyway since it runs under `tsx`.

- [ ] **Step 1: Replace the file with the cleaned version**

Write `scripts/bench-categorize.ts` with exactly this content:

```ts
import { getLlama, LlamaChatSession } from 'node-llama-cpp';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  buildCategorizationPrompt,
  parseCategorization,
  type LlmCategory,
} from '../src/main/categorize/llm';

// Perf bench for LLM categorization. Reuses the app's real prompt + parser.
// Usage:
//   npx tsx scripts/bench-categorize.ts                       # auto backend
//   FORCE_GPU=cuda LD_LIBRARY_PATH="$PWD/.cuda-libs" npx tsx scripts/bench-categorize.ts
// Prints the active backend, load time, inference time, and the parsed mapping.

const MODEL = resolve('models', 'llama-3.2-3b-instruct-q4_k_m.gguf');

const CATEGORIES: LlmCategory[] = [
  { id: 'c1', name: 'Alimentation' },
  { id: 'c2', name: 'Restaurants' },
  { id: 'c3', name: 'Transport' },
  { id: 'c4', name: 'Logement' },
  { id: 'c5', name: 'Énergie' },
  { id: 'c6', name: 'Santé' },
  { id: 'c7', name: 'Loisirs' },
  { id: 'c8', name: 'Abonnements' },
  { id: 'c9', name: 'Shopping' },
  { id: 'c10', name: 'Salaire' },
  { id: 'c11', name: 'Impôts' },
  { id: 'c12', name: 'Assurance' },
];

const LABELS = [
  'CB CARREFOUR MARKET 12/03/25',
  'PRLV SEPA EDF CLIENTS',
  'CB UBER EATS PARIS',
  'VIR SALAIRE ACME SAS',
  'CB TOTALENERGIES STATION',
  'PRLV NETFLIX.COM',
  'CB PHARMACIE DU CENTRE',
  'CB FNAC PARIS 14/04/25',
  'PRLV SEPA FREE MOBILE',
  'CB SNCF CONNECT',
  'CB MCDONALDS LYON',
  'PRLV ASSURANCE MAAF',
];

async function main(): Promise<void> {
  const force = process.env.FORCE_GPU;
  const llama =
    force === undefined || force === 'auto'
      ? await getLlama()
      : await getLlama({ gpu: force as 'cuda' | 'vulkan' | 'metal' });
  console.log(`backend: ${JSON.stringify(llama.gpu)}`);

  const t0 = performance.now();
  const model = await llama.loadModel({ modelPath: MODEL });
  console.log(`load: ${(performance.now() - t0).toFixed(0)}ms`);

  const items = LABELS.map((label, i) => ({ id: `t${String(i)}`, label }));
  const prompt = buildCategorizationPrompt(CATEGORIES, items);

  const context = await model.createContext();
  const session = new LlamaChatSession({ contextSequence: context.getSequence() });
  const ti = performance.now();
  const raw = await session.prompt(prompt, { temperature: 0 });
  const ms = performance.now() - ti;
  await context.dispose();
  await model.dispose();

  console.log(
    `inference: ${ms.toFixed(0)}ms (${(ms / LABELS.length).toFixed(0)}ms/label) for ${String(LABELS.length)} labels`,
  );
  const parsed = parseCategorization(raw, CATEGORIES, items);
  for (const r of parsed) {
    const idx = items.findIndex((it) => it.id === r.id);
    const cat = CATEGORIES.find((c) => c.id === r.categoryId)?.name ?? 'AUCUNE';
    console.log(`  ${LABELS[idx] ?? '?'} -> ${cat}`);
  }
}

void main();
```

- [ ] **Step 2: Verify it runs (CPU path, no libs)**

Run: `npx tsx scripts/bench-categorize.ts 2>&1 | grep -E "^backend|^load|^inference|->"`
Expected: `backend: false`, `inference: ~11000ms`, and a list of `LABEL -> Category` lines (proves it still works on CPU).

- [ ] **Step 3: Commit**

```bash
git add scripts/bench-categorize.ts
git commit -m "test: add LLM categorization perf bench tool"
```

---

## Task 2: Log the selected inference backend (only app-code change)

**Files:**

- Modify: `src/main/llm/llm.ts:33-40` (function `loadModel`)

- [ ] **Step 1: Add the backend log**

In `src/main/llm/llm.ts`, change the body of `loadModel` from:

```ts
const { getLlama } = await import('node-llama-cpp');
const llama = await getLlama();
return llama.loadModel({ modelPath: path });
```

to:

```ts
const { getLlama } = await import('node-llama-cpp');
const llama = await getLlama();
// Diagnostic: which compute backend was auto-selected (cuda / metal / vulkan
// / false=CPU). We never force a backend — auto-detection keeps CPU fallback
// working on machines without a supported GPU. See the GPU acceleration spec.
console.log(`[llm] inference backend: ${JSON.stringify(llama.gpu)}`);
return llama.loadModel({ modelPath: path });
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0, no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: exits 0 (no `no-console` rule is configured, so the log is allowed).

- [ ] **Step 4: Run the LLM/categorize unit tests (must stay green)**

Run: `npx vitest run tests/unit/categorize tests/unit/llm`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/llm/llm.ts
git commit -m "feat(llm): log the auto-selected inference backend"
```

---

## Task 3: Setup script that vendors the CUDA runtime libs (WSL2 dev)

**Files:**

- Create: `scripts/setup-cuda-libs.py`
- Modify: `package.json` (add `setup:cuda` script)

Pinned to the exact wheel versions proven in the spike (CUDA 12.9): `nvidia-cuda-runtime-cu12==12.9.79`, `nvidia-cublas-cu12==12.9.2.10`. CUDA 12.x minor-version compatibility makes these safe against the `b8390` prebuilt.

- [ ] **Step 1: Create the fetch/extract script**

Write `scripts/setup-cuda-libs.py` with exactly this content:

```python
#!/usr/bin/env python3
"""Vendor the CUDA 12 runtime libs that node-llama-cpp's linux-x64-cuda prebuilt
binary needs, into .cuda-libs/ (gitignored). No pip, no CUDA toolkit, no build —
just downloads the manylinux wheels from PyPI and extracts the .so files.

Pinned versions are forward/backward compatible within CUDA 12.x. Re-run is safe
(idempotent): it skips download if the libs already exist."""

import io
import json
import os
import sys
import urllib.request
import zipfile

DEST = os.path.join(os.getcwd(), ".cuda-libs")
PINS = {
    "nvidia-cuda-runtime-cu12": "12.9.79",
    "nvidia-cublas-cu12": "12.9.2.10",
}
REQUIRED = ["libcudart.so.12", "libcublas.so.12", "libcublasLt.so.12"]


def wheel_url(pkg: str, version: str) -> str:
    meta = json.load(urllib.request.urlopen(f"https://pypi.org/pypi/{pkg}/{version}/json"))
    for f in meta["urls"]:
        fn = f["filename"]
        if fn.endswith(".whl") and "x86_64" in fn and "manylinux" in fn:
            return f["url"]
    raise SystemExit(f"no manylinux x86_64 wheel for {pkg}=={version}")


def main() -> None:
    os.makedirs(DEST, exist_ok=True)
    if all(os.path.exists(os.path.join(DEST, lib)) for lib in REQUIRED):
        print(f"CUDA libs already present in {DEST} — skipping.")
        return
    for pkg, version in PINS.items():
        url = wheel_url(pkg, version)
        print(f"downloading {pkg}=={version} ...")
        raw = urllib.request.urlopen(url).read()
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            for name in z.namelist():
                if name.endswith(".so") or ".so." in name:
                    base = os.path.basename(name)
                    with open(os.path.join(DEST, base), "wb") as out:
                        out.write(z.read(name))
                    print(f"  extracted {base}")
    missing = [lib for lib in REQUIRED if not os.path.exists(os.path.join(DEST, lib))]
    if missing:
        raise SystemExit(f"missing after extract: {missing}")
    print(f"\nCUDA runtime libs ready in {DEST}")


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Add the npm script**

In `package.json`, add to `"scripts"` (after `"format"`):

```json
    "setup:cuda": "python3 scripts/setup-cuda-libs.py",
```

- [ ] **Step 3: Remove the throwaway spike libs dir (superseded by .cuda-libs)**

Run: `rm -rf .cuda-spike`
Expected: no output. (The setup script now owns the libs in `.cuda-libs/`.)

- [ ] **Step 4: Run the setup script**

Run: `npm run setup:cuda`
Expected: downloads both wheels and prints `extracted libcudart.so.12`, `libcublas.so.12`, `libcublasLt.so.12`, then `CUDA runtime libs ready in .../.cuda-libs`.

- [ ] **Step 5: Verify idempotency**

Run: `npm run setup:cuda`
Expected: `CUDA libs already present ... skipping.`

- [ ] **Step 6: Confirm .cuda-libs is gitignored (no large files staged)**

Run: `git status --short`
Expected: shows `scripts/setup-cuda-libs.py` and `package.json` as changes, but **not** `.cuda-libs/`.

- [ ] **Step 7: Commit**

```bash
git add scripts/setup-cuda-libs.py package.json
git commit -m "build: add setup:cuda to vendor CUDA runtime libs for dev"
```

---

## Task 4: Wire LD_LIBRARY_PATH into the dev launch

**Files:**

- Create: `scripts/dev.mjs`
- Modify: `package.json` (`dev` script)

The dynamic linker reads `LD_LIBRARY_PATH` at process start, so it must be set **before** electron is spawned. A small Node launcher sets it (Linux only, when libs exist) and execs `electron-vite dev`, inheriting the env down to the electron child.

- [ ] **Step 1: Create the launcher**

Write `scripts/dev.mjs` with exactly this content:

```js
// Dev launcher: on Linux, prepend the vendored CUDA libs (.cuda-libs) to
// LD_LIBRARY_PATH so node-llama-cpp's CUDA prebuilt can load, then run
// electron-vite dev. On other platforms (or when libs are absent) it just runs
// electron-vite dev unchanged — node-llama-cpp falls back to CPU.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const env = { ...process.env };
const libs = join(process.cwd(), '.cuda-libs');
if (process.platform === 'linux' && existsSync(libs)) {
  env.LD_LIBRARY_PATH = env.LD_LIBRARY_PATH ? `${libs}:${env.LD_LIBRARY_PATH}` : libs;
}

const child = spawn('electron-vite', ['dev'], {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32',
});
child.on('exit', (code) => process.exit(code ?? 0));
```

- [ ] **Step 2: Point the dev script at the launcher**

In `package.json`, change:

```json
    "dev": "electron-vite dev",
```

to:

```json
    "dev": "node scripts/dev.mjs",
```

- [ ] **Step 3: Verify the launcher computes the path (dry check without launching electron)**

Run: `node -e "const {existsSync}=require('node:fs');const {join}=require('node:path');console.log(process.platform, existsSync(join(process.cwd(),'.cuda-libs')))"`
Expected: `linux true` (confirms the libs dir exists and the platform branch will fire).

- [ ] **Step 4: Commit**

```bash
git add scripts/dev.mjs package.json
git commit -m "build: launch dev with CUDA libs on LD_LIBRARY_PATH"
```

---

## Task 5: Verify the GPU speedup and the CPU fallback (acceptance gate for dev)

No file changes — this task proves the dev path works end to end and that the fallback is intact. **Do not proceed to Task 6 unless both checks pass.**

- [ ] **Step 1: GPU path — run the bench with the vendored libs**

Run:

```bash
LD_LIBRARY_PATH="$PWD/.cuda-libs:$LD_LIBRARY_PATH" FORCE_GPU=cuda npx tsx scripts/bench-categorize.ts 2>&1 | grep -E "^backend|^load|^inference"
```

Expected: `backend: "cuda"`, `load: ~1600ms`, `inference: ~1100ms` (≈90ms/label). This is the ~10× win.

- [ ] **Step 2: CPU fallback — run the bench with no libs on the path**

Run: `npx tsx scripts/bench-categorize.ts 2>&1 | grep -E "^backend|^inference|->"`
Expected: `backend: false`, `inference: ~11000ms`, and still a correct `LABEL -> Category` list. This proves machines without CUDA keep working.

- [ ] **Step 3: Confirm the app's own log reports CUDA in dev**

Run: `npm run dev` and, in the app, click the "Catégoriser" button (with at least one uncategorized transaction present).
Expected: the dev terminal logs `[llm] inference backend: "cuda"`, and categorization completes visibly faster than before. Stop the app afterwards (Ctrl-C).

> If Step 1 shows `backend: false` instead of `"cuda"`: re-run `npm run setup:cuda`, confirm `.cuda-libs/libcudart.so.12` exists, and check `npx --no node-llama-cpp inspect gpu` no longer says "CUDA runtime is not [installed]" when `LD_LIBRARY_PATH` includes `.cuda-libs`.

---

## Task 6: Keep the Windows CUDA backend in the packaged build

**Files:**

- Modify: `electron-builder.yml` (the `files:` exclusion block)

The current config excludes **all** `*-cuda*` and `*-vulkan*` backends ("CPU-only"). Reverse that for `win-x64-cuda` (and its `-ext` companion holding the cuBLAS DLLs); still drop Vulkan and the non-Windows CUDA backends to limit size. `asarUnpack` already covers `@node-llama-cpp/*`, so the kept binaries are unpacked automatically.

- [ ] **Step 1: Replace the GPU-backend exclusion lines**

In `electron-builder.yml`, replace this block:

```yaml
# CPU-only: drop the heavy GPU backends (CUDA ~600 MB, Vulkan ~76 MB) — the LLM
# is a background batch classifier, CPU is plenty. node-llama-cpp falls back to
# CPU at runtime. Metal (mac) is kept: it's neither *-cuda nor *-vulkan.
- '!**/node_modules/@node-llama-cpp/*-cuda*'
- '!**/node_modules/@node-llama-cpp/*-cuda*/**'
- '!**/node_modules/@node-llama-cpp/*-vulkan*'
- '!**/node_modules/@node-llama-cpp/*-vulkan*/**'
```

with:

```yaml
# Keep the Windows CUDA backend (win-x64-cuda + its -ext cuBLAS DLLs) for GPU
# offload on NVIDIA machines — ~10x faster categorization (design:
# docs/superpowers/specs/2026-06-08-llm-gpu-acceleration). node-llama-cpp still
# falls back to CPU when no NVIDIA GPU is present. Drop Vulkan (broken/unused)
# and the non-Windows CUDA backends to limit artifact size.
- '!**/node_modules/@node-llama-cpp/*-vulkan*'
- '!**/node_modules/@node-llama-cpp/*-vulkan*/**'
- '!**/node_modules/@node-llama-cpp/linux-x64-cuda*'
- '!**/node_modules/@node-llama-cpp/linux-x64-cuda*/**'
- '!**/node_modules/@node-llama-cpp/mac-*-cuda*'
- '!**/node_modules/@node-llama-cpp/mac-*-cuda*/**'
```

- [ ] **Step 2: Confirm the Windows CUDA packages are present to be bundled**

Run: `ls -d node_modules/@node-llama-cpp/win-x64-cuda node_modules/@node-llama-cpp/win-x64-cuda-ext`
Expected: both paths exist.

- [ ] **Step 3: Build the renderer/main bundle (cheap sanity that config parses)**

Run: `npm run build`
Expected: `electron-vite build` completes with no error (this does not run electron-builder, but confirms the project still builds).

- [ ] **Step 4: Commit**

```bash
git add electron-builder.yml
git commit -m "build(win): keep win-x64-cuda backend for GPU categorization"
```

---

## Task 7: Document the dev setup

**Files:**

- Modify: `CONTRIBUTING.md`

- [ ] **Step 1: Add a GPU setup note**

In `CONTRIBUTING.md`, add this subsection under the local development / setup section (place it after the existing install/run instructions):

````markdown
### Optional: GPU acceleration for the LLM (NVIDIA, WSL2/Linux)

LLM categorization runs ~10× faster on an NVIDIA GPU. The CUDA prebuilt binary
ships with `node-llama-cpp`; it only needs the CUDA 12 runtime libs locally:

```bash
npm run setup:cuda   # downloads libcudart/libcublas into .cuda-libs/ (gitignored)
```
````

`npm run dev` then adds `.cuda-libs` to `LD_LIBRARY_PATH` automatically. Confirm
it worked: the dev terminal logs `[llm] inference backend: "cuda"` on the first
categorization. Without this step (or on a machine with no NVIDIA GPU) the app
falls back to CPU automatically — everything still works, just slower.

The packaged Windows app bundles the CUDA backend and needs no setup beyond the
NVIDIA driver.

````

- [ ] **Step 2: Commit**

```bash
git add CONTRIBUTING.md
git commit -m "docs: document optional CUDA setup for LLM dev"
````

---

## Task 8: Full gate + push + PR

- [ ] **Step 1: Run the full local gate**

Run: `npm run typecheck && npm run lint && npm run test && npm run build`
Expected: all four succeed.

- [ ] **Step 2: Push the branch**

Run: `git push -u origin feat/llm-gpu-acceleration`
Expected: branch pushed.

- [ ] **Step 3: Open the PR**

```bash
gh pr create --title "feat(llm): GPU (CUDA) acceleration for categorization" --body "$(cat <<'EOF'
## What
Run LLM categorization on the NVIDIA GPU (CUDA) instead of CPU — ~10× faster
(11.2s → 1.1s per 12-label batch in the bench), with a safe CPU fallback.

## Why
Categorization was CPU-bound and felt frozen. Root cause: a broken Vulkan
prebuilt fell back to CPU; the GPU sat idle. See
`docs/superpowers/specs/2026-06-08-llm-gpu-acceleration-design.md`.

## How
- No backend forced in app code — `getLlama()` auto-selects CUDA when the
  prebuilt + runtime libs are present, else CPU.
- WSL2 dev: `npm run setup:cuda` vendors the CUDA runtime libs (gitignored);
  `npm run dev` exposes them via `LD_LIBRARY_PATH`.
- Windows package: keep `win-x64-cuda` (+ `-ext`) in `electron-builder.yml`.
- Added a perf bench (`scripts/bench-categorize.ts`) and a backend log.

## Validation
- [x] Bench: `backend: "cuda"`, ~1.1s/batch (was ~11s).
- [x] CPU fallback verified (no libs → `backend: false`, still correct).
- [ ] **Maintainer to validate the packaged Windows build** logs
      `backend gpu: cuda` and that a non-NVIDIA machine falls back to CPU.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed.

> **Do not self-merge yet.** Per the project's "validate UI/behaviour before merge" rule, this needs the maintainer's Windows-build validation (the only thing not verifiable from WSL2) before merging.

---

## Self-Review

**Spec coverage:**

- Principle "never force backend" → Task 2 (log only, keeps auto). ✓
- A. Dev vendored libs → Tasks 3 (`setup:cuda`) + 4 (`LD_LIBRARY_PATH`). ✓
- B. Windows bundling (`win-x64-cuda` + `-ext`, asarUnpack) → Task 6 (asarUnpack `@node-llama-cpp/*` already present). ✓
- C. Keep bench, unit tests unaffected, manual validation matrix → Tasks 1, 5, 8. ✓
- D. Privacy/ADR → no code impact; recorded in spec. ✓
- Risk "Windows unverified from here" → flagged in Task 8 PR checklist + no-self-merge note. ✓
- Risk "pin wheel version" → Task 3 pins 12.9.79 / 12.9.2.10. ✓

**Placeholder scan:** No TBD/TODO; all code blocks are complete; all commands have expected output. ✓

**Type/name consistency:** `.cuda-libs` used identically in setup script, `dev.mjs`, gitignore, bench usage, and Task 5. `FORCE_GPU` env name consistent between bench and Task 5. Pinned versions consistent between spec risk note and Task 3. ✓
