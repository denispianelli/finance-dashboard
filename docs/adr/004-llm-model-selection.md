# ADR-004 — LLM model selection

- **Status** : Accepted
- **Date** : <!-- À remplir -->
- **Category** : LLM, Performance
- **Supersedes** : ADR-004 (Proposed, in Notion)

## Context

L'app a besoin d'un LLM local pour deux usages :

1. **Mapping des colonnes** (1× par banque) : identifier la structure d'un relevé CSV/PDF
2. **Catégorisation des transactions** : classer chaque ligne dans une catégorie

Contraintes :

- Tourne sur CPU (pas de GPU requis)
- Tient dans ~2 GB de RAM
- Bon français
- Bonne sortie JSON structurée
- Intégrable via `node-llama-cpp` dans Electron (main process)

## Decision

<!-- Après le benchmark, remplacer cette ligne par : -->
<!-- Après avoir benchmarké 3 candidats sur de vrais relevés bancaires, nous avons retenu **[modèle]** en quantization Q4_K_M. -->

## Alternatives considered

<!-- Remplir avec les résultats mesurés — voir src/main/llm/README.md -->

| Model               | Load | Inference | French | JSON | Verdict |
| ------------------- | ---- | --------- | ------ | ---- | ------- |
| Qwen2.5 3B Instruct | Xms  | Xms       | X/5    | X/5  |         |
| Phi-3.5 Mini        | Xms  | Xms       | X/5    | X/5  |         |
| Llama 3.2 3B        | Xms  | Xms       | X/5    | X/5  |         |

## Consequences

- L'installeur télécharge ~X GB au premier lancement
- Temps d'inférence par relevé : ~Xs
- Latence de catégorisation par transaction : ~Xms
- Empreinte mémoire à l'exécution : ~X GB
