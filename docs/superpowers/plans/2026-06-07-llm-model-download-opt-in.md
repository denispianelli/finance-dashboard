# Opt-in LLM Model Download — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in, just-in-time, non-blocking download of the ~1.9 GB LLM model with a clear decision UX, while the app stays fully usable without it.

**Architecture:** All network/disk I/O lives in the **main process** (renderer stays I/O-free, CSP `'self'`). A resumable, checksum-verified downloader writes to a `.part` file then atomically renames it. A main-side controller holds the download state machine (`absent / downloading / paused / ready / error`) and pushes progress to the renderer over a new IPC event channel. The renderer adds a status hook, a persistent progress indicator, a just-in-time categorization banner (with explicit opt-out), a "PDF requires model" dialog, and a Settings › IA locale section.

**Tech Stack:** Electron, TypeScript (strict), `node:sqlite` (DatabaseSync), Vitest 4 (jsdom + explicit `cleanup`), React + shadcn/Tailwind, Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-06-07-llm-model-download-opt-in-design.md`

---

## Design milestone (hard gate between Phase 1 and Phase 2)

**Phase 1 (Tasks 1–7) is pure main-process: no UI.** After Task 7, STOP and do the
**claude.ai/design pass** for the four renderer components, feeding it spec §5 (states to
cover) + the `finance-dashboard-design` skill. Phase 2 (Tasks 8–13) implements the renderer
from those designs. The components below ship functional, accessible JSX with real
behavior/props and `data-testid`s; the design pass refines visuals only — it must keep every
state and prop listed.

---

## File structure

**Phase 1 — main process**

- Create `src/main/db/migrations/015_app_settings.sql` — key/value settings table.
- Modify `src/main/db/migrate.ts` — register migration 015.
- Create `src/main/settings/settings.ts` — typed get/set for app settings (opt-out).
- Create `src/main/llm/modelManifest.ts` — pinned URL, SHA-256, size.
- Create `src/main/llm/download.ts` — resumable, checksum-verified download primitive.
- Create `src/main/llm/downloadController.ts` — state machine + progress fan-out + remove.
- Create `src/main/ipc/handlers/model.ts` — `model:*` + opt-out IPC handlers.
- Modify `src/shared/types/ipc.ts` — new channels, payloads, `ElectronAPI` progress sub.
- Modify `src/main/ipc/channels.ts` — new channel names.
- Modify `src/main/ipc/register.ts` — register new handlers.
- Modify `src/main/preload.ts` — expose `onModelProgress`.
- Modify `src/main/index.ts` — wire progress push to the main window.

**Phase 2 — renderer**

- Modify `src/renderer/ipc/client.ts` — `onModelProgress` passthrough.
- Create `src/renderer/hooks/useModelStatus.ts` — status + live progress.
- Create `src/renderer/components/model/ModelDownloadIndicator.tsx` — persistent bar.
- Create `src/renderer/components/model/CategorizationPrompt.tsx` — just-in-time banner.
- Create `src/renderer/components/model/PdfModelRequiredDialog.tsx` — scenario (b).
- Create `src/renderer/components/model/triggerLogic.ts` — pure show/hide decision.
- Modify `src/renderer/components/AppShell.tsx` — mount indicator + banner.
- Modify `src/renderer/pages/SettingsPage.tsx` — IA locale section.
- Modify import flow (`src/renderer/hooks/useImport.ts` / `ImportModal.tsx`) — scenario (b).
- Create E2E `tests/e2e/model-download.spec.ts` — stubbed endpoint.

---

# PHASE 1 — MAIN PROCESS (no UI)

## Task 1: App settings table + typed settings module

**Files:**

- Create: `src/main/db/migrations/015_app_settings.sql`
- Modify: `src/main/db/migrate.ts`
- Create: `src/main/settings/settings.ts`
- Test: `tests/unit/settings/settings.test.ts`

- [ ] **Step 1: Write the migration SQL**

`src/main/db/migrations/015_app_settings.sql`:

```sql
-- Generic key/value store for small app-level preferences (string values only).
-- First consumer: the LLM categorization opt-out ("Ne plus me proposer").
CREATE TABLE app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

- [ ] **Step 2: Register migration 015 in `migrate.ts`**

Add the import next to the others and the entry in `MIGRATIONS`:

```ts
import sql015 from './migrations/015_app_settings.sql?raw';
```

```ts
  { version: 14, sql: sql014 },
  { version: 15, sql: sql015 },
```

- [ ] **Step 3: Write the failing test**

`tests/unit/settings/settings.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

const dbHolder: { db: DatabaseSync | null } = { db: null };
vi.mock('../../../src/main/db', () => ({ getDb: () => dbHolder.db }));

import { getCategorizeOptOut, setCategorizeOptOut } from '../../../src/main/settings/settings';

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

describe('categorize opt-out setting', () => {
  it('defaults to false when unset', () => {
    expect(getCategorizeOptOut()).toBe(false);
  });
  it('round-trips true', () => {
    setCategorizeOptOut(true);
    expect(getCategorizeOptOut()).toBe(true);
  });
  it('round-trips back to false', () => {
    setCategorizeOptOut(true);
    setCategorizeOptOut(false);
    expect(getCategorizeOptOut()).toBe(false);
  });
});
```

- [ ] **Step 4: Run it, expect FAIL** — `npm run test -- settings.test` → fails (module not found).

- [ ] **Step 5: Implement `settings.ts`**

`src/main/settings/settings.ts`:

```ts
import { getDb } from '../db';

const OPT_OUT_KEY = 'categorize.optOut';

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

export function getCategorizeOptOut(): boolean {
  return read(OPT_OUT_KEY) === '1';
}

export function setCategorizeOptOut(value: boolean): void {
  write(OPT_OUT_KEY, value ? '1' : '0');
}
```

- [ ] **Step 6: Run it, expect PASS** — `npm run test -- settings.test`.

- [ ] **Step 7: Commit**

```bash
git add src/main/db/migrations/015_app_settings.sql src/main/db/migrate.ts src/main/settings/settings.ts tests/unit/settings/settings.test.ts
git commit -m "feat(settings): add app_settings table and categorize opt-out"
```

---

## Task 2: Model manifest constants

**Files:**

- Create: `src/main/llm/modelManifest.ts`
- Test: `tests/unit/llm/modelManifest.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/llm/modelManifest.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { MODEL_MANIFEST } from '../../../src/main/llm/modelManifest';
import { MODEL_FILE } from '../../../src/main/llm/llm';

describe('MODEL_MANIFEST', () => {
  it('points at the ADR-004 GGUF with a pinned https url', () => {
    expect(MODEL_MANIFEST.url).toMatch(/^https:\/\//);
    expect(MODEL_MANIFEST.url.toLowerCase()).toContain('q4_k_m');
  });
  it('has the real size and a 64-hex sha-256', () => {
    expect(MODEL_MANIFEST.sizeBytes).toBe(2019377696);
    expect(MODEL_MANIFEST.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it('the manifest filename matches MODEL_FILE', () => {
    expect(MODEL_MANIFEST.url.endsWith(MODEL_FILE) || MODEL_MANIFEST.fileName === MODEL_FILE).toBe(
      true,
    );
  });
});
```

