# Epic 2 · Story 1 — File ingestion + type detection + SHA-256 hash : Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an IPC path that lets the renderer pick a bank statement file; the main process detects its type (PDF/CSV/OFX), computes a SHA-256 hash, and reports whether that file was already imported (dedup level 1).

**Architecture:** Main process owns all I/O. New IPC channel `import:pickFile` opens the native dialog, reads bytes, runs pure detection + hashing utilities, queries the `imports` table for the hash, and returns a typed result. Pure utilities are unit-tested; DB check tested against an in-memory SQLite.

**Tech Stack:** Electron `dialog` · `node:fs` · `node:crypto` · `node:sqlite` · existing typed IPC pattern · Vitest

**Spec reference:** `docs/superpowers/specs/2026-05-14-finance-dashboard-design.md` §4 (steps 1-2), §6 level 1

**GitHub:** Story #24 · Epic #23

---

## File Structure

- Create `src/main/import/detectType.ts` — pure file-type detection
- Create `src/main/import/hashFile.ts` — pure SHA-256 hashing
- Create `src/main/import/duplicateCheck.ts` — query `imports` for an existing hash
- Create `src/main/ipc/handlers/importPickFile.ts` — dialog + read + compose
- Modify `src/shared/types/ipc.ts` — add `import:pickFile` to `IpcContract`
- Modify `src/main/ipc/channels.ts` — add channel constant
- Modify `src/main/ipc/register.ts` — register the handler
- Create `tests/unit/import/detectType.test.ts`
- Create `tests/unit/import/hashFile.test.ts`
- Create `tests/unit/import/duplicateCheck.test.ts`

---

## Task 1: IPC contract — types and channel

**Files:**

- Modify: `src/shared/types/ipc.ts`
- Modify: `src/main/ipc/channels.ts`

- [ ] **Step 1: Add the contract types**

In `src/shared/types/ipc.ts`, add before `export interface IpcContract`:

```typescript
export type ImportFileType = 'pdf' | 'csv' | 'ofx';

export interface PickFilePayload {
  void: true;
}

export type PickFileResponse =
  | { cancelled: true }
  | {
      cancelled: false;
      path: string;
      type: ImportFileType;
      hash: string;
      size: number;
      alreadyImported: boolean;
    };
```

Then add the channel to `IpcContract`:

```typescript
export interface IpcContract {
  'app:ping': { payload: PingPayload; response: PingResponse };
  'import:pickFile': { payload: PickFilePayload; response: PickFileResponse };
}
```

- [ ] **Step 2: Add the channel constant**

In `src/main/ipc/channels.ts`:

