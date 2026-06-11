# ADR-004 — LLM model selection

- **Status** : Superseded by ADR-019 (the LLM is removed from the product)
- **Date** : 2026-05-15
- **Category** : LLM, Performance

## Context

The app needs a local LLM for two use cases:

1. **Column mapping** (once per bank): identify the structure of a CSV/PDF bank statement
2. **Transaction categorization**: classify each transaction line into a category

Constraints:

- Runs on CPU (no GPU required)
- Fits in ~2 GB RAM
- Good French language support
- Reliable structured JSON output
- Embeddable via `node-llama-cpp` in Electron (main process)

## Decision

After benchmarking 3 candidates against 2 real LCL bank statements (current account +
joint account, December 2025), we selected **Llama 3.2 3B Instruct Q4_K_M**.

## Alternatives considered

Benchmark run CPU-only (WSL2, Intel i7-10700KF, 16 GB RAM).
See `src/main/llm/README.md` for full measurements.

| Model               | Load     | Avg inference | French | JSON | Verdict |
| ------------------- | -------- | ------------- | ------ | ---- | ------- |
| Qwen2.5 3B Instruct | 4 309 ms | 70 657 ms     | 4/5    | 5/5  | ✅      |
| Phi-3.5 Mini        | 3 426 ms | 156 892 ms    | 4/5    | 2/5  | ❌      |
| Llama 3.2 3B        | 5 963 ms | 56 607 ms     | 5/5    | 5/5  | ✅ 🏆   |

**Phi-3.5 Mini eliminated**: 2.8× slower than Llama and ignores the "strict JSON only"
instruction — outputs correct JSON wrapped in verbose French explanation.

**Llama 3.2 3B selected**: fastest inference, perfectly strict JSON output, native French
terminology (`libelle`, `solde`).

## Consequences

- Installer downloads ~1.9 GB on first launch (GGUF file)
- Column mapping inference time: ~57 s on CPU (i7-10700KF) — GPU times not yet measured
- Runtime memory footprint: ~2 GB
- `node-llama-cpp` handles model download and loading in the main process

## Update (2026-06-08) — hardware-tiered selection

The single pinned model is superseded by a small **registry** with VRAM-based
selection (see `docs/superpowers/specs/archive/2026-06-08-hardware-tiered-model-design.md`):

- **Llama-3.2-3B** remains the universal fallback (CPU / no GPU / < 6 GB VRAM).
- **Qwen2.5-7B-Instruct (Q4_K_M)** is auto-selected on GPUs with ≥ 6 GB total VRAM —
  it categorizes far better (measured 27/37 vs 0/37 of the residual) and the GPU
  work (ADR-002-compatible, opt-in download, main-process-only) makes it fast.

The model **loaded** is the highest-tier model already present on disk; the model
**downloaded** is the VRAM-selected one. Privacy invariant (ADR-002) is unchanged.
