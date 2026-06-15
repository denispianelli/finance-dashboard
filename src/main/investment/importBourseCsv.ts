import { randomUUID, createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  ParsedOp,
  ImportBourseResult,
  SupportDTO,
  OperationDTO,
} from '@shared/types/investment';
import { listSupportRows } from './investmentRepo';

// ---------------------------------------------------------------------------
// Hash
// ---------------------------------------------------------------------------

// Dedup key for idempotent re-import. Scoped by wrapper so the same operation under two
// wrappers is distinct. Known limitation (acceptable for a passive DCA investor): two genuinely
// distinct fills on the same day, same label, same quantity AND same net would collide and the
// second would be dropped as "already present". Add a within-(date,label) ordinal here if that
// ever matters.
const opHash = (wrapperId: string, o: ParsedOp): string =>
  createHash('sha256')
    .update([wrapperId, o.rawLabel, o.opDate, o.kind, String(o.quantity), String(o.net)].join('|'))
    .digest('hex');

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

interface SupportIdRow {
  id: string;
}

interface SortOrderRow {
  n: number;
}

interface AggRow {
  first: string | null;
  last: string | null;
  shares: number | null;
}

interface OpRow {
  id: string;
  support_id: string;
  op_date: string;
  kind: 'buy' | 'sell';
  quantity: number;
  unit_price: number | null;
  gross: number | null;
  fees: number | null;
  net: number;
  currency: string;
  raw_label: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function importBourseCsv(
  db: DatabaseSync,
  wrapperId: string,
  ops: ParsedOp[],
): ImportBourseResult {
  db.exec('PRAGMA foreign_keys = ON');

  const created: SupportDTO[] = [];
  const touched = new Set<string>();
  let imported = 0;
  let already = 0;

  // All-or-nothing: a throw mid-loop must not leave a partially-imported, inconsistent
  // DB (matches saveLoan/insertStatement). Also far faster than autocommit per row.
  db.exec('BEGIN');
  try {
    for (const o of ops) {
      const supportId = resolveSupport(db, wrapperId, o, created);
      touched.add(supportId);

      const hash = opHash(wrapperId, o);
      const dup = db.prepare('SELECT 1 FROM support_operations WHERE op_hash = ?').get(hash);
      if (dup !== undefined) {
        already += 1;
        continue;
      }

      const opId = randomUUID();
      db.prepare(
        `INSERT INTO support_operations
           (id, support_id, op_date, kind, quantity, unit_price, gross, fees, net, currency, raw_label, op_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        opId,
        supportId,
        o.opDate,
        o.kind,
        o.quantity,
        o.unitPrice,
        o.gross,
        o.fees,
        o.net,
        o.currency,
        o.rawLabel,
        hash,
      );

      // Flow: inversion of net (buy net < 0 → +contribution; sell net > 0 → −withdrawal)
      db.prepare(
        `INSERT INTO support_flows (id, support_id, flow_date, amount, note, operation_id)
         VALUES (?, ?, ?, ?, NULL, ?)`,
      ).run(randomUUID(), supportId, o.opDate, -o.net, opId);

      imported += 1;
    }

    for (const supportId of touched) {
      ensureBoundaryValuations(db, supportId);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return {
    operationsImported: imported,
    alreadyPresent: already,
    skippedRows: 0, // populated by the IPC handler from parse result
    createdSupports: created,
    supportsTouched: touched.size,
  };
}

export function listOperations(db: DatabaseSync, supportId: string): OperationDTO[] {
  const rows = db
    .prepare(
      `SELECT id, support_id, op_date, kind, quantity, unit_price, gross, fees, net, currency, raw_label
       FROM support_operations
       WHERE support_id = ?
       ORDER BY op_date ASC, imported_at ASC`,
    )
    .all(supportId) as unknown as OpRow[];

  return rows.map(
    (r): OperationDTO => ({
      id: r.id,
      supportId: r.support_id,
      opDate: r.op_date,
      kind: r.kind,
      quantity: r.quantity,
      unitPrice: r.unit_price,
      gross: r.gross,
      fees: r.fees,
      net: r.net,
      currency: r.currency,
      rawLabel: r.raw_label,
    }),
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve an existing support by import_label or create one. */
function resolveSupport(
  db: DatabaseSync,
  wrapperId: string,
  o: ParsedOp,
  created: SupportDTO[],
): string {
  const existing = db
    .prepare('SELECT id FROM investment_supports WHERE wrapper_id = ? AND import_label = ?')
    .get(wrapperId, o.rawLabel) as SupportIdRow | undefined;

  if (existing !== undefined) {
    return existing.id;
  }

  const supportId = randomUUID();
  const sortRow = db
    .prepare(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM investment_supports WHERE wrapper_id = ?',
    )
    .get(wrapperId) as SortOrderRow | undefined;

  db.prepare(
    `INSERT INTO investment_supports
       (id, wrapper_id, name, isin, valuation_mode, class_id, currency, sort_order, import_label)
     VALUES (?, ?, ?, NULL, 'declared', NULL, ?, ?, ?)`,
  ).run(supportId, wrapperId, o.rawLabel, o.currency, sortRow?.n ?? 0, o.rawLabel);

  const dto = listSupportRows(db, wrapperId).find((s) => s.id === supportId);
  if (dto !== undefined) {
    created.push(dto);
  }

  return supportId;
}

/**
 * Ensure boundary 0-valuations exist for a support:
 * - Always insert one at the first operation date (opening basis for performance).
 * - If the position is closed (net shares ≈ 0), also insert one at the last operation date.
 * Both inserts are no-ops when the valuation already exists (idempotent).
 *
 * Assumes **forward-only** imports (Fortuneo exports are append-forward). Back-filling an OLDER
 * period in a later import would leave the previous opening-0 mid-series; if that ever becomes a
 * use case, delete prior import-origin 0-valuations before re-inserting.
 */
function ensureBoundaryValuations(db: DatabaseSync, supportId: string): void {
  const agg = db
    .prepare(
      `SELECT MIN(op_date) AS first,
              MAX(op_date) AS last,
              SUM(CASE WHEN kind = 'buy' THEN quantity ELSE -quantity END) AS shares
       FROM support_operations
       WHERE support_id = ?`,
    )
    .get(supportId) as AggRow | undefined;

  const first = agg?.first;
  if (agg === undefined || first === null || first === undefined) return;

  insert0IfAbsent(db, supportId, first);

  const isClosed = Math.abs(agg.shares ?? 0) < 1e-6;
  if (isClosed && agg.last !== null) {
    insert0IfAbsent(db, supportId, agg.last);
  }
}

function insert0IfAbsent(db: DatabaseSync, supportId: string, date: string): void {
  const exists =
    db
      .prepare('SELECT 1 FROM support_valuations WHERE support_id = ? AND as_of = ?')
      .get(supportId, date) !== undefined;

  if (!exists) {
    db.prepare(
      "INSERT INTO support_valuations (id, support_id, as_of, value, source) VALUES (?, ?, ?, 0, 'auto')",
    ).run(randomUUID(), supportId, date);
  }
}