- [ ] **Step 2: Run it, expect FAIL.**

- [ ] **Step 3: Implement the manifest** (real size + sha-256 computed from the maintainer's working `models/` copy on 2026-06-07)

`src/main/llm/modelManifest.ts`:

```ts
import { MODEL_FILE } from './llm';

/**
 * Pinned download source for the ADR-004 model (Llama 3.2 3B Instruct Q4_K_M GGUF).
 * sha256 + sizeBytes were computed from the maintainer's working copy; the runtime
 * verifies sha256 after download, so any mirror set as `url` MUST serve a
 * byte-identical file (see Step 4 verification command).
 */
export const MODEL_MANIFEST = {
  fileName: MODEL_FILE,
  url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
  sha256: '6c1a2b41161032677be168d354123594c0e6e67d2b9227c84f296ad037c728ff',
  sizeBytes: 2019377696,
} as const;
```

- [ ] **Step 4: Verify the pinned URL serves the identical file** (one-off, not committed)

```bash
curl -L 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf' -o /tmp/model.gguf
sha256sum /tmp/model.gguf
```

Expected: the printed digest equals `6c1a2b41161032677be168d354123594c0e6e67d2b9227c84f296ad037c728ff`. **If it differs**, the mirror
re-quantized the model — pick a mirror that matches, or update `sha256`/`sizeBytes` to the
new file and re-run benchmarks per ADR-004.

- [ ] **Step 5: Run it, expect PASS.**

- [ ] **Step 6: Commit**

```bash
git add src/main/llm/modelManifest.ts tests/unit/llm/modelManifest.test.ts
git commit -m "feat(llm): pin model download manifest (url, sha-256, size)"
```

---

## Task 3: Resumable, checksum-verified download primitive

**Files:**

- Create: `src/main/llm/download.ts`
- Test: `tests/unit/llm/download.test.ts`

Design: `downloadModel(modelsDir, onProgress, signal, deps?)` streams to
`<model>.gguf.part` using an HTTP `Range` request (resume from existing `.part` size),
checks free disk first, verifies sha-256 over the completed file, then atomically renames
`.part` → final. Dependencies (`fetch`, `freeDiskBytes`, `manifest`) are injectable for tests.

- [ ] **Step 1: Write the failing tests**

`tests/unit/llm/download.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { downloadModel, type DownloadDeps } from '../../../src/main/llm/download';
import { MODEL_FILE } from '../../../src/main/llm/llm';

const BODY = Buffer.from('hello-model-bytes');
const SHA = createHash('sha256').update(BODY).digest('hex');

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dl-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function fakeFetch(full: Buffer): typeof fetch {
  return (async (_url: string, init?: RequestInit) => {
    const range = (init?.headers as Record<string, string> | undefined)?.['Range'];
    const start = range ? Number(/bytes=(\d+)-/.exec(range)?.[1] ?? 0) : 0;
    const slice = full.subarray(start);
    return {
      ok: true,
      status: range ? 206 : 200,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(slice));
          controller.close();
        },
      }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

function deps(over: Partial<DownloadDeps> = {}): DownloadDeps {
  return {
    fetch: fakeFetch(BODY),
    freeDiskBytes: async () => 10 ** 9,
    manifest: {
      url: 'https://x/model.gguf',
      sha256: SHA,
      sizeBytes: BODY.length,
      fileName: MODEL_FILE,
    },
    ...over,
  };
}

it('downloads, verifies and atomically renames to the final file', async () => {
  const res = await downloadModel(dir, () => {}, new AbortController().signal, deps());
  expect(res).toEqual({ ok: true });
  expect(existsSync(join(dir, MODEL_FILE))).toBe(true);
  expect(existsSync(join(dir, `${MODEL_FILE}.part`))).toBe(false);
  expect(readFileSync(join(dir, MODEL_FILE))).toEqual(BODY);
});

it('reports progress up to the total', async () => {
  const seen: number[] = [];
  await downloadModel(dir, (p) => seen.push(p.receivedBytes), new AbortController().signal, deps());
  expect(seen.at(-1)).toBe(BODY.length);
});

it('resumes from an existing .part via a Range request', async () => {
  writeFileSync(join(dir, `${MODEL_FILE}.part`), BODY.subarray(0, 5));
  const res = await downloadModel(dir, () => {}, new AbortController().signal, deps());
  expect(res).toEqual({ ok: true });
  expect(readFileSync(join(dir, MODEL_FILE))).toEqual(BODY);
});

it('fails with checksum_mismatch and deletes the .part', async () => {
  const res = await downloadModel(
    dir,
    () => {},
    new AbortController().signal,
    deps({
      manifest: {
        url: 'https://x',
        sha256: 'f'.repeat(64),
        sizeBytes: BODY.length,
        fileName: MODEL_FILE,
      },
    }),
  );
  expect(res).toEqual({ ok: false, error: 'checksum_mismatch' });
  expect(existsSync(join(dir, `${MODEL_FILE}.part`))).toBe(false);
  expect(existsSync(join(dir, MODEL_FILE))).toBe(false);
});

it('refuses up-front when disk space is insufficient', async () => {
  const res = await downloadModel(
    dir,
    () => {},
    new AbortController().signal,
    deps({ freeDiskBytes: async () => 1 }),
  );
  expect(res).toEqual({ ok: false, error: 'insufficient_disk' });
});

it('returns cancelled and keeps the .part on abort', async () => {
  const ac = new AbortController();
  ac.abort();
  const res = await downloadModel(dir, () => {}, ac.signal, deps());
  expect(res).toEqual({ ok: false, error: 'cancelled' });
});
```

- [ ] **Step 2: Run it, expect FAIL.**

- [ ] **Step 3: Implement `download.ts`**

`src/main/llm/download.ts`:

```ts
import { createHash } from 'node:crypto';
import { createWriteStream, createReadStream } from 'node:fs';
import { stat, rename, rm, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import { MODEL_MANIFEST } from './modelManifest';

export interface DownloadProgress {
  receivedBytes: number;
  totalBytes: number;
}

export type DownloadError = 'insufficient_disk' | 'network' | 'checksum_mismatch' | 'cancelled';
export type DownloadResult = { ok: true } | { ok: false; error: DownloadError };

export interface DownloadDeps {
  fetch: typeof fetch;
  freeDiskBytes: (dir: string) => Promise<number>;
  manifest: { url: string; sha256: string; sizeBytes: number; fileName: string };
}

const DISK_MARGIN_BYTES = 200 * 1024 * 1024; // 200 MB headroom

const defaultDeps: DownloadDeps = {
  fetch: globalThis.fetch,
  freeDiskBytes: async (dir) => {
    const fs = await statfs(dir);
    return fs.bavail * fs.bsize;
  },
  manifest: MODEL_MANIFEST,
};

async function sizeOrZero(path: string): Promise<number> {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    createReadStream(path)
      .on('data', (c) => hash.update(c))
      .on('end', resolve)
      .on('error', reject);
  });
  return hash.digest('hex');
}

export async function downloadModel(
  modelsDir: string,
  onProgress: (p: DownloadProgress) => void,
  signal: AbortSignal,
  deps: Partial<DownloadDeps> = {},
): Promise<DownloadResult> {
  const d: DownloadDeps = { ...defaultDeps, ...deps };
  const finalPath = join(modelsDir, d.manifest.fileName);
  const partPath = `${finalPath}.part`;

  if (signal.aborted) return { ok: false, error: 'cancelled' };

  const already = await sizeOrZero(partPath);
  const remaining = d.manifest.sizeBytes - already;
  const free = await d.freeDiskBytes(modelsDir);
  if (free < remaining + DISK_MARGIN_BYTES) return { ok: false, error: 'insufficient_disk' };

  let received = already;
  try {
    const res = await d.fetch(d.manifest.url, {
      headers: already > 0 ? { Range: `bytes=${String(already)}-` } : {},
      signal,
    });
    if (!res.ok || !res.body) return { ok: false, error: 'network' };

    await new Promise<void>((resolve, reject) => {
      const out = createWriteStream(partPath, { flags: already > 0 ? 'a' : 'w' });
      const reader = res.body!.getReader();
      const pump = (): void => {
        reader
          .read()
          .then(({ done, value }) => {
            if (done) {
              out.end(resolve);
              return;
            }
            received += value.byteLength;
            onProgress({ receivedBytes: received, totalBytes: d.manifest.sizeBytes });
            out.write(value, (err) => (err ? reject(err) : pump()));
          })
          .catch(reject);
      };
      pump();
    });
  } catch (err) {
    if (signal.aborted) return { ok: false, error: 'cancelled' };
    return { ok: false, error: 'network' };
  }

  const digest = await sha256File(partPath);
  if (digest !== d.manifest.sha256) {
    await rm(partPath, { force: true });
    return { ok: false, error: 'checksum_mismatch' };
  }

  await rename(partPath, finalPath);
  return { ok: true };
}
```

- [ ] **Step 4: Run it, expect PASS.** Note: `node:fs/promises` `statfs` requires Node ≥ 24 (satisfied by `engines`).

- [ ] **Step 5: Commit**

```bash
git add src/main/llm/download.ts tests/unit/llm/download.test.ts
git commit -m "feat(llm): add resumable checksum-verified model download primitive"
```

---

## Task 4: Download controller (state machine + progress fan-out + remove)

**Files:**

- Create: `src/shared/types/model.ts`
- Create: `src/main/llm/downloadController.ts`
- Test: `tests/unit/llm/downloadController.test.ts`

State derivation: final file exists → `ready`; else `.part` exists → `paused`; else `absent`.
During an active run → `downloading`; failure → `error`. Listeners are notified on every
status change; the IPC layer (Task 7) registers a listener that forwards to the window.

- [ ] **Step 0: Create the shared status types** (renderer-safe; reused by the controller and the IPC contract in Task 5)

`src/shared/types/model.ts`:

```ts
export type ModelState = 'absent' | 'downloading' | 'paused' | 'ready' | 'error';

export interface ModelStatus {
  state: ModelState;
  receivedBytes?: number;
  totalBytes?: number;
  error?: string;
}
```

- [ ] **Step 1: Write the failing test**

`tests/unit/llm/downloadController.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MODEL_FILE } from '../../../src/main/llm/llm';

vi.mock('../../../src/main/llm/download', () => ({ downloadModel: vi.fn() }));
import { downloadModel } from '../../../src/main/llm/download';
import { createDownloadController } from '../../../src/main/llm/downloadController';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ctl-'));
  vi.clearAllMocks();
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

it('derives absent / paused / ready from the filesystem', () => {
  const ctl = createDownloadController(() => dir);
  expect(ctl.getStatus().state).toBe('absent');
  writeFileSync(join(dir, `${MODEL_FILE}.part`), 'x');
  expect(ctl.getStatus().state).toBe('paused');
  rmSync(join(dir, `${MODEL_FILE}.part`));
  writeFileSync(join(dir, MODEL_FILE), 'x');
  expect(ctl.getStatus().state).toBe('ready');
});

it('emits downloading then ready, forwarding progress', async () => {
  vi.mocked(downloadModel).mockImplementation(async (_d, onProgress) => {
    onProgress({ receivedBytes: 5, totalBytes: 10 });
    writeFileSync(join(dir, MODEL_FILE), 'x');
    return { ok: true };
  });
  const ctl = createDownloadController(() => dir);
  const seen: string[] = [];
  ctl.subscribe((s) => seen.push(s.state));
  await ctl.start();
  expect(seen).toContain('downloading');
  expect(ctl.getStatus().state).toBe('ready');
});

it('goes to error on checksum_mismatch', async () => {
  vi.mocked(downloadModel).mockResolvedValue({ ok: false, error: 'checksum_mismatch' });
  const ctl = createDownloadController(() => dir);
  await ctl.start();
  expect(ctl.getStatus()).toMatchObject({ state: 'error', error: 'checksum_mismatch' });
});

it('remove deletes the model file and returns to absent', async () => {
  writeFileSync(join(dir, MODEL_FILE), 'x');
  const ctl = createDownloadController(() => dir);
  await ctl.remove();
  expect(existsSync(join(dir, MODEL_FILE))).toBe(false);
  expect(ctl.getStatus().state).toBe('absent');
});

it('start is idempotent while a download is in flight', async () => {
  let release: () => void = () => {};
  vi.mocked(downloadModel).mockImplementation(
    () => new Promise((r) => (release = () => r({ ok: true }))),
  );
  const ctl = createDownloadController(() => dir);
  void ctl.start();
  void ctl.start();
  expect(vi.mocked(downloadModel)).toHaveBeenCalledTimes(1);
  release();
});
```

- [ ] **Step 2: Run it, expect FAIL.**

- [ ] **Step 3: Implement `downloadController.ts`**

`src/main/llm/downloadController.ts`:

```ts
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import type { ModelStatus } from '@shared/types/model';
import { resolveModelPath, isModelAvailable } from './llm';
import { downloadModel, type DownloadProgress } from './download';

export interface DownloadController {
  getStatus: () => ModelStatus;
  subscribe: (listener: (s: ModelStatus) => void) => () => void;
  start: () => Promise<void>;
  cancel: () => void;
  remove: () => Promise<void>;
}

export function createDownloadController(modelsDir: () => string): DownloadController {
  const listeners = new Set<(s: ModelStatus) => void>();
  let active: AbortController | null = null;
  let override: ModelStatus | null = null;

  function fsState(): ModelStatus {
    const dir = modelsDir();
    if (isModelAvailable(dir)) return { state: 'ready' };
    if (existsSync(`${resolveModelPath(dir)}.part`)) return { state: 'paused' };
    return { state: 'absent' };
  }

  function getStatus(): ModelStatus {
    return override ?? fsState();
  }

  function emit(): void {
    const s = getStatus();
    for (const l of listeners) l(s);
  }

  function set(s: ModelStatus | null): void {
    override = s;
    emit();
  }

  async function start(): Promise<void> {
    if (active) return;
    active = new AbortController();
    set({ state: 'downloading', receivedBytes: 0, totalBytes: undefined });
    const res = await downloadModel(
      modelsDir(),
      (p: DownloadProgress) =>
        set({ state: 'downloading', receivedBytes: p.receivedBytes, totalBytes: p.totalBytes }),
      active.signal,
    );
    active = null;
    if (res.ok)
      set(null); // fall back to fsState() → 'ready'
    else if (res.error === 'cancelled')
      set(null); // → 'paused' (the .part remains)
    else set({ state: 'error', error: res.error });
  }

  function cancel(): void {
    active?.abort();
  }

  async function remove(): Promise<void> {
    cancel();
    const base = resolveModelPath(modelsDir());
    await rm(base, { force: true });
    await rm(`${base}.part`, { force: true });
    set(null); // → 'absent'
  }

  function subscribe(listener: (s: ModelStatus) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { getStatus, subscribe, start, cancel, remove };
}
```

- [ ] **Step 4: Run it, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/main/llm/downloadController.ts tests/unit/llm/downloadController.test.ts
git commit -m "feat(llm): add model download controller (state machine + fan-out)"
```

---

## Task 5: IPC contract + channels for model status, control and opt-out

**Files:**

- Modify: `src/shared/types/ipc.ts`
- Modify: `src/main/ipc/channels.ts`
- Create: `src/main/ipc/handlers/model.ts`
- Test: `tests/unit/ipc/model.test.ts`

- [ ] **Step 1: Extend the IPC contract** in `src/shared/types/ipc.ts`

Import and re-export the shared status types (so `@shared/types/ipc` consumers keep working
and there is a single source of truth):

```ts
import type { ModelStatus } from './model';
export type { ModelState } from './model';

/** Alias kept for the IPC response naming convention. */
export type ModelStatusResponse = ModelStatus;
```

Add to the `IpcContract` interface:

```ts
  'model:status': { payload: Record<string, never>; response: ModelStatusResponse };
  'model:download:start': { payload: Record<string, never>; response: { ok: true } };
  'model:download:cancel': { payload: Record<string, never>; response: { ok: true } };
  'model:remove': { payload: Record<string, never>; response: { ok: true } };
  'settings:getCategorizeOptOut': { payload: Record<string, never>; response: { value: boolean } };
  'settings:setCategorizeOptOut': { payload: { value: boolean }; response: { ok: true } };
```

Extend `ElectronAPI` with the progress subscription (used in Task 6):

```ts
export interface ElectronAPI {
  invoke: <C extends IpcChannel>(channel: C, payload: IpcPayload<C>) => Promise<IpcResponse<C>>;
  getDroppedPaths: (files: File[]) => string[];
  onModelProgress: (cb: (status: ModelStatusResponse) => void) => () => void;
}
```

- [ ] **Step 2: Add channel names** to `src/main/ipc/channels.ts`

```ts
  modelStatus: 'model:status',
  modelDownloadStart: 'model:download:start',
  modelDownloadCancel: 'model:download:cancel',
  modelRemove: 'model:remove',
  settingsGetCategorizeOptOut: 'settings:getCategorizeOptOut',
  settingsSetCategorizeOptOut: 'settings:setCategorizeOptOut',
```

- [ ] **Step 3: Write the failing test**

`tests/unit/ipc/model.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const ctl = {
  getStatus: vi.fn(),
  subscribe: vi.fn(),
  start: vi.fn(),
  cancel: vi.fn(),
  remove: vi.fn(),
};
vi.mock('../../../src/main/llm/modelController', () => ({ modelController: ctl }));
vi.mock('../../../src/main/settings/settings', () => ({
  getCategorizeOptOut: vi.fn(() => false),
  setCategorizeOptOut: vi.fn(),
}));

import {
  handleModelStatus,
  handleModelDownloadStart,
  handleModelRemove,
  handleGetCategorizeOptOut,
  handleSetCategorizeOptOut,
} from '../../../src/main/ipc/handlers/model';
import { setCategorizeOptOut } from '../../../src/main/settings/settings';

beforeEach(() => vi.clearAllMocks());

it('returns the controller status', () => {
  ctl.getStatus.mockReturnValue({ state: 'absent' });
  expect(handleModelStatus()).toEqual({ state: 'absent' });
});

it('starts the download', async () => {
  ctl.start.mockResolvedValue(undefined);
  expect(await handleModelDownloadStart()).toEqual({ ok: true });
  expect(ctl.start).toHaveBeenCalledOnce();
});

it('removes the model', async () => {
  ctl.remove.mockResolvedValue(undefined);
  expect(await handleModelRemove()).toEqual({ ok: true });
  expect(ctl.remove).toHaveBeenCalledOnce();
});

it('reads and writes the opt-out', () => {
  expect(handleGetCategorizeOptOut()).toEqual({ value: false });
  expect(handleSetCategorizeOptOut({ value: true })).toEqual({ ok: true });
  expect(setCategorizeOptOut).toHaveBeenCalledWith(true);
});
```

Note: this test references `src/main/llm/modelController.ts` — the **singleton** wrapper
created in Step 5.

- [ ] **Step 4: Run it, expect FAIL.**

- [ ] **Step 5: Implement the singleton + handlers**

`src/main/llm/modelController.ts`:

```ts
import { createDownloadController } from './downloadController';
import { modelsDir } from './modelsDir';

/** App-wide single instance; the renderer drives it through the model IPC handlers. */
export const modelController = createDownloadController(modelsDir);
```

`src/main/ipc/handlers/model.ts`:

```ts
import type { ModelStatusResponse } from '@shared/types/ipc';
import { modelController } from '../../llm/modelController';
import { getCategorizeOptOut, setCategorizeOptOut } from '../../settings/settings';

export function handleModelStatus(): ModelStatusResponse {
  return modelController.getStatus();
}

export async function handleModelDownloadStart(): Promise<{ ok: true }> {
  await modelController.start();
  return { ok: true };
}

export function handleModelDownloadCancel(): { ok: true } {
  modelController.cancel();
  return { ok: true };
}

export async function handleModelRemove(): Promise<{ ok: true }> {
  await modelController.remove();
  return { ok: true };
}

export function handleGetCategorizeOptOut(): { value: boolean } {
  return { value: getCategorizeOptOut() };
}

export function handleSetCategorizeOptOut(payload: { value: boolean }): { ok: true } {
  setCategorizeOptOut(payload.value);
  return { ok: true };
}
```

- [ ] **Step 6: Run it, expect PASS.**

- [ ] **Step 7: Commit**

```bash
git add src/shared/types/ipc.ts src/main/ipc/channels.ts src/main/llm/modelController.ts src/main/ipc/handlers/model.ts tests/unit/ipc/model.test.ts
git commit -m "feat(ipc): add model status/control and opt-out channels"
```

---

## Task 6: Progress event channel (main → renderer) + preload bridge

**Files:**

- Modify: `src/main/preload.ts`
- Modify: `src/renderer/ipc/client.ts`

This is wiring, verified end-to-end by the E2E in Task 13; no separate unit test (the preload
runs in the Electron sandbox, not jsdom).

- [ ] **Step 1: Expose `onModelProgress` in preload** (`src/main/preload.ts`)

```ts
import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type {
  ElectronAPI,
  IpcChannel,
  IpcPayload,
  IpcResponse,
  ModelStatusResponse,
} from '@shared/types/ipc';

const api: ElectronAPI = {
  invoke: <C extends IpcChannel>(channel: C, payload: IpcPayload<C>): Promise<IpcResponse<C>> =>
    ipcRenderer.invoke(channel, payload),
  getDroppedPaths: (files: File[]): string[] => files.map((f) => webUtils.getPathForFile(f)),
  onModelProgress: (cb: (status: ModelStatusResponse) => void): (() => void) => {
    const listener = (_e: unknown, status: ModelStatusResponse): void => cb(status);
    ipcRenderer.on('model:progress', listener);
    return () => ipcRenderer.removeListener('model:progress', listener);
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
```

- [ ] **Step 2: Passthrough in the renderer client** (`src/renderer/ipc/client.ts`)

```ts
import type { IpcChannel, IpcPayload, IpcResponse, ModelStatusResponse } from '@shared/types/ipc';

export const ipc = {
  invoke: <C extends IpcChannel>(channel: C, payload: IpcPayload<C>): Promise<IpcResponse<C>> =>
    window.electronAPI.invoke(channel, payload),
  onModelProgress: (cb: (status: ModelStatusResponse) => void): (() => void) =>
    window.electronAPI.onModelProgress(cb),
};
```

- [ ] **Step 3: Typecheck** — `npm run typecheck` (expect clean).

- [ ] **Step 4: Commit**

```bash
git add src/main/preload.ts src/renderer/ipc/client.ts
git commit -m "feat(ipc): bridge model progress events to the renderer"
```

---

## Task 7: Register handlers + push progress to the main window

**Files:**

- Modify: `src/main/ipc/register.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Register the new handlers** in `src/main/ipc/register.ts`

Add the import:

```ts
import {
  handleModelStatus,
  handleModelDownloadStart,
  handleModelDownloadCancel,
  handleModelRemove,
  handleGetCategorizeOptOut,
  handleSetCategorizeOptOut,
} from './handlers/model';
```

Add inside `registerAllHandlers()`:

```ts
register(CHANNELS.modelStatus, () => handleModelStatus());
register(CHANNELS.modelDownloadStart, () => handleModelDownloadStart());
register(CHANNELS.modelDownloadCancel, () => handleModelDownloadCancel());
register(CHANNELS.modelRemove, () => handleModelRemove());
register(CHANNELS.settingsGetCategorizeOptOut, () => handleGetCategorizeOptOut());
register(CHANNELS.settingsSetCategorizeOptOut, handleSetCategorizeOptOut);
```

- [ ] **Step 2: Forward controller status to the window** in `src/main/index.ts`

After the `BrowserWindow` is created (where the variable holding it is in scope, e.g.
`mainWindow`), subscribe once:

```ts
import { modelController } from './llm/modelController';

// Push every model-status change to the renderer (progress bar, banner, settings).
modelController.subscribe((status) => {
  if (!mainWindow.isDestroyed()) mainWindow.webContents.send('model:progress', status);
});
```

- [ ] **Step 3: Typecheck + full unit suite**

Run: `npm run typecheck && npm run test`
Expected: clean + green.

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc/register.ts src/main/index.ts
git commit -m "feat(main): register model handlers and push status to the window"
```

---

## ⛔ DESIGN MILESTONE — do this before Phase 2

Phase 1 is complete and self-contained (the model can be downloaded/removed and status
flows to the renderer, even with no UI yet). **Now run the claude.ai/design pass** for the
four components, giving it spec §5 + the `finance-dashboard-design` skill. Bring back the
visual treatment, then implement Phase 2 keeping all states/props below.

---

# PHASE 2 — RENDERER (UI)

## Task 8: `useModelStatus` hook

**Files:**

- Create: `src/renderer/hooks/useModelStatus.ts`
- Test: `tests/unit/renderer/useModelStatus.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/renderer/useModelStatus.test.ts`:

```ts
// @vitest-environment jsdom
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ModelStatusResponse } from '@shared/types/ipc';

let progressCb: ((s: ModelStatusResponse) => void) | null = null;
vi.mock('@renderer/ipc/client', () => ({
  ipc: {
    invoke: vi.fn(async () => ({ state: 'absent' }) as ModelStatusResponse),
    onModelProgress: (cb: (s: ModelStatusResponse) => void) => {
      progressCb = cb;
      return () => (progressCb = null);
    },
  },
}));

import { useModelStatus } from '@renderer/hooks/useModelStatus';

afterEach(() => {
  cleanup();
  progressCb = null;
});

it('loads the initial status then applies pushed progress', async () => {
  const { result } = renderHook(() => useModelStatus());
  await waitFor(() => expect(result.current.state).toBe('absent'));
  act(() => progressCb?.({ state: 'downloading', receivedBytes: 5, totalBytes: 10 }));
  expect(result.current).toMatchObject({ state: 'downloading', receivedBytes: 5, totalBytes: 10 });
});
```

- [ ] **Step 2: Run it, expect FAIL.**

- [ ] **Step 3: Implement the hook**

`src/renderer/hooks/useModelStatus.ts`:

```ts
import { useEffect, useState } from 'react';
import type { ModelStatusResponse } from '@shared/types/ipc';
import { ipc } from '@renderer/ipc/client';

/** Live model status: seeds from `model:status`, then tracks pushed progress events. */
export function useModelStatus(): ModelStatusResponse {
  const [status, setStatus] = useState<ModelStatusResponse>({ state: 'absent' });

  useEffect(() => {
    void ipc.invoke('model:status', {}).then(setStatus);
    return ipc.onModelProgress(setStatus);
  }, []);

  return status;
}
```

- [ ] **Step 4: Run it, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/renderer/hooks/useModelStatus.ts tests/unit/renderer/useModelStatus.test.ts
git commit -m "feat(renderer): add useModelStatus hook"
```

---

## Task 9: `<ModelDownloadIndicator>` + mount in AppShell

**Files:**

- Create: `src/renderer/components/model/ModelDownloadIndicator.tsx`
- Modify: `src/renderer/components/AppShell.tsx`
- Test: `tests/unit/renderer/ModelDownloadIndicator.test.tsx`

Visible only for `downloading | paused | error`. (Styling is design-pass territory; keep the
states, the percent/MB readout, and the Resume/Retry action.)

- [ ] **Step 1: Write the failing test**

`tests/unit/renderer/ModelDownloadIndicator.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ModelDownloadIndicator } from '@renderer/components/model/ModelDownloadIndicator';

afterEach(() => cleanup());

it('renders nothing when ready or absent', () => {
  const { container } = render(<ModelDownloadIndicator status={{ state: 'ready' }} />);
  expect(container).toBeEmptyDOMElement();
});

it('shows percent and bytes while downloading', () => {
  render(
    <ModelDownloadIndicator
      status={{ state: 'downloading', receivedBytes: 890_000_000, totalBytes: 2_019_377_696 }}
    />,
  );
  expect(screen.getByText(/44\s*%/)).toBeInTheDocument();
});

it('offers Resume when paused', () => {
  const onResume = vi.fn();
  render(<ModelDownloadIndicator status={{ state: 'paused' }} onResume={onResume} />);
  fireEvent.click(screen.getByRole('button', { name: /reprendre/i }));
  expect(onResume).toHaveBeenCalledOnce();
});

it('offers Retry on error', () => {
  const onResume = vi.fn();
  render(
    <ModelDownloadIndicator status={{ state: 'error', error: 'network' }} onResume={onResume} />,
  );
  fireEvent.click(screen.getByRole('button', { name: /réessayer/i }));
  expect(onResume).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run it, expect FAIL.**

- [ ] **Step 3: Implement the component**

`src/renderer/components/model/ModelDownloadIndicator.tsx`:

```tsx
import type { ModelStatusResponse } from '@shared/types/ipc';

function mb(bytes: number): string {
  return `${Math.round(bytes / 1_000_000).toLocaleString('fr-FR')} Mo`;
}

export function ModelDownloadIndicator({
  status,
  onResume,
}: {
  status: ModelStatusResponse;
  onResume?: () => void;
}) {
  if (status.state === 'downloading') {
    const total = status.totalBytes ?? 0;
    const received = status.receivedBytes ?? 0;
    const pct = total > 0 ? Math.floor((received / total) * 100) : 0;
    return (
      <div data-testid="model-indicator" className="flex items-center gap-3 px-4 py-2 text-sm">
        <span>Modèle</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded bg-ink-3">
          <div className="h-full bg-accent" style={{ width: `${String(pct)}%` }} />
        </div>
        <span className="tabular-nums">
          {pct}% · {mb(received)} / {total > 0 ? mb(total) : '…'}
        </span>
      </div>
    );
  }
  if (status.state === 'paused') {
    return (
      <div data-testid="model-indicator" className="flex items-center gap-3 px-4 py-2 text-sm">
        <span>Téléchargement en pause</span>
        <button type="button" className="underline" onClick={onResume}>
          Reprendre
        </button>
      </div>
    );
  }
  if (status.state === 'error') {
    return (
      <div data-testid="model-indicator" className="flex items-center gap-3 px-4 py-2 text-sm">
        <span>Échec du téléchargement</span>
        <button type="button" className="underline" onClick={onResume}>
          Réessayer
        </button>
      </div>
    );
  }
  return null;
}
```

- [ ] **Step 4: Run it, expect PASS.**

- [ ] **Step 5: Mount it in `AppShell.tsx`**

Add the imports:

```ts
import { useModelStatus } from '@renderer/hooks/useModelStatus';
import { ModelDownloadIndicator } from './model/ModelDownloadIndicator';
import { ipc } from '@renderer/ipc/client';
```

Inside `AppShell()`, after the `bg` hook:

```ts
const modelStatus = useModelStatus();
const startDownload = (): void => {
  void ipc.invoke('model:download:start', {});
};
```

Render the indicator just under `<Topbar .../>` (inside the flex column, above `<main>`):

```tsx
<ModelDownloadIndicator status={modelStatus} onResume={startDownload} />
```

- [ ] **Step 6: Typecheck + tests** — `npm run typecheck && npm run test -- ModelDownloadIndicator`.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/model/ModelDownloadIndicator.tsx src/renderer/components/AppShell.tsx tests/unit/renderer/ModelDownloadIndicator.test.tsx
git commit -m "feat(renderer): persistent model download indicator in the chrome"
```

---

## Task 10: Just-in-time categorization banner + trigger logic

**Files:**

- Create: `src/renderer/components/model/triggerLogic.ts`
- Create: `src/renderer/components/model/CategorizationPrompt.tsx`
- Modify: `src/renderer/components/AppShell.tsx`
- Test: `tests/unit/renderer/triggerLogic.test.ts`, `tests/unit/renderer/CategorizationPrompt.test.tsx`

- [ ] **Step 1: Write the trigger-logic test (the truth table)**

`tests/unit/renderer/triggerLogic.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { shouldShowCategorizationPrompt } from '@renderer/components/model/triggerLogic';

const base = {
  state: 'absent' as const,
  pendingCount: 5,
  optOut: false,
  dismissedThisSession: false,
};

it('shows when model absent, pending>0, not opted out, not dismissed', () => {
  expect(shouldShowCategorizationPrompt(base)).toBe(true);
});
it('shows when model paused too', () => {
  expect(shouldShowCategorizationPrompt({ ...base, state: 'paused' })).toBe(true);
});
it('hides when no pending', () => {
  expect(shouldShowCategorizationPrompt({ ...base, pendingCount: 0 })).toBe(false);
});
it('hides when opted out', () => {
  expect(shouldShowCategorizationPrompt({ ...base, optOut: true })).toBe(false);
});
it('hides when dismissed this session', () => {
  expect(shouldShowCategorizationPrompt({ ...base, dismissedThisSession: true })).toBe(false);
});
it('hides when model is ready or downloading', () => {
  expect(shouldShowCategorizationPrompt({ ...base, state: 'ready' })).toBe(false);
  expect(shouldShowCategorizationPrompt({ ...base, state: 'downloading' })).toBe(false);
});
```

- [ ] **Step 2: Run it, expect FAIL.**

- [ ] **Step 3: Implement `triggerLogic.ts`**

`src/renderer/components/model/triggerLogic.ts`:

```ts
import type { ModelState } from '@shared/types/ipc';

export interface PromptInputs {
  state: ModelState;
  pendingCount: number;
  optOut: boolean;
  dismissedThisSession: boolean;
}

/** Scenario (a): propose categorization only when it would actually help. */
export function shouldShowCategorizationPrompt(i: PromptInputs): boolean {
  const modelMissing = i.state === 'absent' || i.state === 'paused';
  return modelMissing && i.pendingCount > 0 && !i.optOut && !i.dismissedThisSession;
}
```

- [ ] **Step 4: Run it, expect PASS.**

- [ ] **Step 5: Write the banner component test**

`tests/unit/renderer/CategorizationPrompt.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { CategorizationPrompt } from '@renderer/components/model/CategorizationPrompt';

afterEach(() => cleanup());

it('shows the pending count and triggers install', () => {
  const onInstall = vi.fn();
  render(
    <CategorizationPrompt
      pendingCount={142}
      onInstall={onInstall}
      onDismiss={() => {}}
      onOptOut={() => {}}
    />,
  );
  expect(screen.getByText(/142/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /activer/i }));
  expect(onInstall).toHaveBeenCalledOnce();
});

it('fires onOptOut when the checkbox is toggled', () => {
  const onOptOut = vi.fn();
  render(
    <CategorizationPrompt
      pendingCount={3}
      onInstall={() => {}}
      onDismiss={() => {}}
      onOptOut={onOptOut}
    />,
  );
  fireEvent.click(screen.getByRole('checkbox', { name: /ne plus me proposer/i }));
  expect(onOptOut).toHaveBeenCalledWith(true);
});
```

- [ ] **Step 6: Run it, expect FAIL, then implement the component**

`src/renderer/components/model/CategorizationPrompt.tsx`:

```tsx
export function CategorizationPrompt({
  pendingCount,
  onInstall,
  onDismiss,
  onOptOut,
}: {
  pendingCount: number;
  onInstall: () => void;
  onDismiss: () => void;
  onOptOut: (value: boolean) => void;
}) {
  return (
    <div
      data-testid="categorization-prompt"
      className="flex items-center gap-3 rounded-md border border-accent/40 bg-accent/10 px-4 py-3 text-sm"
    >
      <span className="flex-1">
        Catégoriser ces {pendingCount.toLocaleString('fr-FR')} opérations automatiquement ?
      </span>
      <label className="flex items-center gap-1.5">
        <input type="checkbox" onChange={(e) => onOptOut(e.target.checked)} />
        Ne plus me proposer
      </label>
      <button type="button" className="font-medium underline" onClick={onInstall}>
        Activer
      </button>
      <button type="button" aria-label="Fermer" onClick={onDismiss}>
        ✕
      </button>
    </div>
  );
}
```

- [ ] **Step 7: Run it, expect PASS.**

- [ ] **Step 8: Wire the banner into `AppShell.tsx`**

Add imports:

```ts
import { CategorizationPrompt } from './model/CategorizationPrompt';
import { shouldShowCategorizationPrompt } from './model/triggerLogic';
```

Add state + opt-out load inside `AppShell()`:

```ts
const [optOut, setOptOut] = useState(false);
const [dismissed, setDismissed] = useState(false);

useEffect(() => {
  void ipc.invoke('settings:getCategorizeOptOut', {}).then((r) => setOptOut(r.value));
}, []);

// A fresh trigger (new import) re-arms the banner for this session.
useEffect(() => {
  setDismissed(false);
}, [refreshToken]);

const showPrompt = shouldShowCategorizationPrompt({
  state: modelStatus.state,
  pendingCount: bg.pending,
  optOut,
  dismissedThisSession: dismissed,
});
```

Render it above `<main>` (under the indicator):

```tsx
{
  showPrompt && (
    <div className="px-5 pt-3 xl:px-7">
      <CategorizationPrompt
        pendingCount={bg.pending}
        onInstall={startDownload}
        onDismiss={() => setDismissed(true)}
        onOptOut={(v) => {
          setOptOut(v);
          void ipc.invoke('settings:setCategorizeOptOut', { value: v });
          if (v) setDismissed(true);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 9: When the model becomes ready, auto-run categorization.** Add to `AppShell()`:

```ts
const prevState = useRef(modelStatus.state);
useEffect(() => {
  if (prevState.current !== 'ready' && modelStatus.state === 'ready') {
    void bg.run();
  }
  prevState.current = modelStatus.state;
}, [modelStatus.state, bg]);
```

(Add `useRef` to the React import.)

- [ ] **Step 10: Typecheck + tests** — `npm run typecheck && npm run test -- triggerLogic CategorizationPrompt`.

- [ ] **Step 11: Commit**

```bash
git add src/renderer/components/model/triggerLogic.ts src/renderer/components/model/CategorizationPrompt.tsx src/renderer/components/AppShell.tsx tests/unit/renderer/triggerLogic.test.ts tests/unit/renderer/CategorizationPrompt.test.tsx
git commit -m "feat(renderer): just-in-time categorization banner with opt-out"
```

---

## Task 11: "PDF requires model" dialog + import-flow wiring + pending retry

**Files:**

- Create: `src/renderer/components/model/PdfModelRequiredDialog.tsx`
- Modify: `src/renderer/hooks/useImport.ts` (and/or `src/renderer/components/ImportModal.tsx`)
- Test: `tests/unit/renderer/PdfModelRequiredDialog.test.tsx`

The `banks:learn` IPC already returns `{ ok: false, error: 'model_unavailable' }` when the
model is absent (see `src/main/ipc/handlers/learnBank.ts`). Scenario (b) shows this dialog
whenever that response is seen — **regardless of the opt-out** (it's a direct user action).

- [ ] **Step 1: Read the import flow first**

Run: open `src/renderer/hooks/useImport.ts` and `src/renderer/components/ImportModal.tsx` and
locate where `banks:learn` is invoked and where its response is handled. The new branch goes
exactly there.

- [ ] **Step 2: Write the failing dialog test**

`tests/unit/renderer/PdfModelRequiredDialog.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { PdfModelRequiredDialog } from '@renderer/components/model/PdfModelRequiredDialog';

afterEach(() => cleanup());

it('offers install and CSV/OFX paths', () => {
  const onInstall = vi.fn();
  const onClose = vi.fn();
  render(<PdfModelRequiredDialog open onInstall={onInstall} onClose={onClose} />);
  expect(screen.getByText(/CSV|OFX/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /installer le modèle/i }));
  expect(onInstall).toHaveBeenCalledOnce();
});

it('renders nothing when closed', () => {
  const { container } = render(
    <PdfModelRequiredDialog open={false} onInstall={() => {}} onClose={() => {}} />,
  );
  expect(container).toBeEmptyDOMElement();
});
```

- [ ] **Step 3: Run it, expect FAIL, then implement the dialog**

`src/renderer/components/model/PdfModelRequiredDialog.tsx`:

```tsx
export function PdfModelRequiredDialog({
  open,
  onInstall,
  onClose,
}: {
  open: boolean;
  onInstall: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-label="Modèle requis"
      data-testid="pdf-model-required"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="max-w-md rounded-lg bg-ink-1 p-6 text-sm">
        <h2 className="mb-2 text-base font-medium">Ce relevé PDF nécessite le modèle</h2>
        <p className="mb-4 text-ink-7">
          Pour lire la mise en page d&apos;une banque inconnue, l&apos;app a besoin du modèle local.
          Vous pouvez l&apos;installer (l&apos;import reprendra automatiquement), ou importer ce
          relevé au format <strong>CSV ou OFX</strong> exporté depuis votre banque (ces formats ne
          nécessitent pas le modèle).
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" className="underline" onClick={onClose}>
            Importer en CSV/OFX
          </button>
          <button type="button" className="font-medium underline" onClick={onInstall}>
            Installer le modèle
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run it, expect PASS.**

- [ ] **Step 5: Wire it into the import flow**

In `useImport.ts` (or `ImportModal.tsx`), where the `banks:learn` response is handled, add:

```ts
const res = await ipc.invoke('banks:learn', payload);
if (!res.ok && res.error === 'model_unavailable') {
  setPdfModelRequiredOpen(true); // new piece of state in the component owning the modal
  return;
}
```

Render `<PdfModelRequiredDialog open={pdfModelRequiredOpen} onInstall={...} onClose={...} />`
near the `ImportModal`. `onInstall` should:

```ts
() => {
  setPdfModelRequiredOpen(false);
  void ipc.invoke('model:download:start', {});
  setPendingPdfLearn(payload); // remember the attempted learn input for retry
};
```

- [ ] **Step 6: Auto-retry the learn when the model turns ready.** In the component owning
      `pendingPdfLearn` (AppShell or ImportModal owner), add:

```ts
useEffect(() => {
  if (modelStatus.state === 'ready' && pendingPdfLearn) {
    void ipc.invoke('banks:learn', pendingPdfLearn).then(() => setPendingPdfLearn(null));
  }
}, [modelStatus.state, pendingPdfLearn]);
```

- [ ] **Step 7: Typecheck + tests** — `npm run typecheck && npm run test -- PdfModelRequiredDialog`.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/model/PdfModelRequiredDialog.tsx src/renderer/hooks/useImport.ts src/renderer/components/ImportModal.tsx tests/unit/renderer/PdfModelRequiredDialog.test.tsx
git commit -m "feat(renderer): PDF-requires-model dialog with install + CSV/OFX paths"
```

---

## Task 12: Settings › IA locale section

**Files:**

- Modify: `src/renderer/pages/SettingsPage.tsx`
- Create: `src/renderer/components/model/ModelSettingsSection.tsx`
- Test: `tests/unit/renderer/ModelSettingsSection.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/renderer/ModelSettingsSection.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ModelSettingsSection } from '@renderer/components/model/ModelSettingsSection';

afterEach(() => cleanup());

it('shows Download when absent and fires onDownload', () => {
  const onDownload = vi.fn();
  render(
    <ModelSettingsSection
      status={{ state: 'absent' }}
      onDownload={onDownload}
      onRemove={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /télécharger/i }));
  expect(onDownload).toHaveBeenCalledOnce();
});

it('shows Remove when ready and fires onRemove', () => {
  const onRemove = vi.fn();
  render(
    <ModelSettingsSection status={{ state: 'ready' }} onDownload={() => {}} onRemove={onRemove} />,
  );
  fireEvent.click(screen.getByRole('button', { name: /supprimer/i }));
  expect(onRemove).toHaveBeenCalledOnce();
});

it('shows progress while downloading', () => {
  render(
    <ModelSettingsSection
      status={{ state: 'downloading', receivedBytes: 1_009_688_848, totalBytes: 2_019_377_696 }}
      onDownload={() => {}}
      onRemove={() => {}}
    />,
  );
  expect(screen.getByText(/50\s*%/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run it, expect FAIL, then implement the section**

`src/renderer/components/model/ModelSettingsSection.tsx`:

```tsx
import type { ModelStatusResponse } from '@shared/types/ipc';

const SIZE_LABEL = '~1,9 Go';

export function ModelSettingsSection({
  status,
  onDownload,
  onRemove,
}: {
  status: ModelStatusResponse;
  onDownload: () => void;
  onRemove: () => void;
}) {
  const pct =
    status.state === 'downloading' && status.totalBytes
      ? Math.floor(((status.receivedBytes ?? 0) / status.totalBytes) * 100)
      : null;

  return (
    <section data-testid="model-settings" className="space-y-2">
      <h2 className="text-base font-medium">IA locale</h2>
      <p className="text-sm text-ink-7">
        Catégorisation automatique et lecture des relevés PDF de banques inconnues. Modèle local,
        hors-ligne ({SIZE_LABEL}).
      </p>
      {status.state === 'ready' && (
        <button type="button" className="underline" onClick={onRemove}>
          Supprimer le modèle
        </button>
      )}
      {(status.state === 'absent' || status.state === 'paused' || status.state === 'error') && (
        <button type="button" className="underline" onClick={onDownload}>
          {status.state === 'absent'
            ? `Télécharger le modèle (${SIZE_LABEL})`
            : 'Reprendre / Réessayer'}
        </button>
      )}
      {pct !== null && <p className="text-sm tabular-nums">Téléchargement… {pct}%</p>}
    </section>
  );
}
```

- [ ] **Step 3: Run it, expect PASS.**

- [ ] **Step 4: Mount it in `SettingsPage.tsx`**

Add imports and render the section, wiring it to live status + IPC:

```tsx
import { useModelStatus } from '@renderer/hooks/useModelStatus';
import { ModelSettingsSection } from '@renderer/components/model/ModelSettingsSection';
import { ipc } from '@renderer/ipc/client';
```

Inside the page body:

```tsx
const modelStatus = useModelStatus();
// …
<ModelSettingsSection
  status={modelStatus}
  onDownload={() => void ipc.invoke('model:download:start', {})}
  onRemove={() => void ipc.invoke('model:remove', {})}
/>;
```

- [ ] **Step 5: Typecheck + tests** — `npm run typecheck && npm run test -- ModelSettingsSection`.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/model/ModelSettingsSection.tsx src/renderer/pages/SettingsPage.tsx tests/unit/renderer/ModelSettingsSection.test.tsx
git commit -m "feat(renderer): Settings IA locale section (download/remove/progress)"
```

---

## Task 13: E2E — stubbed download, indicator, settings

**Files:**

- Create: `tests/e2e/model-download.spec.ts`

A real ~1.9 GB download is impossible in CI. Override the manifest via an env var read by the
download primitive so the test points at a local fixture served by Playwright's static server
(or a `data:`-style small file). Keep it light: assert the indicator appears and Settings
exposes the controls.

- [ ] **Step 1: Make the manifest test-overridable**

In `src/main/llm/modelManifest.ts`, allow an env override (used only by E2E):

```ts
export const MODEL_MANIFEST = {
  fileName: MODEL_FILE,
  url:
    process.env.FD_MODEL_URL ??
    'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
  sha256:
    process.env.FD_MODEL_SHA256 ??
    '6c1a2b41161032677be168d354123594c0e6e67d2b9227c84f296ad037c728ff',
  sizeBytes: process.env.FD_MODEL_SIZE ? Number(process.env.FD_MODEL_SIZE) : 2019377696,
} as const;
```

(Re-run `tests/unit/llm/modelManifest.test.ts` — still green.)

- [ ] **Step 2: Write the E2E**

`tests/e2e/model-download.spec.ts`:

```ts
import { test, expect, _electron as electron } from '@playwright/test';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

const FIXTURE = Buffer.from('fake-gguf-bytes-for-e2e');
const SHA = createHash('sha256').update(FIXTURE).digest('hex');

test('downloads the model (stubbed) and reflects it in the UI', async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-length': String(FIXTURE.length) });
    res.end(FIXTURE);
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;

  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      FD_MODEL_URL: `http://127.0.0.1:${String(port)}/model.gguf`,
      FD_MODEL_SHA256: SHA,
      FD_MODEL_SIZE: String(FIXTURE.length),
    },
  });
  const win = await app.firstWindow();

  await win.getByRole('link', { name: /réglages|settings/i }).click();
  await win.getByRole('button', { name: /télécharger le modèle/i }).click();

  // After the (tiny) download completes, Settings offers removal → model is ready.
  await expect(win.getByRole('button', { name: /supprimer le modèle/i })).toBeVisible({
    timeout: 15_000,
  });

  await app.close();
  server.close();
});
```

- [ ] **Step 3: Run E2E locally** (CI billing is suspended — run the gate locally per the team note)

Run: `xvfb-run npm run test:e2e -- model-download`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main/llm/modelManifest.ts tests/e2e/model-download.spec.ts
git commit -m "test(e2e): stubbed model download reflected in Settings"
```

---

## Final verification (Definition of Done)

- [ ] `npm run lint` clean
- [ ] `npm run typecheck` clean
- [ ] `npm run test` green
- [ ] `xvfb-run npm run test:e2e` green
- [ ] `npm run build` succeeds
- [ ] Open the PR from the feature branch; self-merge once the local gate is green (UI was
      validated by the maintainer first, per the "validate UI before merge" rule).

---

## Notes carried from the spec

- **Privacy:** the only outbound call is the model download, from the **main process** only;
  CSP `'self'` is untouched; the renderer makes no network calls.
- **Without the model:** CSV/OFX import and already-learned PDF banks keep working; only
  auto-categorization and learning a _new_ PDF bank require the model.
- **Distribution** (electron-builder + GitHub Releases, model downloaded on first need, no
  code signing) is a **separate** chantier — out of scope for this plan.
