import { it, expect, beforeEach, afterEach, vi } from 'vitest';
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
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

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
  vi.mocked(downloadModel).mockImplementation((_d, onProgress) => {
    onProgress({ receivedBytes: 5, totalBytes: 10 });
    writeFileSync(join(dir, MODEL_FILE), 'x');
    return Promise.resolve({ ok: true as const });
  });
  const ctl = createDownloadController(() => dir);
  const seen: string[] = [];
  ctl.subscribe((s) => {
    seen.push(s.state);
  });
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

it('goes to paused when a download is cancelled mid-flight', async () => {
  vi.mocked(downloadModel).mockImplementation(
    (_dir, _onProgress, signal) =>
      new Promise((resolve) => {
        signal.addEventListener('abort', () => {
          writeFileSync(join(dir, `${MODEL_FILE}.part`), 'partial');
          resolve({ ok: false, error: 'cancelled' });
        });
      }),
  );
  const ctl = createDownloadController(() => dir);
  const p = ctl.start();
  ctl.cancel();
  await p;
  expect(ctl.getStatus().state).toBe('paused');
});

it('start is idempotent while a download is in flight', () => {
  let release: () => void = () => undefined;
  vi.mocked(downloadModel).mockImplementation(
    () =>
      new Promise((r) => {
        release = () => {
          r({ ok: true });
        };
      }),
  );
  const ctl = createDownloadController(() => dir);
  void ctl.start();
  void ctl.start();
  expect(vi.mocked(downloadModel)).toHaveBeenCalledTimes(1);
  release();
});
