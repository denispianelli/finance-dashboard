import { describe, it, expect } from 'vitest';
import { MODEL_MANIFEST } from '../../../src/main/llm/modelManifest';
import { MODEL_FILE } from '../../../src/main/llm/llm';

describe('MODEL_MANIFEST', () => {
  it('points at the ADR-004 GGUF with a pinned https url', () => {
    expect(MODEL_MANIFEST.url).toMatch(/^https:\/\//);
    expect(MODEL_MANIFEST.url.toLowerCase()).toContain('q4_k_m');
  });
  it('has the real size and a 64-hex sha-256', () => {
    expect(MODEL_MANIFEST.sizeBytes).toBe(2019377696);
    expect(MODEL_MANIFEST.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it('the manifest filename matches MODEL_FILE', () => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    expect(MODEL_MANIFEST.url.endsWith(MODEL_FILE) || MODEL_MANIFEST.fileName === MODEL_FILE).toBe(
      true,
    );
  });
});