```typescript
import type { IpcChannel } from '@shared/types/ipc';

export const CHANNELS = {
  appPing: 'app:ping',
  importPickFile: 'import:pickFile',
} as const satisfies Record<string, IpcChannel>;
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npm run typecheck`
Expected: no errors (handler not yet registered — that's Task 5).

- [ ] **Step 4: Commit**

```bash
git add src/shared/types/ipc.ts src/main/ipc/channels.ts
git commit -m "feat(import): add import:pickFile IPC contract"
```

---

## Task 2: File-type detection (pure, TDD)

**Files:**

- Create: `src/main/import/detectType.ts`
- Test: `tests/unit/import/detectType.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/import/detectType.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { detectType } from '../../../src/main/import/detectType';

describe('detectType', () => {
  it('detects PDF by magic bytes', () => {
    const buf = Buffer.from('%PDF-1.7\n...', 'utf8');
    expect(detectType(buf, 'statement.pdf')).toBe('pdf');
  });

  it('detects OFX by OFXHEADER marker', () => {
    const buf = Buffer.from('OFXHEADER:100\nDATA:OFXSGML\n', 'utf8');
    expect(detectType(buf, 'export.ofx')).toBe('ofx');
  });

  it('detects OFX by <OFX> tag (XML variant)', () => {
    const buf = Buffer.from('<?xml version="1.0"?><OFX><SIGNONMSGSRSV1/>', 'utf8');
    expect(detectType(buf, 'export.ofx')).toBe('ofx');
  });

  it('falls back to CSV for delimited text with .csv extension', () => {
    const buf = Buffer.from('Date;Libelle;Debit;Credit\n01/01/2025;X;10,00;', 'utf8');
    expect(detectType(buf, 'export.csv')).toBe('csv');
  });

  it('returns null for an unsupported binary file', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG
    expect(detectType(buf, 'image.png')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/import/detectType.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/main/import/detectType.ts`:

```typescript
import type { ImportFileType } from '@shared/types/ipc';

export function detectType(content: Buffer, filename: string): ImportFileType | null {
  if (content.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';

  const head = content.subarray(0, 1024).toString('latin1');
  if (head.includes('OFXHEADER') || /<OFX>/i.test(head)) return 'ofx';

  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'csv' && isProbablyText(content)) return 'csv';
  if (ext === 'ofx' && isProbablyText(content)) return 'ofx';

  return null;
}

function isProbablyText(content: Buffer): boolean {
  const sample = content.subarray(0, 512);
  for (const byte of sample) {
    if (byte === 0) return false;
  }
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/import/detectType.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/import/detectType.ts tests/unit/import/detectType.test.ts
git commit -m "feat(import): file-type detection (pdf/csv/ofx)"
```

---

## Task 3: File hashing (pure, TDD)

**Files:**

- Create: `src/main/import/hashFile.ts`
- Test: `tests/unit/import/hashFile.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/import/hashFile.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { hashFile } from '../../../src/main/import/hashFile';

describe('hashFile', () => {
  it('returns the known SHA-256 of "abc"', () => {
    const buf = Buffer.from('abc', 'utf8');
    expect(hashFile(buf)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('is stable for identical content', () => {
    const a = hashFile(Buffer.from('same bytes'));
    const b = hashFile(Buffer.from('same bytes'));
    expect(a).toBe(b);
  });

  it('differs for different content', () => {
    expect(hashFile(Buffer.from('x'))).not.toBe(hashFile(Buffer.from('y')));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/import/hashFile.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/main/import/hashFile.ts`:

```typescript
import { createHash } from 'node:crypto';

export function hashFile(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/import/hashFile.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/import/hashFile.ts tests/unit/import/hashFile.test.ts
git commit -m "feat(import): SHA-256 file hashing"
```

---

## Task 4: Duplicate check against the imports table (TDD, in-memory DB)

**Files:**

- Create: `src/main/import/duplicateCheck.ts`
- Test: `tests/unit/import/duplicateCheck.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/import/duplicateCheck.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { isAlreadyImported } from '../../../src/main/import/duplicateCheck';

function seedImport(db: DatabaseSync, hash: string): void {
  db.prepare("INSERT INTO accounts(id,name,type) VALUES('a1','Test','checking')").run();
  db.prepare(
    `INSERT INTO imports(id,account_id,file_hash,source_type,date_range_start,date_range_end)
     VALUES('imp1','a1',?,'pdf','2025-01-01','2025-01-31')`,
  ).run(hash);
}

describe('isAlreadyImported', () => {
  it('returns false when the hash is not present', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    expect(isAlreadyImported(db, 'deadbeef')).toBe(false);
    db.close();
  });

  it('returns true when the hash exists in imports', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    seedImport(db, 'deadbeef');
    expect(isAlreadyImported(db, 'deadbeef')).toBe(true);
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/import/duplicateCheck.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/main/import/duplicateCheck.ts`:

```typescript
import type { DatabaseSync } from 'node:sqlite';

export function isAlreadyImported(db: DatabaseSync, hash: string): boolean {
  const row = db.prepare('SELECT 1 FROM imports WHERE file_hash = ?').get(hash);
  return row !== undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/import/duplicateCheck.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/import/duplicateCheck.ts tests/unit/import/duplicateCheck.test.ts
git commit -m "feat(import): duplicate-file check against imports table"
```

---

## Task 5: IPC handler — dialog, read, compose, register

**Files:**

- Create: `src/main/ipc/handlers/importPickFile.ts`
- Modify: `src/main/ipc/register.ts`

- [ ] **Step 1: Write the handler**

Create `src/main/ipc/handlers/importPickFile.ts`:

```typescript
import { dialog } from 'electron';
import { readFileSync } from 'node:fs';
import { statSync } from 'node:fs';
import type { PickFileResponse } from '@shared/types/ipc';
import { detectType } from '../../import/detectType';
import { hashFile } from '../../import/hashFile';
import { isAlreadyImported } from '../../import/duplicateCheck';
import { getDb } from '../../db';

export async function handlePickFile(): Promise<PickFileResponse> {
  const result = await dialog.showOpenDialog({
    title: 'Select a bank statement',
    properties: ['openFile'],
    filters: [{ name: 'Statements', extensions: ['pdf', 'csv', 'ofx'] }],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { cancelled: true };
  }

  const path = result.filePaths[0];
  if (path === undefined) return { cancelled: true };

  const content = readFileSync(path);
  const type = detectType(content, path);
  if (type === null) {
    throw new Error('Unsupported file type (expected PDF, CSV or OFX)');
  }

  const hash = hashFile(content);
  const size = statSync(path).size;
  const alreadyImported = isAlreadyImported(getDb(), hash);

  return { cancelled: false, path, type, hash, size, alreadyImported };
}
```

- [ ] **Step 2: Register the handler**

Modify `src/main/ipc/register.ts` — add the import and the registration line. The file currently is:

```typescript
import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import type { IpcChannel, IpcPayload, IpcResponse } from '@shared/types/ipc';
import { CHANNELS } from './channels';
import { handlePing } from './handlers/ping';

type Handler<C extends IpcChannel> = (
  payload: IpcPayload<C>,
) => IpcResponse<C> | Promise<IpcResponse<C>>;

function isValidSender(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url ?? '';
  if (url.startsWith('file://')) return true;
  if (url.startsWith('http://localhost:') || url.startsWith('http://127.0.0.1:')) return true;
  console.error('[ipc] unauthorized sender:', url);
  return false;
}

function register<C extends IpcChannel>(channel: C, handler: Handler<C>): void {
  ipcMain.handle(channel, (event, payload: IpcPayload<C>) => {
    if (!isValidSender(event)) throw new Error(`IPC: unauthorized sender for channel "${channel}"`);
    return handler(payload);
  });
}

export function registerAllHandlers(): void {
  register(CHANNELS.appPing, handlePing);
}
```

Add after the `handlePing` import:

```typescript
import { handlePickFile } from './handlers/importPickFile';
```

Change `registerAllHandlers` to:

```typescript
export function registerAllHandlers(): void {
  register(CHANNELS.appPing, handlePing);
  register(CHANNELS.importPickFile, () => handlePickFile());
}
```

- [ ] **Step 3: Verify typecheck and lint pass**

Run: `npm run typecheck && npm run lint`
Expected: no errors, no warnings.

- [ ] **Step 4: Run the full unit suite**

Run: `npm test`
Expected: all tests pass (existing + 10 new from Tasks 2-4).

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/handlers/importPickFile.ts src/main/ipc/register.ts
git commit -m "feat(import): import:pickFile handler with dialog + dedup check"
```

---

## Task 6: Manual verification + PR

**Files:** none (verification only)

- [ ] **Step 1: Build and launch**

Run: `npm run build && npm run dev`

- [ ] **Step 2: Manual smoke test**

From the renderer devtools console (the typed client is `window.electronAPI`):

```js
await window.electronAPI.invoke('import:pickFile', { void: true });
```

Expected: native dialog opens. Pick an LCL PDF from `spike-fixtures/`. Console returns
`{ cancelled: false, type: 'pdf', hash: '<64 hex>', size: <n>, alreadyImported: false }`.
Cancelling the dialog returns `{ cancelled: true }`.

- [ ] **Step 3: Open the PR**

```bash
git push -u origin feat/24-file-ingestion
gh pr create --title "feat(import): file ingestion + type detection + SHA-256 (#24)" --body "Closes #24. Adds import:pickFile IPC: native dialog, PDF/CSV/OFX detection, SHA-256 hash, dedup-level-1 check against imports table. Pure utils unit-tested; dedup tested against in-memory SQLite."
```

---

## Self-Review

- **Spec coverage:** §4 steps 1-2 (pick + detect) ✓ ; §6 level 1 (file hash + already-imported) ✓.
- **Acceptance criteria (Story #24):** IPC pick+read ✓ ; type detection PDF/CSV/OFX ✓ ; SHA-256 ✓ ; hash checked vs `imports.file_hash` → `alreadyImported` flag ✓ ; unsupported type → thrown error ✓. (The explicit re-import _confirmation UX_ lives in the Review/commit story; Story 1 surfaces the boolean.)
- **Type consistency:** `ImportFileType`, `PickFileResponse` defined once in shared and reused by handler. `detectType` returns `ImportFileType | null`.
- **No placeholders:** every step has full code and exact commands.
