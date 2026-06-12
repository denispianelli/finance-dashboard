# Local Rotating Backups + Read-Only JSON Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Point-in-time recovery (rotating plain-SQLite snapshots, restore) plus a read-only JSON export, per `docs/superpowers/specs/2026-06-12-local-backup-design.md`.

**Architecture:** A `src/main/backup/` module mirrors the `src/main/sync/` structure: pure snapshot/rotation/restore/export functions + a thin electron-wired controller. Restore reuses the swap safety mechanics extracted from `sync/restore.ts`. Renderer talks only typed IPC (ADR-002/007); the Settings page already has placeholder rows to replace.

**Tech Stack:** Electron main (`node:sqlite` `DatabaseSync`, `VACUUM INTO`), typed IPC contract in `src/shared/types/ipc.ts`, React + shadcn/sonner in the renderer, Vitest 4.

**Conventions (this repo):**

- Branch: `feat/local-backup` (no issue number needed in MVP mode). Work in a worktree via the `EnterWorktree` tool.
- TS strict; no `any`; `noUncheckedIndexedAccess` is on (index access yields `T | undefined`).
- Renderer test files need `// @vitest-environment jsdom` **plus** explicit `afterEach(() => { cleanup(); })`.
- Pre-commit reformats staged files (lint-staged); if the commit fails on re-formatting, `git add -A` and retry.
- Run unit tests with `npx vitest run tests/unit/backup -t '<name>'` or whole files; pre-push runs typecheck + all tests.
- Commit the plan file itself in the first commit of the branch.

**Deviations from the spec (deliberate, small):** `backup:list` + `backup:getSettings` are merged into one `backup:getStatus` channel (the UI always needs both together). The launch-trigger failure surfaces in the Settings status (persisted last error is YAGNI — kept in-memory) instead of a toast; the pre-import failure surfaces as a real toast via a response flag.

---

## File structure

| File                                                                | Responsibility                                               |
| ------------------------------------------------------------------- | ------------------------------------------------------------ |
| `src/shared/types/backup.ts` (create)                               | DTOs + result unions for backup IPC                          |
| `src/shared/types/ipc.ts` (modify)                                  | Channel contract entries                                     |
| `src/main/ipc/channels.ts` (modify)                                 | Channel name constants                                       |
| `src/main/backup/snapshot.ts` (create)                              | File naming + `VACUUM INTO` snapshot write                   |
| `src/main/backup/rotation.ts` (create)                              | List/parse backup files, daily check, prune to 15            |
| `src/main/backup/state.ts` (create)                                 | `backup.folderPath` override in `app_settings`               |
| `src/main/sync/restore.ts` (modify)                                 | Extract `swapInValidatedCandidate` (shared swap mechanics)   |
| `src/main/backup/restore.ts` (create)                               | Restore the live DB from a plain `.sqlite` file              |
| `src/main/backup/exportJson.ts` (create)                            | Build + write the read-only JSON export                      |
| `src/main/backup/controller.ts` (create)                            | Triggers, folder resolution, electron-wired singleton        |
| `src/main/ipc/handlers/backup.ts` (create)                          | IPC handlers incl. dialogs                                   |
| `src/main/ipc/register.ts` (modify)                                 | Register channels; restore channels join `MUTATING_CHANNELS` |
| `src/main/index.ts` (modify)                                        | Launch trigger                                               |
| `src/main/ipc/handlers/importConfirm.ts` (modify)                   | Pre-import snapshot + response flag                          |
| `src/renderer/hooks/useImport.ts` (modify)                          | Warning toast on pre-import backup failure                   |
| `src/renderer/components/backup/BackupSettingsSection.tsx` (create) | Settings UI                                                  |
| `src/renderer/pages/SettingsPage.tsx` (modify)                      | Replace placeholder rows                                     |

---

### Task 1: Shared types + channel names

**Files:**

- Create: `src/shared/types/backup.ts`
- Modify: `src/shared/types/ipc.ts`
- Modify: `src/main/ipc/channels.ts`

- [ ] **Step 1: Create `src/shared/types/backup.ts`**

```ts
/** One snapshot file in the backup folder. */
export interface BackupFileInfo {
  fileName: string;
  /** ISO timestamp parsed from the file name (local time, seconds = 00). */
  createdAt: string;
  sizeBytes: number;
}

/** What the Settings UI needs to render the backup section. */
export interface BackupStatusView {
  folderPath: string;
  /** Newest first. */
  backups: BackupFileInfo[];
  /** Human-readable message of the last failed automatic snapshot, null if none. */
  lastError: string | null;
}

export type BackupCreateResult =
  | { ok: true; fileName: string }
  | { ok: false; error: 'write_failed' };

export type BackupRestoreResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | 'file_unavailable'
        | 'not_a_database'
        | 'integrity_failed'
        | 'schema_too_new'
        | 'cancelled';
    };

export type BackupExportResult =
  | { ok: true; path: string }
  | { ok: false; error: 'write_failed' | 'cancelled' };
```

- [ ] **Step 2: Add the channel contract entries to `src/shared/types/ipc.ts`**

Add to the type imports at the top:

```ts
import type {
  BackupStatusView,
  BackupCreateResult,
  BackupRestoreResult,
  BackupExportResult,
} from './backup';
```

Add inside `interface IpcContract`, next to the `sync:*` entries:

```ts
  'backup:getStatus': { payload: Record<string, never>; response: BackupStatusView };
  'backup:pickFolder': {
    payload: Record<string, never>;
    response: { cancelled: true } | { cancelled: false; path: string };
  };
  'backup:setFolder': { payload: { folderPath: string }; response: { ok: true } };
  'backup:create': { payload: Record<string, never>; response: BackupCreateResult };
  'backup:restore': { payload: { fileName: string }; response: BackupRestoreResult };
  'backup:restoreFromFile': { payload: Record<string, never>; response: BackupRestoreResult };
  'backup:exportJson': { payload: Record<string, never>; response: BackupExportResult };
```

Also extend the ok-variant of `ConfirmResponse` (used by Task 8):

```ts
export type ConfirmResponse =
  | {
      ok: true;
      importId: string;
      insertedCount: number;
      skippedCount: number;
      /** Present when the pre-import backup snapshot failed (import still done). */
      preImportBackupFailed?: true;
    }
  | {
      /* ...ok:false variant unchanged... */
    };
```

- [ ] **Step 3: Add the channel names to `src/main/ipc/channels.ts`**

