import type { DashboardTransaction, MonthPoint } from '@shared/types/dashboard';
import { formatBalance } from './dashboardMap';
import { MINUS, NBSP } from './euro';

const MONTHS_FR = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

/** `yyyy-mm` → French month name (`'2026-05'` → `'mai'`); passes through if unparseable. */
export function monthLabelFr(month: string): string {
  const idx = Number(month.slice(5, 7)) - 1;
  return MONTHS_FR[idx] ?? month;
}

/** Splits a formatted euro amount into an integer part and a `,dd €` remainder,
 *  matching the KPI tile's large-number / small-suffix layout. */
export function splitEuro(amount: number): { value: string; sub: string } {
  const [intPart, decPart] = formatBalance(amount).split(',');
  return { value: intPart ?? '0', sub: `,${decPart ?? '00'}${NBSP}€` };
}

export interface KpiDelta {
  delta: string;
  deltaDir: 'up' | 'down';
}

/**
 * Percentage change of `current` vs `previous`, formatted `+ 4,2 %` / `− 8,1 %`.
 * The arrow color (`deltaDir`) encodes good/bad, not direction: when
 * `higherIsBetter` is false (e.g. expenses), a rise is colored "down". Returns
 * undefined when there is no usable baseline.
 */
export function kpiDelta(
  current: number,
  previous: number,
  higherIsBetter: boolean,
): KpiDelta | undefined {
  if (previous === 0) return undefined;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const rose = current >= previous;
  const sign = rose ? '+' : MINUS;
  const magnitude = Math.abs(pct).toLocaleString('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const good = higherIsBetter ? rose : !rose;
  return { delta: `${sign}${NBSP}${magnitude}${NBSP}%`, deltaDir: good ? 'up' : 'down' };
}

/** Normalize y so the largest value sits near the top of the box (small y). */
function scaleY(value: number, min: number, max: number, height: number, pad: number): number {
  if (max === min) return height / 2;
  const usable = height - pad * 2;
  return pad + (1 - (value - min) / (max - min)) * usable;
}

/** Evenly-spaced `x,y` points for a sparkline (KPI tile, default 84×32 box). */
export function sparkPoints(values: number[], width = 84, height = 32): string {
  if (values.length === 0) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values.map((v, i) => point(i * step, scaleY(v, min, max, height, 2))).join(' ');
}

export interface ChartGeometry {
  line: string;
  area: string;
}

/** Line polyline + filled area path for the 12-month chart (default 600×220 box). */
export function chartGeometry(
  values: number[],
  width = 600,
  height = 220,
  pad = 20,
): ChartGeometry {
  if (values.length === 0) return { line: '', area: '' };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const coords = values.map((v, i) => ({ x: i * step, y: scaleY(v, min, max, height, pad) }));
  const line = coords.map((c) => point(c.x, c.y)).join(' ');
  const first = coords[0];
  const last = coords[coords.length - 1];
  // Non-empty values guarantees both ends exist.
  const area =
    first && last
      ? `M${point(first.x, first.y)} ${line} L${point(last.x, height)} L${point(first.x, height)} Z`
      : '';
  return { line, area };
}

export interface CategoryShare {
  name: string;
  total: number;
}

/**
 * Top expense categories for a given `yyyy-mm`, from already-loaded transactions
 * (per-account). Uncategorized and income rows are ignored. Deterministic.
 */
export function topSpendingCategories(
  transactions: DashboardTransaction[],
  month: string,
  limit = 3,
): CategoryShare[] {
  const totals = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.amount >= 0) continue;
    if (tx.categoryName === null) continue;
    if (tx.categoryId === 'cat-transferts') continue; // transfers aren't spending
    if (!tx.date.startsWith(month)) continue;
    totals.set(tx.categoryName, (totals.get(tx.categoryName) ?? 0) + Math.abs(tx.amount));
  }
  return [...totals.entries()]
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

/** Latest month present in the series, or null. */
export function latestMonth(series: MonthPoint[]): string | null {
  return series[series.length - 1]?.month ?? null;
}

/** A rounded `"x,y"` SVG coordinate pair. */
function point(x: number, y: number): string {
  return `${String(round(x))},${String(round(y))}`;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
