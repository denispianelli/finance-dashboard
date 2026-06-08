import { it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MODELS } from '../../../src/main/llm/modelRegistry';
import { findBestPresentModel, isModelAvailable } from '../../../src/main/llm/llm';

const qwenFile = MODELS.find((m) => m.id === 'qwen2.5-7b')?.fileName ?? '';
const llamaFile = MODELS.find((m) => m.id === 'llama-3.2-3b')?.fileName ?? '';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bpm-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

it('returns null and isModelAvailable=false when nothing is present', () => {
  expect(findBestPresentModel(dir)).toBeNull();
  expect(isModelAvailable(dir)).toBe(false);
});

it('returns the 3B when only the 3B is present', () => {
  writeFileSync(join(dir, llamaFile), 'x');
  expect(findBestPresentModel(dir)?.id).toBe('llama-3.2-3b');
  expect(isModelAvailable(dir)).toBe(true);
});

it('prefers the higher-tier model when both are present', () => {
  writeFileSync(join(dir, llamaFile), 'x');
  writeFileSync(join(dir, qwenFile), 'x');
  expect(findBestPresentModel(dir)?.id).toBe('qwen2.5-7b');
});