```ts
  backupGetStatus: 'backup:getStatus',
  backupPickFolder: 'backup:pickFolder',
  backupSetFolder: 'backup:setFolder',
  backupCreate: 'backup:create',
  backupRestore: 'backup:restore',
  backupRestoreFromFile: 'backup:restoreFromFile',
  backupExportJson: 'backup:exportJson',
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean (channels.ts satisfies `Record<string, IpcChannel>` only once the contract entries exist — order of steps matters).

- [ ] **Step 5: Commit (include the plan file)**

```bash
git add src/shared/types/backup.ts src/shared/types/ipc.ts src/main/ipc/channels.ts docs/superpowers/plans/2026-06-12-local-backup.md
git commit -m "feat(backup): add IPC types and channel names for local backups"
```

---

### Task 2: Snapshot writer — `src/main/backup/snapshot.ts`

**Files:**

- Create: `src/main/backup/snapshot.ts`
- Test: `tests/unit/backup/snapshot.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { backupFileName, writeBackupSnapshot } from '../../../src/main/backup/snapshot';

let dir: string;
let folder: string;
let db: DatabaseSync;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fd-backup-'));
  folder = join(dir, 'backups'); // does not exist yet — write must create it
  db = new DatabaseSync(join(dir, 'source.sqlite'));
  db.exec('PRAGMA journal_mode = WAL');
  runMigrations(db);
  db.prepare(
    "INSERT INTO accounts (id, name, type, bank_id, currency) VALUES ('acc-1','Backup Test','checking',NULL,'EUR')",
  ).run();
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('backupFileName', () => {
  it('formats local date and time with zero padding', () => {
    expect(backupFileName(new Date(2026, 5, 3, 9, 7))).toBe('finance-2026-06-03_0907.sqlite');
  });
});

