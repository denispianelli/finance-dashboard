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
}

interface ValuationRow {
  date: string;
  value: number;
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
              ) AS current_value
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
       ) AS current_value
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
      'SELECT as_of AS date, value FROM support_valuations WHERE support_id = ? ORDER BY as_of ASC',
    )
    .all(supportId) as unknown as ValuationRow[];
  const flows = db
    .prepare(
      'SELECT flow_date AS date, amount FROM support_flows WHERE support_id = ? ORDER BY flow_date ASC',
    )
    .all(supportId) as unknown as FlowRow[];
  return {
    valuations: valuations.map((r): DatedValue => ({ date: r.date, value: r.value })),
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
