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
  type ModelSpec,
} from './modelRegistry';
import { getActiveSelection, findBestPresentModel } from './llm';
import { downloadModel, type DownloadProgress } from './download';

export interface DownloadController {
  getStatus: () => ModelStatus;
  subscribe: (listener: (s: ModelStatus) => void) => () => void;
  detectSelection: () => Promise<void>;
  start: () => Promise<void>;
  cancel: () => void;
  remove: () => Promise<void>;
}

export function createDownloadController(modelsDir: () => string): DownloadController {
  const listeners = new Set<(s: ModelStatus) => void>();
  let active: AbortController | null = null;
  let runPromise: Promise<void> | null = null;
  let override: ModelStatus | null = null;
  let selected: ModelSpec | null = null;

  function baseState(dir: string): ModelStatus {
    if (findBestPresentModel(dir) !== null) return { state: 'ready' };
    if (MODELS.some((m) => existsSync(join(dir, `${m.fileName}.part`)))) return { state: 'paused' };
    return { state: 'absent' };
  }

  function info(dir: string): Pick<ModelStatus, 'active' | 'target' | 'upgrade'> {
    const present = findBestPresentModel(dir);
    const targetSpec = selected ?? fallbackModel();
    const activeInfo: ModelInfo | undefined = present === null ? undefined : specToInfo(present);
    const target: ModelInfo = specToInfo(targetSpec);
    const upgrade: ModelInfo | undefined =
      present !== null &&
      selected !== null &&
      !existsSync(join(dir, selected.fileName)) &&
      isHigherTier(selected, present)
        ? specToInfo(selected)
        : undefined;
    return { active: activeInfo, target, upgrade };
  }

  function getStatus(): ModelStatus {
    const dir = modelsDir();
    const enrich = info(dir);
    const core = override ?? baseState(dir);
    return { ...core, ...enrich };
  }

  function emit(): void {
    const s = getStatus();
    for (const l of listeners) l(s);
  }

  function set(s: ModelStatus | null): void {
    override = s;
    emit();
  }

  /** Lazy hardware detection (loads the native backend) — call only from user-driven
   *  paths (Settings mount, PDF dialog), never at launch. Re-emits the enriched status. */
  async function detectSelection(): Promise<void> {
    selected = await getActiveSelection();
    emit();
  }

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

  async function start(): Promise<void> {
    if (active) return;
    const ac = new AbortController();
    active = ac;
    set({ state: 'downloading', receivedBytes: 0, totalBytes: undefined });
    runPromise = (async () => {
      try {
        const spec = withDownloadOverrides(await getActiveSelection());
        const res = await downloadModel(
          modelsDir(),
          (p: DownloadProgress) => {
            set({ state: 'downloading', receivedBytes: p.receivedBytes, totalBytes: p.totalBytes });
          },
          ac.signal,
          { manifest: spec },
        );
        if (res.ok) {
          await pruneToBestPresent();
          set(null);
        } else if (res.error === 'cancelled') set(null);
        else set({ state: 'error', error: res.error });
      } catch (e) {
        set({ state: 'error', error: e instanceof Error ? e.message : 'download_failed' });
      } finally {
        active = null;
      }
    })();
    await runPromise;
  }

  function cancel(): void {
    active?.abort();
  }

  async function remove(): Promise<void> {
    cancel();
    if (runPromise) {
      try {
        await runPromise;
      } catch {
        /* already handled in start */
      }
    }
    const dir = modelsDir();
    for (const m of MODELS) {
      await rm(join(dir, m.fileName), { force: true });
      await rm(join(dir, `${m.fileName}.part`), { force: true });
    }
    set(null); // → 'absent'
  }

  function subscribe(listener: (s: ModelStatus) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { getStatus, subscribe, detectSelection, start, cancel, remove };
}
