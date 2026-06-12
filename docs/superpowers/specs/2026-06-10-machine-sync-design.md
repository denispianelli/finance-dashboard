# Machine sync — encrypted sync-folder snapshots

- **Date**: 2026-06-10
- **Status**: Validated design (brainstormed with maintainer)
- **Related**: ADR-002 (privacy invariant), design spec §14 (Backup & Export `.fbk`), new ADR-017

## 1. Problem

The maintainer uses the app on two machines (Windows PC and Mac) and wants the same data on
both without manually keeping the two sides up to date. Usage is **alternated** — the app is
never open on both machines at the same time, so "newest snapshot wins" is sufficient; no
merge is needed.

Constraints:

- ADR-002 invariant unchanged: **the app makes zero network calls carrying user data**. The
  app only reads/writes a local folder; transporting that folder between machines is the
  user's own tooling (Syncthing recommended; a personal cloud folder is acceptable because
  the snapshot is encrypted).
- Never sync the live SQLite file (WAL `-wal`/`-shm` corruption risk). Sync goes through
  explicit, atomic, encrypted snapshots.

## 2. Architecture

New main-process module `src/main/sync/`. The renderer does no I/O — settings and status go
through typed IPC, as everywhere else.

```
Machine A (app open)                      Sync folder (Syncthing / personal cloud)
┌─────────────────────┐                   ┌──────────────────┐
│ finance.sqlite (WAL)│ ──snapshot──▶     │ finance.fbk      │
│                     │  on quit +        │ (encrypted blob) │
└─────────────────────┘  after mutations  └──────────────────┘
                          (debounced)              │
                                          user's sync tool replicates
Machine B (on launch)                              ▼
┌─────────────────────┐                   ┌──────────────────┐
│ reads .fbk header   │ ◀────────────     │ finance.fbk      │
│ newer? ──▶ offers restore               └──────────────────┘
└─────────────────────┘
```

- **Write path**: `VACUUM INTO` a temp file (clean copy, independent of the WAL), encrypt,
  then write **atomically** into the sync folder (write tmp + rename). Triggered on app quit
  and after each import / batch of mutations (debounced), plus a manual "Sync now" button.
- **Read path**: on launch, read the plaintext header of `finance.fbk` in the sync folder
  and compare it with a local "last snapshot seen" marker stored in the settings table.

## 3. Snapshot format & crypto

Single file `finance.fbk`, overwritten on each write:

- **Plaintext header**: magic + format version, DB schema version, timestamp, machine name,
  monotonic sequence number, salt, nonce.
- **Encrypted body**: the SQLite copy, encrypted with libsodium XChaCha20-Poly1305
  (`crypto_secretbox`), key derived from the user passphrase with Argon2id. The built-in MAC
  detects corruption or a partially synced file → the app keeps the local DB and warns;
  never silently restore a dubious file.
- **Passphrase**: entered once per machine, stored encrypted at rest with Electron
  `safeStorage` (macOS Keychain / Windows DPAPI). Not re-entered on every launch.

## 4. Restore & conflict handling (alternated usage)

On launch, three cases:

1. **Folder snapshot == last seen** → nothing to do.
2. **Folder snapshot newer, local DB unchanged since last sync** → dialog "Newer data found
   (Mac, yesterday 22:14). Restore?". Before swapping: decrypt to tmp, `PRAGMA
integrity_check`, back up the current DB as `finance.sqlite.bak-<date>`, then replace,
   reopen, run migrations.
3. **Folder snapshot newer AND local DB changed** (forgot to quit / sync tool hadn't
   replicated) → explicit conflict dialog: "Keep this machine" (re-overwrites the folder) or
   "Take the other" (local DB backed up to `.bak` first). No merge — assumed, given
   alternated usage.

Guards:

- Snapshot schema version newer than the app → refuse restore with "update the app on this
  machine".
- Sync folder unavailable → silent skip + status indicator.
- Wrong passphrase → clear error message.

## 5. Settings & UI

New Settings section **"Synchronisation entre machines"** (shadcn/ui, existing pattern):

- **Enable sync** toggle (off by default — opt-in).
- **Sync folder** picker (native OS dialog via main process).
- **Passphrase**: set on activation (with confirmation); the second machine enters the same
  one. Changeable (rewrites the snapshot).
- **Status line**: last snapshot written / last restore, with machine name and timestamp,
  plus a **"Sync now"** button.
- Restore/conflict dialogs at launch are blocking modals shown before the dashboard — the
  user must not work on data that may be overwritten.

## 6. ADR impact

New **ADR-017 "User-managed encrypted sync folder"**: relaxes ADR-002's "No multi-machine
sync (intentional)" into "no network sync by the app; sync via a local encrypted folder the
user transports with their own tooling". Core invariant unchanged — zero network calls
added. ADR-002 gets a cross-reference note.

## 7. Testing

- **Unit**: encrypt/decrypt round-trip (good and wrong passphrase, truncated blob → MAC
  failure), header parsing, conflict state machine (the 3 launch cases + schema-too-new),
  key derivation.
- **Integration**: full snapshot → restore on a temp DB (Vitest, like the import pipeline);
  `VACUUM INTO` while the main DB is open; migrations after restoring a snapshot from an
  older app version.
- **E2E**: one happy path — enable sync, "Sync now", relaunch with a newer injected
  snapshot, accept the restore, verify the data.

## 8. v1 scope (assumed)

- No merge; "newest wins" with explicit conflict dialog.
- Single snapshot file in the folder (no history there — local `.bak` files cover
  rollback).
- `models/` is not synced; each machine downloads its own model.
