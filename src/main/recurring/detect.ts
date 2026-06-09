import type {
  RecurringCadence,
  RecurringInput,
  RecurringSubscription,
} from '@shared/types/recurring';

const MIN_OCCURRENCES = 3;

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  if (s.length === 0) return 0;
  return s.length % 2 === 1 ? (s[mid] ?? 0) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
}

function cadenceOf(intervals: number[]): RecurringCadence | null {
  if (intervals.length === 0) return null;
  if (intervals.every((d) => d >= 25 && d <= 35)) return 'monthly';
  if (intervals.every((d) => d >= 355 && d <= 375)) return 'annual';
  return null;
}

function addInterval(date: string, cadence: RecurringCadence): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDate();
  const month = d.getUTCMonth() + (cadence === 'monthly' ? 1 : 0);
  const year = d.getUTCFullYear() + (cadence === 'annual' ? 1 : 0);
  // Clamp to the target month's last day so a month-end anchor doesn't overflow
  // (Jan 31 + 1 month → Feb 28/29, not Mar 3; Feb 29 + 1 year → Feb 28).
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

/**
 * Detect recurring expenses: a stable payee + stable amount at a regular monthly
 * or annual cadence. Income is ignored; transfers are expected to be filtered out
 * by the caller. Pure — no DB, no clock.
 */
export function detectRecurring(txns: RecurringInput[]): RecurringSubscription[] {
  const groups = new Map<string, RecurringInput[]>();
  for (const t of txns) {
    if (t.amount >= 0) continue;
    const g = groups.get(t.label) ?? [];
    g.push(t);
    groups.set(t.label, g);
  }

  const subs: RecurringSubscription[] = [];
  for (const [label, items] of groups) {
    if (items.length < MIN_OCCURRENCES) continue;
    const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      intervals.push(daysBetween(sorted[i - 1]?.date ?? '', sorted[i]?.date ?? ''));
    }
    const cadence = cadenceOf(intervals);
    if (cadence === null) continue;

    const amounts = sorted.map((s) => Math.abs(s.amount));
    const medAmt = median(amounts);
    const tol = Math.max(2, medAmt * 0.05);
    if (!amounts.every((a) => Math.abs(a - medAmt) <= tol)) continue;

    const lastDate = sorted[sorted.length - 1]?.date ?? '';
    subs.push({
      label,
      amount: medAmt,
      cadence,
      monthlyEquivalent: cadence === 'monthly' ? medAmt : medAmt / 12,
      occurrences: sorted.length,
      lastDate,
      nextDueDate: addInterval(lastDate, cadence),
    });
  }

  return subs.sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent);
}
