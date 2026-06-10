# Machine Sync (Encrypted Sync-Folder Snapshots) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the maintainer share app data between his PC and Mac by writing an encrypted snapshot (`finance.fbk`) into a user-chosen folder that an external tool (Syncthing, personal cloud) replicates — the app itself makes zero network calls.

**Architecture:** A new main-process module `src/main/sync/` built pure-first: crypto, file format, decision logic and state are plain Node modules (unit-testable without Electron); Electron touches (safeStorage, dialog, app lifecycle) live in thin wrappers. The renderer gets a Settings section and a blocking launch gate, both via typed IPC. See the validated spec: `docs/superpowers/specs/2026-06-10-machine-sync-design.md`.

**Tech Stack:** Electron main process, `node:sqlite` (`VACUUM INTO`), `libsodium-wrappers-sumo` (XChaCha20-Poly1305 + Argon2id), Electron `safeStorage`, React + shadcn/ui patterns, Vitest, Playwright Electron.

**Branch:** `feat/machine-sync` (already exists, spec committed).

**Conventions reminders (from CLAUDE.md):**

- TypeScript strict; `no-explicit-any` and `no-unsafe-*` are errors; `noUncheckedIndexedAccess` is on.
- Renderer tests: `// @vitest-environment jsdom` per file **plus** explicit `afterEach(() => { cleanup(); })`.
- Husky pre-commit reformats staged files — if commit fails on lint-staged changes, `git add` again and retry.
- UI text is French; code/comments/commits are English. Lucide icons, never emoji.

**One design refinement vs the spec (carried through all tasks):** an AEAD MAC failure cannot distinguish "wrong passphrase" from "corrupt/partially-synced file". The error model therefore has a single `wrong_passphrase_or_corrupt` outcome and the UI says "Passphrase incorrecte ou fichier corrompu/incomplet". The spec's intent (never restore a dubious file, clear message) is preserved.

---

## File map

| File                                                                                                                                          | Role                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `src/shared/types/sync.ts` (create)                                                                                                           | Shared DTOs: settings view, launch-check result, IPC results          |
| `src/main/db/migrate.ts` (modify)                                                                                                             | Export `LATEST_SCHEMA_VERSION`                                        |
| `src/main/db/index.ts` (modify)                                                                                                               | Export `getDbPath()`                                                  |
| `src/main/sync/crypto.ts` (create)                                                                                                            | Argon2id key derivation + XChaCha20-Poly1305 encrypt/decrypt (pure)   |
| `src/main/sync/header.ts` (create)                                                                                                            | `.fbk` binary format build/parse (pure)                               |
| `src/main/sync/state.ts` (create)                                                                                                             | Sync settings + markers in `app_settings` (db-only)                   |
| `src/main/sync/passphrase.ts` (create)                                                                                                        | `safeStorage`-backed `PassphraseCipher` (thin Electron wrapper)       |
| `src/main/sync/snapshot.ts` (create)                                                                                                          | `VACUUM INTO` → encrypt → atomic write; header read; decrypt-to-file  |
| `src/main/sync/launchCheck.ts` (create)                                                                                                       | Pure 3-case launch decision state machine                             |
| `src/main/sync/restore.ts` (create)                                                                                                           | Integrity-checked DB swap with `.bak` backup                          |
| `src/main/sync/controller.ts` (create)                                                                                                        | Orchestrator: enable/disable, syncNow, markDirty debounce, quit flush |
| `src/main/ipc/handlers/sync.ts` (create)                                                                                                      | IPC handlers                                                          |
| `src/main/ipc/channels.ts` + `src/shared/types/ipc.ts` + `src/main/ipc/register.ts` (modify)                                                  | Contract + wiring + markDirty hook on mutating channels               |
| `src/main/index.ts` (modify)                                                                                                                  | `will-quit` flush                                                     |
| `src/renderer/components/sync/SyncSettingsSection.tsx` (create)                                                                               | Settings UI (enable dialog, status, Sync now, disable)                |
| `src/renderer/components/sync/SyncLaunchGate.tsx` (create)                                                                                    | Blocking launch modal (restore / conflict / errors)                   |
| `src/renderer/pages/SettingsPage.tsx` + `src/renderer/App.tsx` (modify)                                                                       | Mount the two components                                              |
| `docs/adr/017-user-managed-encrypted-sync-folder.md` (create) + `docs/adr/002-privacy-first-local.md` (modify)                                | ADR                                                                   |
| `tests/unit/sync/*.test.ts`, `tests/integration/sync/*.test.ts`, `tests/unit/renderer/SyncLaunchGate.test.tsx`, `tests/e2e/sync-flow.test.ts` | Tests                                                                 |

---

### Task 1: Add libsodium dependency

**Files:**

- Modify: `package.json` (via npm)

- [ ] **Step 1: Install**

```bash
npm install libsodium-wrappers-sumo
npm install -D @types/libsodium-wrappers-sumo
```

Note: the **sumo** variant is required — `crypto_pwhash` (Argon2id) is excluded from the standard `libsodium-wrappers` build.

- [ ] **Step 2: Sanity-check it loads under Node**

```bash
node -e "import('libsodium-wrappers-sumo').then(async (m) => { const s = m.default; await s.ready; console.log('pwhash alg:', s.crypto_pwhash_ALG_ARGON2ID13); })"
```

Expected: prints `pwhash alg: 2`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build(sync): add libsodium-wrappers-sumo for snapshot encryption"
```

---

### Task 2: Shared sync types + schema-version export

**Files:**

- Create: `src/shared/types/sync.ts`
- Modify: `src/main/db/migrate.ts` (export `LATEST_SCHEMA_VERSION`)
- Modify: `src/main/db/index.ts` (export `getDbPath()`)
- Test: `tests/unit/db/migrate.test.ts` (extend existing file)

- [ ] **Step 1: Create `src/shared/types/sync.ts`**

```ts
/** What the Settings UI needs to render the sync section. */
export interface SyncStatusView {
  enabled: boolean;
  folderPath: string | null;
  /** ISO timestamp of the last snapshot this machine wrote, null if never. */
  lastWriteAt: string | null;
  /** ISO timestamp of the last restore applied on this machine, null if never. */
  lastRestoreAt: string | null;
  /** Machine name embedded in the last restored snapshot. */
  lastRestoreFromMachine: string | null;
  /** Local DB has changes not yet written to the sync folder. */
  dirty: boolean;
}

/** Result of the launch-time (or post-enable) check against the sync folder. */
export type SyncLaunchCheck =
  | { kind: 'disabled' }
  | { kind: 'up_to_date' }
  | { kind: 'no_snapshot' }
  | { kind: 'folder_unavailable' }
  | { kind: 'snapshot_invalid' }
  | { kind: 'restore_available'; machineName: string; createdAt: string }
  | { kind: 'conflict'; machineName: string; createdAt: string }
  | { kind: 'schema_too_new'; machineName: string; createdAt: string };

export type SyncNowResult =
  | { ok: true; writtenAt: string }
  | { ok: false; error: 'disabled' | 'folder_unavailable' | 'write_failed' };

export type SyncRestoreResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | 'disabled'
        | 'folder_unavailable'
        | 'snapshot_invalid'
        | 'wrong_passphrase_or_corrupt'
        | 'integrity_failed'
        | 'schema_too_new';
    };

export type SyncEnableResult =
  | { ok: true }
  | { ok: false; error: 'safe_storage_unavailable' | 'folder_unavailable' };
```

- [ ] **Step 2: Export the latest schema version from `src/main/db/migrate.ts`**

Add after the `MIGRATIONS` array (currently ends at line 41):

```ts
/** Highest migration version this build knows — embedded in snapshot headers. */
export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;
```

(The `?? 0` keeps `noUncheckedIndexedAccess` happy.)

- [ ] **Step 3: Export the DB path from `src/main/db/index.ts`**

Add to `src/main/db/index.ts` (it already imports `app`, `join`):

```ts
export function getDbPath(): string {
  return join(app.getPath('userData'), 'finance.sqlite');
}
```

And use it inside `getDb()` — replace `const dbPath = join(userData, 'finance.sqlite');` with `const dbPath = getDbPath();` (keep the `mkdirSync(userData, …)` line above it).

- [ ] **Step 4: Add a regression test for `LATEST_SCHEMA_VERSION`**

Append to `tests/unit/db/migrate.test.ts`:

```ts
import { LATEST_SCHEMA_VERSION } from '../../../src/main/db/migrate';

describe('LATEST_SCHEMA_VERSION', () => {
  it('matches the max applied migration version', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const row = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as {
      v: number;
    };
    expect(LATEST_SCHEMA_VERSION).toBe(row.v);
    db.close();
  });
});
```

(Adapt imports to what the file already has — it already imports `DatabaseSync` and `runMigrations`.)

- [ ] **Step 5: Run the test**

```bash
npx vitest run tests/unit/db/migrate.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types/sync.ts src/main/db/migrate.ts src/main/db/index.ts tests/unit/db/migrate.test.ts
git commit -m "feat(sync): add shared sync types and schema-version export"
```

---

### Task 3: Crypto module (TDD)

**Files:**

- Create: `src/main/sync/crypto.ts`
- Test: `tests/unit/sync/crypto.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import {
  generateSalt,
  generateNonce,
  deriveKey,
  encrypt,
  decrypt,
} from '../../../src/main/sync/crypto';

