import { createHash } from 'node:crypto';
import { createWriteStream, createReadStream } from 'node:fs';
import { stat, rename, rm, statfs, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fallbackModel } from './modelRegistry';

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
  manifest: fallbackModel(),
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
      .on('data', (c) => hash.update(c as Buffer))
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

  // Fresh install: userData/models doesn't exist yet. Create it before the disk
  // check (statfs) and the write stream, both of which ENOENT on a missing dir.
  await mkdir(modelsDir, { recursive: true });

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
    if (already > 0 && res.status !== 206) return { ok: false, error: 'network' };

    const body = res.body;
    await new Promise<void>((resolve, reject) => {
      const out = createWriteStream(partPath, { flags: already > 0 ? 'a' : 'w' });
      const reader = body.getReader();
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
            out.write(value, (err) => {
              if (err) {
                out.destroy();
                reject(err);
              } else {
                pump();
              }
            });
          })
          .catch((e: unknown) => {
            out.destroy();
            reject(e instanceof Error ? e : new Error(String(e), { cause: e }));
          });
      };
      pump();
    });
  } catch (err) {
    const isAbort =
      err instanceof Error && (err.name === 'AbortError' || err.name === 'DOMException');
    if (isAbort) {
      return { ok: false, error: 'cancelled' };
    }
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
