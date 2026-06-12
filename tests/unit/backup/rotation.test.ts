import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listBackups, hasBackupForDay, pruneBackups } from '../../../src/main/backup/rotation';

let folder: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'fd-rotation-'));
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

function touch(name: string, content = 'x'): void {
  writeFileSync(join(folder, name), content);
}

describe('listBackups', () => {
  it('lists only pattern-matching files, newest first, with parsed createdAt and size', () => {
    touch('finance-2026-06-11_0900.sqlite', 'aa');
    touch('finance-2026-06-12_0830.sqlite', 'bbbb');
    touch('notes.txt');
    touch('finance.sqlite'); // live-DB-style name must not match
    const list = listBackups(folder);
    expect(list.map((b) => b.fileName)).toEqual([
      'finance-2026-06-12_0830.sqlite',
      'finance-2026-06-11_0900.sqlite',
    ]);
    expect(list[0]?.createdAt).toBe('2026-06-12T08:30:00');
    expect(list[0]?.sizeBytes).toBe(4);
  });

  it('returns [] for a missing folder', () => {
    expect(listBackups(join(folder, 'nope'))).toEqual([]);
  });
});

describe('hasBackupForDay', () => {
  it('is true only when a snapshot dated that local day exists', () => {
    touch('finance-2026-06-12_0830.sqlite');
    expect(hasBackupForDay(folder, new Date(2026, 5, 12, 23, 59))).toBe(true);
    expect(hasBackupForDay(folder, new Date(2026, 5, 13, 0, 1))).toBe(false);
  });
});

describe('pruneBackups', () => {
  it('keeps the 15 newest matching files and never touches other files', () => {
    for (let i = 1; i <= 18; i++) {
      touch(`finance-2026-05-${String(i).padStart(2, '0')}_1200.sqlite`);
    }
    touch('unrelated.sqlite');
    const deleted = pruneBackups(folder);
    expect(deleted.sort()).toEqual([
      'finance-2026-05-01_1200.sqlite',
      'finance-2026-05-02_1200.sqlite',
      'finance-2026-05-03_1200.sqlite',
    ]);
    expect(existsSync(join(folder, 'unrelated.sqlite'))).toBe(true);
    expect(listBackups(folder)).toHaveLength(15);
  });
});
