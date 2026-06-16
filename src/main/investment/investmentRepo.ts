import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  WrapperDTO,
  SupportDTO,
  CreateWrapperInput,
  CreateSupportInput,
  SupportUpdateInput,
  DatedValue,
  DatedFlow,
  SupportHistory,
  QuotableSupport,
} from '@shared/types/investment';

// ---------------------------------------------------------------------------
// Row types (snake_case from SQLite)
// ---------------------------------------------------------------------------

interface WrapperRow {
  id: string;
  name: string;
  type: string;
  sort_order: number;
}

interface SupportRow {
  id: string;
  wrapper_id: string;
  name: string;
  isin: string | null;
  class_id: string | null;
  currency: string;
  sort_order: number;
  current_value: number;
  current_value_source: string | null;
}

interface ValuationRow {
  date: string;
  value: number;
  source: 'declared' | 'auto' | 'quote';
}

interface FlowRow {
  date: string;
  amount: number;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function toWrapper(r: WrapperRow): WrapperDTO {
  return {
    id: r.id,
    name: r.name,
    type: r.type as WrapperDTO['type'],
    sortOrder: r.sort_order,
  };
}

function toSupport(r: SupportRow): SupportDTO {
  return {
    id: r.id,
    wrapperId: r.wrapper_id,
    name: r.name,
    isin: r.isin,
    classId: r.class_id,
    currency: r.currency,
    sortOrder: r.sort_order,
    currentValue: r.current_value,
    currentValueSource:
      r.current_value_source === 'auto' || r.current_value_source === 'quote'
        ? r.current_value_source
        : r.current_value_source === 'declared'
          ? 'declared'
          : null,
  };
}

// ---------------------------------------------------------------------------
// Wrappers
// ---------------------------------------------------------------------------

export function createWrapper(db: DatabaseSync, input: CreateWrapperInput): WrapperDTO {
  const id = randomUUID();
  const nextOrder =
    (
      db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM investment_wrappers').get() as
        | { n: number }
        | undefined
    )?.n ?? 0;
  db.prepare(
    'INSERT INTO investment_wrappers (id, name, type, sort_order) VALUES (?, ?, ?, ?)',
  ).run(id, input.name, input.type, nextOrder);
  const row = db
    .prepare('SELECT id, name, type, sort_order FROM investment_wrappers WHERE id = ?')
    .get(id) as unknown as WrapperRow;
  return toWrapper(row);
}

export function listWrapperRows(db: DatabaseSync): WrapperDTO[] {
  const rows = db
    .prepare(
      'SELECT id, name, type, sort_order FROM investment_wrappers ORDER BY sort_order ASC, created_at ASC',
    )
    .all() as unknown as WrapperRow[];
  return rows.map(toWrapper);
}

export function deleteWrapper(db: DatabaseSync, id: string): void {
  db.exec('PRAGMA foreign_keys = ON');
  db.prepare('DELETE FROM investment_wrappers WHERE id = ?').run(id);
}

// ---------------------------------------------------------------------------
// Supports
// ---------------------------------------------------------------------------

export function createSupport(db: DatabaseSync, input: CreateSupportInput): SupportDTO {
  const id = randomUUID();
  const nextOrder =
    (
      db
        .prepare(
          'SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM investment_supports WHERE wrapper_id = ?',
        )
        .get(input.wrapperId) as { n: number } | undefined
    )?.n ?? 0;
  db.prepare(
    `INSERT INTO investment_supports (id, wrapper_id, name, isin, valuation_mode, class_id, currency, sort_order)
     VALUES (?, ?, ?, ?, 'declared', ?, 'EUR', ?)`,
  ).run(id, input.wrapperId, input.name, input.isin, input.classId, nextOrder);
  const row = db
    .prepare(
      `SELECT s.id, s.wrapper_id, s.name, s.isin, s.class_id, s.currency, s.sort_order,
              COALESCE(
                (SELECT v.value FROM support_valuations v
                 WHERE v.support_id = s.id
                 ORDER BY v.as_of DESC, v.created_at DESC LIMIT 1),
                0
              ) AS current_value,
              (SELECT v.source FROM support_valuations v
               WHERE v.support_id = s.id
               ORDER BY v.as_of DESC, v.created_at DESC LIMIT 1) AS current_value_source
       FROM investment_supports s WHERE s.id = ?`,
    )
    .get(id) as unknown as SupportRow;
  return toSupport(row);
}

export function deleteSupport(db: DatabaseSync, id: string): void {
  db.exec('PRAGMA foreign_keys = ON');
  db.prepare('DELETE FROM investment_supports WHERE id = ?').run(id);
}

export function listSupportRows(db: DatabaseSync, wrapperId?: string): SupportDTO[] {
  const base = `SELECT s.id, s.wrapper_id, s.name, s.isin, s.class_id, s.currency, s.sort_order,
       COALESCE(
         (SELECT v.value FROM support_valuations v
          WHERE v.support_id = s.id
          ORDER BY v.as_of DESC, v.created_at DESC LIMIT 1),
         0
       ) AS current_value,
       (SELECT v.source FROM support_valuations v
        WHERE v.support_id = s.id
        ORDER BY v.as_of DESC, v.created_at DESC LIMIT 1) AS current_value_source
  FROM investment_supports s`;
  const rows =
    wrapperId !== undefined
      ? (db
          .prepare(`${base} WHERE s.wrapper_id = ? ORDER BY s.sort_order ASC, s.created_at ASC`)
          .all(wrapperId) as unknown as SupportRow[])
      : (db
          .prepare(`${base} ORDER BY s.sort_order ASC, s.created_at ASC`)
          .all() as unknown as SupportRow[]);
  return rows.map(toSupport);
}

// ---------------------------------------------------------------------------
// Valuations & flows
// ---------------------------------------------------------------------------

export function addValuation(
  db: DatabaseSync,
  supportId: string,
  asOf: string,
  value: number,
): void {
  db.prepare(
    'INSERT INTO support_valuations (id, support_id, as_of, value) VALUES (?, ?, ?, ?)',
  ).run(randomUUID(), supportId, asOf, value);
}

export function addFlow(
  db: DatabaseSync,
  supportId: string,
  flowDate: string,
  amount: number,
  note?: string | null,
): void {
  db.prepare(
    'INSERT INTO support_flows (id, support_id, flow_date, amount, note) VALUES (?, ?, ?, ?, ?)',
  ).run(randomUUID(), supportId, flowDate, amount, note ?? null);
}

export function applyUpdate(db: DatabaseSync, input: SupportUpdateInput): void {
  addValuation(db, input.supportId, input.asOf, input.value);
  if (input.flow !== 0) {
    addFlow(db, input.supportId, input.asOf, input.flow);
  }
}

// ---------------------------------------------------------------------------
// History & latest valuation
// ---------------------------------------------------------------------------

export function getSupportHistory(db: DatabaseSync, supportId: string): SupportHistory {
  const valuations = db
    .prepare(
      'SELECT as_of AS date, value, source FROM support_valuations WHERE support_id = ? ORDER BY as_of ASC',
    )
    .all(supportId) as unknown as ValuationRow[];
  const flows = db
    .prepare(
      'SELECT flow_date AS date, amount FROM support_flows WHERE support_id = ? ORDER BY flow_date ASC',
    )
    .all(supportId) as unknown as FlowRow[];
  return {
    valuations: valuations.map(
      // Surface 'auto' and 'quote' explicitly; declared valuations leave source absent (the default).
      (r): DatedValue => ({
        date: r.date,
        value: r.value,
        source: r.source === 'auto' || r.source === 'quote' ? r.source : undefined,
      }),
    ),
    flows: flows.map((r): DatedFlow => ({ date: r.date, amount: r.amount })),
  };
}

export function latestValuation(db: DatabaseSync, supportId: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(
         (SELECT value FROM support_valuations
          WHERE support_id = ?
          ORDER BY as_of DESC, created_at DESC LIMIT 1),
         0
       ) AS value`,
    )
    .get(supportId) as { value: number } | undefined;
  return row?.value ?? 0;
}

// ---------------------------------------------------------------------------
// Quote feed helpers
// ---------------------------------------------------------------------------

/** Supports eligible for an auto quote: have an ISIN and a positive net share count. */
export function listQuotableSupports(db: DatabaseSync): QuotableSupport[] {
  const rows = db
    .prepare(
      `SELECT s.id, s.isin, s.quote_symbol AS quoteSymbol,
              (SELECT COALESCE(SUM(CASE WHEN o.kind = 'buy' THEN o.quantity ELSE -o.quantity END), 0)
               FROM support_operations o WHERE o.support_id = s.id) AS shares
       FROM investment_supports s
       WHERE s.isin IS NOT NULL`,
    )
    .all() as unknown as QuotableSupport[];
  return rows.filter((r) => r.shares > 1e-6);
}

/** Cache the resolved EUR ticker on the support so a refresh only needs the quote host. */
export function setQuoteSymbol(db: DatabaseSync, supportId: string, symbol: string): void {
  db.prepare('UPDATE investment_supports SET quote_symbol = ? WHERE id = ?').run(symbol, supportId);
}

/** Set (or clear) a support's ISIN. Clears the cached ticker so a changed ISIN re-resolves. */
export function setSupportIsin(db: DatabaseSync, supportId: string, isin: string | null): void {
  db.prepare('UPDATE investment_supports SET isin = ?, quote_symbol = NULL WHERE id = ?').run(
    isin,
    supportId,
  );
}

/** Upsert one 'quote' valuation per (support, date). A same-date declared value is never shadowed. */
export function writeQuoteValuation(
  db: DatabaseSync,
  supportId: string,
  asOf: string,
  value: number,
): 'written' | 'skipped_declared' {
  const declared = db
    .prepare(
      "SELECT 1 FROM support_valuations WHERE support_id = ? AND as_of = ? AND source = 'declared' LIMIT 1",
    )
    .get(supportId, asOf);
  if (declared !== undefined) return 'skipped_declared';
  const existing = db
    .prepare(
      "SELECT id FROM support_valuations WHERE support_id = ? AND as_of = ? AND source = 'quote' LIMIT 1",
    )
    .get(supportId, asOf) as { id: string } | undefined;
  if (existing !== undefined) {
    db.prepare('UPDATE support_valuations SET value = ? WHERE id = ?').run(value, existing.id);
  } else {
    db.prepare(
      "INSERT INTO support_valuations (id, support_id, as_of, value, source) VALUES (?, ?, ?, ?, 'quote')",
    ).run(randomUUID(), supportId, asOf, value);
  }
  return 'written';
}
