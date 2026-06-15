import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  AssetClass,
  UpsertAssetClassInput,
  ClassifiableHolding,
} from '@shared/types/patrimoine';

interface ClassRow {
  id: string;
  name: string;
  color: string;
  target_pct: number | null;
  sort_order: number;
}

function toClass(r: ClassRow): AssetClass {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    targetPct: r.target_pct,
    sortOrder: r.sort_order,
  };
}

export function listClasses(db: DatabaseSync): AssetClass[] {
  const rows = db
    .prepare(
      'SELECT id, name, color, target_pct, sort_order FROM asset_classes ORDER BY sort_order ASC, created_at ASC',
    )
    .all() as unknown as ClassRow[];
  return rows.map(toClass);
}

export function upsertClass(db: DatabaseSync, input: UpsertAssetClassInput): AssetClass {
  const id = input.id ?? randomUUID();
  const nextOrder =
    (
      db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM asset_classes').get() as
        | { n: number }
        | undefined
    )?.n ?? 0;
  db.prepare(
    `INSERT INTO asset_classes (id, name, color, target_pct, sort_order)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       color = excluded.color,
       target_pct = excluded.target_pct`,
  ).run(id, input.name, input.color, input.targetPct, nextOrder);
  const row = db
    .prepare('SELECT id, name, color, target_pct, sort_order FROM asset_classes WHERE id = ?')
    .get(id) as unknown as ClassRow;
  return toClass(row);
}

export function deleteClass(db: DatabaseSync, id: string): void {
  db.exec('PRAGMA foreign_keys = ON');
  db.prepare('DELETE FROM asset_classes WHERE id = ?').run(id);
}

export function reorderClass(db: DatabaseSync, id: string, sortOrder: number): void {
  db.prepare('UPDATE asset_classes SET sort_order = ? WHERE id = ?').run(sortOrder, id);
}

const TABLE_BY_KIND = {
  account: 'accounts',
  asset: 'assets',
  loan: 'loans',
  support: 'investment_supports',
} as const;

export function assignClass(
  db: DatabaseSync,
  args: { kind: 'account' | 'asset' | 'loan' | 'support'; id: string; classId: string | null },
): void {
  const table = TABLE_BY_KIND[args.kind];
  db.prepare(`UPDATE ${table} SET class_id = ? WHERE id = ?`).run(args.classId, args.id);
}

export function listHoldings(db: DatabaseSync): ClassifiableHolding[] {
  const accounts = db
    .prepare('SELECT id, name, class_id FROM accounts ORDER BY name')
    .all() as unknown as { id: string; name: string; class_id: string | null }[];
  const assets = db
    .prepare('SELECT id, name, declared_value, share, class_id FROM assets ORDER BY name')
    .all() as unknown as {
    id: string;
    name: string;
    declared_value: number;
    share: number;
    class_id: string | null;
  }[];
  const loans = db
    .prepare('SELECT id, name, share, class_id FROM loans ORDER BY name')
    .all() as unknown as { id: string; name: string; share: number; class_id: string | null }[];
  const supports = db
    .prepare(
      `SELECT id, name, class_id,
         COALESCE((SELECT value FROM support_valuations v
                   WHERE v.support_id = investment_supports.id
                   ORDER BY as_of DESC, created_at DESC LIMIT 1), 0) AS current_value
       FROM investment_supports ORDER BY name`,
    )
    .all() as unknown as {
    id: string;
    name: string;
    class_id: string | null;
    current_value: number;
  }[];

  return [
    ...accounts.map((a) => ({
      id: a.id,
      kind: 'account' as const,
      name: a.name,
      signedValue: 0,
      classId: a.class_id,
    })),
    ...assets.map((a) => ({
      id: a.id,
      kind: 'asset' as const,
      name: a.name,
      signedValue: Math.round(a.declared_value * a.share * 100) / 100,
      classId: a.class_id,
    })),
    ...loans.map((l) => ({
      id: l.id,
      kind: 'loan' as const,
      name: l.name,
      signedValue: 0,
      classId: l.class_id,
    })),
    ...supports.map((s) => ({
      id: s.id,
      kind: 'support' as const,
      name: s.name,
      signedValue: Math.round(s.current_value * 100) / 100,
      classId: s.class_id,
    })),
  ];
}
