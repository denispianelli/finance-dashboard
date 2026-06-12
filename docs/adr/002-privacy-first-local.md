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
