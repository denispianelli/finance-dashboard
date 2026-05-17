import type { DatabaseSync } from 'node:sqlite';
import type { OverlappingImport, PeriodOverlapResult } from '@shared/types/import';

/**
 * Pre-insert contract: call BEFORE inserting the new import row, so the new
 * import never matches itself. Compares against imports with status 'validated' or 'pending_review' for the same
 * account; 'cancelled' imports are ignored. If a new terminal status is added to the
 * schema, update the SQL IN clause and this union type accordingly.
 * Boundaries are inclusive (end == start counts as an overlap). Non-blocking:
 * this only reports — the caller decides what to do.
 */
export function checkPeriodOverlap(
  db: DatabaseSync,
  accountId: string,
  newStart: string,
  newEnd: string,
): PeriodOverlapResult {
  const rows = db
    .prepare(
      `SELECT id, date_range_start, date_range_end, status
       FROM imports
       WHERE account_id = ?
         AND status IN ('validated', 'pending_review')
         AND date_range_start <= ?
         AND date_range_end   >= ?`,
    )
    .all(accountId, newEnd, newStart) as unknown as OverlappingImport[];
  return { hasOverlap: rows.length > 0, overlappingImports: rows };
}
