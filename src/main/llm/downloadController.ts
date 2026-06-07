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
      (p: DownloadProgress) => {
        set({ state: 'downloading', receivedBytes: p.receivedBytes, totalBytes: p.totalBytes });
      },
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
