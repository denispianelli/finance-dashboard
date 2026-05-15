import { describe, it, expect } from 'vitest';
import { hashFile } from '../../../src/main/import/hashFile';

describe('hashFile', () => {
  it('returns the known SHA-256 of "abc"', () => {
    const buf = Buffer.from('abc', 'utf8');
    expect(hashFile(buf)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('is stable for identical content', () => {
    const a = hashFile(Buffer.from('same bytes'));
    const b = hashFile(Buffer.from('same bytes'));
    expect(a).toBe(b);
  });

  it('differs for different content', () => {
    expect(hashFile(Buffer.from('x'))).not.toBe(hashFile(Buffer.from('y')));
  });
});
