# Hardware-tiered model selection (adopt Qwen2.5-7B) — design

**Date:** 2026-06-08
**Status:** Proposed
**Related:** ADR-004 (model selection — to receive an addendum), ADR-002 (privacy),
`project-categorization-quality`, `project-llm-gpu-acceleration`,
`project-llm-download-opt-in`.

## Problem

The pinned model (Llama-3.2-3B) is too weak for categorization: on the real
residual it classified **0/37** distinct labels. **Qwen2.5-7B** classified **27/37**
mostly correctly (OpenAI→Abonnements, Cultura→Loisirs, MACDO→Restaurants,
person-transfers→Transferts internes). The maintainer's RTX 4060 Ti (8 GB) runs the
7B comfortably on GPU (~1 s/label). But the model is a **hardcoded constant**
(`MODEL_FILE`), so every machine gets the 3B regardless of capability, and a
7B would be unusable on CPU / small GPUs.

## Goal

Pick the model **automatically from the machine's VRAM**, transparently:

- **CPU / no GPU**, or **total VRAM < 6 GB** → Llama-3.2-3B (current, universal fallback).
- **total VRAM ≥ 6 GB** → Qwen2.5-7B.

No manual setting. Show which model is active. When a better model fits but isn't
downloaded yet, offer it **opt-in** (non-blocking banner) — consistent with the
existing opt-in download ethos; never force a second large download.

## Non-goals

- Manual model override / multi-model management UI (switch, delete) — YAGNI.
- More than two tiers.
- Amount tolerance, prompt changes — the existing French/JSON prompt already works
  with Qwen (verified). No prompt edits.
- Re-tuning the passthrough/dedup logic — unaffected (Qwen still runs through the
  same cascade; passthroughs stay excluded, so Qwen never mis-files PayPal).

## Design (A1 — registry + lazy VRAM selection)

### A. Model registry — `src/main/llm/modelRegistry.ts` (replaces `MODEL_FILE` + `MODEL_MANIFEST`)

```
interface ModelSpec {
  id: string;            // 'llama-3.2-3b' | 'qwen2.5-7b'
  fileName: string;      // gguf filename in modelsDir
  url: string;           // HuggingFace (overridable via FD_MODEL_URL for E2E)
  sha256: string;        // verified after download
  sizeBytes: number;
  label: string;         // user-facing, e.g. "Qwen2.5 7B"
  minVramBytes: number;  // total-VRAM gate
}
```

Two specs:

- **llama-3.2-3b** — existing manifest values (`minVramBytes: 0`, universal fallback).
- **qwen2.5-7b** — `Qwen2.5-7B-Instruct-Q4_K_M.gguf`,
  url `https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf`,
  sha256 `65b8fcd92af6b4fefa935c625d1ac27ea29dcb6ee14589c55a8f115ceaaa1423`,
  sizeBytes `4683074240`, `minVramBytes: 6 * 1024**3`.

The `FD_MODEL_*` E2E overrides are preserved (now per-spec, or applied to the
selected spec).

### B. Selection — pure, testable

`selectModelSpec(gpu: string | false, vramTotalBytes: number): ModelSpec`

- `gpu === false` → 3B (7B on CPU is too slow).
- else → the highest-`minVramBytes` spec with `minVramBytes <= vramTotalBytes`
  (≥6 GB → Qwen-7B, else 3B). Decision uses **total** VRAM (stable capability), not
  free (fluctuates).

### C. Lazy, cached hardware detection

`getActiveSelection(): Promise<ModelSpec>` — first call only: `getLlama()` →
`getVramState()` → `selectModelSpec(llama.gpu, vram.total)`; cached for the process.
Runs **lazily** (first time the model name/size is needed or first categorization),
**not at launch** — preserves the "no native addon on the hot path / launch"
invariant (it loads the backend addon, never the multi-GB model).

### D. Model layer keys off the selection

`resolveModelPath(dir, spec)`, `isModelAvailable(dir, spec)`, the download, and
`getModel` take the selected `ModelSpec`. **Model actually loaded** = the selected
spec if its file is present; else the best _present_ spec (so the app works
immediately); else "absent".

### E. Status, download & UX

Extend `ModelStatus` (`src/shared/types/model.ts`) with the active/selected model and
an optional upgrade offer:

- Download (opt-in, existing flow) targets the **selected** spec; the prompt shows its
  label + size.
- **Upgrade banner** (non-blocking): shown when the selected spec is absent but a
  lesser spec is present → "A better model is available for your machine (Qwen2.5-7B,
  ~4.4 GB) — download". Reuses the existing download mechanism.
- The model/settings area shows **which model is active** (transparency).

### F. ADR-004 addendum

Add an "Update (2026-06-08)" section to `docs/adr/004-*` recording the tiering:
3B remains the universal/CPU fallback; Qwen-7B is auto-selected on ≥6 GB-VRAM GPUs.
Privacy invariant unchanged (the 7B GGUF downloads from HuggingFace via the same
opt-in, main-process-only path; no user data leaves).

## Data flow

```
first need → getActiveSelection(): getLlama → gpu + vram.total → selectModelSpec
   4060 Ti (8GB, cuda)  → Qwen-7B
   no GPU / <6GB        → Llama-3B
model to load = selected if present, else best present, else absent
fresh install / opt-in → download the SELECTED spec (sha256-verified)
selected absent + lesser present → upgrade banner (opt-in)
```

## Testing

- `selectModelSpec`: `gpu=false`→3B; `vram=4GB`→3B; `vram=8GB`→Qwen-7B; boundary `=6GB`→Qwen-7B.
- Registry: every spec has a unique `fileName`/`id`; sha256/size present.
- "load best present" resolution: selected present → selected; selected absent + 3B
  present → 3B + `upgradeAvailable`; none present → absent.
- Download targets the selected spec; sha256 mismatch handling unchanged
  (existing `download.ts` tests still pass).
- VRAM detection is mocked in unit tests (no real GPU dependency); the real
  `getVramState` call is exercised manually.

## Risks

- **Metal (Apple Silicon) unified memory:** `getVramState().total` may report a large
  shared figure → could over-select 7B on a weak Mac. Apple Silicon generally runs 7B
  fine, but the 6 GB threshold may need Metal-specific tuning. Mac is secondary/untested
  — flag for the maintainer's Mac validation.
- **`getVramState` availability/shape** in node-llama-cpp 3.x — confirm the API during
  implementation; fall back to 3B if detection throws.
- **Lazy detection timing:** must not load the backend addon at launch; verify the
  download prompt/status path stays light until the user acts or categorization runs.
