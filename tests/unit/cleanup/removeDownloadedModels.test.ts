import { describe, it, expect } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { removeDownloadedModels } from '../../../src/main/cleanup/removeDownloadedModels';

describe('removeDownloadedModels', () => {
  it('removes the models directory under userData, files included', () => {
    const userData = mkdtempSync(join(tmpdir(), 'fd-userdata-'));
    const modelsDir = join(userData, 'models');
    mkdirSync(modelsDir);
    writeFileSync(join(modelsDir, 'some-model.gguf'), 'weights');

    removeDownloadedModels(userData);

    expect(existsSync(modelsDir)).toBe(false);
    expect(existsSync(userData)).toBe(true);
  });

  it('is a no-op when there is no models directory', () => {
    const userData = mkdtempSync(join(tmpdir(), 'fd-userdata-'));
    expect(() => {
      removeDownloadedModels(userData);
    }).not.toThrow();
    expect(existsSync(userData)).toBe(true);
  });
});
