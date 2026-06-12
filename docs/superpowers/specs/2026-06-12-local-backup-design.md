# Local rotating backups + read-only JSON export — design

**Date:** 2026-06-12
**Status:** validated (maintainer-approved in session)
**Scope guard:** safety net before real-statement usage. Complements machine sync
(PR #208 / ADR-017), which covers machine loss but keeps a **single** snapshot —
a bad state overwrites the good one within 30 s. This brick adds point-in-time
recovery (human error, bad import, buggy migration) and a long-term-readability
export. No network calls; renderer does no I/O (ADR-002 intact).

**Sequencing:** builds on `main` **after** PR #208 is maintainer-validated and
merged — the restore safety path (`src/main/sync/restore.ts`) is reused, not
duplicated.

## Problem

The maintainer is about to start feeding real bank statements into the app while
the product is still moving fast (bugs, reversals of feature decisions expected).
Failure scenarios and coverage:

1. **Machine loss / multi-machine** → PR #208 (encrypted sync folder). Covered.
2. **Human error or bug corrupting data** → needs _history_: several dated
   snapshots, not one overwritten file. **This is the gap this brick fills.**
3. **App abandonment / 10-year readability** → a flat, human-readable export.
   Export only — no importer.

JSON as a _restore_ mechanism was considered and rejected: rebuilding the DB from
JSON means a versioned importer (IDs, audit trail, transfer pairs, rules,
mappings) tracking every schema change — a large surface for one user, with
silent-corruption risk. Restoring a SQLite snapshot reuses code that already
exists and is tested in #208.

## Design

### 1. Snapshots — `src/main/backup/`

- **Format: plain SQLite** (not encrypted `.fbk`). A backup is a last-resort
  safety net and must depend on no secret: a dated `.sqlite` opens in 10 years
  with any client, without the app, passphrase or keychain. Encryption in #208
  exists because that file _travels_; a local backup does not, and the live DB
  is already plaintext on the same disk. If the backup folder should ever live
  in a cloud folder, point the #208 sync at it instead — that is its job.
- `snapshot.ts`: `VACUUM INTO` a temp file (clean, WAL-independent — same
  pattern as `sync/snapshot.ts`), then atomic move into the backup folder as
  `finance-YYYY-MM-DD_HHmm.sqlite` (time in the name: several snapshots on the
  same day are possible via the pre-import trigger).
- `rotation.ts`: after every successful write, delete the oldest files beyond
  the **15 most recent**.
- `controller.ts` triggers:
  - **App launch**: write a snapshot if none exists for today (before the user
    touches anything).
  - **Before every statement import**: always write one (the riskiest
    operation).
  - Failures (folder unwritable, disk full) surface as a non-blocking toast;
    they never block app usage or the import itself.

### 2. Storage location

Default `<userData>/backups/`, changeable in Settings (same folder-picker
pattern as sync). The backup folder is distinct from the sync folder — the two
roles do not mix. The folder is created on first write.

### 3. Restore

Settings → new « Sauvegardes » section:

- A **« Sauvegarder maintenant »** button (manual snapshot, same write path as
  the automatic triggers).
- Lists snapshots from the backup folder (date, size), newest first, with a
  **Restaurer** button + explicit confirmation dialog.
- **« Restaurer depuis un fichier… »** file picker for a snapshot taken out of
  the folder (e.g. copied from another disk).
- The restore path reuses `sync/restore.ts` safety mechanics: `.bak` copy of
  the current DB, `PRAGMA integrity_check` on the candidate, atomic swap,
  relaunch. Startup migrations bring an older-schema snapshot up to date
  (existing pattern). A candidate **newer** than the app's schema is refused
  with a clear message (downgrade is not supported).
- Restoring a snapshot does **not** touch the machine's sync settings.
- Plain-SQLite candidates are validated as SQLite databases (header +
  `integrity_check`) before any swap; a corrupt file leaves the current DB
  untouched.

### 4. Read-only JSON export

Settings → **« Exporter en JSON… »** → save dialog → one file:

```jsonc
{
  "formatVersion": 1,
  "exportedAt": "2026-06-12T09:30:00.000Z",
  "accounts": [
    /* flat */
  ],
  "categories": [
    /* flat */
  ],
  "transactions": [
    /* flat, with resolved category *name*, not just ID */
  ],
}
```

Purpose: human readability in 10 years. **No importer** — the file is not a
restore format and the app never reads it back.

### 5. IPC

New typed channels (renderer stays I/O-free): `backup:list`, `backup:create`
(manual « Sauvegarder maintenant »), `backup:restore`, `backup:restoreFromFile`,
`backup:exportJson`, `backup:getSettings` / `backup:setFolder`. Mutating
channels join `MUTATING_CHANNELS` where applicable (#208 convention).

## Verification path (north star)

End-of-brick validation script for the maintainer:

1. Launch the app → a dated `.sqlite` appears in `<userData>/backups/`; open it
   with `sqlite3` and compare `SELECT COUNT(*) FROM transactions` with the
   count displayed in the app.
2. Delete one transaction in the app → restore this morning's snapshot →
   the transaction is back.
3. Open the exported JSON and point at one known transaction from a real
   statement (amount + label + category name match the app to the cent).

## Testing

- **Unit:** rotation/retention boundaries, file naming, "already one today"
  trigger logic, JSON export shape (formatVersion, category-name resolution).
- **Integration:** snapshot → restore round-trip; pre-import trigger writes a
  snapshot before rows change; corrupt/non-SQLite candidate is refused and the
  current DB is untouched.
- Restore reuses #208-tested code — no duplicate coverage of crypto/swap
  internals.

## Out of scope

- JSON import / restore-from-JSON (rejected above).
- Encrypted backups, generational (daily/weekly) retention, background
  schedulers — YAGNI for one user; revisit only on a felt need.
- Any cloud or network transport (ADR-002).
