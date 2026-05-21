# ADR-001 — Electron over Tauri

- **Status** : Accepted
- **Date** : 2026-05-14
- **Category** : Architecture

## Context

The app is a desktop client using React/shadcn/ui and embedding an LLM via `node-llama-cpp`. Two main options: Electron (mature, heavy) or Tauri (lightweight, requires Rust).

## Decision

**Electron** is chosen.

## Alternatives considered

### Tauri (Rust-based desktop framework with WebView)

Tauri was evaluated as the primary alternative. It offers a significantly smaller installer footprint and uses the OS-native WebView instead of bundling Chromium.

**Rejected because:**

- Requires Rust expertise that the team does not have, adding a second language to the stack
- `node-llama-cpp` and `better-sqlite3` depend on Node.js native bindings that do not integrate cleanly in a Tauri/Rust host
- shadcn/ui (React) works natively in Electron's Node + Chromium environment with no bridging overhead
- Tauri's cross-platform native WebView can behave inconsistently across OS versions, whereas Electron's bundled Chromium guarantees a uniform rendering surface
- Installer size is not a meaningful differentiator given a ~2 GB LLM model is downloaded at first launch regardless

## Consequences

- Installer ~150 MB + 2 GB LLM model
- Dependency on Chromium (security updates to track)
- Native builds (`better-sqlite3`, `node-llama-cpp`) → multi-OS CI required from the start
