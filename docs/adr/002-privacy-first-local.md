# ADR-002 — Privacy-first local architecture

- **Status** : Accepted
- **Date** : 2026-05-14
- **Category** : Architecture, Security

## Context

Banking data is ultra-sensitive data. The product promise is total confidentiality.

## Decision

The invariant is **no user data ever leaves the machine** — the promise is about data
confidentiality, not a literal absence of network packets. Concretely:

- No network calls from the renderer side (strict CSP `'self'`)
- No network calls from the main side **except** an opt-in version check (sends no user data,
  receives only a version number) and the initial LLM model download
- No telemetry, no analytics — nothing that transmits user or financial data, ever
- 100% local LLM (node-llama-cpp)

A version check leaks only the caller's IP/User-Agent to the release host; it carries no
user data, so it does not violate the invariant. It stays **opt-in** to keep the "100% local"
promise honest for users who want zero outbound traffic.

## Alternatives considered

Any cloud-connected or telemetry-enabled approach — rejected outright as antithetical to the core product promise.

## Consequences

- No multi-machine sync over the network (refined by ADR-017: optional local encrypted
  sync-folder snapshots, transported by the user's own tooling)
- No bank connection (PSD2 — incompatible with the privacy promise)
- No cloud backup (user manages `.fbk` exports)
- Public source code (AGPL) so the user can verify the privacy promise

## Amendment (2026-06-15) — allowed outbound calls updated

The "Decision" list above is updated to reflect two changes since 2026-05-14:

- The **LLM model download** exception is **obsolete** — the embedded model was removed
  (ADR-019); no model is ever downloaded.
- A second opt-in outbound call now exists: an **opt-in, off-by-default market-price feed**
  (**ADR-018**), main-process only. It transmits only a **public instrument identifier**
  (ISIN/ticker) for a holding the user explicitly chose to value online — never balances,
  amounts, positions, or account data.

The invariant is unchanged in spirit (per ADR-009 Amendment 2 §5: about **data, not packets**):
**no third party ever learns anything about the user's finances.** Both outbound calls (version
check, price feed) are opt-in and off by default, so the literal "100% local" promise holds for
anyone who leaves them off.
