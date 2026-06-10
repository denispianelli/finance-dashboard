# Hardware-Tiered Model — Phase B (status surface + UX) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface which model is active (real name + size), offer an opt-in upgrade banner when a better model fits the hardware but isn't downloaded, and auto-remove the superseded model after an upgrade — killing the hardcoded "~1,9 Go" / "Llama 3.2 3B" lies left by Phase A.

**Architecture:** Status splits into a **sync** part (`active`, always available via `findBestPresentModel` + registry) and a **lazy** part (`target`, `upgrade`) resolved by a user-triggered `detectSelection()` that runs hardware detection off the launch path. The existing `subscribe → model:progress` push delivers the enriched status to the renderer — no new push channel. After every successful download, `pruneToBestPresent()` keeps only the highest-tier model on disk.

**Tech Stack:** Electron (typed IPC), `node:sqlite` (unaffected here), `node-llama-cpp` (detection only, via Phase A's `getActiveSelection`), React + Tailwind/shadcn, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-06-08-hardware-tiered-model-design.md` §B (Phase B).

**Conventions (enforced):** TypeScript strict; `@typescript-eslint/no-explicit-any`, `no-unsafe-*`, **`no-non-null-assertion`** are ERRORS (no `!`); `noUncheckedIndexedAccess` on. Vitest per-file `// @vitest-environment jsdom` **only** for renderer tests (never on `node:sqlite`/main tests) + explicit `afterEach(() => { cleanup(); })`. Conventional Commits, English imperative, end commit bodies with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Extend `ModelStatus` with `ModelInfo` (active / target / upgrade)

**Files:**

- Modify: `src/shared/types/model.ts`

- [ ] **Step 1: Add the `ModelInfo` interface and extend `ModelStatus`**

Replace the file's `ModelStatus` interface, adding the optional fields. Final content:

```ts
export type ModelState = 'absent' | 'downloading' | 'paused' | 'ready' | 'error';

/** A model identified for the UI: registry id, user-facing label, real byte size. */
export interface ModelInfo {
  id: string;
  label: string;
  sizeBytes: number;
}

export interface ModelStatus {
  state: ModelState;
  receivedBytes?: number;
  totalBytes?: number;
  error?: string;
  /** Best-present model (sync) — drives the "Présent · {label} · {size}" display. */
  active?: ModelInfo;
  /** Download target: the cached hardware selection once detected, else the fallback. */
  target?: ModelInfo;
  /** Set only when ready + a better, not-yet-downloaded model fits the hardware. */
  upgrade?: ModelInfo;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (new optional fields break nothing; `ModelStatusResponse` in `ipc.ts` re-exports `ModelStatus`).

- [ ] **Step 3: Commit**

```bash
git add src/shared/types/model.ts
git commit -m "feat(model): add ModelInfo + active/target/upgrade to ModelStatus"
```

---

### Task 2: `modelRegistry` helper — `specToInfo` + tier comparison

**Files:**

- Modify: `src/main/llm/modelRegistry.ts`
- Test: `tests/unit/llm/modelRegistry.test.ts` (extend if it exists; else create)

- [ ] **Step 1: Write failing tests**

Add to (or create) `tests/unit/llm/modelRegistry.test.ts`. No `jsdom` directive — this is a pure-node module.

```ts
import { describe, it, expect } from 'vitest';
import { MODELS, specToInfo, isHigherTier } from '../../../src/main/llm/modelRegistry';

describe('specToInfo', () => {
  it('projects a spec to {id,label,sizeBytes}', () => {
    const spec = MODELS[0];
    if (spec === undefined) throw new Error('MODELS empty');
    expect(specToInfo(spec)).toEqual({ id: spec.id, label: spec.label, sizeBytes: spec.sizeBytes });
  });
});

describe('isHigherTier', () => {
  it('a model earlier in MODELS (best-first) is higher tier', () => {
    const best = MODELS[0];
    const worst = MODELS[MODELS.length - 1];
    if (best === undefined || worst === undefined) throw new Error('MODELS empty');
    expect(isHigherTier(best, worst)).toBe(true);
    expect(isHigherTier(worst, best)).toBe(false);
    expect(isHigherTier(best, best)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/llm/modelRegistry.test.ts`
Expected: FAIL ("specToInfo is not a function" / "isHigherTier is not a function").

- [ ] **Step 3: Implement the helpers**

Append to `src/main/llm/modelRegistry.ts`:

```ts
import type { ModelInfo } from '@shared/types/model';

/** Project a spec to the UI-facing subset. */
export function specToInfo(spec: ModelSpec): ModelInfo {
  return { id: spec.id, label: spec.label, sizeBytes: spec.sizeBytes };
}

/** True if `a` is a strictly better tier than `b` (earlier in MODELS, which is best-first). */
export function isHigherTier(a: ModelSpec, b: ModelSpec): boolean {
  return MODELS.indexOf(a) < MODELS.indexOf(b);
}
```

(If `@shared` is not the alias used by other `src/main` files, match the existing import style — e.g. `import type { ModelInfo } from '../../shared/types/model';`. Check a sibling file like `downloadController.ts`, which imports `@shared/types/model`.)

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/unit/llm/modelRegistry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/llm/modelRegistry.ts tests/unit/llm/modelRegistry.test.ts
git commit -m "feat(model): add specToInfo + isHigherTier registry helpers"
```

---

### Task 3: Controller — `detectSelection`, enriched `getStatus`, `pruneToBestPresent`

**Files:**

- Modify: `src/main/llm/downloadController.ts`
- Test: `tests/unit/llm/downloadController.test.ts` (extend if it exists; else create)

**Context:** `findBestPresentModel(dir)` (returns the best-present `ModelSpec | null`) and `getActiveSelection()` (async, cached, never throws — returns the hardware's `ModelSpec`) already exist in `src/main/llm/llm.ts`. `fallbackModel()` and the new `specToInfo`/`isHigherTier` live in `modelRegistry.ts`. The controller already pushes status via `subscribe`/`emit`.

- [ ] **Step 1: Write failing tests**

Add to `tests/unit/llm/downloadController.test.ts`. No `jsdom` directive (node + fs). Use a temp models dir and write fake `.gguf` files to simulate presence. Mock `getActiveSelection` via `vi.mock('../../../src/main/llm/llm', ...)` keeping `findBestPresentModel` real (it only does `existsSync`).

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MODELS } from '../../../src/main/llm/modelRegistry';

const QWEN = MODELS.find((m) => m.id === 'qwen2.5-7b');
const LLAMA = MODELS.find((m) => m.id === 'llama-3.2-3b');
if (QWEN === undefined || LLAMA === undefined) throw new Error('registry changed');

const getActiveSelection = vi.fn();
vi.mock('../../../src/main/llm/llm', async (orig) => {
  const actual = await orig<typeof import('../../../src/main/llm/llm')>();
  return { ...actual, getActiveSelection: () => getActiveSelection() };
});

// Import AFTER the mock is registered.
const { createDownloadController } = await import('../../../src/main/llm/downloadController');

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fd-models-'));
  getActiveSelection.mockReset();
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function present(spec: { fileName: string }): void {
  writeFileSync(join(dir, spec.fileName), 'x');
}

describe('downloadController status enrichment', () => {
  it('getStatus() includes active from best-present (sync, no detection)', () => {
    present(LLAMA);
    const c = createDownloadController(() => dir);
    const s = c.getStatus();
    expect(s.state).toBe('ready');
    expect(s.active).toEqual({ id: LLAMA.id, label: LLAMA.label, sizeBytes: LLAMA.sizeBytes });
    expect(s.upgrade).toBeUndefined(); // detection not run yet
  });

  it('after detectSelection(): 3B present + hardware wants 7B → upgrade set', async () => {
    present(LLAMA);
    getActiveSelection.mockResolvedValue(QWEN);
    const c = createDownloadController(() => dir);
    await c.detectSelection();
    const s = c.getStatus();
    expect(s.upgrade).toEqual({ id: QWEN.id, label: QWEN.label, sizeBytes: QWEN.sizeBytes });
    expect(s.target).toEqual({ id: QWEN.id, label: QWEN.label, sizeBytes: QWEN.sizeBytes });
  });

  it('no upgrade when the selected model is already present', async () => {
    present(QWEN);
    getActiveSelection.mockResolvedValue(QWEN);
    const c = createDownloadController(() => dir);
    await c.detectSelection();
    expect(c.getStatus().upgrade).toBeUndefined();
  });

  it('remove() with both present deletes everything', async () => {
    present(QWEN);
    present(LLAMA);
    const c = createDownloadController(() => dir);
    await c.remove();
    expect(existsSync(join(dir, QWEN.fileName))).toBe(false);
    expect(existsSync(join(dir, LLAMA.fileName))).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/llm/downloadController.test.ts`
Expected: FAIL (`c.detectSelection is not a function`; `active`/`upgrade` undefined).

- [ ] **Step 3: Implement controller changes**

In `src/main/llm/downloadController.ts`:

3a. Update imports:

```ts
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { ModelStatus, ModelInfo } from '@shared/types/model';
import {
  MODELS,
  withDownloadOverrides,
  fallbackModel,
  specToInfo,
  isHigherTier,
} from './modelRegistry';
import { getActiveSelection, findBestPresentModel } from './llm';
import { downloadModel, type DownloadProgress } from './download';
```

3b. Add `ModelSpec` import for typing `selected`:

```ts
import {
  MODELS,
  withDownloadOverrides,
  fallbackModel,
  specToInfo,
  isHigherTier,
  type ModelSpec,
} from './modelRegistry';
```

3c. Add state inside `createDownloadController`, alongside the existing locals:

```ts
let selected: ModelSpec | null = null;
```

3d. Add `detectSelection`:

```ts
/** Lazy hardware detection (loads the native backend) — call only from user-driven
 *  paths (Settings mount, PDF dialog), never at launch. Re-emits the enriched status. */
async function detectSelection(): Promise<void> {
  selected = await getActiveSelection();
  emit();
}
```

3e. Replace `fsState()` with an enriching version that keeps the same state logic and adds the `ModelInfo` fields. The `override` (download/error) still wins for `state`/progress in `getStatus()`, but `active`/`target`/`upgrade` are always computed from disk + `selected`:

```ts
function baseState(dir: string): ModelStatus {
  if (findBestPresentModel(dir) !== null) return { state: 'ready' };
  if (MODELS.some((m) => existsSync(join(dir, `${m.fileName}.part`)))) return { state: 'paused' };
  return { state: 'absent' };
}

function info(dir: string): Pick<ModelStatus, 'active' | 'target' | 'upgrade'> {
  const present = findBestPresentModel(dir);
  const targetSpec = selected ?? fallbackModel();
  const active: ModelInfo | undefined = present === null ? undefined : specToInfo(present);
  const target: ModelInfo = specToInfo(targetSpec);
  // Upgrade: ready, a selection is resolved, its file is absent, and it beats what we have.
  const upgrade: ModelInfo | undefined =
    present !== null &&
    selected !== null &&
    !existsSync(join(dir, selected.fileName)) &&
    isHigherTier(selected, present)
      ? specToInfo(selected)
      : undefined;
  return { active, target, upgrade };
}

function getStatus(): ModelStatus {
  const dir = modelsDir();
  const enrich = info(dir);
  const core = override ?? baseState(dir);
  return { ...core, ...enrich };
}
```

(Remove the old `fsState()`; update the two internal callers — `start()` and `remove()` use `set(null)`, which calls `emit()` → `getStatus()`, so they need no change beyond `baseState` no longer being named `fsState`. The `override`-vs-fs precedence is unchanged.)

3f. Add `pruneToBestPresent` and call it after a successful download:

```ts
/** Keep only the highest-tier present model on disk (removes a superseded lower model
 *  after an upgrade). No-op on a first/only download. */
async function pruneToBestPresent(): Promise<void> {
  const dir = modelsDir();
  const best = findBestPresentModel(dir);
  if (best === null) return;
  for (const m of MODELS) {
    if (m.id === best.id) continue;
    await rm(join(dir, m.fileName), { force: true });
    await rm(join(dir, `${m.fileName}.part`), { force: true });
  }
}
```

In `start()`, change the success branch:

```ts
if (res.ok) {
  await pruneToBestPresent();
  set(null);
} else if (res.error === 'cancelled') set(null);
else set({ state: 'error', error: res.error });
```

3g. Add `detectSelection` to the returned object and the `DownloadController` interface:

```ts
export interface DownloadController {
  getStatus: () => ModelStatus;
  subscribe: (listener: (s: ModelStatus) => void) => () => void;
  detectSelection: () => Promise<void>;
  start: () => Promise<void>;
  cancel: () => void;
  remove: () => Promise<void>;
}
```

```ts
return { getStatus, subscribe, detectSelection, start, cancel, remove };
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/unit/llm/downloadController.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/main/llm/downloadController.ts tests/unit/llm/downloadController.test.ts
git commit -m "feat(model): enrich status (active/target/upgrade) + auto-prune after upgrade"
```

---

### Task 4: IPC channel `model:selection:detect`

**Files:**

- Modify: `src/main/ipc/channels.ts`
- Modify: `src/shared/types/ipc.ts`
- Modify: `src/main/ipc/handlers/model.ts`
- Modify: `src/main/ipc/register.ts`

- [ ] **Step 1: Add the channel constant**

`src/main/ipc/channels.ts`, after `modelRemove: 'model:remove',`:

```ts
  modelDetectSelection: 'model:selection:detect',
```

- [ ] **Step 2: Add the contract entry**

`src/shared/types/ipc.ts`, after the `'model:remove'` line:

```ts
  'model:selection:detect': { payload: Record<string, never>; response: { ok: true } };
```

- [ ] **Step 3: Add the handler**

`src/main/ipc/handlers/model.ts`, after `handleModelRemove`:

```ts
export async function handleModelDetectSelection(): Promise<{ ok: true }> {
  await modelController.detectSelection();
  return { ok: true };
}
```

- [ ] **Step 4: Register it**

`src/main/ipc/register.ts` — add to the imports from `./handlers/model` and register, after the `modelRemove` line:

```ts
register(CHANNELS.modelDetectSelection, () => handleModelDetectSelection());
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (the contract, channel map `satisfies Record<string, IpcChannel>`, and handler all line up).

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc/channels.ts src/shared/types/ipc.ts src/main/ipc/handlers/model.ts src/main/ipc/register.ts
git commit -m "feat(model): add model:selection:detect lazy IPC channel"
```

---

### Task 5: `ModelSettingsSection` — drive copy from status + upgrade banner

**Files:**

- Modify: `src/renderer/components/model/ModelSettingsSection.tsx`
- Test: `tests/unit/renderer/ModelSettingsSection.test.tsx` (create)

**Context:** `formatModelSize(bytes)` (from `@renderer/lib/modelFormat`) renders FR sizes ("4,4 Go"). `Button` from `@renderer/components/ui/button`. Design tokens: `bg-ink-3`, `border-line-2`, `text-paper-mute`, `bg-sage` (present dot), `bg-brass` / `brass-soft` / `text-brass` for the upgrade accent. Lucide icons only (e.g. `Sparkles` or `ArrowUpCircle` for upgrade) — never emoji.

- [ ] **Step 1: Write failing tests**

`tests/unit/renderer/ModelSettingsSection.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ModelSettingsSection } from '../../../src/renderer/components/model/ModelSettingsSection';

afterEach(() => {
  cleanup();
});

const QWEN = { id: 'qwen2.5-7b', label: 'Qwen2.5 7B', sizeBytes: 4683074240 };
const LLAMA = { id: 'llama-3.2-3b', label: 'Llama 3.2 3B', sizeBytes: 2019377696 };

describe('ModelSettingsSection', () => {
  it('ready: shows the active model label + real size', () => {
    render(
      <ModelSettingsSection
        status={{ state: 'ready', active: QWEN }}
        onDownload={() => {}}
        onRemove={() => {}}
      />,
    );
    expect(screen.getByText(/Qwen2\.5 7B/)).toBeTruthy();
    expect(screen.getByText(/4,4/)).toBeTruthy();
  });

  it('ready + upgrade: renders a non-blocking upgrade banner that triggers onDownload', () => {
    const onDownload = vi.fn();
    render(
      <ModelSettingsSection
        status={{ state: 'ready', active: LLAMA, upgrade: QWEN }}
        onDownload={onDownload}
        onRemove={() => {}}
      />,
    );
    expect(screen.getByText(/meilleur modèle/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Qwen2\.5 7B|Télécharger|Installer/i }));
    expect(onDownload).toHaveBeenCalledOnce();
  });

  it('absent: download button copy comes from target', () => {
    render(
      <ModelSettingsSection
        status={{ state: 'absent', target: QWEN }}
        onDownload={() => {}}
        onRemove={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /Qwen2\.5 7B|4,4/ })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/renderer/ModelSettingsSection.test.tsx`
Expected: FAIL (component still hardcodes "1,9 Go"; no upgrade banner).

- [ ] **Step 3: Implement**

Rewrite `ModelSettingsSection.tsx`. Key changes: import `formatModelSize`; `ready` branch reads `status.active`; add an upgrade banner when `status.upgrade` is set; `absent`/`paused` button copy from `status.target`. Guard optional fields (no `!`). Skeleton:

```tsx
import { ArrowDownToLine, Play, RotateCw, Sparkles } from 'lucide-react';
import type { ModelStatus } from '@shared/types/model';
import { formatModelSize, modelPercent } from '@renderer/lib/modelFormat';
import { Button } from '@renderer/components/ui/button';

export function ModelSettingsSection({
  status,
  onDownload,
  onRemove,
}: {
  status: ModelStatus;
  onDownload: () => void;
  onRemove: () => void;
}) {
  if (status.state === 'ready') {
    const label = status.active?.label ?? 'Modèle';
    const size = status.active ? `~${formatModelSize(status.active.sizeBytes)}` : '';
    return (
      <div className="flex flex-col items-end gap-2.5">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-sm border border-line-2 bg-ink-3 px-2 py-0.5 font-mono text-[10px] text-paper-mute">
            <span className="h-1.5 w-1.5 rounded-full bg-sage" />
            Présent · {label}
            {size ? <> · {size}</> : null}
          </span>
          <Button variant="destructive" size="sm" onClick={onRemove}>
            Supprimer le modèle
          </Button>
        </div>
        {status.upgrade ? (
          <div className="flex items-center gap-2.5 rounded-sm border border-line-2 bg-brass-soft px-2.5 py-1.5">
            <Sparkles size={13} strokeWidth={1.7} className="shrink-0 text-brass" />
            <span className="font-sans text-[11px] leading-snug text-paper-soft">
              Un meilleur modèle est disponible pour ta machine — {status.upgrade.label} (~
              {formatModelSize(status.upgrade.sizeBytes)})
            </span>
            <Button variant="secondary" size="sm" onClick={onDownload}>
              <ArrowDownToLine size={13} strokeWidth={1.7} />
              Télécharger
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  if (status.state === 'absent') {
    const target = status.target;
    const label = target ? `${target.label} (~${formatModelSize(target.sizeBytes)})` : 'le modèle';
    return (
      <Button variant="secondary" size="sm" onClick={onDownload}>
        <ArrowDownToLine size={13} strokeWidth={1.7} />
        Télécharger {label}
      </Button>
    );
  }

  if (status.state === 'paused') {
    return (
      <div className="flex items-center gap-2.5">
        <span className="font-sans text-[12px] text-paper-mute">En pause</span>
        <Button variant="secondary" size="sm" onClick={onDownload}>
          <Play size={13} strokeWidth={1.7} />
          Reprendre
        </Button>
      </div>
    );
  }

  if (status.state === 'error') {
    return (
      <div className="flex items-center gap-2.5">
        <span className="font-sans text-[12px] text-coral">Échec</span>
        <Button variant="secondary" size="sm" onClick={onDownload}>
          <RotateCw size={13} strokeWidth={1.7} />
          Réessayer
        </Button>
      </div>
    );
  }

  // downloading
  const percent = modelPercent(status);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-sans text-[12px] text-paper-mute">Téléchargement… {percent} %</span>
      <div className="h-0.5 w-40 rounded-full bg-ink-4">
        <div
          className="h-full rounded-full bg-brass transition-[width] duration-300 ease-out"
          style={{ width: `${String(percent)}%` }}
        />
      </div>
    </div>
  );
}
```

(Verify `bg-brass-soft` exists in the token set — `PdfModelRequiredDialog` uses it, so it does.)

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/unit/renderer/ModelSettingsSection.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/renderer/components/model/ModelSettingsSection.tsx tests/unit/renderer/ModelSettingsSection.test.tsx
git commit -m "feat(model): show active model + opt-in upgrade banner in settings"
```

---

### Task 6: Wire SettingsPage (trigger detect + dynamic model name) and PDF dialog size

**Files:**

- Modify: `src/renderer/pages/SettingsPage.tsx`
- Modify: `src/renderer/components/model/PdfModelRequiredDialog.tsx`
- Modify: `src/renderer/components/ImportModal.tsx`

**Context:** `SettingsPage` `ModelSection` already calls `useModelStatus()`. The hardcoded model-name line is at `SettingsPage.tsx:40-42` ("Llama 3.2 3B Instruct · Q4_K_M"). `ImportModal` renders `<PdfModelRequiredDialog>` around line 154 and has `modelStatus` from `useModelStatus()`.

- [ ] **Step 1: SettingsPage — trigger detect on mount + dynamic model name**

In `ModelSection`, add a `useEffect` that fires the lazy detect once, and replace the hardcoded model-name span with `status.active?.label ?? status.target?.label ?? '—'`:

```tsx
import { useEffect } from 'react';
// ...
function ModelSection() {
  const status = useModelStatus();
  useEffect(() => {
    void ipc.invoke('model:selection:detect', {});
  }, []);
  const modelName = status.active?.label ?? status.target?.label ?? '—';
  return (
    <Section icon={Cpu} overline="— Local" title="Modèle LLM">
      {/* ...unchanged intro paragraph... */}
      <Row label="Modèle">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[12px] text-paper-soft">{modelName}</span>
          <ModelSettingsSection
            status={status}
            onDownload={() => void ipc.invoke('model:download:start', {})}
            onRemove={() => void ipc.invoke('model:remove', {})}
          />
        </div>
      </Row>
      {/* ...unchanged remaining rows... */}
    </Section>
  );
}
```

(Add `useEffect` to the existing `react` import. Keep everything else in `ModelSection` as-is.)

- [ ] **Step 2: PdfModelRequiredDialog — take a `sizeLabel` prop**

Replace the hardcoded "~1,9 Go" with a prop:

```tsx
interface PdfModelRequiredDialogProps {
  open: boolean;
  sizeLabel: string; // e.g. "~4,4 Go" — from the parent's modelStatus.target
  onInstall: () => void;
  onClose: () => void;
}

export function PdfModelRequiredDialog({
  open,
  sizeLabel,
  onInstall,
  onClose,
}: PdfModelRequiredDialogProps) {
  // ...
  // in the DialogDescription, replace "(~1,9 Go, hors-ligne)" with:
  //   ({sizeLabel}, hors-ligne)
}
```

- [ ] **Step 3: ImportModal — trigger detect + pass the size label**

Where `ImportModal` renders `<PdfModelRequiredDialog ... />`, add the `sizeLabel` prop derived from `modelStatus.target`, and trigger detect when the PDF-required state becomes active. Use the existing `modelStatus` and `ipc`:

```tsx
import { formatModelSize } from '@renderer/lib/modelFormat';
// ...
// near the other effects:
useEffect(() => {
  if (/* the PDF-required dialog is open */) {
    void ipc.invoke('model:selection:detect', {});
  }
}, [/* the open flag */]);
// ...
<PdfModelRequiredDialog
  open={/* unchanged */}
  sizeLabel={
    modelStatus.target ? `~${formatModelSize(modelStatus.target.sizeBytes)}` : '~1,9 Go'
  }
  onInstall={/* unchanged */}
  onClose={/* unchanged */}
/>
```

(Inspect `ImportModal` for the exact open-flag expression already used at line ~155; reuse it for both the effect dependency and the `open` prop. The `'~1,9 Go'` literal is a pre-detection fallback only.)

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/renderer/pages/SettingsPage.tsx src/renderer/components/model/PdfModelRequiredDialog.tsx src/renderer/components/ImportModal.tsx`
Expected: PASS (no `any`, no `!`).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/SettingsPage.tsx src/renderer/components/model/PdfModelRequiredDialog.tsx src/renderer/components/ImportModal.tsx
git commit -m "feat(model): trigger lazy detect + dynamic model name/size in settings & PDF dialog"
```

---

### Task 7: Full gate

**Files:** none (verification).

- [ ] **Step 1: Lint, typecheck, unit tests, build**

```bash
npx eslint . && npx tsc --noEmit && npx vitest run && npm run build
```

Expected: all green. (E2E `model-download` unaffected — Phase A's FD_MODEL_URL short-circuit still bypasses detection; the new channel is renderer-triggered and not in that flow.)

- [ ] **Step 2: Commit any lint-staged reformatting if husky adjusted files** (re-add + amend or new commit as needed).

---

## Notes for the executor

- **Do NOT self-merge.** This is a UI/visual change — open the PR, run the gate green, then hand off to the maintainer for in-app validation (the upgrade banner + active-model display must be eyeballed). See memory `feedback-validate-ui-before-merge`.
- **Minor known jank (acceptable):** on a 7B-capable machine with no model present, the download button briefly shows the 3B fallback copy until `detectSelection()` resolves (~1 s after Settings mount), then flips to the 7B copy. Non-blocking; do not add launch-time detection to fix it (violates the launch invariant).
- Branch name: `feat/model-active-transparency` (or similar). Per CLAUDE.md MVP mode: branch + PR, no issue linkage.
