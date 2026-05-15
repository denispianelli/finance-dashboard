import type { DatabaseSync } from 'node:sqlite';

export function isAlreadyImported(db: DatabaseSync, hash: string): boolean {
  const row = db.prepare('SELECT 1 FROM imports WHERE file_hash = ?').get(hash);
  return row !== undefined;
}
