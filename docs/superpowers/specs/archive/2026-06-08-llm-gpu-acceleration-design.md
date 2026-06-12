# LLM GPU acceleration (CUDA offload) — design

**Date:** 2026-06-08
**Status:** Proposed
**Related:** ADR-002 (privacy), ADR-004 (model choice: Llama 3.2 3B Q4_K_M),
`project-desktop-packaging`, `project-llm-download-opt-in`.

## Problem

LLM categorization (the "Catégoriser" button → background batch classifier) is
unusably slow. The user could not tell whether it even worked, because a pass
appears frozen.

**Root cause (measured, not guessed):** `node-llama-cpp` runs 100% on CPU.
`node-llama-cpp inspect gpu` reports the NVIDIA driver present but the **CUDA
runtime missing**, and the installed **Vulkan** prebuilt binary is broken on this
WSL2 system (`Binary GPU type mismatch. Expected: vulkan, got: false`) → it falls
back to CPU. The maintainer's RTX 4060 Ti (8 GB) sits idle.

This is a performance problem, not a correctness bug: the pipeline classifies
correctly (70 unit tests green; a real batch correctly tagged Carrefour→
Alimentation, Uber Eats→Restaurants, SNCF→Transport, etc.).

## De-risking spike (done — proves the approach)

A throwaway bench (`scripts/bench-categorize.ts`) ran the app's real
categorization prompt + parser against the real model:

|                       | CPU (before) | CUDA (after) |
| --------------------- | ------------ | ------------ |
| backend               | `false`      | `"cuda"`     |
| model load            | 4007 ms      | 1611 ms      |
| GPU layers            | 0            | 29 (all)     |
| inference (12 labels) | 11 250 ms    | 1 102 ms     |
| per label             | 938 ms       | 92 ms        |

**~10.2× faster, identical output (deterministic, temp 0).**

Key finding: **no CUDA Toolkit, no apt, no source build needed.** The
`@node-llama-cpp/linux-x64-cuda` prebuilt binary is already installed; it only
needed three runtime libs on the loader path — `libcudart.so.12`,
`libcublas.so.12`, `libcublasLt.so.12` — obtained as PyPI wheels
(`nvidia-cuda-runtime-cu12`, `nvidia-cublas-cu12`) extracted into a gitignored
dir, with `LD_LIBRARY_PATH` pointing at them.

## Non-goals

- **Categorization accuracy.** The model leaves clear cases at `AUCUNE`
  (EDF→Énergie, Salaire, Assurance, abonnements). Real, but a **separate** axis
  (prompt/model) tracked elsewhere — not in scope here.
- Batch-size tuning, label dedup, context reuse. Worthwhile follow-ups, but the
  GPU win (~10×) dwarfs them; deferred.
- Non-NVIDIA GPU acceleration (AMD/Intel via Vulkan). Out of scope; CPU fallback
  covers those machines.

## Design

### Principle: never force the backend in app code

`getLlama()` (`src/main/llm/llm.ts`) already auto-selects the best available
backend and offloads the max layers that fit VRAM. Once the CUDA binary +
runtime libs are present, it picks CUDA automatically and **falls back to CPU on
machines without an NVIDIA GPU**.

- **App code change: minimal.** At most, log the selected backend
  (`llama.gpu`) once at startup for diagnosability. **Do NOT** hard-code
  `gpu:'cuda'` — that would break every non-NVIDIA user. Keep `'auto'`.
- CPU fallback is a hard requirement and must be verified.

### A. Dev path (WSL2) — vendored CUDA runtime libs

The `linux-x64-cuda` prebuilt is already installed. Provide the three runtime
libs without apt / toolkit:

- `scripts/setup-cuda-libs.py`: downloads the manylinux x86_64 wheels for
  `nvidia-cuda-runtime-cu12` + `nvidia-cublas-cu12` from PyPI (stdlib-only fetch,
  no pip required), extracts the `.so` files into a **gitignored** dir
  (`.cuda-libs/`). Idempotent: skips if already present.
- The dev launcher (npm `dev` script / electron.vite env) exports
  `LD_LIBRARY_PATH=<repo>/.cuda-libs:$LD_LIBRARY_PATH` so the CUDA binary resolves
  its deps.
- `.cuda-libs/` (and the spike's `.cuda-spike/`) added to `.gitignore` — the libs
  are ~800 MB and must never be committed.
- Documented in `CONTRIBUTING.md` (one-time `npm run setup:cuda`).

Graceful: if the libs are absent, the app still runs (CPU). The setup script is
opt-in convenience, not a hard dependency.

### B. Packaged Windows path (the maintainer's daily runtime)

- Bundle `@node-llama-cpp/win-x64-cuda` **and** `@node-llama-cpp/win-x64-cuda-ext`
  (the `-ext` package carries the large redistributable cuBLAS DLLs) so a Windows
  machine with only the NVIDIA **driver** needs no CUDA install.
- `electron-builder.yml`: ensure node-llama-cpp's native binaries are
  `asarUnpack`-ed (they cannot load from inside the asar archive), and that the
  CUDA binary packages are included in the build (not pruned).
- Validation is manual on a real Windows build by the maintainer (cannot be
  tested from WSL2): confirm startup logs `backend gpu: cuda` and the ~10×
  speedup, and that a machine without an NVIDIA GPU still falls back to CPU.

### C. Testing & guardrails

- **Keep `scripts/bench-categorize.ts`** (cleaned up) as a perf-regression tool;
  prints backend, load time, per-label inference. Committed.
- Unit tests unaffected (model is mocked).
- Manual validation matrix:
  - WSL2 dev after `setup:cuda` → `backend gpu: cuda`, ~10× speedup.
  - WSL2 dev without libs → CPU fallback, app still works.
  - Windows packaged build (NVIDIA) → `cuda`.
  - (If available) a non-NVIDIA machine → CPU fallback.

### D. Privacy / ADR

Bundling CUDA binaries enlarges the Windows artifact (~hundreds of MB) but
transmits **no data** — fully compatible with ADR-002. No ADR amendment needed;
this spec records the packaging decision.

## Risks & open questions

- **Windows bundling is unverified from here.** If `win-x64-cuda-ext` does not in
  fact ship the needed DLLs, the user may need the NVIDIA CUDA redistributable —
  fallback plan: bundle the cudart/cublas DLLs explicitly via extraResources.
  Resolve during the maintainer's Windows validation.
- **CUDA minor-version compat.** Spike used cudart 12.9 against the b8390
  prebuilt; CUDA 12.x minor-version compatibility makes this safe, but pin a
  known-good wheel version in the setup script.
- **VRAM headroom.** 3B-Q4 (~2 GB) fits the 8 GB card with full offload; no
  partial-offload tuning required.
