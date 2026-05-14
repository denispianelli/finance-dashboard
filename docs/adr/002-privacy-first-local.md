# ADR-002 — Privacy-first local architecture

- **Status** : Accepted
- **Date** : 2026-05-14
- **Category** : Architecture, Security

## Context

Banking data is ultra-sensitive data. The product promise is total confidentiality.

## Decision

- No network calls from the renderer side (strict CSP)
- No network calls from the main side except Electron updates and initial LLM model download
- No telemetry, no analytics
- 100% local LLM (node-llama-cpp)

## Alternatives considered

Any cloud-connected or telemetry-enabled approach — rejected outright as antithetical to the core product promise.

## Consequences

- No multi-machine sync (intentional)
- No bank connection (PSD2 — incompatible with the privacy promise)
- No cloud backup (user manages `.fbk` exports)
- Public source code (AGPL) so the user can verify the privacy promise

---

_Mirrored from Notion : [ADR-002](https://www.notion.so/360e531ab5ff81a18649fb9c38a1a66c)_
