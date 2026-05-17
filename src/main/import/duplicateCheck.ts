import type { DatabaseSync } from 'node:sqlite';

export function isAlreadyImported(db: DatabaseSync, hash: string): boolean {
  const row = db.prepare('SELECT 1 FROM imports WHERE file_hash = ?').get(hash);
  return row !== undefined;
}

export function findExistingHashes(db: DatabaseSync, accountId: string): Set<string> {
  const rows = db
    .prepare('SELECT tx_hash FROM transactions WHERE account_id = ?')
    .all(accountId) as unknown as { tx_hash: string }[];
  return new Set(rows.map((r) => r.tx_hash));
}
