# LLM Model — Spike Results

## Date

<!-- À remplir après le benchmark -->

## Setup

- Machine : <!-- CPU, RAM, OS — ex: Intel Core i7-12700H, 16 GB RAM, WSL2 Ubuntu 22.04 -->
- Quantization : Q4_K_M pour tous les candidats
- Prompt : identification des colonnes d'un relevé bancaire → JSON strict

## Candidates

| Model               | Size   | Load time | Avg inference | French quality | JSON quality | Verdict |
| ------------------- | ------ | --------- | ------------- | -------------- | ------------ | ------- |
| Qwen2.5 3B Instruct | 2.0 GB | ms        | ms            | /5             | /5           |         |
| Phi-3.5 Mini        | 2.4 GB | ms        | ms            | /5             | /5           |         |
| Llama 3.2 3B        | 2.0 GB | ms        | ms            | /5             | /5           |         |

## Chosen model

<!-- **[Nom du modèle]** — raison : ... -->

## Sources

- Qwen2.5 3B : https://huggingface.co/bartowski/Qwen2.5-3B-Instruct-GGUF
- Phi-3.5 Mini : https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF
- Llama 3.2 3B : https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF
