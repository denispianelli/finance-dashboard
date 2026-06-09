import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readImportFile } from '../../../src/main/import/readImportFile';
import { ImportError } from '../../../src/main/import/importError';

const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'readimportfile-'));
  dirs.push(d);
  return d;
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('readImportFile', () => {
  it('reads a file with an allowed statement extension', () => {
    const dir = tmp();
    const path = join(dir, 'statement.pdf');
    writeFileSync(path, '%PDF-1.7 hello');
    expect(readImportFile(path).toString()).toBe('%PDF-1.7 hello');
  });

  it('accepts .ofx and .csv regardless of case', () => {
    const dir = tmp();
    for (const name of ['a.OFX', 'b.Csv', 'c.pDf']) {
      const path = join(dir, name);
      writeFileSync(path, 'x');
      expect(readImportFile(path).toString()).toBe('x');
    }
  });

  it('rejects a path whose extension is not a statement format', () => {
    const dir = tmp();
    const path = join(dir, 'secrets.txt');
    writeFileSync(path, 'id_rsa private key');
    // A compromised renderer cannot turn an import channel into an arbitrary
    // file read: anything outside the statement extensions is refused before
    // the bytes are touched.
    expect(() => readImportFile(path)).toThrow(ImportError);
    expect(() => readImportFile(path)).toThrow('unsupported_format');
  });

  it('rejects an extensionless path (e.g. /etc/passwd)', () => {
    const dir = tmp();
    const path = join(dir, 'passwd');
    writeFileSync(path, 'root:x:0:0');
    expect(() => readImportFile(path)).toThrow(ImportError);
  });

  it('rejects a directory that happens to end in an allowed extension', () => {
    const dir = tmp();
    const sneaky = join(dir, 'evil.pdf');
    mkdirSync(sneaky);
    expect(() => readImportFile(sneaky)).toThrow(ImportError);
  });

  it('throws on a missing file (does not silently return empty)', () => {
    const dir = tmp();
    expect(() => readImportFile(join(dir, 'absent.pdf'))).toThrow();
  });
});
