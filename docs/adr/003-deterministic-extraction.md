# ADR-003 — Deterministic extraction over LLM for numbers

- **Status** : Accepted
- **Date** : 2026-05-14
- **Category** : Data, LLM

## Context

First instinct: use an LLM to parse PDFs (flexible, multi-bank). But LLMs hallucinate — unacceptable for financial data.

## Decision

- Deterministic extraction via `pdfjs-dist` (text + x/y coordinates) to reconstruct the table
- The LLM intervenes only for:
  - Mapping columns the **first time** a bank is encountered (then cached)
  - Categorizing transactions (no confidence score — see ADR-005)
- Arithmetic verification: `opening_balance + Σcredits - Σdebits == closing_balance` — otherwise import is blocked
- Mandatory Review page before any INSERT

## Alternatives considered

Using an LLM to parse raw PDF text directly — rejected due to hallucination risk on financial figures.

## Consequences

- Faster (LLM rarely invoked)
- Zero hallucination on figures (deterministic guarantee)
- Requires text-based PDF (otherwise OCR via Tesseract on demand)
- LLM column mapping must be cached durably
