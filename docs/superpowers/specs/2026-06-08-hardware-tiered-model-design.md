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

---

## Phase B — concrete design (2026-06-08)

Phase A shipped the engine (registry, `selectModelSpec`, `getActiveSelection`,
best-present load, selected-spec download). Phase B is the **status surface + UX**, and
it also closes a correctness gap Phase A left: the UI hardcodes "~1,9 Go" / "Llama 3.2
3B" in four places, now wrong whenever Qwen-7B is the active/selected model.

**Maintainer decisions (locked):** upgrade banner lives in **Réglages only**; after an
upgrade the old (lower-tier) model is **auto-removed**; the active-model display shows
**name + real size** (no backend/CPU-GPU line — deferred).

### B1. The launch invariant shapes everything

`model:status` is polled at app launch (`AppShell` → `useModelStatus`), and hardware
detection (`getActiveSelection` → `getLlama`) loads the native backend. So detection
**must never** sit on the status path. Status splits into:

- **Sync part** (always available, zero detection): `state`, progress, and `active` —
  the best-present model's name + real size, from `findBestPresentModel` + its registry
  spec. This alone fixes the "1,9 Go" lie everywhere.
- **Lazy part** (only after a user-initiated trigger): `target` (the selected download
  spec) and `upgrade`. Resolved by a new `detectSelection()` that the **Settings page**
  and the **PDF-required dialog flow** call on mount/open — both post-launch, user-driven.

### B2. `ModelStatus` extension (`src/shared/types/model.ts`)

```ts
export interface ModelInfo {
  id: string; // registry id, e.g. 'qwen2.5-7b'
  label: string; // 'Qwen2.5 7B'
  sizeBytes: number; // real size, formatted via existing formatModelSize()
}

export interface ModelStatus {
  state: ModelState;
  receivedBytes?: number;
  totalBytes?: number;
  error?: string;
  active?: ModelInfo; // best-present model (SYNC) — drives "Présent · {label} · {size}"
  target?: ModelInfo; // download target: cached selection once detected, else fallbackModel()
  upgrade?: ModelInfo; // set ONLY when ready + selection is a better, not-yet-downloaded model → banner
}
```

### B3. Controller changes (`src/main/llm/downloadController.ts`)

- Hold `let selected: ModelSpec | null = null`.
- New `detectSelection(): Promise<void>` → `selected = await getActiveSelection(); emit();`
  (lazy; the resolved status reaches the renderer via the existing `subscribe →
model:progress` push — no new push channel needed).
- `getStatus()` enriches the sync status:
  - `active` = `findBestPresentModel(dir)` → `ModelInfo` (omitted when none present).
  - `target` = `(selected ?? fallbackModel())` → `ModelInfo`.
  - `upgrade` = set iff `state === 'ready'` AND `selected` is resolved AND `selected`'s
    file is **absent** AND `selected` is a **higher tier** than `active` (i.e. the user
    has the 3B, the machine wants the 7B, the 7B isn't downloaded). "Higher tier" =
    earlier index in `MODELS` (best-first).
- New `pruneToBestPresent()`: after **every successful** download (`res.ok`, before
  `set(null)`), delete every present model file (and `.part`) except the highest-tier
  present one. First download → no-op; 3B→7B upgrade → removes the 3B. Idempotent
  invariant: **only the best-present model is ever kept on disk.**

### B4. IPC — one new lazy channel

- `channels.ts`: `modelDetectSelection: 'model:selection:detect'`.
- `ipc.ts` contract: `'model:selection:detect': { payload: Record<string, never>;
response: { ok: true } }`.
- `handlers/model.ts`: `handleModelDetectSelection()` → `await
modelController.detectSelection(); return { ok: true }`. (Result lands via the existing
  `model:progress` push; the invoke just triggers + acks.)
- `register.ts`: wire it. No preload change (generic `invoke`).

### B5. Renderer

- **`ModelSettingsSection.tsx`** — drive all copy from `status`:
  - `ready`: `Présent · {active.label} · ~{formatModelSize(active.sizeBytes)}`.
  - `absent`/`paused`: button copy from `target` (`Télécharger {target.label}
(~{size})` / `Reprendre`).
  - `ready` **and** `status.upgrade`: render a non-blocking **upgrade banner** beneath
    the present chip — "Un meilleur modèle est disponible pour ta machine —
    {upgrade.label} (~{size})" + a download button calling `onDownload` (same handler;
    `start()` fetches the selected spec, then `pruneToBestPresent` removes the 3B).
  - Remove the hardcoded "~1,9 Go".
- **`SettingsPage.tsx`** — the model-name line (currently hardcoded "Llama 3.2 3B
  Instruct · Q4_K_M") shows `active.label` when present else `target.label`; trigger
  `ipc.invoke('model:selection:detect', {})` once on `ModelSection` mount (lazy, so
  `target`/`upgrade` resolve while the user is on Settings).
- **PDF flow** — `ImportModal` triggers `detect` when it opens `PdfModelRequiredDialog`
  and passes the model size label (from `modelStatus.target`) into the dialog;
  `PdfModelRequiredDialog` takes a `sizeLabel` prop instead of the hardcoded "~1,9 Go".

### B6. Testing

- `downloadController`: `getStatus()` includes `active` from best-present (sync, no
  detection); after `detectSelection()` mock resolves to 7B with only 3B present →
  `upgrade` set; with 7B present → no `upgrade`; `pruneToBestPresent` removes the 3B
  when the 7B is present, no-ops when only one model present.
- `selectModelSpec` / tier-ordering already covered (Phase A).
- Renderer (jsdom): `ModelSettingsSection` shows `active.label`+size when ready; renders
  the upgrade banner only when `upgrade` present; download button copy from `target`.

### B7. Out of scope (Phase B)

- Backend (CPU/GPU/CUDA) transparency line — deferred (needs gpu plumbed into status).
- Manual model switch/override UI. Mac/Metal VRAM-threshold tuning (separate validation).