describe('writeBackupSnapshot', () => {
  it('creates the folder, writes a valid SQLite copy, leaves no tmp file', () => {
    const res = writeBackupSnapshot(db, folder, new Date(2026, 5, 12, 10, 30));
    expect(res).toEqual({ fileName: 'finance-2026-06-12_1030.sqlite', skipped: false });
    const copy = new DatabaseSync(join(folder, res.fileName), { readOnly: true });
    const row = copy.prepare('SELECT COUNT(*) AS n FROM accounts').get() as { n: number };
    copy.close();
    expect(row.n).toBe(1);
    expect(readdirSync(folder)).toEqual([res.fileName]); // no leftover tmp
  });

  it('skips when a snapshot for the same minute already exists', () => {
    const when = new Date(2026, 5, 12, 10, 30);
    writeBackupSnapshot(db, folder, when);
    const res = writeBackupSnapshot(db, folder, when);
    expect(res.skipped).toBe(true);
  });

  it('propagates fs errors (unwritable folder)', () => {
    expect(() => writeBackupSnapshot(db, join(dir, 'source.sqlite'), new Date())).toThrow();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`Cannot find module '../../../src/main/backup/snapshot'`)

Run: `npx vitest run tests/unit/backup/snapshot.test.ts`

- [ ] **Step 3: Implement `src/main/backup/snapshot.ts`**

```ts
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

/** `finance-YYYY-MM-DD_HHmm.sqlite`, local time (spec §1). */
export function backupFileName(now: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const date = `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `finance-${date}_${pad(now.getHours())}${pad(now.getMinutes())}.sqlite`;
}

export interface WriteBackupResult {
  fileName: string;
  /** True when a snapshot for the same minute already existed (nothing written). */
  skipped: boolean;
}

/**
 * VACUUM INTO a tmp name inside the backup folder (clean, WAL-independent
 * copy — same pattern as sync/snapshot.ts), then rename atomically.
 * Same-minute target already present → skip: it captures the same state.
 * Throws on fs/SQLite errors — callers map that to a user-facing result.
 */
export function writeBackupSnapshot(
  db: DatabaseSync,
  folderPath: string,
  now: Date = new Date(),
): WriteBackupResult {
  mkdirSync(folderPath, { recursive: true });
  const fileName = backupFileName(now);
  const target = join(folderPath, fileName);
  if (existsSync(target)) return { fileName, skipped: true };
  // VACUUM INTO refuses to overwrite; the random name guarantees absence.
  const tmp = join(folderPath, `.${fileName}.${randomUUID()}.tmp`);
  try {
    db.exec(`VACUUM INTO '${tmp.replaceAll("'", "''")}'`);
    renameSync(tmp, target);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
  return { fileName, skipped: false };
}
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `npx vitest run tests/unit/backup/snapshot.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/main/backup/snapshot.ts tests/unit/backup/snapshot.test.ts
git commit -m "feat(backup): dated plain-SQLite snapshot writer (VACUUM INTO + atomic rename)"
```

---

### Task 3: Listing, daily check, rotation — `src/main/backup/rotation.ts`

**Files:**

- Create: `src/main/backup/rotation.ts`
- Test: `tests/unit/backup/rotation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listBackups, hasBackupForDay, pruneBackups } from '../../../src/main/backup/rotation';

let folder: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'fd-rotation-'));
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

function touch(name: string, content = 'x'): void {
  writeFileSync(join(folder, name), content);
}

describe('listBackups', () => {
  it('lists only pattern-matching files, newest first, with parsed createdAt and size', () => {
    touch('finance-2026-06-11_0900.sqlite', 'aa');
    touch('finance-2026-06-12_0830.sqlite', 'bbbb');
    touch('notes.txt');
    touch('finance.sqlite'); // live-DB-style name must not match
    const list = listBackups(folder);
    expect(list.map((b) => b.fileName)).toEqual([
      'finance-2026-06-12_0830.sqlite',
      'finance-2026-06-11_0900.sqlite',
    ]);
    expect(list[0]?.createdAt).toBe('2026-06-12T08:30:00');
    expect(list[0]?.sizeBytes).toBe(4);
  });

  it('returns [] for a missing folder', () => {
    expect(listBackups(join(folder, 'nope'))).toEqual([]);
  });
});

describe('hasBackupForDay', () => {
  it('is true only when a snapshot dated that local day exists', () => {
    touch('finance-2026-06-12_0830.sqlite');
    expect(hasBackupForDay(folder, new Date(2026, 5, 12, 23, 59))).toBe(true);
    expect(hasBackupForDay(folder, new Date(2026, 5, 13, 0, 1))).toBe(false);
  });
});

describe('pruneBackups', () => {
  it('keeps the 15 newest matching files and never touches other files', () => {
    for (let i = 1; i <= 18; i++) {
      touch(`finance-2026-05-${String(i).padStart(2, '0')}_1200.sqlite`);
    }
    touch('unrelated.sqlite');
    const deleted = pruneBackups(folder);
    expect(deleted.sort()).toEqual([
      'finance-2026-05-01_1200.sqlite',
      'finance-2026-05-02_1200.sqlite',
      'finance-2026-05-03_1200.sqlite',
    ]);
    expect(existsSync(join(folder, 'unrelated.sqlite'))).toBe(true);
    expect(listBackups(folder)).toHaveLength(15);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (module not found)

Run: `npx vitest run tests/unit/backup/rotation.test.ts`

- [ ] **Step 3: Implement `src/main/backup/rotation.ts`**

```ts
import { readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { BackupFileInfo } from '@shared/types/backup';
import { backupFileName } from './snapshot';

/** Must match snapshot.ts's backupFileName output — and nothing else. */
export const BACKUP_FILE_RE = /^finance-(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})\.sqlite$/;

export const KEEP_COUNT = 15;

/** Newest first. Missing/unreadable folder → []. */
export function listBackups(folderPath: string): BackupFileInfo[] {
  let names: string[];
  try {
    names = readdirSync(folderPath);
  } catch {
    return [];
  }
  const out: BackupFileInfo[] = [];
  for (const fileName of names) {
    const m = BACKUP_FILE_RE.exec(fileName);
    if (m === null) continue;
    const [, date, hh, mm] = m;
    let sizeBytes = 0;
    try {
      sizeBytes = statSync(join(folderPath, fileName)).size;
    } catch {
      continue; // raced away — not a backup we can offer
    }
    if (date === undefined || hh === undefined || mm === undefined) continue;
    out.push({ fileName, createdAt: `${date}T${hh}:${mm}:00`, sizeBytes });
  }
  // Name encodes the timestamp, so lexicographic order is chronological.
  out.sort((a, b) => (a.fileName < b.fileName ? 1 : -1));
  return out;
}

export function hasBackupForDay(folderPath: string, day: Date): boolean {
  const prefix = backupFileName(day).slice(0, 'finance-2026-06-12'.length);
  return listBackups(folderPath).some((b) => b.fileName.startsWith(prefix));
}

/** Deletes matching files beyond the KEEP_COUNT newest; returns deleted names. */
export function pruneBackups(folderPath: string, keep: number = KEEP_COUNT): string[] {
  const excess = listBackups(folderPath).slice(keep);
  const deleted: string[] = [];
  for (const b of excess) {
    try {
      rmSync(join(folderPath, b.fileName), { force: true });
      deleted.push(b.fileName);
    } catch {
      // best-effort — an undeletable old file must not fail the snapshot write.
    }
  }
  return deleted;
}
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `npx vitest run tests/unit/backup/rotation.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/main/backup/rotation.ts tests/unit/backup/rotation.test.ts
git commit -m "feat(backup): backup file listing, daily check and prune-to-15 rotation"
```

---

### Task 4: Extract the swap mechanics from `sync/restore.ts`

**Files:**

- Modify: `src/main/sync/restore.ts`
- Test (existing, must stay green): `tests/integration/sync/restore.test.ts`

- [ ] **Step 1: Refactor `src/main/sync/restore.ts`** — extract everything from the integrity check to `reopenDb()` into an exported function; `restoreFromFolder` keeps the header/decrypt logic and calls it:

```ts
/**
 * Validates the candidate DB at tmpPath and swaps it in as the live DB:
 * integrity_check → .bak of the current DB → drop stale WAL side files →
 * atomic rename → reopen (migrations run). Removes tmpPath on failure.
 * Shared by sync restore and local-backup restore.
 */
export function swapInValidatedCandidate(
  tmpPath: string,
  env: RestoreEnv,
): 'ok' | 'integrity_failed' {
  try {
    const check = new DatabaseSync(tmpPath);
    const row = check.prepare('PRAGMA integrity_check').get() as
      | { integrity_check: string }
      | undefined;
    check.close();
    if (row?.integrity_check !== 'ok') {
      rmSync(tmpPath, { force: true });
      return 'integrity_failed';
    }
  } catch {
    rmSync(tmpPath, { force: true });
    return 'integrity_failed';
  }

  env.closeDb();
  // .bak files accumulate by design in v1 — manual cleanup; they are the
  // rollback story (see ADR-017).
  if (existsSync(env.dbPath)) {
    const stamp = new Date().toISOString().replaceAll(':', '-');
    copyFileSync(env.dbPath, `${env.dbPath}.bak-${stamp}`);
  }
  // WAL side files belong to the old DB; they must not shadow the restored one.
  rmSync(`${env.dbPath}-wal`, { force: true });
  rmSync(`${env.dbPath}-shm`, { force: true });
  renameSync(tmpPath, env.dbPath);
  env.reopenDb();
  return 'ok';
}
```

In `restoreFromFolder`, the block after the decrypt result checks becomes:

```ts
if (swapInValidatedCandidate(tmpPath, env) !== 'ok') {
  return { ok: false, error: 'integrity_failed' };
}
recordRestore(new Date().toISOString(), header.machineName, header.snapshotId);
return { ok: true };
```

- [ ] **Step 2: Run the existing sync tests — expect PASS (pure refactor)**

Run: `npx vitest run tests/integration/sync tests/unit/sync`
Expected: all green, no test changes needed.

- [ ] **Step 3: Commit**

```bash
git add src/main/sync/restore.ts
git commit -m "refactor(sync): extract swapInValidatedCandidate for reuse by local backup restore"
```

---

### Task 5: Restore from a plain `.sqlite` file — `src/main/backup/restore.ts`

**Files:**

- Create: `src/main/backup/restore.ts`
- Test: `tests/integration/backup/restore.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import type { RestoreEnv } from '../../../src/main/sync/restore';
import { writeBackupSnapshot } from '../../../src/main/backup/snapshot';
import { restoreFromBackupFile } from '../../../src/main/backup/restore';

let dir: string;
let dbPath: string;
let db: DatabaseSync | null;

function openDb(): DatabaseSync {
  const d = new DatabaseSync(dbPath);
  d.exec('PRAGMA journal_mode = WAL');
  runMigrations(d);
  return d;
}

const env: RestoreEnv = {
  get dbPath() {
    return dbPath;
  },
  closeDb() {
    db?.close();
    db = null;
  },
  reopenDb() {
    db = openDb();
  },
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fd-backup-restore-'));
  dbPath = join(dir, 'finance.sqlite');
  db = openDb();
  db.prepare(
    "INSERT INTO accounts (id, name, type, bank_id, currency) VALUES ('acc-1','A','checking',NULL,'EUR')",
  ).run();
});

afterEach(() => {
  db?.close();
  db = null;
  rmSync(dir, { recursive: true, force: true });
});

describe('restoreFromBackupFile', () => {
  it('round-trips: snapshot → mutate → restore brings the row back', () => {
    if (db === null) throw new Error('unreachable');
    const folder = join(dir, 'backups');
    const { fileName } = writeBackupSnapshot(db, folder);
    db.prepare("DELETE FROM accounts WHERE id = 'acc-1'").run();

    const res = restoreFromBackupFile(join(folder, fileName), env);
    expect(res).toEqual({ ok: true });
    if (db === null) throw new Error('reopen failed');
    const row = (db as DatabaseSync).prepare('SELECT COUNT(*) AS n FROM accounts').get() as {
      n: number;
    };
    expect(row.n).toBe(1);
  });

  it('refuses a missing file', () => {
    expect(restoreFromBackupFile(join(dir, 'nope.sqlite'), env)).toEqual({
      ok: false,
      error: 'file_unavailable',
    });
  });

  it('refuses a non-SQLite file and leaves the current DB untouched', () => {
    const junk = join(dir, 'junk.sqlite');
    writeFileSync(junk, 'this is not a database');
    expect(restoreFromBackupFile(junk, env)).toEqual({ ok: false, error: 'not_a_database' });
    if (db === null) throw new Error('db must still be open');
    const row = (db as DatabaseSync).prepare('SELECT COUNT(*) AS n FROM accounts').get() as {
      n: number;
    };
    expect(row.n).toBe(1);
    // no stray restore-tmp left behind
    expect(readdirSync(dir).filter((n) => n.includes('restore-tmp'))).toEqual([]);
  });

  it('refuses a snapshot whose schema is newer than the app', () => {
    if (db === null) throw new Error('unreachable');
    const folder = join(dir, 'backups');
    const { fileName } = writeBackupSnapshot(db, folder);
    const future = new DatabaseSync(join(folder, fileName));
    future.prepare('INSERT INTO schema_migrations (version) VALUES (9999)').run();
    future.close();
    expect(restoreFromBackupFile(join(folder, fileName), env)).toEqual({
      ok: false,
      error: 'schema_too_new',
    });
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (module not found)

Run: `npx vitest run tests/integration/backup/restore.test.ts`

- [ ] **Step 3: Implement `src/main/backup/restore.ts`**

```ts
import { copyFileSync, existsSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { BackupRestoreResult } from '@shared/types/backup';
import { LATEST_SCHEMA_VERSION } from '../db/migrate';
import { swapInValidatedCandidate, type RestoreEnv } from '../sync/restore';

/**
 * Restores the live DB from a plain SQLite backup file. The source file is
 * never moved or modified — it is copied to a temp candidate first, so a
 * failed restore leaves both the backup and the current DB untouched.
 */
export function restoreFromBackupFile(srcPath: string, env: RestoreEnv): BackupRestoreResult {
  if (!existsSync(srcPath)) return { ok: false, error: 'file_unavailable' };

  let schemaVersion: number;
  try {
    const candidate = new DatabaseSync(srcPath, { readOnly: true });
    try {
      const row = candidate
        .prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations')
        .get() as { v: number } | undefined;
      schemaVersion = row?.v ?? 0;
    } finally {
      candidate.close();
    }
  } catch {
    // Not openable as SQLite, or no schema_migrations table: not one of ours.
    return { ok: false, error: 'not_a_database' };
  }
  if (schemaVersion > LATEST_SCHEMA_VERSION) return { ok: false, error: 'schema_too_new' };

  const tmpPath = `${env.dbPath}.restore-tmp`;
  rmSync(tmpPath, { force: true });
  copyFileSync(srcPath, tmpPath);
  if (swapInValidatedCandidate(tmpPath, env) !== 'ok') {
    return { ok: false, error: 'integrity_failed' };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `npx vitest run tests/integration/backup/restore.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/main/backup/restore.ts tests/integration/backup/restore.test.ts
git commit -m "feat(backup): restore the live DB from a plain SQLite backup file"
```

---

### Task 6: JSON export — `src/main/backup/exportJson.ts`

**Files:**

- Create: `src/main/backup/exportJson.ts`
- Test: `tests/unit/backup/exportJson.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { buildJsonExport, writeJsonExport } from '../../../src/main/backup/exportJson';

let dir: string;
let db: DatabaseSync;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fd-export-'));
  db = new DatabaseSync(join(dir, 'db.sqlite'));
  runMigrations(db);
  db.prepare(
    "INSERT INTO accounts (id, name, type, bank_id, currency) VALUES ('acc-1','Compte LCL','checking',NULL,'EUR')",
  ).run();
  db.prepare(
    "INSERT INTO categories (id, parent_id, name) VALUES ('cat-1', NULL, 'Courses')",
  ).run();
  db.prepare(
    `INSERT INTO transactions
       (id, account_id, import_id, tx_hash, date, amount, label_raw, label_clean,
        category_id, is_internal_transfer, user_modified)
     VALUES ('tx-1','acc-1',NULL,'h1','2026-06-01',-42.5,'CB CARREFOUR','Carrefour',
        'cat-1',0,1)`,
  ).run();
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('buildJsonExport', () => {
  it('produces formatVersion 1 with flat rows and a resolved category name', () => {
    const exp = buildJsonExport(db, new Date('2026-06-12T09:30:00.000Z'));
    expect(exp.formatVersion).toBe(1);
    expect(exp.exportedAt).toBe('2026-06-12T09:30:00.000Z');
    expect(exp.accounts).toEqual([
      { id: 'acc-1', name: 'Compte LCL', type: 'checking', currency: 'EUR' },
    ]);
    expect(exp.categories).toEqual([{ id: 'cat-1', parentId: null, name: 'Courses' }]);
    expect(exp.transactions).toEqual([
      {
        id: 'tx-1',
        account: 'Compte LCL',
        date: '2026-06-01',
        amount: -42.5,
        labelRaw: 'CB CARREFOUR',
        labelClean: 'Carrefour',
        category: 'Courses',
        isInternalTransfer: false,
        userModified: true,
      },
    ]);
  });

  it('exports an uncategorized transaction with category null', () => {
    db.prepare("UPDATE transactions SET category_id = NULL WHERE id = 'tx-1'").run();
    expect(buildJsonExport(db).transactions[0]?.category).toBeNull();
  });
});

describe('writeJsonExport', () => {
  it('writes pretty-printed parseable JSON', () => {
    const dest = join(dir, 'export.json');
    writeJsonExport(db, dest);
    const parsed = JSON.parse(readFileSync(dest, 'utf8')) as { formatVersion: number };
    expect(parsed.formatVersion).toBe(1);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (module not found)

Run: `npx vitest run tests/unit/backup/exportJson.test.ts`

- [ ] **Step 3: Implement `src/main/backup/exportJson.ts`**

```ts
import { writeFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';

export interface JsonExport {
  formatVersion: 1;
  exportedAt: string;
  accounts: { id: string; name: string; type: string; currency: string }[];
  categories: { id: string; parentId: string | null; name: string }[];
  transactions: {
    id: string;
    account: string;
    date: string;
    amount: number;
    labelRaw: string;
    labelClean: string;
    /** Resolved category NAME (spec §4) — null when uncategorized. */
    category: string | null;
    isInternalTransfer: boolean;
    userModified: boolean;
  }[];
}

interface TxRow {
  id: string;
  account: string;
  date: string;
  amount: number;
  label_raw: string;
  label_clean: string;
  category: string | null;
  is_internal_transfer: number;
  user_modified: number;
}

/** Read-only flat export for long-term human readability. The app never reads it back. */
export function buildJsonExport(db: DatabaseSync, now: Date = new Date()): JsonExport {
  const accounts = db
    .prepare('SELECT id, name, type, currency FROM accounts ORDER BY name, id')
    .all() as JsonExport['accounts'];
  const categories = (
    db.prepare('SELECT id, parent_id, name FROM categories ORDER BY position, name, id').all() as {
      id: string;
      parent_id: string | null;
      name: string;
    }[]
  ).map((c) => ({ id: c.id, parentId: c.parent_id, name: c.name }));
  const transactions = (
    db
      .prepare(
        `SELECT t.id, a.name AS account, t.date, t.amount, t.label_raw, t.label_clean,
                c.name AS category, t.is_internal_transfer, t.user_modified
           FROM transactions t
           JOIN accounts a ON a.id = t.account_id
           LEFT JOIN categories c ON c.id = t.category_id
          ORDER BY t.date, t.id`,
      )
      .all() as TxRow[]
  ).map((t) => ({
    id: t.id,
    account: t.account,
    date: t.date,
    amount: t.amount,
    labelRaw: t.label_raw,
    labelClean: t.label_clean,
    category: t.category,
    isInternalTransfer: t.is_internal_transfer === 1,
    userModified: t.user_modified === 1,
  }));
  return { formatVersion: 1, exportedAt: now.toISOString(), accounts, categories, transactions };
}

export function writeJsonExport(db: DatabaseSync, destPath: string): void {
  writeFileSync(destPath, JSON.stringify(buildJsonExport(db), null, 2));
}
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `npx vitest run tests/unit/backup/exportJson.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/main/backup/exportJson.ts tests/unit/backup/exportJson.test.ts
git commit -m "feat(backup): read-only flat JSON export with resolved category names"
```

---

### Task 7: Folder setting + controller — `state.ts`, `controller.ts`

**Files:**

- Create: `src/main/backup/state.ts`
- Create: `src/main/backup/controller.ts`
- Test: `tests/unit/backup/controller.test.ts`

- [ ] **Step 1: Create `src/main/backup/state.ts`** (same `app_settings` access pattern as `sync/state.ts`):

```ts
import { getDb } from '../db';

const KEY = 'backup.folderPath';

/** User override of the backup folder; null → caller falls back to the default. */
export function getBackupFolderOverride(): string | null {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(KEY) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setBackupFolder(folderPath: string): void {
  getDb()
    .prepare(
      'INSERT INTO app_settings (key, value) VALUES (?, ?) ' +
        'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    )
    .run(KEY, folderPath);
}
```

- [ ] **Step 2: Write the failing controller test**

The class takes its dependencies explicitly, so the test needs no electron mock — only the `../db` mock for `state.ts` (mirror `tests/unit/sync/state.test.ts`):

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

const dbHolder: { db: DatabaseSync | null } = { db: null };
vi.mock('../../../src/main/db', () => ({ getDb: () => dbHolder.db }));

import { BackupController } from '../../../src/main/backup/controller';
import { setBackupFolder } from '../../../src/main/backup/state';
import { listBackups } from '../../../src/main/backup/rotation';

let dir: string;
let controller: BackupController;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fd-backup-ctl-'));
  dbHolder.db = new DatabaseSync(join(dir, 'finance.sqlite'));
  runMigrations(dbHolder.db);
  controller = new BackupController({
    getDb: () => {
      if (dbHolder.db === null) throw new Error('db closed');
      return dbHolder.db;
    },
    defaultFolder: () => join(dir, 'backups'),
    restoreEnv: () => ({
      dbPath: join(dir, 'finance.sqlite'),
      closeDb: () => {
        dbHolder.db?.close();
        dbHolder.db = null;
      },
      reopenDb: () => {
        dbHolder.db = new DatabaseSync(join(dir, 'finance.sqlite'));
        runMigrations(dbHolder.db);
      },
    }),
  });
});

afterEach(() => {
  dbHolder.db?.close();
  dbHolder.db = null;
  rmSync(dir, { recursive: true, force: true });
});

describe('ensureDailySnapshot', () => {
  it('writes one snapshot, then skips the rest of the day', () => {
    controller.ensureDailySnapshot();
    controller.ensureDailySnapshot();
    expect(listBackups(join(dir, 'backups'))).toHaveLength(1);
  });

  it('records a lastError instead of throwing when the folder is unwritable', () => {
    setBackupFolder(join(dir, 'finance.sqlite')); // a file → mkdir/VACUUM fails
    expect(() => {
      controller.ensureDailySnapshot();
    }).not.toThrow();
    expect(controller.getStatusView().lastError).not.toBeNull();
  });
});

describe('snapshotBeforeImport', () => {
  it('always writes (same day as the launch snapshot) and reports success', () => {
    controller.ensureDailySnapshot();
    const ok = controller.snapshotBeforeImport(new Date(Date.now() + 60_000));
    expect(ok).toBe(true);
    expect(listBackups(join(dir, 'backups'))).toHaveLength(2);
  });

  it('returns false on failure instead of throwing', () => {
    setBackupFolder(join(dir, 'finance.sqlite'));
    expect(controller.snapshotBeforeImport()).toBe(false);
  });
});

describe('restore', () => {
  it('refuses a fileName that is not a plain backup name (path traversal)', () => {
    expect(controller.restore('../finance.sqlite')).toEqual({
      ok: false,
      error: 'file_unavailable',
    });
  });
});

describe('getStatusView', () => {
  it('reports the override folder and the backup list', () => {
    setBackupFolder(join(dir, 'elsewhere'));
    controller.ensureDailySnapshot();
    const view = controller.getStatusView();
    expect(view.folderPath).toBe(join(dir, 'elsewhere'));
    expect(view.backups).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run it — expect FAIL** (module not found)

Run: `npx vitest run tests/unit/backup/controller.test.ts`

- [ ] **Step 4: Implement `src/main/backup/controller.ts`**

```ts
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type {
  BackupCreateResult,
  BackupRestoreResult,
  BackupStatusView,
} from '@shared/types/backup';
import type { RestoreEnv } from '../sync/restore';
import { writeBackupSnapshot } from './snapshot';
import { BACKUP_FILE_RE, hasBackupForDay, listBackups, pruneBackups } from './rotation';
import { restoreFromBackupFile } from './restore';
import { writeJsonExport } from './exportJson';
import { getBackupFolderOverride, setBackupFolder } from './state';

export interface BackupControllerDeps {
  getDb(): DatabaseSync;
  /** `<userData>/backups` in the app; injected for tests. */
  defaultFolder(): string;
  restoreEnv(): RestoreEnv;
}

export class BackupController {
  private lastError: string | null = null;

  constructor(private readonly deps: BackupControllerDeps) {}

  folder(): string {
    return getBackupFolderOverride() ?? this.deps.defaultFolder();
  }

  setFolder(folderPath: string): void {
    setBackupFolder(folderPath);
  }

  getStatusView(): BackupStatusView {
    const folderPath = this.folder();
    return { folderPath, backups: listBackups(folderPath), lastError: this.lastError };
  }

  /** Launch trigger (spec §1): at most one snapshot per local day. Never throws. */
  ensureDailySnapshot(now: Date = new Date()): void {
    try {
      if (hasBackupForDay(this.folder(), now)) return;
      this.write(now);
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      console.error('backup: daily snapshot failed', e);
    }
  }

  /** Pre-import trigger (spec §1): always writes. False on failure — the import proceeds. */
  snapshotBeforeImport(now: Date = new Date()): boolean {
    try {
      this.write(now);
      return true;
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      console.error('backup: pre-import snapshot failed', e);
      return false;
    }
  }

  /** Manual « Sauvegarder maintenant ». */
  createNow(): BackupCreateResult {
    try {
      const { fileName } = this.write(new Date());
      return { ok: true, fileName };
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      console.error('backup: manual snapshot failed', e);
      return { ok: false, error: 'write_failed' };
    }
  }

  /** Restore a snapshot from the backup folder by file name (no paths from the renderer). */
  restore(fileName: string): BackupRestoreResult {
    if (!BACKUP_FILE_RE.test(fileName)) return { ok: false, error: 'file_unavailable' };
    return restoreFromBackupFile(join(this.folder(), fileName), this.deps.restoreEnv());
  }

  /** Restore from an absolute path picked in a main-process file dialog. */
  restoreFromPath(filePath: string): BackupRestoreResult {
    return restoreFromBackupFile(filePath, this.deps.restoreEnv());
  }

  exportJson(destPath: string): void {
    writeJsonExport(this.deps.getDb(), destPath);
  }

  private write(now: Date): { fileName: string } {
    const folderPath = this.folder();
    const res = writeBackupSnapshot(this.deps.getDb(), folderPath, now);
    pruneBackups(folderPath);
    this.lastError = null;
    return { fileName: res.fileName };
  }
}
```

- [ ] **Step 5: Run the test — expect PASS**

Run: `npx vitest run tests/unit/backup/controller.test.ts`

- [ ] **Step 6: Add the electron-wired singleton** in `src/main/backup/index.ts` (separate file so the controller class stays electron-free for tests):

```ts
import { app } from 'electron';
import { join } from 'node:path';
import { closeDb, getDb, getDbPath } from '../db';
import { BackupController } from './controller';

export const backupController = new BackupController({
  getDb,
  defaultFolder: () => join(app.getPath('userData'), 'backups'),
  restoreEnv: () => ({
    dbPath: getDbPath(),
    closeDb,
    reopenDb: () => {
      getDb();
    },
  }),
});
```

- [ ] **Step 7: Typecheck, then commit**

Run: `npm run typecheck`

```bash
git add src/main/backup/state.ts src/main/backup/controller.ts src/main/backup/index.ts tests/unit/backup/controller.test.ts
git commit -m "feat(backup): backup controller with launch/pre-import triggers and folder setting"
```

---

### Task 8: IPC handlers, registration, launch + pre-import wiring

**Files:**

- Create: `src/main/ipc/handlers/backup.ts`
- Modify: `src/main/ipc/register.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/ipc/handlers/importConfirm.ts`
- Modify: `src/renderer/hooks/useImport.ts`

- [ ] **Step 1: Create `src/main/ipc/handlers/backup.ts`**

```ts
import { dialog } from 'electron';
import type {
  BackupCreateResult,
  BackupExportResult,
  BackupRestoreResult,
  BackupStatusView,
} from '@shared/types/backup';
import { backupController } from '../../backup';

export function handleBackupGetStatus(): BackupStatusView {
  return backupController.getStatusView();
}

export async function handleBackupPickFolder(): Promise<
  { cancelled: true } | { cancelled: false; path: string }
> {
  const result = await dialog.showOpenDialog({
    title: 'Choisir le dossier de sauvegarde',
    properties: ['openDirectory', 'createDirectory'],
  });
  const first = result.filePaths[0];
  if (result.canceled || first === undefined) return { cancelled: true };
  return { cancelled: false, path: first };
}

export function handleBackupSetFolder(payload: { folderPath: string }): { ok: true } {
  backupController.setFolder(payload.folderPath);
  return { ok: true };
}

export function handleBackupCreate(): BackupCreateResult {
  return backupController.createNow();
}

export function handleBackupRestore(payload: { fileName: string }): BackupRestoreResult {
  return backupController.restore(payload.fileName);
}

export async function handleBackupRestoreFromFile(): Promise<BackupRestoreResult> {
  const result = await dialog.showOpenDialog({
    title: 'Restaurer depuis une sauvegarde',
    properties: ['openFile'],
    filters: [{ name: 'Sauvegarde SQLite', extensions: ['sqlite'] }],
  });
  const first = result.filePaths[0];
  if (result.canceled || first === undefined) return { ok: false, error: 'cancelled' };
  return backupController.restoreFromPath(first);
}

export async function handleBackupExportJson(): Promise<BackupExportResult> {
  const stamp = new Date().toISOString().slice(0, 10);
  const result = await dialog.showSaveDialog({
    title: 'Exporter en JSON',
    defaultPath: `finance-export-${stamp}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || result.filePath === '') return { ok: false, error: 'cancelled' };
  try {
    backupController.exportJson(result.filePath);
    return { ok: true, path: result.filePath };
  } catch (e) {
    console.error('backup: JSON export failed', e);
    return { ok: false, error: 'write_failed' };
  }
}
```

- [ ] **Step 2: Register in `src/main/ipc/register.ts`**

Imports:

```ts
import {
  handleBackupGetStatus,
  handleBackupPickFolder,
  handleBackupSetFolder,
  handleBackupCreate,
  handleBackupRestore,
  handleBackupRestoreFromFile,
  handleBackupExportJson,
} from './handlers/backup';
```

In `MUTATING_CHANNELS`, add (with this comment):

```ts
  // A backup restore replaces the whole DB: the sync folder must be told.
  'backup:restore',
  'backup:restoreFromFile',
```

In `registerAllHandlers()`:

```ts
register(CHANNELS.backupGetStatus, () => handleBackupGetStatus());
register(CHANNELS.backupPickFolder, () => handleBackupPickFolder());
register(CHANNELS.backupSetFolder, handleBackupSetFolder);
register(CHANNELS.backupCreate, () => handleBackupCreate());
register(CHANNELS.backupRestore, handleBackupRestore);
register(CHANNELS.backupRestoreFromFile, () => handleBackupRestoreFromFile());
register(CHANNELS.backupExportJson, () => handleBackupExportJson());
```

- [ ] **Step 3: Launch trigger in `src/main/index.ts`**

Add `import { backupController } from './backup';` and, inside `app.whenReady().then(...)` right after the `removeDownloadedModels` block (the controller catches internally — no try/catch needed):

```ts
// Daily local snapshot before the user touches anything (local-backup spec §1).
backupController.ensureDailySnapshot();
```

- [ ] **Step 4: Pre-import snapshot in `src/main/ipc/handlers/importConfirm.ts`**

Add `import { backupController } from '../../backup';` and, as the FIRST statement inside the `try` of `handleImportConfirm` (before `readImportFile`):

```ts
// Snapshot before the riskiest operation (local-backup spec §1). A backup
// failure must never block the import — flag it for a renderer warning.
const backupOk = backupController.snapshotBeforeImport();
```

Change the success return to:

```ts
return { ok: true, ...result, ...(backupOk ? {} : { preImportBackupFailed: true as const }) };
```

- [ ] **Step 5: Warning toast in `src/renderer/hooks/useImport.ts`**

Find the `ipc.invoke('import:confirm', ...)` call (~line 368) and, in its success path (where the result has `ok: true`), add:

```ts
if (result.preImportBackupFailed === true) {
  toast.warning('Sauvegarde pré-import échouée — import effectué quand même.');
}
```

(`sonner`'s `toast` is the established pattern; import it if the hook doesn't already.)

- [ ] **Step 6: Typecheck + full unit tests**

Run: `npm run typecheck && npx vitest run tests/unit`
Expected: clean / all green.

- [ ] **Step 7: Commit**

```bash
git add src/main/ipc/handlers/backup.ts src/main/ipc/register.ts src/main/index.ts src/main/ipc/handlers/importConfirm.ts src/renderer/hooks/useImport.ts
git commit -m "feat(backup): wire IPC handlers, launch trigger and pre-import snapshot"
```

---

### Task 9: Settings UI — `BackupSettingsSection`

**Files:**

- Create: `src/renderer/components/backup/BackupSettingsSection.tsx`
- Modify: `src/renderer/pages/SettingsPage.tsx`
- Test: `tests/unit/renderer/BackupSettingsSection.test.tsx`

- [ ] **Step 1: Write the failing test** (mirror `tests/unit/renderer/SettingsPage.test.tsx` for the ipc-client mock pattern; jsdom directive + explicit cleanup are mandatory):

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BackupStatusView } from '@shared/types/backup';

const invoke = vi.fn();
vi.mock('../../../src/renderer/ipc/client', () => ({ ipc: { invoke } }));

import { BackupSettingsSection } from '../../../src/renderer/components/backup/BackupSettingsSection';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span>{label}</span>
      {children}
    </div>
  );
}

const status: BackupStatusView = {
  folderPath: '/home/denis/.config/finance-dashboard/backups',
  backups: [
    {
      fileName: 'finance-2026-06-12_0900.sqlite',
      createdAt: '2026-06-12T09:00:00',
      sizeBytes: 204800,
    },
    {
      fileName: 'finance-2026-06-11_0900.sqlite',
      createdAt: '2026-06-11T09:00:00',
      sizeBytes: 102400,
    },
  ],
  lastError: null,
};

beforeEach(() => {
  invoke.mockReset();
  invoke.mockImplementation((channel: string) => {
    if (channel === 'backup:getStatus') return Promise.resolve(status);
    if (channel === 'backup:create')
      return Promise.resolve({ ok: true, fileName: 'finance-2026-06-12_1010.sqlite' });
    return Promise.resolve({ ok: true });
  });
});

afterEach(() => {
  cleanup();
});

describe('BackupSettingsSection', () => {
  it('lists snapshots with formatted dates', async () => {
    render(<BackupSettingsSection Row={Row} />);
    expect(await screen.findByText(/12 juin 2026/)).toBeTruthy();
    expect(screen.getByText(/11 juin 2026/)).toBeTruthy();
  });

  it('« Sauvegarder maintenant » invokes backup:create and refreshes', async () => {
    render(<BackupSettingsSection Row={Row} />);
    await screen.findByText(/12 juin 2026/);
    await userEvent.click(screen.getByRole('button', { name: /sauvegarder maintenant/i }));
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('backup:create', {});
    });
  });

  it('restore requires an explicit confirmation dialog before invoking backup:restore', async () => {
    render(<BackupSettingsSection Row={Row} />);
    await screen.findByText(/12 juin 2026/);
    const restoreButtons = screen.getAllByRole('button', { name: /^restaurer$/i });
    await userEvent.click(restoreButtons[0] as HTMLElement);
    expect(invoke).not.toHaveBeenCalledWith('backup:restore', expect.anything());
    await userEvent.click(screen.getByRole('button', { name: /confirmer/i }));
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('backup:restore', {
        fileName: 'finance-2026-06-12_0900.sqlite',
      });
    });
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (module not found)

Run: `npx vitest run tests/unit/renderer/BackupSettingsSection.test.tsx`

- [ ] **Step 3: Implement `src/renderer/components/backup/BackupSettingsSection.tsx`**

Follow `SyncSettingsSection.tsx` exactly for structure (same `Row` injection, `ipc` client, sonner toasts, date-fns/fr formatting, Button/Dialog from `../ui/`). Content:

- **Row « Dossier de sauvegarde »** — truncated mono path + a « Modifier » secondary button: `backup:pickFolder` → if not cancelled `backup:setFolder` → refresh + `toast.success('Dossier de sauvegarde modifié.')`.
- **Row « Sauvegarde automatique »** with `hint="Un snapshot par jour au lancement, un avant chaque import · 15 conservés."` — « Sauvegarder maintenant » button → `backup:create` → success: `toast.success('Sauvegarde écrite.')` + refresh; failure: `toast.error('Échec d'écriture de la sauvegarde.')`. If `status.lastError !== null`, render under the row: `<span className="font-sans text-[11px] text-coral">Dernière sauvegarde automatique échouée : {status.lastError}</span>`.
- **Row « Snapshots »** — the `status.backups` list: each entry shows `format(new Date(b.createdAt), "d MMM yyyy 'à' HH:mm", { locale: fr })`, `${Math.max(1, Math.round(b.sizeBytes / 1024))} Ko` in mono dim text, and a « Restaurer » ghost/secondary button. Empty list → `<span className="text-paper-dim">Aucune sauvegarde pour l'instant.</span>`.
- **Restore confirmation `Dialog`** (state: `pendingRestore: string | null`): title « Restaurer cette sauvegarde ? », description « La base actuelle sera remplacée par le snapshot du {date}. Une copie .bak est conservée à côté de la base. », buttons « Annuler » / « Confirmer » (destructive). Confirm → `backup:restore` with the fileName.
- **Row « Restaurer depuis un fichier »** — secondary button → `backup:restoreFromFile` directly (the OS dialog is the confirmation step; `cancelled` → no toast).
- **Shared restore result handling:**

```ts
const RESTORE_ERRORS: Record<string, string> = {
  file_unavailable: 'Fichier introuvable.',
  not_a_database: "Ce fichier n'est pas une base de données de l'application.",
  integrity_failed: 'Sauvegarde corrompue — la base actuelle est intacte.',
  schema_too_new: "Sauvegarde créée par une version plus récente de l'application.",
};

function afterRestore(result: BackupRestoreResult): void {
  if (result.ok) {
    toast.success('Sauvegarde restaurée.');
    window.location.reload(); // reload the SPA so every view reflects the restored DB
  } else if (result.error !== 'cancelled') {
    toast.error(RESTORE_ERRORS[result.error] ?? result.error);
  }
}
```

- **Export JSON** is wired in SettingsPage (next step), not here.

- [ ] **Step 4: Wire into `src/renderer/pages/SettingsPage.tsx`**

In `DataSection`:

- Add `import { BackupSettingsSection } from '../components/backup/BackupSettingsSection';` and `import { ipc } from '../lib/...'` — **check the actual ipc client import path used by `SyncSettingsSection`** (`../../ipc/client` from components; from pages it is `../ipc/client`).
- Replace the placeholder « Sauvegarde » and « Restauration » rows with `<BackupSettingsSection Row={Row} />`.
- In the « Export » row, keep the CSV button as-is (still `toast.info(SOON)`) and wire the JSON button:

```tsx
<Button
  variant="secondary"
  size="sm"
  onClick={() => {
    void ipc.invoke('backup:exportJson', {}).then((result) => {
      if (result.ok) toast.success(`Export écrit : ${result.path}`);
      else if (result.error !== 'cancelled') toast.error("Échec de l'export JSON.");
    });
  }}
>
  JSON
</Button>
```

- Leave « Emplacement de la base », « Taille de la base » and « Zone danger » placeholders untouched (out of scope).

- [ ] **Step 5: Run the tests — expect PASS** (component test + the existing `SettingsPage.test.tsx`, which may need its ipc mock extended if it renders `DataSection` — extend the mock, don't weaken assertions)

Run: `npx vitest run tests/unit/renderer/BackupSettingsSection.test.tsx tests/unit/renderer/SettingsPage.test.tsx`

- [ ] **Step 6: Lint + typecheck**

Run: `npm run lint && npm run typecheck`

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/backup/BackupSettingsSection.tsx src/renderer/pages/SettingsPage.tsx tests/unit/renderer/BackupSettingsSection.test.tsx tests/unit/renderer/SettingsPage.test.tsx
git commit -m "feat(backup): settings UI — snapshot list, restore with confirmation, JSON export"
```

---

### Task 10: Docs, full gate, PR

**Files:**

- Modify: `README.md` (if it documents features/settings — add a short « Sauvegardes locales » mention next to where sync is described; skip if sync isn't mentioned either)

- [ ] **Step 1: Definition of done**

Run: `npm run lint && npm run typecheck && npx vitest run tests/unit tests/integration && npm run build`
Expected: all clean/green.

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin feat/local-backup
gh pr create --title "feat(backup): local rotating snapshots + read-only JSON export" --body "$(cat <<'EOF'
## Summary
- Rotating plain-SQLite backups (daily at launch + before every import + manual, 15 kept) in a configurable local folder, default `<userData>/backups/`
- Restore from the list or from a picked file, through the #208-extracted swap safety path (`.bak`, `integrity_check`, atomic swap, migrations on reopen); newer-schema snapshots refused
- Read-only JSON export (accounts / categories / transactions with resolved category names) — no importer by design
- Spec: `docs/superpowers/specs/2026-06-12-local-backup-design.md` · Plan: `docs/superpowers/plans/2026-06-12-local-backup.md`

## Test plan
- [x] Unit: snapshot naming/writer, rotation, controller triggers, JSON export shape, settings section
- [x] Integration: snapshot → restore round-trip; corrupt and newer-schema candidates refused with the live DB untouched
- [ ] Maintainer in-app validation (UI feature — no self-merge): validation script in the PR conversation

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Post the maintainer validation script as a PR comment** (north star: every figure checkable):

1. `npm run dev` → check `<userData>/backups/` contains a new `finance-<today>_HHmm.sqlite`; `sqlite3 <file> 'SELECT COUNT(*) FROM transactions;'` must equal the transaction count shown in the app.
2. Delete one transaction in the app → Réglages → Sauvegardes → Restaurer the launch snapshot → confirm → the app reloads and the transaction is back.
3. Import any statement → a second snapshot dated now appears.
4. Réglages → Export JSON → open the file, find one known transaction: amount, label and category name match the app to the cent.
5. Relaunch the app the same day → no extra snapshot (daily trigger is idempotent).

**UI PR — wait for maintainer in-app validation before merge (no self-merge).**

---

## Self-review (done while writing)

- Spec coverage: §1 snapshots (Tasks 2, 7, 8) · §2 location (Tasks 7, 9) · §3 restore incl. manual button + file picker + schema guard (Tasks 4, 5, 7, 8, 9) · §4 JSON export (Tasks 6, 9) · §5 IPC (Tasks 1, 8) · verification path (Task 10) · testing section (Tasks 2–9).
- Channel-name deviation from spec §5 (`getStatus` merges `list`+`getSettings`) is declared up top.
- Type names consistent across tasks (`BackupFileInfo`, `BackupStatusView`, `RestoreEnv`, `BACKUP_FILE_RE`, `restoreFromBackupFile`, `swapInValidatedCandidate`).
