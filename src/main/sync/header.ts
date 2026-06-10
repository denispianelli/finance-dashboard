const MAGIC = Buffer.from('FBK1', 'ascii');
const LEN_OFFSET = MAGIC.length; // 4
const JSON_OFFSET = LEN_OFFSET + 4; // 8

export interface SnapshotHeader {
  formatVersion: 1;
  schemaVersion: number;
  /** ISO 8601 — display only; ordering decisions never compare clocks. */
  createdAt: string;
  machineName: string;
  /** UUID; identity for "have I already seen this snapshot". */
  snapshotId: string;
  /** base64 */
  salt: string;
  /** base64 */
  nonce: string;
}

export function buildSnapshotFile(header: SnapshotHeader, ciphertext: Uint8Array): Buffer {
  const json = Buffer.from(JSON.stringify(header), 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(json.length, 0);
  return Buffer.concat([MAGIC, len, json, Buffer.from(ciphertext)]);
}

export function parseSnapshotFile(
  buf: Buffer,
): { header: SnapshotHeader; ciphertext: Buffer } | null {
  if (buf.length < JSON_OFFSET || !buf.subarray(0, LEN_OFFSET).equals(MAGIC)) return null;
  const jsonLen = buf.readUInt32LE(LEN_OFFSET);
  if (buf.length < JSON_OFFSET + jsonLen) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(buf.subarray(JSON_OFFSET, JSON_OFFSET + jsonLen).toString('utf8'));
  } catch {
    return null;
  }
  if (!isSnapshotHeader(parsed)) return null;
  return { header: parsed, ciphertext: buf.subarray(JSON_OFFSET + jsonLen) };
}

function isSnapshotHeader(v: unknown): v is SnapshotHeader {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    o.formatVersion === 1 &&
    typeof o.schemaVersion === 'number' &&
    typeof o.createdAt === 'string' &&
    typeof o.machineName === 'string' &&
    typeof o.snapshotId === 'string' &&
    typeof o.salt === 'string' &&
    typeof o.nonce === 'string'
  );
}
