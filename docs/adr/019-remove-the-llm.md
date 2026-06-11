# ADR-019 — Remove the embedded LLM

- **Status** : Accepted
- **Date** : 2026-06-11
- **Category** : LLM, Product, Architecture
- **Supersedes** : ADR-004 (model selection), ADR-013 (LLM batch categorization)
- **Related** : ADR-003 (deterministic extraction — unchanged, now the whole story),
  ADR-005 (mandatory human review — unchanged), ADR-009 (scope guard — amended by this ADR)

## Context

The LLM was integrated for two jobs: classify the categorization **residual** (labels the
deterministic history + rules cascade does not know yet) and infer the **column mapping** of
an unknown bank's statement (once per bank). Both were fully built out: opt-in model download
(#163), CUDA offload (#168), label dedup (#170), passthrough amounts (#173), hardware-tiered
models up to Qwen-7B (#174), active-model transparency (#175), automatic non-blocking passes
with a per-model failure memory (#207).

After living with the result, the cost/benefit is structurally unbalanced:

- **The value decays over time.** Every manual correction feeds the history tier, so the
  residual shrinks month after month — steady state is a handful of new merchants per month,
  classified by hand in under a minute. Bank mapping fires roughly once per bank, i.e.
  almost never for a personal tool, and was only ever validated against one test bank
  (Société Générale) besides the hard-coded LCL parser.
- **The cost does not decay.** 1.9–4.4 GB model artifacts, VRAM-dependent model tiering,
  GPU/CPU backend differences, and a recurring platform-fragility class: on 2026-06-11 the
  CPU inference path was diagnosed as crashing the Electron binary outright on Linux/WSL
  (multi-GiB weight allocation vs Chromium's allocator), requiring a CUDA-runtime
  workaround. Every Electron or `node-llama-cpp` upgrade re-rolls that dice.
- **Inference quality itself required dedicated infrastructure**: #207 exists because the
  model answers "AUCUNE" often enough that the app needs a per-model memory of failures to
  avoid re-asking forever. That is machinery built to manage the component's weakness, not
  its strength.
- **The reference tool does without.** Portfolio Performance — the benchmark for this app's
  next chapter (patrimoine, TRI) — uses zero ML: deterministic per-bank importers and
  rule-based categorization, with per-transaction duplicate flags (a model we already
  adopted in #210). Its import quality is the standard users actually praise.

## Decision

**Remove the LLM from the product entirely.** Deterministic replacements:

1. **Categorization** — keep the cascade (history → seed rules) and strengthen it:
   one-click _create a rule from this correction_ in the transactions view, so a manual fix
   compounds instead of evaporating. The residual is categorized by hand — which the
   history tier then remembers.
2. **New-bank import** — replace LLM column inference with a **manual mapping assistant**:
   the user points at the date / amount / label columns of a sample statement once; the
   mapping is persisted per bank (same persistence as today's learned banks). Deterministic,
   instant, no download.
3. **Everything else is already deterministic** (extraction ADR-003, review ADR-005,
   dedup ADR-006/#210, reports, patrimoine ADR-009 Amendment 2) and is not touched.

**Scope guard (amends ADR-009):** the LLM clause is replaced by "the app embeds no ML model".
The expansion ideas evaluated to justify keeping it — budget recommendations, generative
insights — stay cut, and ADR-009's original reasoning still holds: a small quantized model
reasoning over financial figures hallucinates with confidence, and the genuinely useful
insights (recurring charges, subscription price increases, spend vs baseline, percentile
budgets) are exact computations that need no model.

**Privacy invariant tightens:** once removal lands, the only outbound call left in the app
is the opt-in version check (the model download disappears).

## Alternatives considered

- **Status quo (keep the batch classifier).** Rejected: value trends to zero while the
  maintenance and platform risk stay constant; it also keeps 2–4 GB of artifacts and a GPU
  story in a personal finance tool that otherwise needs neither.
- **Freeze without removal.** Considered as a transition state, rejected as an end state:
  the fragility class (Electron × native binding) bites on upgrades even with zero feature
  work, and packaging keeps paying the size cost.
- **Expand the LLM's role (budgets, insights) to justify it.** Rejected — see Decision;
  this inverts the burden of proof (features must justify components, not the reverse) and
  was already cut by ADR-009.

## Consequences

Easier: packaging (no model assets, no `node-llama-cpp` native binding), a simpler privacy
story, no VRAM/hardware tiering, a whole platform-fragility class gone, and the codebase
sheds the model-download UX, backend detection and pass orchestration.

Harder / lost: brand-new labels are no longer auto-categorized (mitigated by
rule-from-correction and the naturally shrinking residual); adding an unknown bank requires
a one-time manual mapping instead of an automatic inference (mitigated by the assistant —
and the automatic path had a single validated bank anyway).

Implementation is phased in follow-up PRs (this ADR decides direction only; until removal
lands the classifier stays frozen — no further LLM investment):

1. Rule-from-correction UX + manual mapping assistant (replacements land first).
2. Remove the LLM code paths: categorization pass, learnBank inference, model download UI
   and settings, hardware detection; drop the `llm_attempts` table; prune `models/` on
   upgrade (reuse the #175 auto-prune machinery).
3. Docs: README, CLAUDE.md scope guard (done in this PR), supersede notes on ADR-004/013.

Risks: none new — every removed behavior has a deterministic replacement that ships before
or with the removal.
