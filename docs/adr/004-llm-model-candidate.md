# ADR-004 — LLM model candidate

- **Status** : Proposed
- **Date** : 2026-05-14
- **Category** : LLM, Performance

## Context

A local LLM model is needed that:

- Runs on average CPU without GPU
- Understands French well
- Excels at structured JSON extraction
- Fits within ~2 GB max

## Decision (provisional)

**Qwen2.5 3B Instruct** quantized to Q4_K_M (~2 GB).

## Alternatives considered

- Phi-3.5 Mini (Microsoft) — good reasoning, decent French
- Llama 3.2 3B (Meta) — solid generalist
- Mistral 7B — too heavy (~4–5 GB RAM)

## Spike required before finalizing

1–2 days, on 3 real PDFs:

- Column mapping quality
- French categorization quality
- CPU speed
- RAM usage

After the spike, move this ADR to Accepted or create a new ADR if the model changes.

## Consequences

- ~2 GB download on first launch
- Must be benchmarked on a representative set of French bank PDFs before being accepted

---

_Mirrored from Notion : [ADR-004](https://www.notion.so/360e531ab5ff81179b35d801413a1553)_