describe('sync crypto', () => {
  it('round-trips plaintext with the right passphrase', async () => {
    const salt = await generateSalt();
    const nonce = await generateNonce();
    const key = await deriveKey('correct horse battery staple', salt);
    const plain = new TextEncoder().encode('hello snapshot');
    const cipher = await encrypt(plain, key, nonce);
    expect(cipher).not.toEqual(plain);
    const back = await decrypt(cipher, key, nonce);
    expect(back).not.toBeNull();
    expect(new TextDecoder().decode(back as Uint8Array)).toBe('hello snapshot');
  });

  it('returns null with a wrong passphrase', async () => {
    const salt = await generateSalt();
    const nonce = await generateNonce();
    const key = await deriveKey('right', salt);
    const wrongKey = await deriveKey('wrong', salt);
    const cipher = await encrypt(new TextEncoder().encode('secret'), key, nonce);
    expect(await decrypt(cipher, wrongKey, nonce)).toBeNull();
  });

  it('returns null on a truncated ciphertext (MAC failure)', async () => {
    const salt = await generateSalt();
    const nonce = await generateNonce();
    const key = await deriveKey('pw', salt);
    const cipher = await encrypt(new TextEncoder().encode('secret data here'), key, nonce);
    expect(await decrypt(cipher.subarray(0, cipher.length - 4), key, nonce)).toBeNull();
  });

  it('derives the same key for the same passphrase+salt, different for another salt', async () => {
    const salt = await generateSalt();
    const k1 = await deriveKey('pw', salt);
    const k2 = await deriveKey('pw', salt);
    const k3 = await deriveKey('pw', await generateSalt());
    expect(Buffer.from(k1).equals(Buffer.from(k2))).toBe(true);
    expect(Buffer.from(k1).equals(Buffer.from(k3))).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run tests/unit/sync/crypto.test.ts
```

Expected: FAIL — cannot resolve `src/main/sync/crypto`.

- [ ] **Step 3: Implement `src/main/sync/crypto.ts`**

```ts
import sodium from 'libsodium-wrappers-sumo';

// Argon2id with INTERACTIVE limits (~64 MiB, ~2 ops): derivation stays under a
// second on desktop hardware, which matters because it runs on every snapshot
// write/restore. The threat model is an encrypted blob sitting in a personal
// sync folder, not an offline cracking target with a weak passphrase.

export async function generateSalt(): Promise<Uint8Array> {
  await sodium.ready;
  return sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
}

export async function generateNonce(): Promise<Uint8Array> {
  await sodium.ready;
  return sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
}

export async function deriveKey(passphrase: string, salt: Uint8Array): Promise<Uint8Array> {
  await sodium.ready;
  return sodium.crypto_pwhash(
    sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES,
    passphrase,
    salt,
    sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  );
}

export async function encrypt(
  plain: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array,
): Promise<Uint8Array> {
  await sodium.ready;
  return sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(plain, null, null, nonce, key);
}

/**
 * Null on authentication failure — wrong passphrase and corrupt/truncated file
 * are cryptographically indistinguishable, callers must present both causes.
 */
export async function decrypt(
  cipher: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array,
): Promise<Uint8Array | null> {
  await sodium.ready;
  try {
    return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, cipher, null, nonce, key);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/unit/sync/crypto.test.ts
```

Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/sync/crypto.ts tests/unit/sync/crypto.test.ts
git commit -m "feat(sync): add Argon2id + XChaCha20-Poly1305 crypto module"
```

---

### Task 4: Snapshot file format (TDD)

**Files:**

- Create: `src/main/sync/header.ts`
- Test: `tests/unit/sync/header.test.ts`

File layout: `"FBK1"` magic (4 bytes) · uint32-LE header length · UTF-8 JSON header (plaintext, readable without the passphrase) · ciphertext.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import {
  buildSnapshotFile,
  parseSnapshotFile,
  type SnapshotHeader,
} from '../../../src/main/sync/header';

const header: SnapshotHeader = {
  formatVersion: 1,
  schemaVersion: 16,
  createdAt: '2026-06-10T14:32:00.000Z',
  machineName: 'denis-pc',
  snapshotId: '7f4f3f9a-0000-4000-8000-000000000001',
  salt: Buffer.from('salt'.repeat(4)).toString('base64'),
  nonce: Buffer.from('nonce-bytes-here-1234567').toString('base64'),
};

describe('snapshot file format', () => {
  it('round-trips header + ciphertext', () => {
    const cipher = Buffer.from([1, 2, 3, 4, 5]);
    const file = buildSnapshotFile(header, cipher);
    const parsed = parseSnapshotFile(file);
    expect(parsed).not.toBeNull();
    expect(parsed?.header).toEqual(header);
    expect(Buffer.from(parsed?.ciphertext ?? []).equals(cipher)).toBe(true);
  });

  it('rejects a bad magic', () => {
    const file = buildSnapshotFile(header, Buffer.from([1]));
    file[0] = 0x00;
    expect(parseSnapshotFile(file)).toBeNull();
  });

  it('rejects a file truncated inside the header', () => {
    const file = buildSnapshotFile(header, Buffer.from([1, 2, 3]));
    expect(parseSnapshotFile(file.subarray(0, 20))).toBeNull();
  });

  it('rejects a header that is not valid JSON', () => {
    const good = buildSnapshotFile(header, Buffer.alloc(0));
    good.write('{{{{', 8); // corrupt the JSON region
    expect(parseSnapshotFile(good)).toBeNull();
  });

  it('rejects a header missing required fields', () => {
    const json = Buffer.from(JSON.stringify({ formatVersion: 1 }), 'utf8');
    const len = Buffer.alloc(4);
    len.writeUInt32LE(json.length, 0);
    const file = Buffer.concat([Buffer.from('FBK1'), len, json]);
    expect(parseSnapshotFile(file)).toBeNull();
  });

  it('rejects an empty buffer', () => {
    expect(parseSnapshotFile(Buffer.alloc(0))).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run tests/unit/sync/header.test.ts
```

Expected: FAIL — cannot resolve `src/main/sync/header`.

- [ ] **Step 3: Implement `src/main/sync/header.ts`**

```ts
const MAGIC = Buffer.from('FBK1', 'ascii');
const LEN_OFFSET = MAGIC.length; // 4
const JSON_OFFSET = LEN_OFFSET + 4; // 8

export interface SnapshotHeader {
  formatVersion: 1;
  schemaVersion: number;
  /** ISO 8601 — display only; ordering decisions never compare clocks. */
  createdAt: string;
  machineName: string;
  /** UUID; identity for "have I already seen this snapshot". */
  snapshotId: string;
  /** base64 */
  salt: string;
  /** base64 */
  nonce: string;
}

export function buildSnapshotFile(header: SnapshotHeader, ciphertext: Uint8Array): Buffer {
  const json = Buffer.from(JSON.stringify(header), 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(json.length, 0);
  return Buffer.concat([MAGIC, len, json, Buffer.from(ciphertext)]);
}

export function parseSnapshotFile(
  buf: Buffer,
): { header: SnapshotHeader; ciphertext: Buffer } | null {
  if (buf.length < JSON_OFFSET || !buf.subarray(0, LEN_OFFSET).equals(MAGIC)) return null;
  const jsonLen = buf.readUInt32LE(LEN_OFFSET);
  if (buf.length < JSON_OFFSET + jsonLen) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(buf.subarray(JSON_OFFSET, JSON_OFFSET + jsonLen).toString('utf8'));
  } catch {
    return null;
  }
  if (!isSnapshotHeader(parsed)) return null;
  return { header: parsed, ciphertext: buf.subarray(JSON_OFFSET + jsonLen) };
}

function isSnapshotHeader(v: unknown): v is SnapshotHeader {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    o.formatVersion === 1 &&
    typeof o.schemaVersion === 'number' &&
    typeof o.createdAt === 'string' &&
    typeof o.machineName === 'string' &&
    typeof o.snapshotId === 'string' &&
    typeof o.salt === 'string' &&
    typeof o.nonce === 'string'
  );
}
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/unit/sync/header.test.ts
```

Expected: 6 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/sync/header.ts tests/unit/sync/header.test.ts
git commit -m "feat(sync): add .fbk snapshot file format (plaintext header + ciphertext)"
```

---

### Task 5: Sync state in app_settings (TDD)

**Files:**

- Create: `src/main/sync/state.ts`
- Create: `src/main/sync/passphrase.ts`
- Test: `tests/unit/sync/state.test.ts`

State lives in the existing `app_settings` table (migration 015, key/value TEXT — no new migration needed). The passphrase is stored encrypted at rest through an injected `PassphraseCipher` so tests never touch Electron; the real implementation wraps `safeStorage`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

const dbHolder: { db: DatabaseSync | null } = { db: null };
vi.mock('../../../src/main/db', () => ({ getDb: () => dbHolder.db }));

import {
  getSyncEnabled,
  getSyncFolder,
  getDirty,
  setDirty,
  getLastSeenSnapshotId,
  setLastSeenSnapshotId,
  enableSync,
  disableSync,
  getPassphrase,
  recordWrite,
  recordRestore,
  getStatusView,
  type PassphraseCipher,
} from '../../../src/main/sync/state';

/** Reversible fake "encryption" — enough to assert we never store the plaintext. */
const fakeCipher: PassphraseCipher = {
  isAvailable: () => true,
  encrypt: (plain) => Buffer.from(plain, 'utf8').toString('base64'),
  decrypt: (enc) => Buffer.from(enc, 'base64').toString('utf8'),
};

beforeEach(() => {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  dbHolder.db = db;
});

afterEach(() => {
  dbHolder.db?.close();
  dbHolder.db = null;
  vi.clearAllMocks();
});

describe('sync state', () => {
  it('is disabled by default with empty view', () => {
    expect(getSyncEnabled()).toBe(false);
    const view = getStatusView();
    expect(view).toEqual({
      enabled: false,
      folderPath: null,
      lastWriteAt: null,
      lastRestoreAt: null,
      lastRestoreFromMachine: null,
      dirty: false,
    });
  });

  it('enableSync stores folder and encrypted passphrase, round-trips passphrase', () => {
    enableSync('/sync/folder', 'my secret', fakeCipher);
    expect(getSyncEnabled()).toBe(true);
    expect(getSyncFolder()).toBe('/sync/folder');
    expect(getPassphrase(fakeCipher)).toBe('my secret');
    // never stored as plaintext
    const raw = dbHolder.db
      ?.prepare("SELECT value FROM app_settings WHERE key = 'sync.passphraseEnc'")
      .get() as { value: string };
    expect(raw.value).not.toBe('my secret');
  });

  it('dirty flag round-trips and survives via DB (not memory)', () => {
    expect(getDirty()).toBe(false);
    setDirty(true);
    expect(getDirty()).toBe(true);
    setDirty(false);
    expect(getDirty()).toBe(false);
  });

  it('lastSeenSnapshotId round-trips', () => {
    expect(getLastSeenSnapshotId()).toBeNull();
    setLastSeenSnapshotId('snap-1');
    expect(getLastSeenSnapshotId()).toBe('snap-1');
  });

  it('recordWrite and recordRestore update the status view', () => {
    enableSync('/sync/folder', 'pw', fakeCipher);
    recordWrite('2026-06-10T10:00:00.000Z', 'snap-1');
    expect(getLastSeenSnapshotId()).toBe('snap-1');
    expect(getDirty()).toBe(false);
    recordRestore('2026-06-10T11:00:00.000Z', 'denis-mac', 'snap-2');
    const view = getStatusView();
    expect(view.lastWriteAt).toBe('2026-06-10T10:00:00.000Z');
    expect(view.lastRestoreAt).toBe('2026-06-10T11:00:00.000Z');
    expect(view.lastRestoreFromMachine).toBe('denis-mac');
    expect(getLastSeenSnapshotId()).toBe('snap-2');
  });

  it('disableSync clears everything', () => {
    enableSync('/sync/folder', 'pw', fakeCipher);
    setDirty(true);
    setLastSeenSnapshotId('snap-1');
    disableSync();
    expect(getSyncEnabled()).toBe(false);
    expect(getSyncFolder()).toBeNull();
    expect(getPassphrase(fakeCipher)).toBeNull();
    expect(getDirty()).toBe(false);
    expect(getLastSeenSnapshotId()).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run tests/unit/sync/state.test.ts
```

Expected: FAIL — cannot resolve `src/main/sync/state`.

- [ ] **Step 3: Implement `src/main/sync/state.ts`**

```ts
import { getDb } from '../db';
import type { SyncStatusView } from '@shared/types/sync';

export interface PassphraseCipher {
  isAvailable(): boolean;
  /** plaintext → opaque string safe to persist */
  encrypt(plain: string): string;
  /** inverse of encrypt */
  decrypt(enc: string): string;
}

const KEYS = {
  enabled: 'sync.enabled',
  folder: 'sync.folderPath',
  passphraseEnc: 'sync.passphraseEnc',
  dirty: 'sync.dirty',
  lastSeenSnapshotId: 'sync.lastSeenSnapshotId',
  lastWriteAt: 'sync.lastWriteAt',
  lastRestoreAt: 'sync.lastRestoreAt',
  lastRestoreFrom: 'sync.lastRestoreFromMachine',
} as const;

function read(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

function write(key: string, value: string): void {
  getDb()
    .prepare(
      'INSERT INTO app_settings (key, value) VALUES (?, ?) ' +
        'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    )
    .run(key, value);
}

function remove(key: string): void {
  getDb().prepare('DELETE FROM app_settings WHERE key = ?').run(key);
}

export function getSyncEnabled(): boolean {
  return read(KEYS.enabled) === '1';
}

export function getSyncFolder(): string | null {
  return read(KEYS.folder);
}

export function getDirty(): boolean {
  return read(KEYS.dirty) === '1';
}

export function setDirty(value: boolean): void {
  write(KEYS.dirty, value ? '1' : '0');
}

export function getLastSeenSnapshotId(): string | null {
  return read(KEYS.lastSeenSnapshotId);
}

export function setLastSeenSnapshotId(id: string): void {
  write(KEYS.lastSeenSnapshotId, id);
}

export function enableSync(folderPath: string, passphrase: string, cipher: PassphraseCipher): void {
  write(KEYS.folder, folderPath);
  write(KEYS.passphraseEnc, cipher.encrypt(passphrase));
  write(KEYS.enabled, '1');
}

export function disableSync(): void {
  for (const key of Object.values(KEYS)) remove(key);
}

export function getPassphrase(cipher: PassphraseCipher): string | null {
  const enc = read(KEYS.passphraseEnc);
  if (enc === null) return null;
  return cipher.decrypt(enc);
}

/** After a successful snapshot write: our own snapshot becomes the last seen one. */
export function recordWrite(writtenAt: string, snapshotId: string): void {
  write(KEYS.lastWriteAt, writtenAt);
  setLastSeenSnapshotId(snapshotId);
  setDirty(false);
}

/** After a successful restore: the folder snapshot becomes the last seen one. */
export function recordRestore(restoredAt: string, fromMachine: string, snapshotId: string): void {
  write(KEYS.lastRestoreAt, restoredAt);
  write(KEYS.lastRestoreFrom, fromMachine);
  setLastSeenSnapshotId(snapshotId);
  setDirty(false);
}

export function getStatusView(): SyncStatusView {
  return {
    enabled: getSyncEnabled(),
    folderPath: getSyncFolder(),
    lastWriteAt: read(KEYS.lastWriteAt),
    lastRestoreAt: read(KEYS.lastRestoreAt),
    lastRestoreFromMachine: read(KEYS.lastRestoreFrom),
    dirty: getDirty(),
  };
}
```

- [ ] **Step 4: Implement `src/main/sync/passphrase.ts`** (thin Electron wrapper, no unit test — exercised by E2E)

```ts
import { safeStorage } from 'electron';
import type { PassphraseCipher } from './state';

/** OS-keychain-backed cipher (Keychain on macOS, DPAPI on Windows). */
export const safeStorageCipher: PassphraseCipher = {
  isAvailable: () => safeStorage.isEncryptionAvailable(),
  encrypt: (plain) => safeStorage.encryptString(plain).toString('base64'),
  decrypt: (enc) => safeStorage.decryptString(Buffer.from(enc, 'base64')),
};
```

- [ ] **Step 5: Run the tests**

```bash
npx vitest run tests/unit/sync/state.test.ts
```

Expected: 6 PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/sync/state.ts src/main/sync/passphrase.ts tests/unit/sync/state.test.ts
git commit -m "feat(sync): add sync state storage with encrypted-at-rest passphrase"
```

---

### Task 6: Snapshot write / header read / decrypt (integration TDD)

**Files:**

- Create: `src/main/sync/snapshot.ts`
- Test: `tests/integration/sync/snapshot.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import {
  writeSnapshot,
  readSnapshotHeader,
  decryptSnapshotToFile,
  SNAPSHOT_FILENAME,
} from '../../../src/main/sync/snapshot';

let dir: string;
let db: DatabaseSync;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fd-sync-'));
  db = new DatabaseSync(join(dir, 'source.sqlite'));
  db.exec('PRAGMA journal_mode = WAL');
  runMigrations(db);
  db.prepare(
    "INSERT INTO accounts (id, name, type, bank_id, currency) VALUES ('acc-1','Sync Test','checking','lcl','EUR')",
  ).run();
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('snapshot write + read', () => {
  it('writes finance.fbk and reads its header back', async () => {
    const folder = join(dir, 'syncfolder');
    // writeSnapshot must work even if the folder exists already (normal case)
    rmSync(folder, { recursive: true, force: true });
    const header = await writeSnapshot(db, {
      folderPath: dir,
      passphrase: 'pw',
      machineName: 'test-machine',
    });
    expect(existsSync(join(dir, SNAPSHOT_FILENAME))).toBe(true);
    const res = readSnapshotHeader(dir);
    expect(res.kind).toBe('ok');
    if (res.kind !== 'ok') return;
    expect(res.header.snapshotId).toBe(header.snapshotId);
    expect(res.header.machineName).toBe('test-machine');
    expect(res.header.schemaVersion).toBeGreaterThan(0);
  });

  it('decrypts the snapshot back to a valid SQLite file with the data', async () => {
    await writeSnapshot(db, { folderPath: dir, passphrase: 'pw', machineName: 'm' });
    const dest = join(dir, 'restored.sqlite');
    const result = await decryptSnapshotToFile(dir, 'pw', dest);
    expect(result).toBe('ok');
    const restored = new DatabaseSync(dest);
    const row = restored.prepare("SELECT name FROM accounts WHERE id = 'acc-1'").get() as {
      name: string;
    };
    expect(row.name).toBe('Sync Test');
    restored.close();
  });

  it('fails decryption with the wrong passphrase', async () => {
    await writeSnapshot(db, { folderPath: dir, passphrase: 'pw', machineName: 'm' });
    expect(await decryptSnapshotToFile(dir, 'nope', join(dir, 'out.sqlite'))).toBe('mac_failed');
    expect(existsSync(join(dir, 'out.sqlite'))).toBe(false);
  });

  it('reports missing / invalid / unavailable headers', async () => {
    expect(readSnapshotHeader(dir).kind).toBe('missing');
    writeFileSync(join(dir, SNAPSHOT_FILENAME), Buffer.from('garbage'));
    expect(readSnapshotHeader(dir).kind).toBe('invalid');
    expect(readSnapshotHeader(join(dir, 'does-not-exist')).kind).toBe('unavailable');
  });

  it('truncated file fails cleanly as mac_failed (partial sync simulation)', async () => {
    await writeSnapshot(db, { folderPath: dir, passphrase: 'pw', machineName: 'm' });
    const full = readFileSync(join(dir, SNAPSHOT_FILENAME));
    writeFileSync(join(dir, SNAPSHOT_FILENAME), full.subarray(0, full.length - 32));
    expect(await decryptSnapshotToFile(dir, 'pw', join(dir, 'out.sqlite'))).toBe('mac_failed');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run tests/integration/sync/snapshot.test.ts
```

Expected: FAIL — cannot resolve `src/main/sync/snapshot`.

- [ ] **Step 3: Implement `src/main/sync/snapshot.ts`**

```ts
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { buildSnapshotFile, parseSnapshotFile, type SnapshotHeader } from './header';
import { decrypt, deriveKey, encrypt, generateNonce, generateSalt } from './crypto';

export const SNAPSHOT_FILENAME = 'finance.fbk';

export type HeaderReadResult =
  | { kind: 'ok'; header: SnapshotHeader }
  | { kind: 'missing' }
  | { kind: 'invalid' }
  | { kind: 'unavailable' };

export interface WriteSnapshotOptions {
  folderPath: string;
  passphrase: string;
  machineName: string;
}

/**
 * VACUUM INTO a temp copy (clean, WAL-independent), encrypt it, then write
 * atomically into the sync folder (tmp file + rename, same filesystem).
 * Throws on fs errors — callers map that to a user-facing result.
 */
export async function writeSnapshot(
  db: DatabaseSync,
  opts: WriteSnapshotOptions,
): Promise<SnapshotHeader> {
  const vacuumPath = join(tmpdir(), `fd-vacuum-${randomUUID()}.sqlite`);
  try {
    // VACUUM INTO refuses to overwrite; the random name guarantees absence.
    db.exec(`VACUUM INTO '${vacuumPath.replaceAll("'", "''")}'`);
    const plain = readFileSync(vacuumPath);

    const salt = await generateSalt();
    const nonce = await generateNonce();
    const key = await deriveKey(opts.passphrase, salt);
    const ciphertext = await encrypt(plain, key, nonce);

    const schemaRow = db
      .prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations')
      .get() as { v: number };

    const header: SnapshotHeader = {
      formatVersion: 1,
      schemaVersion: schemaRow.v,
      createdAt: new Date().toISOString(),
      machineName: opts.machineName,
      snapshotId: randomUUID(),
      salt: Buffer.from(salt).toString('base64'),
      nonce: Buffer.from(nonce).toString('base64'),
    };

    const file = buildSnapshotFile(header, ciphertext);
    const tmpOut = join(opts.folderPath, `${SNAPSHOT_FILENAME}.tmp`);
    writeFileSync(tmpOut, file);
    renameSync(tmpOut, join(opts.folderPath, SNAPSHOT_FILENAME));
    return header;
  } finally {
    rmSync(vacuumPath, { force: true });
  }
}

export function readSnapshotHeader(folderPath: string): HeaderReadResult {
  try {
    if (!statSync(folderPath).isDirectory()) return { kind: 'unavailable' };
  } catch {
    return { kind: 'unavailable' };
  }
  const filePath = join(folderPath, SNAPSHOT_FILENAME);
  if (!existsSync(filePath)) return { kind: 'missing' };
  let buf: Buffer;
  try {
    buf = readFileSync(filePath);
  } catch {
    return { kind: 'unavailable' };
  }
  const parsed = parseSnapshotFile(buf);
  if (parsed === null) return { kind: 'invalid' };
  return { kind: 'ok', header: parsed.header };
}

/**
 * Decrypts the folder snapshot to destPath. Never leaves a partial file on
 * failure. 'mac_failed' covers both wrong passphrase and corrupt/truncated
 * data (indistinguishable by design).
 */
export async function decryptSnapshotToFile(
  folderPath: string,
  passphrase: string,
  destPath: string,
): Promise<'ok' | 'mac_failed' | 'invalid'> {
  const filePath = join(folderPath, SNAPSHOT_FILENAME);
  let parsed: ReturnType<typeof parseSnapshotFile>;
  try {
    parsed = parseSnapshotFile(readFileSync(filePath));
  } catch {
    return 'invalid';
  }
  if (parsed === null) return 'invalid';
  const salt = Buffer.from(parsed.header.salt, 'base64');
  const nonce = Buffer.from(parsed.header.nonce, 'base64');
  const key = await deriveKey(passphrase, salt);
  const plain = await decrypt(parsed.ciphertext, key, nonce);
  if (plain === null) return 'mac_failed';
  writeFileSync(destPath, plain);
  return 'ok';
}
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/integration/sync/snapshot.test.ts
```

Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/sync/snapshot.ts tests/integration/sync/snapshot.test.ts
git commit -m "feat(sync): add encrypted snapshot write/read with atomic folder output"
```

---

### Task 7: Launch-check decision (TDD, pure)

**Files:**

- Create: `src/main/sync/launchCheck.ts`
- Test: `tests/unit/sync/launchCheck.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { decideLaunch } from '../../../src/main/sync/launchCheck';
import type { SnapshotHeader } from '../../../src/main/sync/header';

const header = (over: Partial<SnapshotHeader> = {}): SnapshotHeader => ({
  formatVersion: 1,
  schemaVersion: 16,
  createdAt: '2026-06-09T22:14:00.000Z',
  machineName: 'denis-mac',
  snapshotId: 'snap-remote',
  salt: 'c2FsdA==',
  nonce: 'bm9uY2U=',
  ...over,
});

const base = {
  enabled: true,
  lastSeenSnapshotId: 'snap-local' as string | null,
  dirty: false,
  appSchemaVersion: 16,
};

describe('decideLaunch', () => {
  it('disabled when sync is off', () => {
    expect(decideLaunch({ ...base, enabled: false, header: { kind: 'missing' } })).toEqual({
      kind: 'disabled',
    });
  });

  it('no_snapshot when folder is empty', () => {
    expect(decideLaunch({ ...base, header: { kind: 'missing' } })).toEqual({ kind: 'no_snapshot' });
  });

  it('folder_unavailable when folder cannot be read', () => {
    expect(decideLaunch({ ...base, header: { kind: 'unavailable' } })).toEqual({
      kind: 'folder_unavailable',
    });
  });

  it('snapshot_invalid on unparseable file', () => {
    expect(decideLaunch({ ...base, header: { kind: 'invalid' } })).toEqual({
      kind: 'snapshot_invalid',
    });
  });

  it('up_to_date when the folder snapshot is the one we last saw', () => {
    expect(
      decideLaunch({
        ...base,
        header: { kind: 'ok', header: header({ snapshotId: 'snap-local' }) },
      }),
    ).toEqual({ kind: 'up_to_date' });
  });

  it('restore_available when snapshot is new and local DB is clean', () => {
    expect(decideLaunch({ ...base, header: { kind: 'ok', header: header() } })).toEqual({
      kind: 'restore_available',
      machineName: 'denis-mac',
      createdAt: '2026-06-09T22:14:00.000Z',
    });
  });

  it('conflict when snapshot is new and local DB is dirty', () => {
    expect(
      decideLaunch({ ...base, dirty: true, header: { kind: 'ok', header: header() } }),
    ).toEqual({
      kind: 'conflict',
      machineName: 'denis-mac',
      createdAt: '2026-06-09T22:14:00.000Z',
    });
  });

  it('schema_too_new wins over restore/conflict', () => {
    const res = decideLaunch({
      ...base,
      dirty: true,
      header: { kind: 'ok', header: header({ schemaVersion: 99 }) },
    });
    expect(res.kind).toBe('schema_too_new');
  });

  it('first launch on second machine: lastSeen null + clean → restore_available', () => {
    expect(
      decideLaunch({ ...base, lastSeenSnapshotId: null, header: { kind: 'ok', header: header() } }),
    ).toEqual({
      kind: 'restore_available',
      machineName: 'denis-mac',
      createdAt: '2026-06-09T22:14:00.000Z',
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run tests/unit/sync/launchCheck.test.ts
```

Expected: FAIL — cannot resolve `src/main/sync/launchCheck`.

- [ ] **Step 3: Implement `src/main/sync/launchCheck.ts`**

```ts
import type { SyncLaunchCheck } from '@shared/types/sync';
import type { HeaderReadResult } from './snapshot';

export interface LaunchCheckInput {
  enabled: boolean;
  header: HeaderReadResult;
  /** Snapshot id this machine last wrote or restored, null on first run. */
  lastSeenSnapshotId: string | null;
  /** Local DB has changes not yet snapshotted. */
  dirty: boolean;
  appSchemaVersion: number;
}

/**
 * Pure decision for the launch gate. Identity-based, never clock-based:
 * a snapshot is "new" iff its id differs from the one we last saw.
 */
export function decideLaunch(input: LaunchCheckInput): SyncLaunchCheck {
  if (!input.enabled) return { kind: 'disabled' };
  switch (input.header.kind) {
    case 'unavailable':
      return { kind: 'folder_unavailable' };
    case 'missing':
      return { kind: 'no_snapshot' };
    case 'invalid':
      return { kind: 'snapshot_invalid' };
    case 'ok':
      break;
  }
  const { header } = input.header;
  if (header.snapshotId === input.lastSeenSnapshotId) return { kind: 'up_to_date' };
  if (header.schemaVersion > input.appSchemaVersion) {
    return {
      kind: 'schema_too_new',
      machineName: header.machineName,
      createdAt: header.createdAt,
    };
  }
  if (input.dirty) {
    return { kind: 'conflict', machineName: header.machineName, createdAt: header.createdAt };
  }
  return {
    kind: 'restore_available',
    machineName: header.machineName,
    createdAt: header.createdAt,
  };
}
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/unit/sync/launchCheck.test.ts
```

Expected: 9 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/sync/launchCheck.ts tests/unit/sync/launchCheck.test.ts
git commit -m "feat(sync): add identity-based launch-check decision"
```

---

### Task 8: Restore (integration TDD)

**Files:**

- Create: `src/main/sync/restore.ts`
- Test: `tests/integration/sync/restore.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { writeSnapshot } from '../../../src/main/sync/snapshot';

const dbHolder: { db: DatabaseSync | null } = { db: null };
vi.mock('../../../src/main/db', () => ({ getDb: () => dbHolder.db }));

import { restoreFromFolder, type RestoreEnv } from '../../../src/main/sync/restore';

let dir: string;
let dbPath: string;

function openLocalDb(): DatabaseSync {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  runMigrations(db);
  return db;
}

const env = (): RestoreEnv => ({
  dbPath,
  closeDb: () => {
    dbHolder.db?.close();
    dbHolder.db = null;
  },
  reopenDb: () => {
    dbHolder.db = openLocalDb();
  },
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fd-restore-'));
  dbPath = join(dir, 'finance.sqlite');
  dbHolder.db = openLocalDb();
});

afterEach(() => {
  dbHolder.db?.close();
  dbHolder.db = null;
  rmSync(dir, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe('restoreFromFolder', () => {
  it('replaces the local DB with the snapshot and records state', async () => {
    // Build a "remote" DB with a marker row and snapshot it into the folder.
    const remoteDir = mkdtempSync(join(tmpdir(), 'fd-remote-'));
    const remote = new DatabaseSync(join(remoteDir, 'remote.sqlite'));
    runMigrations(remote);
    remote
      .prepare(
        "INSERT INTO accounts (id, name, type, bank_id, currency) VALUES ('acc-remote','Depuis Mac','checking','lcl','EUR')",
      )
      .run();
    const header = await writeSnapshot(remote, {
      folderPath: dir,
      passphrase: 'pw',
      machineName: 'denis-mac',
    });
    remote.close();
    rmSync(remoteDir, { recursive: true, force: true });

    const result = await restoreFromFolder(dir, 'pw', env());
    expect(result).toEqual({ ok: true });

    // restored data visible through the reopened db
    const row = dbHolder.db?.prepare("SELECT name FROM accounts WHERE id = 'acc-remote'").get() as {
      name: string;
    };
    expect(row.name).toBe('Depuis Mac');

    // a .bak of the pre-restore DB exists
    expect(readdirSync(dir).some((f) => f.startsWith('finance.sqlite.bak-'))).toBe(true);

    // state updated: snapshot now "seen", not dirty
    const seen = dbHolder.db
      ?.prepare("SELECT value FROM app_settings WHERE key = 'sync.lastSeenSnapshotId'")
      .get() as { value: string };
    expect(seen.value).toBe(header.snapshotId);
  });

  it('wrong passphrase leaves the local DB untouched', async () => {
    dbHolder.db
      ?.prepare(
        "INSERT INTO accounts (id, name, type, bank_id, currency) VALUES ('acc-local','Local','checking','lcl','EUR')",
      )
      .run();
    const remoteDir = mkdtempSync(join(tmpdir(), 'fd-remote-'));
    const remote = new DatabaseSync(join(remoteDir, 'remote.sqlite'));
    runMigrations(remote);
    await writeSnapshot(remote, { folderPath: dir, passphrase: 'pw', machineName: 'm' });
    remote.close();
    rmSync(remoteDir, { recursive: true, force: true });

    const result = await restoreFromFolder(dir, 'WRONG', env());
    expect(result).toEqual({ ok: false, error: 'wrong_passphrase_or_corrupt' });
    const row = dbHolder.db?.prepare("SELECT name FROM accounts WHERE id = 'acc-local'").get() as {
      name: string;
    };
    expect(row.name).toBe('Local');
    expect(existsSync(`${dbPath}.restore-tmp`)).toBe(false);
  });

  it('missing snapshot reports folder problem', async () => {
    const result = await restoreFromFolder(join(dir, 'nope'), 'pw', env());
    expect(result).toEqual({ ok: false, error: 'folder_unavailable' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run tests/integration/sync/restore.test.ts
```

Expected: FAIL — cannot resolve `src/main/sync/restore`.

- [ ] **Step 3: Implement `src/main/sync/restore.ts`**

```ts
import { copyFileSync, existsSync, renameSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { SyncRestoreResult } from '@shared/types/sync';
import { LATEST_SCHEMA_VERSION } from '../db/migrate';
import { decryptSnapshotToFile, readSnapshotHeader } from './snapshot';
import { recordRestore } from './state';

export interface RestoreEnv {
  dbPath: string;
  closeDb(): void;
  /** Reopen the app DB (runs migrations) so subsequent getDb() calls serve the restored data. */
  reopenDb(): void;
}

export async function restoreFromFolder(
  folderPath: string,
  passphrase: string,
  env: RestoreEnv,
): Promise<SyncRestoreResult> {
  const headerRes = readSnapshotHeader(folderPath);
  if (headerRes.kind === 'unavailable' || headerRes.kind === 'missing') {
    return { ok: false, error: 'folder_unavailable' };
  }
  if (headerRes.kind === 'invalid') return { ok: false, error: 'snapshot_invalid' };
  const { header } = headerRes;
  if (header.schemaVersion > LATEST_SCHEMA_VERSION) {
    return { ok: false, error: 'schema_too_new' };
  }

  const tmpPath = `${env.dbPath}.restore-tmp`;
  rmSync(tmpPath, { force: true });
  const decrypted = await decryptSnapshotToFile(folderPath, passphrase, tmpPath);
  if (decrypted === 'invalid') return { ok: false, error: 'snapshot_invalid' };
  if (decrypted === 'mac_failed') return { ok: false, error: 'wrong_passphrase_or_corrupt' };

  try {
    const check = new DatabaseSync(tmpPath);
    const row = check.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
    check.close();
    if (row.integrity_check !== 'ok') {
      rmSync(tmpPath, { force: true });
      return { ok: false, error: 'integrity_failed' };
    }
  } catch {
    rmSync(tmpPath, { force: true });
    return { ok: false, error: 'integrity_failed' };
  }

  env.closeDb();
  if (existsSync(env.dbPath)) {
    const stamp = new Date().toISOString().replaceAll(':', '-');
    copyFileSync(env.dbPath, `${env.dbPath}.bak-${stamp}`);
  }
  // WAL side files belong to the old DB; they must not shadow the restored one.
  rmSync(`${env.dbPath}-wal`, { force: true });
  rmSync(`${env.dbPath}-shm`, { force: true });
  renameSync(tmpPath, env.dbPath);
  env.reopenDb();

  recordRestore(new Date().toISOString(), header.machineName, header.snapshotId);
  return { ok: true };
}
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/integration/sync/restore.test.ts
```

Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/sync/restore.ts tests/integration/sync/restore.test.ts
git commit -m "feat(sync): add integrity-checked restore with local backup"
```

---

### Task 9: Sync controller (TDD)

**Files:**

- Create: `src/main/sync/controller.ts`
- Test: `tests/unit/sync/controller.test.ts`

The controller is the single entry point the IPC layer and app lifecycle use. It binds state + snapshot + restore together, owns the debounce, and resolves the machine name (`os.hostname()`).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { SNAPSHOT_FILENAME } from '../../../src/main/sync/snapshot';
import type { PassphraseCipher } from '../../../src/main/sync/state';

const dbHolder: { db: DatabaseSync | null } = { db: null };
let dbPath: string;
vi.mock('../../../src/main/db', () => ({
  getDb: () => dbHolder.db,
  getDbPath: () => dbPath,
  closeDb: () => {
    dbHolder.db?.close();
    dbHolder.db = null;
  },
}));

const fakeCipher: PassphraseCipher = {
  isAvailable: () => true,
  encrypt: (plain) => Buffer.from(plain, 'utf8').toString('base64'),
  decrypt: (enc) => Buffer.from(enc, 'base64').toString('utf8'),
};
vi.mock('../../../src/main/sync/passphrase', () => ({
  get safeStorageCipher() {
    return fakeCipher;
  },
}));

import { SyncController } from '../../../src/main/sync/controller';

let dir: string;
let folder: string;
let controller: SyncController;

beforeEach(() => {
  vi.useFakeTimers();
  dir = mkdtempSync(join(tmpdir(), 'fd-ctrl-'));
  folder = mkdtempSync(join(tmpdir(), 'fd-ctrl-folder-'));
  dbPath = join(dir, 'finance.sqlite');
  dbHolder.db = new DatabaseSync(dbPath);
  runMigrations(dbHolder.db);
  controller = new SyncController();
});

afterEach(() => {
  vi.useRealTimers();
  dbHolder.db?.close();
  dbHolder.db = null;
  rmSync(dir, { recursive: true, force: true });
  rmSync(folder, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe('SyncController', () => {
  it('syncNow is a no-op error when disabled', async () => {
    expect(await controller.syncNow()).toEqual({ ok: false, error: 'disabled' });
  });

  it('enable + syncNow writes a snapshot and clears dirty', async () => {
    expect(controller.enable(folder, 'pw')).toEqual({ ok: true });
    controller.markDirty();
    const result = await controller.syncNow();
    expect(result.ok).toBe(true);
    expect(existsSync(join(folder, SNAPSHOT_FILENAME))).toBe(true);
    expect(controller.getStatusView().dirty).toBe(false);
    expect(controller.needsQuitFlush()).toBe(false);
  });

  it('enable refuses an unreachable folder', () => {
    expect(controller.enable(join(folder, 'missing-sub'), 'pw')).toEqual({
      ok: false,
      error: 'folder_unavailable',
    });
  });

  it('markDirty schedules a debounced syncNow', async () => {
    controller.enable(folder, 'pw');
    controller.markDirty();
    expect(controller.getStatusView().dirty).toBe(true);
    expect(existsSync(join(folder, SNAPSHOT_FILENAME))).toBe(false);
    await vi.advanceTimersByTimeAsync(31_000);
    expect(existsSync(join(folder, SNAPSHOT_FILENAME))).toBe(true);
    expect(controller.getStatusView().dirty).toBe(false);
  });

  it('markDirty does nothing when sync is disabled', () => {
    controller.markDirty();
    expect(controller.getStatusView().dirty).toBe(false);
  });

  it('launchCheck reflects the folder state', async () => {
    controller.enable(folder, 'pw');
    expect(controller.launchCheck().kind).toBe('no_snapshot');
    await controller.syncNow();
    expect(controller.launchCheck().kind).toBe('up_to_date');
  });

  it('needsQuitFlush true only when enabled and dirty', () => {
    expect(controller.needsQuitFlush()).toBe(false);
    controller.enable(folder, 'pw');
    expect(controller.needsQuitFlush()).toBe(false);
    controller.markDirty();
    expect(controller.needsQuitFlush()).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run tests/unit/sync/controller.test.ts
```

Expected: FAIL — cannot resolve `src/main/sync/controller`.

- [ ] **Step 3: Implement `src/main/sync/controller.ts`**

```ts
import { statSync } from 'node:fs';
import { hostname } from 'node:os';
import type {
  SyncEnableResult,
  SyncLaunchCheck,
  SyncNowResult,
  SyncRestoreResult,
  SyncStatusView,
} from '@shared/types/sync';
import { closeDb, getDb, getDbPath } from '../db';
import { LATEST_SCHEMA_VERSION } from '../db/migrate';
import { decideLaunch } from './launchCheck';
import { safeStorageCipher } from './passphrase';
import { restoreFromFolder } from './restore';
import { readSnapshotHeader, writeSnapshot } from './snapshot';
import * as state from './state';

const DEBOUNCE_MS = 30_000;

export class SyncController {
  private debounceTimer: NodeJS.Timeout | null = null;

  enable(folderPath: string, passphrase: string): SyncEnableResult {
    if (!safeStorageCipher.isAvailable()) {
      return { ok: false, error: 'safe_storage_unavailable' };
    }
    try {
      if (!statSync(folderPath).isDirectory()) return { ok: false, error: 'folder_unavailable' };
    } catch {
      return { ok: false, error: 'folder_unavailable' };
    }
    state.enableSync(folderPath, passphrase, safeStorageCipher);
    return { ok: true };
  }

  disable(): void {
    this.clearDebounce();
    state.disableSync();
  }

  getStatusView(): SyncStatusView {
    return state.getStatusView();
  }

  /** Mark the DB as changed and schedule a debounced snapshot write. */
  markDirty(): void {
    if (!state.getSyncEnabled()) return;
    state.setDirty(true);
    this.clearDebounce();
    this.debounceTimer = setTimeout(() => {
      void this.syncNow().catch((e: unknown) => {
        console.error('sync: debounced snapshot failed', e);
      });
    }, DEBOUNCE_MS);
    this.debounceTimer.unref();
  }

  async syncNow(): Promise<SyncNowResult> {
    this.clearDebounce();
    if (!state.getSyncEnabled()) return { ok: false, error: 'disabled' };
    const folderPath = state.getSyncFolder();
    const passphrase = state.getPassphrase(safeStorageCipher);
    if (folderPath === null || passphrase === null) return { ok: false, error: 'disabled' };
    try {
      if (!statSync(folderPath).isDirectory()) return { ok: false, error: 'folder_unavailable' };
    } catch {
      return { ok: false, error: 'folder_unavailable' };
    }
    try {
      const header = await writeSnapshot(getDb(), {
        folderPath,
        passphrase,
        machineName: hostname(),
      });
      state.recordWrite(header.createdAt, header.snapshotId);
      return { ok: true, writtenAt: header.createdAt };
    } catch (e) {
      console.error('sync: snapshot write failed', e);
      return { ok: false, error: 'write_failed' };
    }
  }

  launchCheck(): SyncLaunchCheck {
    const enabled = state.getSyncEnabled();
    const folderPath = state.getSyncFolder();
    return decideLaunch({
      enabled,
      header: enabled && folderPath !== null ? readSnapshotHeader(folderPath) : { kind: 'missing' },
      lastSeenSnapshotId: state.getLastSeenSnapshotId(),
      dirty: state.getDirty(),
      appSchemaVersion: LATEST_SCHEMA_VERSION,
    });
  }

  async restore(): Promise<SyncRestoreResult> {
    if (!state.getSyncEnabled()) return { ok: false, error: 'disabled' };
    const folderPath = state.getSyncFolder();
    const passphrase = state.getPassphrase(safeStorageCipher);
    if (folderPath === null || passphrase === null) return { ok: false, error: 'disabled' };
    return restoreFromFolder(folderPath, passphrase, {
      dbPath: getDbPath(),
      closeDb,
      reopenDb: () => {
        getDb();
      },
    });
  }

  needsQuitFlush(): boolean {
    return state.getSyncEnabled() && state.getDirty();
  }

  async flushOnQuit(): Promise<void> {
    if (!this.needsQuitFlush()) return;
    const result = await this.syncNow();
    if (!result.ok) console.error('sync: quit flush failed:', result.error);
  }

  private clearDebounce(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}

export const syncController = new SyncController();
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/unit/sync/controller.test.ts
```

Expected: 7 PASS.

- [ ] **Step 5: Run the whole sync suite once**

```bash
npx vitest run tests/unit/sync tests/integration/sync
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/sync/controller.ts tests/unit/sync/controller.test.ts
git commit -m "feat(sync): add sync controller (enable, debounce, syncNow, quit flush)"
```

---

### Task 10: IPC contract, handlers, wiring + markDirty hook

**Files:**

- Modify: `src/shared/types/ipc.ts`
- Modify: `src/main/ipc/channels.ts`
- Create: `src/main/ipc/handlers/sync.ts`
- Modify: `src/main/ipc/register.ts`
- Test: typecheck (the contract is types; behavior is covered by Task 9 + E2E)

- [ ] **Step 1: Extend `src/shared/types/ipc.ts`**

Add to the imports at the top:

```ts
import type {
  SyncStatusView,
  SyncLaunchCheck,
  SyncNowResult,
  SyncRestoreResult,
  SyncEnableResult,
} from './sync';
```

Add to the `IpcContract` interface (before the closing brace):

```ts
  'sync:getStatus': { payload: Record<string, never>; response: SyncStatusView };
  'sync:pickFolder': {
    payload: Record<string, never>;
    response: { cancelled: true } | { cancelled: false; path: string };
  };
  'sync:enable': {
    payload: { folderPath: string; passphrase: string };
    response: SyncEnableResult;
  };
  'sync:disable': { payload: Record<string, never>; response: { ok: true } };
  'sync:now': { payload: Record<string, never>; response: SyncNowResult };
  'sync:launchCheck': { payload: Record<string, never>; response: SyncLaunchCheck };
  'sync:restore': { payload: Record<string, never>; response: SyncRestoreResult };
  'sync:keepLocal': { payload: Record<string, never>; response: SyncNowResult };
```

- [ ] **Step 2: Extend `src/main/ipc/channels.ts`**

Add to the `CHANNELS` object:

```ts
  syncGetStatus: 'sync:getStatus',
  syncPickFolder: 'sync:pickFolder',
  syncEnable: 'sync:enable',
  syncDisable: 'sync:disable',
  syncNow: 'sync:now',
  syncLaunchCheck: 'sync:launchCheck',
  syncRestore: 'sync:restore',
  syncKeepLocal: 'sync:keepLocal',
```

- [ ] **Step 3: Create `src/main/ipc/handlers/sync.ts`**

```ts
import { dialog } from 'electron';
import type {
  SyncEnableResult,
  SyncLaunchCheck,
  SyncNowResult,
  SyncRestoreResult,
  SyncStatusView,
} from '@shared/types/sync';
import { syncController } from '../../sync/controller';

export function handleSyncGetStatus(): SyncStatusView {
  return syncController.getStatusView();
}

export async function handleSyncPickFolder(): Promise<
  { cancelled: true } | { cancelled: false; path: string }
> {
  const result = await dialog.showOpenDialog({
    title: 'Choisir le dossier de synchronisation',
    properties: ['openDirectory', 'createDirectory'],
  });
  const first = result.filePaths[0];
  if (result.canceled || first === undefined) return { cancelled: true };
  return { cancelled: false, path: first };
}

export function handleSyncEnable(payload: {
  folderPath: string;
  passphrase: string;
}): SyncEnableResult {
  return syncController.enable(payload.folderPath, payload.passphrase);
}

export function handleSyncDisable(): { ok: true } {
  syncController.disable();
  return { ok: true };
}

export function handleSyncNow(): Promise<SyncNowResult> {
  return syncController.syncNow();
}

export function handleSyncLaunchCheck(): SyncLaunchCheck {
  return syncController.launchCheck();
}

export function handleSyncRestore(): Promise<SyncRestoreResult> {
  return syncController.restore();
}

/** Conflict resolution "keep this machine": overwrite the folder snapshot. */
export function handleSyncKeepLocal(): Promise<SyncNowResult> {
  return syncController.syncNow();
}
```

- [ ] **Step 4: Wire into `src/main/ipc/register.ts` + markDirty hook**

Add the imports:

```ts
import {
  handleSyncGetStatus,
  handleSyncPickFolder,
  handleSyncEnable,
  handleSyncDisable,
  handleSyncNow,
  handleSyncLaunchCheck,
  handleSyncRestore,
  handleSyncKeepLocal,
} from './handlers/sync';
import { syncController } from '../sync/controller';
```

Add the mutating-channel set (top level, after `isValidSender`):

```ts
// Channels whose successful completion changes user data — each one marks the
// DB dirty so the sync controller schedules a debounced snapshot.
const MUTATING_CHANNELS: ReadonlySet<IpcChannel> = new Set<IpcChannel>([
  'import:confirm',
  'categorize:batch',
  'accounts:create',
  'accounts:update',
  'accounts:delete',
  'accounts:setDeclaredBalance',
  'categories:rename',
  'categories:create',
  'categories:delete',
  'transactions:setCategory',
  'transactions:update',
  'transactions:delete',
  'transactions:restore',
  'transactions:setTransfer',
  'banks:learn',
  'settings:setCategorizeOptOut',
]);
```

Change `register` so the hook fires after a successful handler:

```ts
function register<C extends IpcChannel>(channel: C, handler: Handler<C>): void {
  ipcMain.handle(channel, async (event, payload: IpcPayload<C>) => {
    if (!isValidSender(event)) {
      throw new Error(`IPC: unauthorized sender for channel "${channel}"`);
    }
    const result = await handler(payload);
    if (MUTATING_CHANNELS.has(channel)) syncController.markDirty();
    return result;
  });
}
```

Add registrations at the end of `registerAllHandlers()`:

```ts
register(CHANNELS.syncGetStatus, () => handleSyncGetStatus());
register(CHANNELS.syncPickFolder, () => handleSyncPickFolder());
register(CHANNELS.syncEnable, handleSyncEnable);
register(CHANNELS.syncDisable, () => handleSyncDisable());
register(CHANNELS.syncNow, () => handleSyncNow());
register(CHANNELS.syncLaunchCheck, () => handleSyncLaunchCheck());
register(CHANNELS.syncRestore, () => handleSyncRestore());
register(CHANNELS.syncKeepLocal, () => handleSyncKeepLocal());
```

- [ ] **Step 5: Verify gate**

```bash
npm run typecheck && npm run lint && npm test
```

Expected: all clean/green.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types/ipc.ts src/main/ipc/channels.ts src/main/ipc/handlers/sync.ts src/main/ipc/register.ts
git commit -m "feat(sync): add sync IPC contract and mark-dirty hook on mutating channels"
```

---

### Task 11: Quit flush in `src/main/index.ts`

**Files:**

- Modify: `src/main/index.ts`

- [ ] **Step 1: Add the import**

```ts
import { syncController } from './sync/controller';
```

- [ ] **Step 2: Replace the existing `will-quit` handler**

Replace:

```ts
app.on('will-quit', () => {
  closeDb();
});
```

with:

```ts
// Write a final snapshot when quitting with unsynced changes. preventDefault +
// async flush + re-quit is the standard Electron pattern; the guard makes the
// second pass fall through to closeDb.
let quitFlushStarted = false;
app.on('will-quit', (event) => {
  if (!quitFlushStarted && syncController.needsQuitFlush()) {
    quitFlushStarted = true;
    event.preventDefault();
    void syncController
      .flushOnQuit()
      .catch((e: unknown) => {
        console.error('sync: quit flush failed', e);
      })
      .finally(() => {
        closeDb();
        app.quit();
      });
    return;
  }
  closeDb();
});
```

- [ ] **Step 3: Verify build + tests**

```bash
npm run typecheck && npm run build
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(sync): flush a final snapshot on quit when dirty"
```

---

### Task 12: Settings UI — sync section

**Files:**

- Create: `src/renderer/components/sync/SyncSettingsSection.tsx`
- Modify: `src/renderer/pages/SettingsPage.tsx`

No new unit test here — presentation wiring over an already-tested contract; behavior is covered by the E2E (Task 15). Per project feedback, this UI must be **maintainer-validated in-app before merge**.

- [ ] **Step 1: Create `src/renderer/components/sync/SyncSettingsSection.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { SyncStatusView } from '@shared/types/sync';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { ipc } from '../../ipc/client';

function formatTs(iso: string | null): string {
  if (iso === null) return '—';
  return format(new Date(iso), "d MMM yyyy 'à' HH:mm", { locale: fr });
}

const ENABLE_ERRORS: Record<string, string> = {
  safe_storage_unavailable: 'Le trousseau système est indisponible sur cette machine.',
  folder_unavailable: 'Ce dossier est introuvable ou inaccessible.',
};

const SYNC_ERRORS: Record<string, string> = {
  disabled: 'La synchronisation est désactivée.',
  folder_unavailable: 'Dossier de synchronisation introuvable (Syncthing arrêté ?).',
  write_failed: "Échec d'écriture du snapshot.",
};

export function SyncSettingsSection({
  Row,
}: {
  Row: (props: { label: string; hint?: string; children: React.ReactNode }) => React.ReactNode;
}) {
  const [status, setStatus] = useState<SyncStatusView | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(() => {
    void ipc.invoke('sync:getStatus', {}).then(setStatus);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (status === null) return null;

  if (!status.enabled) {
    return (
      <>
        <Row
          label="Synchronisation entre machines"
          hint="Snapshot chiffré dans un dossier que tu fais transiter toi-même (Syncthing, cloud perso)."
        >
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setSetupOpen(true);
            }}
          >
            Configurer
          </Button>
        </Row>
        <SyncSetupDialog
          open={setupOpen}
          onClose={() => {
            setSetupOpen(false);
          }}
          onEnabled={refresh}
        />
      </>
    );
  }

  return (
    <>
      <Row label="Dossier de synchronisation">
        <span className="max-w-[280px] truncate font-mono text-[12px] text-paper-soft">
          {status.folderPath ?? '—'}
        </span>
      </Row>
      <Row label="Dernier snapshot écrit">
        <span className="font-mono text-[12px] text-paper-soft">
          {formatTs(status.lastWriteAt)}
          {status.dirty ? ' · modifications en attente' : ''}
        </span>
      </Row>
      <Row label="Dernière restauration">
        <span className="font-mono text-[12px] text-paper-soft">
          {formatTs(status.lastRestoreAt)}
          {status.lastRestoreFromMachine !== null ? ` (${status.lastRestoreFromMachine})` : ''}
        </span>
      </Row>
      <Row label="Actions">
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={syncing}
            onClick={() => {
              setSyncing(true);
              void ipc
                .invoke('sync:now', {})
                .then((res) => {
                  if (res.ok) toast.success('Snapshot écrit.');
                  else toast.error(SYNC_ERRORS[res.error] ?? res.error);
                  refresh();
                })
                .finally(() => {
                  setSyncing(false);
                });
            }}
          >
            Synchroniser maintenant
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              void ipc.invoke('sync:disable', {}).then(() => {
                toast.info('Synchronisation désactivée.');
                refresh();
              });
            }}
          >
            Désactiver
          </Button>
        </div>
      </Row>
    </>
  );
}

function SyncSetupDialog({
  open,
  onClose,
  onEnabled,
}: {
  open: boolean;
  onClose: () => void;
  onEnabled: () => void;
}) {
  const [folder, setFolder] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const canSubmit = folder !== null && passphrase.length >= 8 && passphrase === confirm && !busy;

  const inputClass =
    'w-full rounded-md border border-line-2 bg-ink-2 px-2.5 py-1.5 font-sans text-[13px] text-paper outline-none focus:border-brass/60';

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configurer la synchronisation</DialogTitle>
          <DialogDescription>
            L'app écrit un snapshot chiffré dans le dossier choisi. Utilise la même passphrase sur
            tes deux machines. Minimum 8 caractères.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void ipc.invoke('sync:pickFolder', {}).then((res) => {
                  if (!res.cancelled) setFolder(res.path);
                });
              }}
            >
              Choisir un dossier
            </Button>
            <span className="max-w-[260px] truncate font-mono text-[12px] text-paper-dim">
              {folder ?? 'Aucun dossier choisi'}
            </span>
          </div>
          <input
            type="password"
            value={passphrase}
            placeholder="Passphrase"
            className={inputClass}
            onChange={(e) => {
              setPassphrase(e.target.value);
            }}
          />
          <input
            type="password"
            value={confirm}
            placeholder="Confirmer la passphrase"
            className={inputClass}
            onChange={(e) => {
              setConfirm(e.target.value);
            }}
          />
          {confirm.length > 0 && confirm !== passphrase ? (
            <span className="font-sans text-[11px] text-coral">
              Les deux passphrases ne correspondent pas.
            </span>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Annuler
          </Button>
          <Button
            size="sm"
            disabled={!canSubmit}
            onClick={() => {
              if (folder === null) return;
              setBusy(true);
              void ipc
                .invoke('sync:enable', { folderPath: folder, passphrase })
                .then((res) => {
                  if (res.ok) {
                    toast.success('Synchronisation activée.');
                    onClose();
                    onEnabled();
                    // A snapshot from the other machine may already be waiting.
                    window.dispatchEvent(new CustomEvent('sync:recheck'));
                  } else {
                    toast.error(ENABLE_ERRORS[res.error] ?? res.error);
                  }
                })
                .finally(() => {
                  setBusy(false);
                });
            }}
          >
            Activer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Note: check `src/renderer/components/ui/dialog.tsx` for the exact exported names (`DialogContent`, `DialogHeader`, …) and adapt imports if they differ.

- [ ] **Step 2: Mount it in `src/renderer/pages/SettingsPage.tsx`**

Add the import:

```tsx
import { FolderSync } from 'lucide-react';
import { SyncSettingsSection } from '../components/sync/SyncSettingsSection';
```

Add a new section component and render it inside `SettingsPage` between `<DataSection />` and `<AppearanceSection />`:

```tsx
function SyncSection() {
  return (
    <Section icon={FolderSync} overline="— Multi-machines" title="Synchronisation">
      <SyncSettingsSection Row={Row} />
    </Section>
  );
}
```

(The existing local `Row` helper is passed down so the rows render identically to the other sections.)

- [ ] **Step 3: Verify**

```bash
npm run typecheck && npm run lint && npm run build
```

Expected: clean. Then a quick manual smoke: `npm run dev`, open Réglages, see the "Synchronisation" section with "Configurer".

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/sync/SyncSettingsSection.tsx src/renderer/pages/SettingsPage.tsx
git commit -m "feat(sync): add sync settings section (enable flow, status, sync now)"
```

---

### Task 13: Launch gate modal

**Files:**

- Create: `src/renderer/components/sync/SyncLaunchGate.tsx`
- Modify: `src/renderer/App.tsx`
- Test: `tests/unit/renderer/SyncLaunchGate.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SyncLaunchGate } from '../../../src/renderer/components/sync/SyncLaunchGate';
import type { SyncLaunchCheck } from '@shared/types/sync';

let launchCheck: SyncLaunchCheck;

beforeEach(() => {
  launchCheck = { kind: 'disabled' };
  window.electronAPI = {
    invoke: vi.fn((channel: string) => {
      if (channel === 'sync:launchCheck') return Promise.resolve(launchCheck);
      return Promise.resolve({ ok: true });
    }),
    getDroppedPaths: vi.fn(() => []),
    onModelProgress: vi.fn(() => () => undefined),
  } as unknown as typeof window.electronAPI;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SyncLaunchGate', () => {
  it('renders nothing when sync is disabled', async () => {
    render(<SyncLaunchGate />);
    await vi.waitFor(() => {
      expect(window.electronAPI.invoke).toHaveBeenCalledWith('sync:launchCheck', {});
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the restore dialog when a newer snapshot exists', async () => {
    launchCheck = {
      kind: 'restore_available',
      machineName: 'denis-mac',
      createdAt: '2026-06-09T22:14:00.000Z',
    };
    render(<SyncLaunchGate />);
    expect(await screen.findByText(/Données plus récentes trouvées/i)).toBeTruthy();
    expect(screen.getByText(/denis-mac/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Restaurer/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Ignorer/i })).toBeTruthy();
  });

  it('shows the conflict dialog with both choices', async () => {
    launchCheck = {
      kind: 'conflict',
      machineName: 'denis-mac',
      createdAt: '2026-06-09T22:14:00.000Z',
    };
    render(<SyncLaunchGate />);
    expect(await screen.findByText(/Conflit de synchronisation/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Garder cette machine/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Prendre l'autre/i })).toBeTruthy();
  });

  it('shows the update-required message when the snapshot schema is newer', async () => {
    launchCheck = {
      kind: 'schema_too_new',
      machineName: 'denis-mac',
      createdAt: '2026-06-09T22:14:00.000Z',
    };
    render(<SyncLaunchGate />);
    expect(await screen.findByText(/Mets à jour l'app/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run tests/unit/renderer/SyncLaunchGate.test.tsx
```

Expected: FAIL — cannot resolve the component.

- [ ] **Step 3: Implement `src/renderer/components/sync/SyncLaunchGate.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { SyncLaunchCheck } from '@shared/types/sync';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { ipc } from '../../ipc/client';

const RESTORE_ERRORS: Record<string, string> = {
  disabled: 'La synchronisation est désactivée.',
  folder_unavailable: 'Dossier de synchronisation introuvable.',
  snapshot_invalid: 'Le fichier de snapshot est invalide.',
  wrong_passphrase_or_corrupt: 'Passphrase incorrecte ou fichier corrompu/incomplet.',
  integrity_failed: 'La base restaurée a échoué la vérification d’intégrité.',
  schema_too_new: "Snapshot créé par une version plus récente de l'app.",
};

function describe(machineName: string, createdAt: string): string {
  const ts = format(new Date(createdAt), "d MMM yyyy 'à' HH:mm", { locale: fr });
  return `${machineName}, le ${ts}`;
}

/**
 * Blocking launch gate: checks the sync folder before the user works on data
 * that a restore would overwrite. Also re-checks on the window event
 * 'sync:recheck' (fired right after enabling sync in settings).
 */
export function SyncLaunchGate() {
  const [check, setCheck] = useState<SyncLaunchCheck | null>(null);
  const [busy, setBusy] = useState(false);

  const runCheck = useCallback(() => {
    void ipc.invoke('sync:launchCheck', {}).then((res) => {
      if (res.kind === 'folder_unavailable') {
        toast.warning('Dossier de synchronisation introuvable — snapshot ignoré.');
      }
      setCheck(res);
    });
  }, []);

  useEffect(() => {
    runCheck();
    window.addEventListener('sync:recheck', runCheck);
    return () => {
      window.removeEventListener('sync:recheck', runCheck);
    };
  }, [runCheck]);

  if (check === null) return null;

  const dismiss = () => {
    setCheck({ kind: 'up_to_date' });
  };

  const doRestore = () => {
    setBusy(true);
    void ipc
      .invoke('sync:restore', {})
      .then((res) => {
        if (res.ok) {
          // Full reload: every page refetches from the restored DB.
          window.location.reload();
        } else {
          toast.error(RESTORE_ERRORS[res.error] ?? res.error);
          setBusy(false);
        }
      })
      .catch(() => {
        setBusy(false);
      });
  };

  const doKeepLocal = () => {
    setBusy(true);
    void ipc
      .invoke('sync:keepLocal', {})
      .then((res) => {
        if (res.ok) toast.success('Snapshot du dossier remplacé par les données de cette machine.');
        else toast.error(RESTORE_ERRORS[res.error] ?? res.error);
        dismiss();
      })
      .finally(() => {
        setBusy(false);
      });
  };

  if (check.kind === 'restore_available') {
    return (
      <GateDialog
        title="Données plus récentes trouvées"
        description={`Un snapshot plus récent existe (${describe(check.machineName, check.createdAt)}). Restaurer ces données sur cette machine ? Une sauvegarde locale est créée avant.`}
      >
        <Button variant="secondary" size="sm" disabled={busy} onClick={dismiss}>
          Ignorer
        </Button>
        <Button size="sm" disabled={busy} onClick={doRestore}>
          Restaurer
        </Button>
      </GateDialog>
    );
  }

  if (check.kind === 'conflict') {
    return (
      <GateDialog
        title="Conflit de synchronisation"
        description={`Cette machine a des modifications locales ET un snapshot plus récent existe (${describe(check.machineName, check.createdAt)}). Choisis la version à garder — l'autre est sauvegardée avant d'être remplacée.`}
      >
        <Button variant="secondary" size="sm" disabled={busy} onClick={doKeepLocal}>
          Garder cette machine
        </Button>
        <Button size="sm" disabled={busy} onClick={doRestore}>
          Prendre l'autre
        </Button>
      </GateDialog>
    );
  }

  if (check.kind === 'schema_too_new') {
    return (
      <GateDialog
        title="Snapshot plus récent que l'app"
        description={`Le snapshot (${describe(check.machineName, check.createdAt)}) vient d'une version plus récente de l'app. Mets à jour l'app sur cette machine pour le restaurer.`}
      >
        <Button size="sm" onClick={dismiss}>
          Continuer sans restaurer
        </Button>
      </GateDialog>
    );
  }

  if (check.kind === 'snapshot_invalid') {
    return (
      <GateDialog
        title="Snapshot illisible"
        description="Le fichier finance.fbk du dossier de synchronisation est invalide ou incomplet (synchronisation en cours ?). Les données locales sont conservées."
      >
        <Button size="sm" onClick={dismiss}>
          Continuer
        </Button>
      </GateDialog>
    );
  }

  return null;
}

function GateDialog({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog open>
      <DialogContent
        onInteractOutside={(e) => {
          e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>{children}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

(Adapt `Dialog*` imports/props to the actual `ui/dialog.tsx` API; the blocking behavior — no outside-click/escape dismiss — is the requirement.)

- [ ] **Step 4: Mount in `src/renderer/App.tsx`**

```tsx
import { SyncLaunchGate } from './components/sync/SyncLaunchGate';
```

and inside the returned JSX, next to `<Toaster richColors />`:

```tsx
      <Toaster richColors />
      <SyncLaunchGate />
```

- [ ] **Step 5: Run the tests**

```bash
npx vitest run tests/unit/renderer/SyncLaunchGate.test.tsx
```

Expected: 4 PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/sync/SyncLaunchGate.tsx src/renderer/App.tsx tests/unit/renderer/SyncLaunchGate.test.tsx
git commit -m "feat(sync): add blocking launch gate (restore, conflict, guards)"
```

---

### Task 14: ADR-017 + ADR-002 cross-reference

**Files:**

- Create: `docs/adr/017-user-managed-encrypted-sync-folder.md`
- Modify: `docs/adr/002-privacy-first-local.md`

- [ ] **Step 1: Write `docs/adr/017-user-managed-encrypted-sync-folder.md`**

```markdown
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
```

- [ ] **Step 2: Add the cross-reference in `docs/adr/002-privacy-first-local.md`**

Change the consequence line:

```markdown
- No multi-machine sync (intentional)
```

to:

```markdown
- No multi-machine sync over the network (refined by ADR-017: optional local encrypted
  sync-folder snapshots, transported by the user's own tooling)
```

- [ ] **Step 3: Commit**

```bash
git add docs/adr/017-user-managed-encrypted-sync-folder.md docs/adr/002-privacy-first-local.md
git commit -m "docs(adr): add ADR-017 user-managed encrypted sync folder"
```

---

### Task 15: E2E happy path

**Files:**

- Create: `tests/e2e/sync-flow.test.ts`

Strategy: stub `dialog.showOpenDialog` in the main process via `electronApp.evaluate` so the folder picker returns a temp folder; drive the rest through the real UI. Machine 2 is simulated with a **fresh userData dir** and the **same sync folder**.

- [ ] **Step 1: Write the test**

```ts
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function launchApp(userDataDir: string) {
  const app = await electron.launch({
    args: [`--user-data-dir=${userDataDir}`, join(process.cwd(), 'out/main/index.js')],
  });
  const window = await app.firstWindow();
  return { app, window };
}

async function stubFolderPicker(app: ElectronApplication, folder: string) {
  await app.evaluate(({ dialog }, pickedFolder) => {
    dialog.showOpenDialog = () =>
      Promise.resolve({ canceled: false, filePaths: [pickedFolder], bookmarks: [] });
  }, folder);
}

async function enableSync(window: Awaited<ReturnType<typeof launchApp>>['window']) {
  await window.getByRole('link', { name: /réglages/i }).click();
  await window.getByRole('button', { name: /configurer/i }).click();
  await window.getByRole('button', { name: /choisir un dossier/i }).click();
  await window.getByPlaceholder('Passphrase').fill('passphrase-e2e');
  await window.getByPlaceholder('Confirmer la passphrase').fill('passphrase-e2e');
  await window.getByRole('button', { name: /^activer$/i }).click();
}

test('sync round-trip: machine 1 writes, machine 2 restores', async () => {
  test.setTimeout(120_000);
  const syncFolder = mkdtempSync(join(tmpdir(), 'fd-e2e-syncfolder-'));
  const userData1 = mkdtempSync(join(tmpdir(), 'fd-e2e-m1-'));
  const userData2 = mkdtempSync(join(tmpdir(), 'fd-e2e-m2-'));

  // ----- Machine 1: create a recognizable account, enable sync, sync now -----
  const m1 = await launchApp(userData1);
  try {
    await stubFolderPicker(m1.app, syncFolder);
    // create an account through the UI so the snapshot carries it
    await m1.window.getByRole('link', { name: /comptes/i }).click();
    await m1.window.getByRole('button', { name: /ajouter un compte/i }).click();
    await m1.window.getByPlaceholder(/nom du compte/i).fill('Compte Sync E2E');
    await m1.window.getByRole('button', { name: /créer/i }).click();

    await enableSync(m1.window);
    await m1.window.getByRole('button', { name: /synchroniser maintenant/i }).click();
    await expect(m1.window.getByText(/snapshot écrit/i)).toBeVisible();
    expect(existsSync(join(syncFolder, 'finance.fbk'))).toBe(true);
  } finally {
    await m1.app.close();
  }

  // ----- Machine 2: fresh userData, same folder + passphrase, restore -----
  const m2 = await launchApp(userData2);
  try {
    await stubFolderPicker(m2.app, syncFolder);
    await enableSync(m2.window);
    // enabling fires the post-enable recheck → restore dialog
    await expect(m2.window.getByText(/données plus récentes trouvées/i)).toBeVisible();
    await m2.window.getByRole('button', { name: /^restaurer$/i }).click();
    // app reloads on success, then the restored account is visible
    await m2.window.getByRole('link', { name: /comptes/i }).click();
    await expect(m2.window.getByText('Compte Sync E2E')).toBeVisible({ timeout: 20_000 });
  } finally {
    await m2.app.close();
  }
});
```

Adapt selectors (link names, account-creation flow, button labels) to the real UI — read `tests/e2e/import-flow.test.ts` and the Accounts page for the exact roles/labels before running.

- [ ] **Step 2: Run it**

```bash
npm run build && npx playwright test tests/e2e/sync-flow.test.ts
```

(On a headless Linux box: `xvfb-run npx playwright test tests/e2e/sync-flow.test.ts`.)

Expected: PASS. This is the most environment-sensitive task — if a selector mismatch fails, fix the selector, not the feature; if `safeStorage` is unavailable on headless Linux (no keyring), the enable step returns `safe_storage_unavailable`: in that case skip the test on Linux with `test.skip(process.platform === 'linux' && !process.env.DISPLAY, ...)` reasoning documented inline, and rely on Windows/macOS CI legs.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/sync-flow.test.ts
git commit -m "test(sync): add E2E round-trip (write on machine 1, restore on machine 2)"
```

---

### Task 16: Full gate, push, PR

- [ ] **Step 1: Full local gate (Definition of done)**

```bash
npm run lint && npm run typecheck && npm run test:all && npm run build
```

Expected: everything green/clean.

- [ ] **Step 2: Make sure the plan file is tracked**

```bash
git add docs/superpowers/plans/2026-06-10-machine-sync.md
git commit -m "docs(sync): add machine-sync implementation plan" --allow-empty-message || true
git status
```

(If it was already committed earlier, this is a no-op; never leave the plan untracked — CLAUDE.md rule.)

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin feat/machine-sync
gh pr create --title "feat(sync): encrypted sync-folder snapshots for multi-machine use" --body "$(cat <<'EOF'
## Summary
- App writes an encrypted snapshot (finance.fbk: XChaCha20-Poly1305 + Argon2id, passphrase via safeStorage) into a user-chosen folder on quit / after changes (debounced) / on demand
- On launch (or right after enabling), offers to restore a newer snapshot; explicit conflict dialog (keep local / take other); local .bak + integrity check before any swap
- Transport is the user's own tooling (Syncthing recommended) — zero network calls added (ADR-002 invariant intact, refined by new ADR-017)
- Spec: docs/superpowers/specs/2026-06-10-machine-sync-design.md · Plan: docs/superpowers/plans/2026-06-10-machine-sync.md

## Test plan
- [ ] Unit: crypto round-trip, .fbk format, sync state, launch-check state machine, controller
- [ ] Integration: snapshot write→restore round-trip, wrong-passphrase, truncated file
- [ ] E2E: machine 1 writes → machine 2 restores
- [ ] Maintainer in-app validation (UI feature — no self-merge per project feedback)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Wait for CI (4 required checks) — then STOP**

**Do not self-merge.** This PR contains user-facing UI (settings section + launch dialogs): per project feedback, the maintainer validates in-app first (ideally on both Windows and Mac, since safeStorage and paths differ per OS).

---

## Self-review notes (already applied)

- **Spec coverage:** §2 architecture → Tasks 6/9/10/11; §3 format/crypto → Tasks 3/4; §4 restore/conflicts/guards → Tasks 7/8/13; §5 settings/UI → Tasks 12/13; §6 ADR → Task 14; §7 tests → every task + 15; §8 scope respected (no merge, single snapshot file, models not synced).
- **Deliberate deviation from spec:** "wrong passphrase" vs "corrupt file" merged into one error (cryptographically indistinguishable) — documented at the top.
- **Migrations after restoring an older-version snapshot** (spec §7 integration item) is covered structurally: `reopenDb()` → `getDb()` → `runMigrations` (Task 8 wiring); the restore test asserts the reopened DB works. The schema-too-new guard has dedicated tests (Task 7).
- **Type consistency check:** `SyncStatusView`/`SyncLaunchCheck`/`SyncNowResult`/`SyncRestoreResult`/`SyncEnableResult` defined once in Task 2 and used verbatim in Tasks 9/10/12/13; `PassphraseCipher` defined in Task 5, used in 9; `HeaderReadResult` defined in Task 6, consumed in 7/9; `SNAPSHOT_FILENAME` exported in 6, used in 9's test and E2E.
