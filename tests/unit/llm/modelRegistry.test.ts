import { describe, it, expect } from 'vitest';
import {
  MODELS,
  selectModelSpec,
  withDownloadOverrides,
  specToInfo,
  isHigherTier,
} from '../../../src/main/llm/modelRegistry';

const GB = 1024 ** 3;

describe('MODELS registry', () => {
  it('lists distinct ids/filenames with 64-hex sha256 and a 7B tier above a 3B fallback', () => {
    expect(MODELS.length).toBeGreaterThanOrEqual(2);
    expect(new Set(MODELS.map((m) => m.id)).size).toBe(MODELS.length);
    expect(new Set(MODELS.map((m) => m.fileName)).size).toBe(MODELS.length);
    for (const m of MODELS) {
      expect(m.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(m.url).toMatch(/^https:\/\//);
      expect(m.sizeBytes).toBeGreaterThan(0);
    }
    expect(MODELS[MODELS.length - 1]?.minVramBytes).toBe(0);
  });
});

describe('selectModelSpec', () => {
  it('returns the fallback (3B) on CPU / no GPU', () => {
    expect(selectModelSpec(false, 64 * GB).id).toBe('llama-3.2-3b');
  });
  it('returns the 3B below the VRAM threshold', () => {
    expect(selectModelSpec('cuda', 4 * GB).id).toBe('llama-3.2-3b');
  });
  it('returns Qwen-7B at/above 6 GB total VRAM', () => {
    expect(selectModelSpec('cuda', 6 * GB).id).toBe('qwen2.5-7b');
    expect(selectModelSpec('cuda', 8 * GB).id).toBe('qwen2.5-7b');
  });
});

describe('withDownloadOverrides', () => {
  it('is a no-op without FD_MODEL_URL', () => {
    const spec = MODELS[0];
    if (spec === undefined) throw new Error('MODELS is empty');
    expect(withDownloadOverrides(spec)).toEqual(spec);
  });
});

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
