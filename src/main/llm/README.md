# LLM Model — Spike Results

## Date

2026-05-15

## Setup

- Machine: Intel Core i7-10700KF @ 3.80 GHz, 16 GB RAM, NVIDIA RTX 4060 Ti 8 GB
- OS: WSL2 (Ubuntu) — test ran CPU-only (Vulkan not available in WSL2)
- Quantization: Q4_K_M for all candidates
- Fixtures: 2 real LCL bank statements (current account + joint account, December 2025)
- Prompt: identify columns in a bank statement → strict JSON output

## Candidates

| Model               | Size   | Load time | Avg inference | French quality | JSON quality | Verdict |
| ------------------- | ------ | --------- | ------------- | -------------- | ------------ | ------- |
| Qwen2.5 3B Instruct | 1.8 GB | 4 309 ms  | 70 657 ms     | 4/5            | 5/5          | ✅      |
| Phi-3.5 Mini        | 2.2 GB | 3 426 ms  | 156 892 ms    | 4/5            | 2/5          | ❌      |
| Llama 3.2 3B        | 1.9 GB | 5 963 ms  | 56 607 ms     | 5/5            | 5/5          | ✅ 🏆   |

### Notes per model

**Qwen2.5 3B** — Clean, strict JSON with no extra text. Uses English keys (`label`,
`balance`) despite a French prompt.

**Phi-3.5 Mini** — Slowest (2.8× Llama). Did not follow the "strict JSON" instruction:
outputs correct JSON but wrapped in verbose French explanation. Eliminated.

**Llama 3.2 3B** — Fastest, perfectly strict JSON, and spontaneously uses French banking
terms (`libelle`, `solde`). Best candidate for a French-language banking app.

## Chosen model

**Llama 3.2 3B Instruct Q4_K_M** — fastest on CPU, strict JSON output with no drift,
native French terminology. Reasonable size (1.9 GB).

## Sources

- Qwen2.5 3B: https://huggingface.co/bartowski/Qwen2.5-3B-Instruct-GGUF
- Phi-3.5 Mini: https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF
- Llama 3.2 3B: https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF
