# LLM Removal Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every remaining piece of LLM machinery (classifier, model download, settings, `llm_attempts`, `node-llama-cpp`) per ADR-019; categorization stays fully deterministic (history + rules).

**Architecture:** Pure removal in dependency order — renderer surface first, then the IPC contract and main-process code, then DB migration, disk cleanup, dependencies/packaging, docs. Each task compiles and passes the full gate so every commit is green.

**Tech Stack:** Electron + TypeScript strict, node:sqlite migrations, Vitest 4 (jsdom directive only for DOM tests + explicit `cleanup()`).

**Spec:** `docs/superpowers/specs/2026-06-11-llm-removal-phase2-design.md`

**Conventions for every task:** run the gate `npx eslint src tests && npx tsc --noEmit && npm test` before committing. Conventional Commits, English, imperative. Worktree: `/home/denis/finance-dashboard/.claude/worktrees/llm-removal-phase2`, branch `chore/llm-removal-phase2`.

---

### Task 1: Strip the renderer LLM surface

**Files:**

- Modify: `src/renderer/components/AppShell.tsx`
- Modify: `src/renderer/components/Topbar.tsx`
- Modify: `src/renderer/pages/SettingsPage.tsx`
- Delete: `src/renderer/components/model/CategorizationPrompt.tsx`, `src/renderer/components/model/ModelDownloadIndicator.tsx`, `src/renderer/components/model/ModelSettingsSection.tsx`, `src/renderer/components/model/triggerLogic.ts` (the whole `src/renderer/components/model/` directory)
- Delete: `src/renderer/hooks/useBackgroundCategorization.ts`, `src/renderer/hooks/useModelStatus.ts`, `src/renderer/lib/modelFormat.ts`
- Delete tests: `tests/unit/renderer/CategorizationPrompt.test.tsx`, `tests/unit/renderer/ModelDownloadIndicator.test.tsx`, `tests/unit/renderer/ModelSettingsSection.test.tsx`, `tests/unit/renderer/modelFormat.test.ts`, `tests/unit/renderer/triggerLogic.test.ts`, `tests/unit/renderer/useBackgroundCategorization.test.ts`, `tests/unit/renderer/useModelStatus.test.ts`
- Rewrite tests: `tests/unit/renderer/AppShell.test.tsx`, `tests/unit/renderer/SettingsPage.test.tsx`

- [ ] **Step 1: Delete the renderer LLM files and their tests**

```bash
git rm -r src/renderer/components/model
git rm src/renderer/hooks/useBackgroundCategorization.ts src/renderer/hooks/useModelStatus.ts src/renderer/lib/modelFormat.ts
git rm tests/unit/renderer/CategorizationPrompt.test.tsx tests/unit/renderer/ModelDownloadIndicator.test.tsx tests/unit/renderer/ModelSettingsSection.test.tsx tests/unit/renderer/modelFormat.test.ts tests/unit/renderer/triggerLogic.test.ts tests/unit/renderer/useBackgroundCategorization.test.ts tests/unit/renderer/useModelStatus.test.ts
```

- [ ] **Step 2: Rewrite `src/renderer/components/AppShell.tsx`**

Full new content (drops the background pass, model status, download indicator, categorization prompt, opt-out wiring; keeps everything else byte-identical):

```tsx
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import type { AppOutletContext } from '@renderer/lib/outletContext';
import { useNetWorthSummary } from '@renderer/hooks/useNetWorthSummary';
import { useSidebarCollapse } from '@renderer/hooks/useSidebarCollapse';
import { ImportModal } from './ImportModal';
import { CreateAccountModal } from './accounts/CreateAccountModal';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell() {
  const [importOpen, setImportOpen] = useState(false);
  const [createAccountOpen, setCreateAccountOpen] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const { netWorth, monthDelta } = useNetWorthSummary(refreshToken);
  const { collapsed: sidebarCollapsed, toggle: toggleSidebar } = useSidebarCollapse();

  return (
    <div className="flex h-full bg-ink-1">
      <Sidebar
        onImport={() => {
          setImportOpen(true);
        }}
        netWorth={netWorth}
        monthDelta={monthDelta}
        collapsed={sidebarCollapsed}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onImport={() => {
            setImportOpen(true);
          }}
          onToggleSidebar={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />
        {/* min-h-0 lets this flex child shrink to the viewport and scroll;
            [&>*]:shrink-0 stops page sections from being vertically
            compressed (which collapsed AccountTabs when the window
            was short). Sections keep their natural height; main scrolls. */}
        <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-6 pt-5 xl:gap-5 xl:px-7 xl:pb-8 xl:pt-6 [&>*]:shrink-0">
          <Outlet
            context={
              {
                refreshToken,
                openImport: () => {
                  setImportOpen(true);
                },
                openCreateAccount: () => {
                  setCreateAccountOpen(true);
                },
              } satisfies AppOutletContext
            }
          />
        </main>
      </div>
      <ImportModal
        open={importOpen}
        onClose={() => {
          setImportOpen(false);
        }}
        onImported={() => {
          setRefreshToken((t) => t + 1);
        }}
      />
      <CreateAccountModal
        open={createAccountOpen}
        onClose={() => {
          setCreateAccountOpen(false);
        }}
        onCreated={() => {
          setRefreshToken((t) => t + 1);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 3: Remove the categorization badge from `src/renderer/components/Topbar.tsx`**

Three edits:

1. Imports — replace `import { PanelLeft, Sparkles } from 'lucide-react';` with `import { PanelLeft } from 'lucide-react';`
2. Signature — replace

```tsx
export function Topbar({
  onImport,
  onToggleSidebar,
  sidebarCollapsed = false,
  categorizing = false,
  categorizeRemaining = 0,
}: {
  onImport: () => void;
  onToggleSidebar?: () => void;
  sidebarCollapsed?: boolean;
  categorizing?: boolean;
  categorizeRemaining?: number;
}) {
```

with

```tsx
export function Topbar({
  onImport,
  onToggleSidebar,
  sidebarCollapsed = false,
}: {
  onImport: () => void;
  onToggleSidebar?: () => void;
  sidebarCollapsed?: boolean;
}) {
```

3. Delete the whole `{categorizing ? ( … ) : null}` block (the `aria-live` span with `Catégorisation IA… ({categorizeRemaining})`) between `<span className="flex-1" />` and the `Importer un relevé` button.

- [ ] **Step 4: Remove `ModelSection` from `src/renderer/pages/SettingsPage.tsx`**

Edits:

1. Replace the import block's first lines: drop `useEffect` (no longer used), drop `Cpu`, drop the `useModelStatus` / `ModelSettingsSection` / `ipc` imports. New imports:

```tsx
import { type ComponentType, type ReactNode } from 'react';
import { Database, Palette } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Chip } from '../components/ui/chip';
import { Overline } from '../components/ui/overline';
import { cn } from '../lib/utils';
```

2. In `SettingsPage()`, remove `<ModelSection />` from the JSX (keep `DataSection` and `AppearanceSection`).
3. Delete the whole `function ModelSection() { … }` definition.
4. The `PLACEHOLDER` constant is still used by `DataSection`; keep it. Keep `SOON`.

- [ ] **Step 5: Rewrite `tests/unit/renderer/AppShell.test.tsx`**

The old tests asserted the post-import background pass — that behavior is gone. Replace the file with a regression test that the shell still renders and the import flow still bumps the refresh token (observed via the outlet context consumer):

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MemoryRouter, Route, Routes, useOutletContext } from 'react-router-dom';
import type { AppOutletContext } from '@renderer/lib/outletContext';

vi.mock('@renderer/hooks/useNetWorthSummary', () => ({
  useNetWorthSummary: () => ({ netWorth: 0, monthDelta: null }),
}));
vi.mock('@renderer/components/Sidebar', () => ({ Sidebar: () => <div /> }));
vi.mock('@renderer/components/accounts/CreateAccountModal', () => ({
  CreateAccountModal: () => null,
}));
vi.mock('@renderer/hooks/useSidebarCollapse', () => ({
  useSidebarCollapse: () => ({ collapsed: false, toggle: vi.fn() }),
}));
// The modal is replaced by a button that reports a successful import directly.
vi.mock('@renderer/components/ImportModal', () => ({
  ImportModal: ({ open, onImported }: { open: boolean; onImported: () => void }) =>
    open ? (
      <button type="button" onClick={onImported}>
        simulate-import-success
      </button>
    ) : null,
}));

import { AppShell } from '@renderer/components/AppShell';

afterEach(() => {
  cleanup();
});

function TokenProbe() {
  const { refreshToken } = useOutletContext<AppOutletContext>();
  return <div data-testid="token">{refreshToken}</div>;
}

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<TokenProbe />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppShell', () => {
  it('bumps the refresh token after a successful import', async () => {
    renderShell();
    expect(screen.getByTestId('token').textContent).toBe('0');

    await userEvent.click(screen.getByRole('button', { name: 'Importer un relevé' }));
    await userEvent.click(screen.getByRole('button', { name: 'simulate-import-success' }));

    expect(screen.getByTestId('token').textContent).toBe('1');
  });
});
```

- [ ] **Step 6: Rewrite `tests/unit/renderer/SettingsPage.test.tsx`**

The model section is gone; the `ipc` mock is no longer needed (nothing in the page calls IPC anymore):

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: { info: vi.fn() } }));

import { SettingsPage } from '@renderer/pages/SettingsPage';

afterEach(() => {
  cleanup();
});

describe('SettingsPage', () => {
  it('renders the two content sections and no model section', () => {
    render(<SettingsPage />);
    expect(screen.getByText('Données & Sauvegarde')).toBeInTheDocument();
    expect(screen.getByText('Apparence & divers')).toBeInTheDocument();
    expect(screen.queryByText('Modèle LLM')).not.toBeInTheDocument();
  });

  it('disables the "à venir" actions (restore, reset)', () => {
    render(<SettingsPage />);
    expect(screen.getByRole('button', { name: /Restaurer/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Tout réinitialiser/ })).toBeDisabled();
  });

  it('keeps the live-worthy export/backup actions enabled', () => {
    render(<SettingsPage />);
    expect(screen.getByRole('button', { name: 'CSV' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'JSON' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Sauvegarder' })).toBeEnabled();
  });
});
```

- [ ] **Step 7: Gate and commit**

Run: `npx eslint src tests && npx tsc --noEmit && npm test`
Expected: all green (the IPC contract still declares the model/categorize channels — they're just no longer called from the renderer).

```bash
git add -A
git commit -m "refactor(renderer): remove the LLM surface (banner, prompt, model settings, background pass)"
```

---

### Task 2: Remove the IPC channels and the main-process LLM code

**Files:**

- Modify: `src/shared/types/ipc.ts`, `src/shared/types/import.ts`, `src/main/ipc/channels.ts`, `src/main/ipc/register.ts`, `src/main/preload.ts`, `src/renderer/ipc/client.ts`, `src/main/index.ts`
- Delete: `src/main/llm/` (whole directory), `src/main/ipc/handlers/model.ts`, `src/main/ipc/handlers/categorize.ts`, `src/main/categorize/llm.ts`, `src/main/categorize/pending.ts`, `src/main/categorize/attempts.ts`, `src/main/settings/settings.ts` (and the now-empty `src/main/settings/` directory), `src/shared/types/model.ts`
- Delete tests: `tests/unit/llm/` (whole directory), `tests/unit/categorize/llm.test.ts`, `tests/unit/categorize/pending.test.ts`, `tests/unit/categorize/attempts.test.ts`, `tests/unit/ipc/model.test.ts`, `tests/unit/ipc/categorize.test.ts`, `tests/e2e/model-download.test.ts`

- [ ] **Step 1: Delete the main-process LLM files and their tests**

```bash
git rm -r src/main/llm tests/unit/llm
git rm src/main/ipc/handlers/model.ts src/main/ipc/handlers/categorize.ts
git rm src/main/categorize/llm.ts src/main/categorize/pending.ts src/main/categorize/attempts.ts
git rm src/main/settings/settings.ts
git rm src/shared/types/model.ts
git rm tests/unit/categorize/llm.test.ts tests/unit/categorize/pending.test.ts tests/unit/categorize/attempts.test.ts
git rm tests/unit/ipc/model.test.ts tests/unit/ipc/categorize.test.ts
git rm tests/e2e/model-download.test.ts
```

- [ ] **Step 2: Purge the IPC contract in `src/shared/types/ipc.ts`**

1. Delete the model-type header (lines importing/re-exporting from `./model`):

```ts
import type { ModelStatus } from './model';
export type { ModelState } from './model';

/** Alias kept for the IPC response naming convention. */
export type ModelStatusResponse = ModelStatus;
```

2. In the `./import` type import, drop `PendingGroup`: `import type { StatementExtraction } from './import';`
3. Delete the types `CategorizePendingResponse`, `CategorizeBatchPayload`, `CategorizeBatchResponse` (the block between `ConfirmResponse` and `RulesMutationResponse`).
4. In `IpcContract`, delete these entries:
   - `'categorize:pending'` and `'categorize:batch'`
   - `'model:status'`, `'model:download:start'`, `'model:download:cancel'`, `'model:remove'`, `'model:selection:detect'`
   - `'settings:getCategorizeOptOut'`, `'settings:setCategorizeOptOut'`
5. In `ElectronAPI`, delete the `onModelProgress` member.

- [ ] **Step 3: Drop `PendingGroup` from `src/shared/types/import.ts`**

Delete the `export interface PendingGroup { … }` block (around line 61). Nothing references it after Step 1.

- [ ] **Step 4: Purge `src/main/ipc/channels.ts`**

Delete these keys from `CHANNELS`: `categorizePending`, `categorizeBatch`, `modelStatus`, `modelDownloadStart`, `modelDownloadCancel`, `modelRemove`, `modelDetectSelection`, `settingsGetCategorizeOptOut`, `settingsSetCategorizeOptOut`.

- [ ] **Step 5: Purge `src/main/ipc/register.ts`**

Delete the imports of `handleCategorizePending, handleCategorizeBatch` (from `./handlers/categorize`) and the whole import block from `./handlers/model`. Delete the matching `register(...)` lines: `categorizePending`, `categorizeBatch`, `modelStatus`, `modelDownloadStart`, `modelDownloadCancel`, `modelRemove`, `modelDetectSelection`, `settingsGetCategorizeOptOut`, `settingsSetCategorizeOptOut`.

- [ ] **Step 6: Simplify `src/main/preload.ts`**

Full new content:

```ts
import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { ElectronAPI, IpcChannel, IpcPayload, IpcResponse } from '@shared/types/ipc';

const api: ElectronAPI = {
  invoke: <C extends IpcChannel>(channel: C, payload: IpcPayload<C>): Promise<IpcResponse<C>> =>
    ipcRenderer.invoke(channel, payload),
  getDroppedPaths: (files: File[]): string[] => files.map((f) => webUtils.getPathForFile(f)),
};

contextBridge.exposeInMainWorld('electronAPI', api);
```

- [ ] **Step 7: Simplify `src/renderer/ipc/client.ts`**

Full new content:

```ts
import type { IpcChannel, IpcPayload, IpcResponse } from '@shared/types/ipc';

export const ipc = {
  invoke: <C extends IpcChannel>(channel: C, payload: IpcPayload<C>): Promise<IpcResponse<C>> =>
    window.electronAPI.invoke(channel, payload),
};
```

- [ ] **Step 8: Remove the model push from `src/main/index.ts`**

Delete the import `import { modelController } from './llm/modelController';` and the block:

```ts
// Push every model-status change to the renderer (progress bar, banner, settings).
const unsubscribeModelStatus = modelController.subscribe((status) => {
  if (!win.isDestroyed()) win.webContents.send('model:progress', status);
});
win.once('closed', unsubscribeModelStatus);
```

- [ ] **Step 9: Clean the ImportModal test mocks**

`tests/unit/renderer/ImportModal.summary.test.tsx` (line ~8) and `tests/unit/renderer/ImportModal.review.test.tsx` (line ~21) both mock the ipc client with an `onModelProgress: vi.fn()…` member. Delete that member from both mock objects (keep `invoke`).

- [ ] **Step 10: Sweep for survivors**

Run: `grep -rn "model:\|categorize:pending\|categorize:batch\|node-llama\|llm/\|ModelStatus\|onModelProgress\|getCategorizeOptOut" src tests --include='*.ts' --include='*.tsx' | grep -v 'shared/types/bank\|suggestColumns\|learnBank\|detectBank'`
Expected: no hits in live code (mentions inside `package.json`/`electron-builder.yml` are Task 5; docs are Task 6). If a test mocks a removed channel, fix it now.

- [ ] **Step 11: Gate and commit**

Run: `npx eslint src tests && npx tsc --noEmit && npm test`
Expected: green — TypeScript strict proves no orphan caller of the removed contract entries survives.

```bash
git add -A
git commit -m "refactor(main): remove the LLM classifier, model download and their IPC channels"
```

---

### Task 3: Migration 019 — drop `llm_attempts` (TDD)

**Files:**

- Create: `src/main/db/migrations/019_drop_llm_attempts.sql`
- Modify: `src/main/db/migrate.ts`
- Test: `tests/unit/db/drop_llm_attempts.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/db/drop_llm_attempts.test.ts` (node env — no jsdom directive, matching the other `tests/unit/db/*` files):

```ts
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

describe('migration 019 (LLM removal)', () => {
  it('leaves no llm_attempts table', () => {
    const db = freshDb();
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'llm_attempts'")
      .get();
    expect(row).toBeUndefined();
    db.close();
  });

  it('removes the categorize opt-out setting row', () => {
    const db = freshDb();
    const row = db.prepare("SELECT value FROM app_settings WHERE key = 'categorize.optOut'").get();
    expect(row).toBeUndefined();
    db.close();
  });
});
```

- [ ] **Step 2: Run it to make sure the first test fails**

Run: `npx vitest run tests/unit/db/drop_llm_attempts.test.ts`
Expected: FAIL — `llm_attempts` still exists (migration 017 created it, nothing drops it). The opt-out test may already pass on a fresh db; that's fine, it guards the upgrade path.

- [ ] **Step 3: Write the migration**

`src/main/db/migrations/019_drop_llm_attempts.sql`:

```sql
-- ADR-019 phase 2: the LLM classifier is removed. Drop its per-model failure
-- memory (017) and the categorization-prompt opt-out setting. No user data
-- is touched — transaction categories live on transactions/rules.
DROP TABLE llm_attempts;
DELETE FROM app_settings WHERE key = 'categorize.optOut';
```

In `src/main/db/migrate.ts`, add the import and the entry (no `rebuildsTables`: nothing references `llm_attempts`):

```ts
import sql019 from './migrations/019_drop_llm_attempts.sql?raw';
```

```ts
  { version: 19, sql: sql019 },
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run tests/unit/db/`
Expected: all green, including the pre-existing migration tests.

- [ ] **Step 5: Gate and commit**

Run: `npx eslint src tests && npx tsc --noEmit && npm test`

```bash
git add -A
git commit -m "feat(db): drop the llm_attempts table and the categorize opt-out setting"
```

---

### Task 4: One-shot startup cleanup of downloaded models (TDD)

**Files:**

- Create: `src/main/cleanup/removeDownloadedModels.ts`
- Modify: `src/main/index.ts`
- Test: `tests/unit/cleanup/removeDownloadedModels.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/cleanup/removeDownloadedModels.test.ts` (node env):

```ts
import { describe, it, expect } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { removeDownloadedModels } from '../../../src/main/cleanup/removeDownloadedModels';

describe('removeDownloadedModels', () => {
  it('removes the models directory under userData, files included', () => {
    const userData = mkdtempSync(join(tmpdir(), 'fd-userdata-'));
    const modelsDir = join(userData, 'models');
    mkdirSync(modelsDir);
    writeFileSync(join(modelsDir, 'some-model.gguf'), 'weights');

    removeDownloadedModels(userData);

    expect(existsSync(modelsDir)).toBe(false);
    expect(existsSync(userData)).toBe(true);
  });

  it('is a no-op when there is no models directory', () => {
    const userData = mkdtempSync(join(tmpdir(), 'fd-userdata-'));
    expect(() => {
      removeDownloadedModels(userData);
    }).not.toThrow();
    expect(existsSync(userData)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/unit/cleanup/`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/main/cleanup/removeDownloadedModels.ts`:

```ts
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ADR-019 phase 2: the LLM is gone, but earlier versions downloaded GGUF
 * models (2–4.4 GB) into <userData>/models. Reclaim that disk space once on
 * startup. Permanent and idempotent — after the first run it's a single
 * existsSync per launch. Scoped strictly to the `models` subdirectory the
 * download feature owned (PR #163).
 */
export function removeDownloadedModels(userDataDir: string): void {
  const dir = join(userDataDir, 'models');
  if (!existsSync(dir)) return;
  rmSync(dir, { recursive: true, force: true });
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run tests/unit/cleanup/`
Expected: PASS (2/2).

- [ ] **Step 5: Wire it into startup**

In `src/main/index.ts`, add the import:

```ts
import { removeDownloadedModels } from './cleanup/removeDownloadedModels';
```

and inside `app.whenReady().then(() => { … })`, after the `detectTransfers` try/catch and before `registerAllHandlers()`:

```ts
// ADR-019: reclaim the disk space of previously downloaded LLM models.
try {
  removeDownloadedModels(app.getPath('userData'));
} catch (e) {
  // best-effort — a locked file must never block startup.
  console.error('startup: model cleanup failed', e);
}
```

- [ ] **Step 6: Gate and commit**

Run: `npx eslint src tests && npx tsc --noEmit && npm test`

```bash
git add -A
git commit -m "feat(main): reclaim downloaded LLM model files at startup"
```

---

### Task 5: Drop `node-llama-cpp` and clean the packaging config

**Files:**

- Modify: `package.json`, `package-lock.json` (via npm), `electron-builder.yml`

- [ ] **Step 1: Remove the dependency**

```bash
npm uninstall node-llama-cpp
```

Expected: `package.json` no longer lists `node-llama-cpp`; lockfile updated; install succeeds.

- [ ] **Step 2: Clean `electron-builder.yml`**

Replace the `files:` and `asarUnpack:` sections with (keep the `!models` exclusions as belt-and-braces while model files may still exist on machines; drop everything node-llama-cpp):

```yaml
# electron-vite emits the bundled app into out/. Ship that plus package.json;
# production node_modules are included by electron-builder's defaults.
files:
  - out/**
  - package.json
  # Safety: never bundle leftover GGUF models (the LLM was removed — ADR-019;
  # the dirs may still exist on dev machines).
  - '!models'
  - '!models/**'
```

(The whole `asarUnpack:` block and the `@node-llama-cpp` globs disappear; `mac:`/`win:` stay unchanged.)

- [ ] **Step 3: Verify the build**

Run: `npx tsc --noEmit && npm run build`
Expected: build succeeds with no reference to node-llama-cpp. Then `grep -rn 'node-llama' out/ | head` → no hits.

- [ ] **Step 4: Gate and commit**

Run: `npx eslint src tests && npm test`

```bash
git add -A
git commit -m "build: drop node-llama-cpp and its packaging carve-outs"
```

---

### Task 6: Docs — README, CLAUDE.md, ADR-019

**Files:**

- Modify: `README.md`, `CLAUDE.md`, `docs/adr/019-remove-the-llm.md`

- [ ] **Step 1: Update `README.md`**

Anchored edits (verify with `grep -n -i 'llm\|model\|llama' README.md` that none survive except historical ADR mentions):

- Line ~32 `human-reviewable (the embedded LLM classifier is being removed — ADR-019);` → `human-reviewable (deterministic history + rules — the embedded LLM was removed, ADR-019);`
- Line ~46 `all computed locally, no network. The LLM classifies in the background; it …` → end the sentence at `all computed locally, no network.` and delete the LLM sentence(s) that follow (read the paragraph; remove every claim about an embedded model/classifier).
- Line ~52 `` `node:sqlite` (`node-llama-cpp` on its way out — ADR-019). `` → `` `node:sqlite`. ``
- Keep line ~54 (the no-LLM stance note) but fix tense if it says "is being removed".
- If a model-download / "Modèle LLM" setup section exists further down, delete it.
- Make sure the privacy paragraph states: the only outbound network call is the opt-in version check (sends no data, receives a version number).

- [ ] **Step 2: Update `CLAUDE.md`**

- §Privacy: replace `the only outbound calls allowed are an opt-in version check (sends no data, receives a version number) and — until the ADR-019 removal lands — the initial LLM model download, both from the main process only, never the renderer.` with `the only outbound call allowed is an opt-in version check (sends no data, receives a version number), from the main process only, never the renderer.`
- §Scope guard: replace the trailing ADR-019 sentence (`the embedded model is being removed … until the removal lands the existing classifier is frozen (no further investment).`) with `the embedded model was removed (phases #212/#214 + this PR) — categorization and bank mapping are deterministic (history/rules + a manual mapping assistant). Do not propose LLM-powered features.`
- §Worktrees & fixtures: drop `models/` from the gitignored-dirs rule and the symlink example (keep `spike-fixtures`): `spike-fixtures/ is gitignored (real bank data) — never commit it. A worktree that needs it gets a symlink, e.g. ln -sfn <repo>/spike-fixtures <worktree>/spike-fixtures.`

- [ ] **Step 3: Update `docs/adr/019-remove-the-llm.md`**

Under the `- **Status** : Accepted` line, add:

```markdown
- **Executed** : 2026-06-11 — phase 1a #212 (rules), phase 1b #214 (mapping
  assistant), phase 2 (classifier + model download removal, migration 019,
  startup model cleanup) in this PR.
```

- [ ] **Step 4: Gate and commit**

Run: `npx eslint src tests && npx tsc --noEmit && npm test`

```bash
git add -A
git commit -m "docs: record the LLM removal as executed (ADR-019 phase 2)"
```

---

### Task 7: Push, PR, and local disk cleanup

- [ ] **Step 1: Push and open the PR**

```bash
git push -u origin chore/llm-removal-phase2
gh pr create --title "refactor: remove the LLM (ADR-019 phase 2)" --body "$(cat <<'EOF'
## Summary
- remove the categorization classifier, model download/settings UI, and all `model:*` / `categorize:*` IPC channels
- migration 019: drop `llm_attempts` + the categorize opt-out setting
- one-shot startup cleanup of `<userData>/models` (reclaims the downloaded GGUF space)
- drop `node-llama-cpp` and its electron-builder carve-outs; docs updated (README, CLAUDE.md, ADR-019 executed)

Spec: docs/superpowers/specs/2026-06-11-llm-removal-phase2-design.md

## Validation (maintainer, in-app)
1. App starts; Réglages has no « Modèle LLM » section; no download indicator/prompt anywhere.
2. Import a PDF: history+rules categorization still applies; corrections still offer « Créer une règle ».
3. Windows: after first launch, `%APPDATA%/finance-dashboard/models` is gone.
4. `npm run build` package contains no node-llama-cpp.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Local-only cleanup (not part of the PR)**

After the maintainer validates and the PR is merged: delete the dev repo's `models/` (~15 GB) — `rm -rf /home/denis/finance-dashboard/models` — and any worktree `models` symlinks. Never needed again; `.gitignore` keeps ignoring the path harmlessly.

---

## Validation script (maintainer)

1. `npm run dev` (no `LD_LIBRARY_PATH` needed anymore — CUDA was for the LLM): the app opens; Réglages shows only « Données & Sauvegarde » and « Apparence & divers ».
2. Import `releve-banque-horizon.pdf` (or any LCL statement) on a test account: transactions appear, history/rules categorization applies, reassigning a category still offers « Créer une règle ».
3. Check the DB (`sqlite3` or the app): `llm_attempts` table is gone, `schema_migrations` has version 19.
4. On Windows after first launch of a packaged build: the `models` folder under `%APPDATA%` has been removed.
