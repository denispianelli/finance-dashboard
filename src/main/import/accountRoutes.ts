import type { DatabaseSync } from 'node:sqlite';

/** Look up the account a learned identifier routes to, or null if unknown. */
export function findAccountByIdentifier(db: DatabaseSync, identifier: string): string | null {
  const row = db
    .prepare('SELECT account_id FROM account_identifiers WHERE identifier = ?')
    .get(identifier) as unknown as { account_id: string } | undefined;
  return row?.account_id ?? null;
}

/** Record (or re-point) the identifier→account route. Idempotent upsert. */
export function learnAccountRoute(db: DatabaseSync, identifier: string, accountId: string): void {
  db.prepare(
    `INSERT INTO account_identifiers (identifier, account_id) VALUES (?, ?)
     ON CONFLICT(identifier) DO UPDATE SET account_id = excluded.account_id`,
  ).run(identifier, accountId);
}
