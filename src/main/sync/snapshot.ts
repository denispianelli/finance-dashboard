import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { buildSnapshotFile, parseSnapshotFile, type SnapshotHeader } from './header';
import { decrypt, deriveKey, encrypt, generateNonce, generateSalt } from './crypto';

export const SNAPSHOT_FILENAME = 'finance.fbk';

export type HeaderReadResult =
  | { kind: 'ok'; header: SnapshotHeader }
  | { kind: 'missing' }
  | { kind: 'invalid' }
  | { kind: 'unavailable' };

export interface WriteSnapshotOptions {
  folderPath: string;
  passphrase: string;
  machineName: string;
}

/**
 * VACUUM INTO a temp copy (clean, WAL-independent), encrypt it, then write
 * atomically into the sync folder (tmp file + rename, same filesystem).
 * Throws on fs errors — callers map that to a user-facing result.
 */
export async function writeSnapshot(
  db: DatabaseSync,
  opts: WriteSnapshotOptions,
): Promise<SnapshotHeader> {
  const vacuumPath = join(tmpdir(), `fd-vacuum-${randomUUID()}.sqlite`);
  try {
    // VACUUM INTO refuses to overwrite; the random name guarantees absence.
    db.exec(`VACUUM INTO '${vacuumPath.replaceAll("'", "''")}'`);
    const plain = readFileSync(vacuumPath);

    const salt = await generateSalt();
    const nonce = await generateNonce();
    const key = await deriveKey(opts.passphrase, salt);
    const ciphertext = await encrypt(plain, key, nonce);

    const schemaRow = db
      .prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations')
      .get() as { v: number };

    const header: SnapshotHeader = {
      formatVersion: 1,
      schemaVersion: schemaRow.v,
      createdAt: new Date().toISOString(),
      machineName: opts.machineName,
      snapshotId: randomUUID(),
      salt: Buffer.from(salt).toString('base64'),
      nonce: Buffer.from(nonce).toString('base64'),
    };

    const file = buildSnapshotFile(header, ciphertext);
    const tmpOut = join(opts.folderPath, `${SNAPSHOT_FILENAME}.tmp`);
    writeFileSync(tmpOut, file);
    renameSync(tmpOut, join(opts.folderPath, SNAPSHOT_FILENAME));
    return header;
  } finally {
    rmSync(vacuumPath, { force: true });
  }
}

export function readSnapshotHeader(folderPath: string): HeaderReadResult {
  try {
    if (!statSync(folderPath).isDirectory()) return { kind: 'unavailable' };
  } catch {
    return { kind: 'unavailable' };
  }
  const filePath = join(folderPath, SNAPSHOT_FILENAME);
  if (!existsSync(filePath)) return { kind: 'missing' };
  let buf: Buffer;
  try {
    buf = readFileSync(filePath);
  } catch {
    return { kind: 'unavailable' };
  }
  const parsed = parseSnapshotFile(buf);
  if (parsed === null) return { kind: 'invalid' };
  return { kind: 'ok', header: parsed.header };
}

/**
 * Decrypts the folder snapshot to destPath. Never leaves a partial file on
 * failure. 'mac_failed' covers both wrong passphrase and corrupt/truncated
 * data (indistinguishable by design).
 */
export async function decryptSnapshotToFile(
  folderPath: string,
  passphrase: string,
  destPath: string,
): Promise<'ok' | 'mac_failed' | 'invalid'> {
  const filePath = join(folderPath, SNAPSHOT_FILENAME);
  let parsed: ReturnType<typeof parseSnapshotFile>;
  try {
    parsed = parseSnapshotFile(readFileSync(filePath));
  } catch {
    return 'invalid';
  }
  if (parsed === null) return 'invalid';
  const salt = Buffer.from(parsed.header.salt, 'base64');
  const nonce = Buffer.from(parsed.header.nonce, 'base64');
  const key = await deriveKey(passphrase, salt);
  const plain = await decrypt(parsed.ciphertext, key, nonce);
  if (plain === null) return 'mac_failed';
  writeFileSync(destPath, plain);
  return 'ok';
}
