import { it, expect, describe, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MODELS } from '../../../src/main/llm/modelRegistry';
const MODEL_FILE = MODELS.find((m) => m.id === 'llama-3.2-3b')?.fileName ?? '';

const QWEN = MODELS.find((m) => m.id === 'qwen2.5-7b');
const LLAMA = MODELS.find((m) => m.id === 'llama-3.2-3b');
if (QWEN === undefined || LLAMA === undefined) throw new Error('registry changed');

vi.mock('../../../src/main/llm/download', () => ({ downloadModel: vi.fn() }));
// Stub getActiveSelection so tests never hit real hardware detection.
// findBestPresentModel still reads the real filesystem (the temp dir).
vi.mock('../../../src/main/llm/llm', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../src/main/llm/llm')>();
  return {
    ...real,
    getActiveSelection: vi.fn().mockResolvedValue(MODELS.find((m) => m.id === 'llama-3.2-3b')),
  };
});
import { downloadModel } from '../../../src/main/llm/download';
import { getActiveSelection } from '../../../src/main/llm/llm';
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
  let capturedSignal: AbortSignal | undefined;
  let resolveDownload!: (r: { ok: false; error: 'cancelled' }) => void;
  vi.mocked(downloadModel).mockImplementation(
    (_dir, _onProgress, signal) =>
      new Promise((resolve) => {
        capturedSignal = signal;
        resolveDownload = resolve;
      }),
  );
  const ctl = createDownloadController(() => dir);
  const p = ctl.start();
  // Flush microtasks so getActiveSelection resolves and downloadModel is entered.
  await Promise.resolve();
  await Promise.resolve();
  // Now downloadModel is running — cancel and let the mock react.
  ctl.cancel();
  writeFileSync(join(dir, `${MODEL_FILE}.part`), 'partial');
  resolveDownload({ ok: false, error: 'cancelled' });
  // Satisfy the unused variable lint check.
  void capturedSignal;
  await p;
  expect(ctl.getStatus().state).toBe('paused');
});

it('start is idempotent while a download is in flight', async () => {
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
  // Start twice — the second call must be a no-op.
  const p1 = ctl.start();
  const p2 = ctl.start();
  // Flush microtasks so getActiveSelection resolves and downloadModel is called.
  await Promise.resolve();
  await Promise.resolve();
  expect(vi.mocked(downloadModel)).toHaveBeenCalledTimes(1);
  release();
  await Promise.all([p1, p2]);
});

describe('downloadController status enrichment', () => {
  function present(spec: { fileName: string }): void {
    writeFileSync(join(dir, spec.fileName), 'x');
  }

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
    vi.mocked(getActiveSelection).mockResolvedValue(QWEN);
    const c = createDownloadController(() => dir);
    await c.detectSelection();
    const s = c.getStatus();
    expect(s.upgrade).toEqual({ id: QWEN.id, label: QWEN.label, sizeBytes: QWEN.sizeBytes });
    expect(s.target).toEqual({ id: QWEN.id, label: QWEN.label, sizeBytes: QWEN.sizeBytes });
  });

  it('no upgrade when the selected model is already present', async () => {
    present(QWEN);
    vi.mocked(getActiveSelection).mockResolvedValue(QWEN);
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

  it('pruneToBestPresent keeps highest-tier model and deletes lower one', async () => {
    // Pre-create the lower-tier LLAMA file on disk.
    present(LLAMA);
    // Hardware selection resolves to QWEN (7B — higher tier).
    vi.mocked(getActiveSelection).mockResolvedValue(QWEN);
    // downloadModel "succeeds" by writing the QWEN file and returning { ok: true }.
    vi.mocked(downloadModel).mockImplementation(() => {
      present(QWEN);
      return Promise.resolve({ ok: true as const });
    });
    const c = createDownloadController(() => dir);
    await c.start();
    // QWEN must be kept; LLAMA must have been pruned.
    expect(existsSync(join(dir, QWEN.fileName))).toBe(true);
    expect(existsSync(join(dir, LLAMA.fileName))).toBe(false);
  });
});
