import type { DatabaseSync } from 'node:sqlite';

export interface PairRow {
  id: string;
  accountId: string;
  date: string;
  amount: number;
}

const MAX_DAY_GAP = 3;

function cents(amount: number): number {
  return Math.round(amount * 100);
}

function dayGap(a: string, b: string): number {
  return Math.abs(Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000));
}

function byDateThenId(a: PairRow, b: PairRow): number {
  return a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date);
}

/**
 * Pure pairing: the ids of transactions that belong to a detected internal-transfer
 * pair — a `−X` on one account matched with a `+X` on a *different* account, same
 * amount to the cent, dates within ±3 days. Greedy and one-to-one: each transaction
 * is used at most once; for a contended inflow the smallest day-gap (then earliest
 * date, then id) wins.
 */
export function findTransferPairs(rows: PairRow[]): Set<string> {
  const outflows = rows.filter((r) => r.amount < 0).sort(byDateThenId);
  const inflows = rows.filter((r) => r.amount > 0).sort(byDateThenId);
  const usedInflow = new Set<string>();
  const result = new Set<string>();

  for (const out of outflows) {
    let best: PairRow | undefined;
    let bestKey: readonly [number, string, string] | undefined;
    for (const inf of inflows) {
      if (usedInflow.has(inf.id)) continue;
      if (inf.accountId === out.accountId) continue;
      if (cents(inf.amount) !== -cents(out.amount)) continue;
      const gap = dayGap(out.date, inf.date);
      if (gap > MAX_DAY_GAP) continue;
      const key = [gap, inf.date, inf.id] as const;
      if (
        bestKey === undefined ||
        key[0] < bestKey[0] ||
        (key[0] === bestKey[0] && key[1] < bestKey[1]) ||
        (key[0] === bestKey[0] && key[1] === bestKey[1] && key[2] < bestKey[2])
      ) {
        best = inf;
        bestKey = key;
      }
    }
    if (best !== undefined) {
      usedInflow.add(best.id);
      result.add(best.id);
      result.add(out.id);
    }
  }

  return result;
}

/**
 * Detection pass (ADR-016): reset auto-marked transfers, re-pair the candidate set
 * (rows the user hasn't locked), and flag both legs `is_internal_transfer = 1`.
 * Never touches `user_modified = 1` rows. Idempotent.
 */
export function detectTransfers(db: DatabaseSync): { paired: number } {
  db.exec('BEGIN');
  try {
    db.exec(
      'UPDATE transactions SET is_internal_transfer = 0 WHERE is_internal_transfer = 1 AND user_modified = 0',
    );
    const rows = db
      .prepare(
        'SELECT id, account_id AS accountId, date, amount FROM transactions WHERE user_modified = 0',
      )
      .all() as unknown as PairRow[];
    const ids = findTransferPairs(rows);
    const mark = db.prepare('UPDATE transactions SET is_internal_transfer = 1 WHERE id = ?');
    for (const id of ids) mark.run(id);
    db.exec('COMMIT');
    return { paired: ids.size };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
