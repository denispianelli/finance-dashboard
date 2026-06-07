import { it, expect, beforeEach, afterEach } from 'vitest';
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

function noop(): void {
  // intentional no-op for progress callbacks in tests
}

function fakeFetch(full: Buffer): typeof fetch {
  return ((_url: string, init?: RequestInit) => {
    const range = (init?.headers as Record<string, string> | undefined)?.Range;
    const start = range ? Number(/bytes=(\d+)-/.exec(range)?.[1] ?? 0) : 0;
    const slice = full.subarray(start);
    return Promise.resolve({
      ok: true,
      status: range ? 206 : 200,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(slice));
          controller.close();
        },
      }),
    } as unknown as Response);
  }) as unknown as typeof fetch;
}

function deps(over: Partial<DownloadDeps> = {}): DownloadDeps {
  return {
    fetch: fakeFetch(BODY),
    freeDiskBytes: () => Promise.resolve(10 ** 9),
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
  const res = await downloadModel(dir, noop, new AbortController().signal, deps());
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
  const res = await downloadModel(dir, noop, new AbortController().signal, deps());
  expect(res).toEqual({ ok: true });
  expect(readFileSync(join(dir, MODEL_FILE))).toEqual(BODY);
});

it('fails with checksum_mismatch and deletes the .part', async () => {
  const res = await downloadModel(
    dir,
    noop,
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
    noop,
    new AbortController().signal,
    deps({ freeDiskBytes: () => Promise.resolve(1) }),
  );
  expect(res).toEqual({ ok: false, error: 'insufficient_disk' });
});

it('returns cancelled when aborted before the download starts', async () => {
  const ac = new AbortController();
  ac.abort();
  const res = await downloadModel(dir, noop, ac.signal, deps());
  expect(res).toEqual({ ok: false, error: 'cancelled' });
});

it('returns cancelled mid-stream and keeps the .part', async () => {
  writeFileSync(join(dir, `${MODEL_FILE}.part`), BODY.subarray(0, 5));
  const ac = new AbortController();
  const abortingFetch = ((_url: string, init?: RequestInit) => {
    const signal: AbortSignal | undefined =
      init?.signal instanceof AbortSignal ? init.signal : undefined;
    return Promise.resolve({
      ok: true,
      status: 206,
      body: new ReadableStream({
        pull(controller) {
          if (signal?.aborted) {
            controller.error(new DOMException('aborted', 'AbortError'));
            return;
          }
          controller.enqueue(new Uint8Array(BODY.subarray(5)));
        },
      }),
    } as unknown as Response);
  }) as unknown as typeof fetch;

  const res = await downloadModel(
    dir,
    () => {
      ac.abort();
    }, // abort right after the first chunk's progress
    ac.signal,
    deps({ fetch: abortingFetch }),
  );
  expect(res).toEqual({ ok: false, error: 'cancelled' });
  expect(existsSync(join(dir, `${MODEL_FILE}.part`))).toBe(true);
});
