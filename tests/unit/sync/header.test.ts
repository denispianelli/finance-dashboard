import { describe, it, expect } from 'vitest';
import {
  buildSnapshotFile,
  parseSnapshotFile,
  type SnapshotHeader,
} from '../../../src/main/sync/header';

const header: SnapshotHeader = {
  formatVersion: 1,
  schemaVersion: 16,
  createdAt: '2026-06-10T14:32:00.000Z',
  machineName: 'denis-pc',
  snapshotId: '7f4f3f9a-0000-4000-8000-000000000001',
  salt: Buffer.from('salt'.repeat(4)).toString('base64'),
  nonce: Buffer.from('nonce-bytes-here-1234567').toString('base64'),
};

describe('snapshot file format', () => {
  it('round-trips header + ciphertext', () => {
    const cipher = Buffer.from([1, 2, 3, 4, 5]);
    const file = buildSnapshotFile(header, cipher);
    const parsed = parseSnapshotFile(file);
    expect(parsed).not.toBeNull();
    expect(parsed?.header).toEqual(header);
    expect(Buffer.from(parsed?.ciphertext ?? []).equals(cipher)).toBe(true);
  });

  it('rejects a bad magic', () => {
    const file = buildSnapshotFile(header, Buffer.from([1]));
    file[0] = 0x00;
    expect(parseSnapshotFile(file)).toBeNull();
  });

  it('rejects a file truncated inside the header', () => {
    const file = buildSnapshotFile(header, Buffer.from([1, 2, 3]));
    expect(parseSnapshotFile(file.subarray(0, 20))).toBeNull();
  });

  it('rejects a header that is not valid JSON', () => {
    const good = buildSnapshotFile(header, Buffer.alloc(0));
    good.write('{{{{', 8); // corrupt the JSON region
    expect(parseSnapshotFile(good)).toBeNull();
  });

  it('rejects a header missing required fields', () => {
    const json = Buffer.from(JSON.stringify({ formatVersion: 1 }), 'utf8');
    const len = Buffer.alloc(4);
    len.writeUInt32LE(json.length, 0);
    const file = Buffer.concat([Buffer.from('FBK1'), len, json]);
    expect(parseSnapshotFile(file)).toBeNull();
  });

  it('rejects an empty buffer', () => {
    expect(parseSnapshotFile(Buffer.alloc(0))).toBeNull();
  });
});
