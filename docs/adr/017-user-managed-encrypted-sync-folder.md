# ADR-017 — User-managed encrypted sync folder

- **Status** : Accepted
- **Date** : 2026-06-10
- **Category** : Architecture, Security

## Context

The maintainer uses the app on two machines (PC and Mac), alternately, and wants the same
data on both without manual export/import on every switch. ADR-002 declared "No multi-machine
sync (intentional)" — that line was about network sync and cloud backends, which remain
forbidden.

## Decision

The app writes an **encrypted snapshot** (`finance.fbk`: XChaCha20-Poly1305, key derived from
a user passphrase with Argon2id, passphrase stored at rest via Electron `safeStorage`) into a
**user-chosen local folder** on quit and after data changes (debounced). On launch, if that
folder holds a snapshot this machine has not seen, the app offers to restore it (local backup
first, `PRAGMA integrity_check` before swap). Conflicts (local changes + unseen snapshot) get
an explicit keep-local / take-other dialog; no merge ("alternated use" model).

**Transporting the folder between machines is the user's own tooling** (Syncthing
recommended; a personal cloud folder is acceptable because the content is an opaque encrypted
blob). The app gains **zero network calls** — the ADR-002 invariant ("no user data ever
leaves the machine _via the app_") is unchanged.

The live SQLite file is never synced (WAL corruption risk); snapshots are clean `VACUUM INTO`
copies written atomically.

## Alternatives considered

- Manual `.fbk` export/import only (design spec §14): safe but defeats the goal — a manual
  action on every machine switch.
- In-app LAN peer-to-peer sync: introduces networking into the app and re-implements what
  Syncthing already does well. Rejected.

## Consequences

- ADR-002's "No multi-machine sync (intentional)" is refined: still no _network_ sync by the
  app; folder-based, user-transported sync is supported.
- The snapshot doubles as the encrypted backup format envisioned in design spec §14.
- `models/` is not synced; each machine downloads its own model.
- Design: `docs/superpowers/specs/2026-06-10-machine-sync-design.md`.
