import { describe, it, expect } from 'vitest';
import { ImportError } from '../../../src/main/import/importError';

describe('ImportError new codes', () => {
  it('carries unsupported_format', () => {
    const e = new ImportError('unsupported_format');
    expect(e.code).toBe('unsupported_format');
    expect(e.name).toBe('ImportError');
  });

  it('carries malformed_ofx', () => {
    const e = new ImportError('malformed_ofx');
    expect(e.code).toBe('malformed_ofx');
  });
});
