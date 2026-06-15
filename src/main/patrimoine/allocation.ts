import type { DatabaseSync } from 'node:sqlite';
import type { Allocation, AllocationSlice } from '@shared/types/patrimoine';
import { listClasses } from './assetClassRepo';
import { crdAt } from './loanRepo';
import { getAccountSummaries } from '../dashboard/queries';

const round2 = (n: number): number => Math.round(n * 100) / 100;
const UNCLASSIFIED = '__unclassified__';

export function getAllocation(db: DatabaseSync): Allocation {
  const todayIso = new Date().toISOString().slice(0, 10);
  const classes = listClasses(db);

  const values = new Map<string, number>();
  const add = (key: string | null, v: number): void => {
    const k = key ?? UNCLASSIFIED;
    values.set(k, (values.get(k) ?? 0) + v);
  };

  for (const a of getAccountSummaries(db)) {
    const row = db.prepare('SELECT class_id FROM accounts WHERE id = ?').get(a.id) as
      | { class_id: string | null }
      | undefined;
    add(row?.class_id ?? null, a.balance ?? 0);
  }

  const assets = db
    .prepare('SELECT declared_value, share, class_id FROM assets')
    .all() as unknown as { declared_value: number; share: number; class_id: string | null }[];
  for (const a of assets) add(a.class_id, a.declared_value * a.share);

  const loans = db.prepare('SELECT id, share, class_id FROM loans').all() as unknown as {
    id: string;
    share: number;
    class_id: string | null;
  }[];
  for (const l of loans) add(l.class_id, -crdAt(db, l.id, todayIso) * l.share);

  const total = round2([...values.values()].reduce((s, v) => s + v, 0));

  const slices: AllocationSlice[] = classes.map((c) => {
    const value = round2(values.get(c.id) ?? 0);
    const pct = total > 0 ? value / total : 0;
    return {
      classId: c.id,
      name: c.name,
      color: c.color,
      value,
      pct,
      targetPct: c.targetPct,
      gap: c.targetPct === null ? null : pct - c.targetPct,
    };
  });

  const unclassified = values.get(UNCLASSIFIED);
  if (unclassified !== undefined && round2(unclassified) !== 0) {
    const value = round2(unclassified);
    slices.push({
      classId: null,
      name: 'Non classé',
      color: 'var(--paper-mute)',
      value,
      pct: total > 0 ? value / total : 0,
      targetPct: null,
      gap: null,
    });
  }

  return { total, slices };
}
