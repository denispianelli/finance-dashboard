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
