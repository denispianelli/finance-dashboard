import { TrendingDown, TrendingUp } from 'lucide-react';
import type { Allocation } from '@shared/types/patrimoine';
import { Overline } from '../ui/overline';
import { Money } from '../ui/money';
import { formatEuro, formatPercent } from '../../lib/euro';

/**
 * Patrimoine summary tile: the big net-worth figure + monthly delta, the
 * Actifs / Passif split, and a composition bar by asset class with a legend.
 * Leads the Patrimoine page (composition shown as a bar, not a donut — the
 * donut lives nowhere now; this is the user-preferred lead-in).
 */
export function NetWorthSummaryCard({
  netWorth,
  monthDelta,
  actifs,
  passif,
  allocation,
}: {
  netWorth: number;
  monthDelta: number;
  actifs: number;
  passif: number;
  allocation: Allocation | null;
}) {
  const slices = allocation?.slices ?? [];
  const up = monthDelta >= 0;

  return (
    <div className="tile p-[22px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-brass" />
          <Overline>Patrimoine net</Overline>
        </div>
        <div className="flex gap-8">
          <div className="text-right">
            <div className="flex items-center justify-end gap-1.5 font-sans text-[10px] uppercase tracking-[0.12em] text-paper-mute">
              <span className="h-1.5 w-1.5 rounded-full bg-sage" /> Actifs
            </div>
            <Money value={actifs} className="text-[15px] font-semibold" />
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-1.5 font-sans text-[10px] uppercase tracking-[0.12em] text-paper-mute">
              <span className="h-1.5 w-1.5 rounded-full bg-coral" /> Passif
            </div>
            <Money value={passif} kind="expense" className="text-[15px] font-semibold" />
          </div>
        </div>
      </div>

      <div className="mt-2">
        <Money
          value={netWorth}
          className="text-hero font-semibold leading-figure tracking-figure"
        />
      </div>

      {monthDelta !== 0 && (
        <div className="mt-2 flex items-center gap-1.5 font-sans text-[12px]">
          <span
            className={
              up ? 'flex items-center gap-1 text-sage' : 'flex items-center gap-1 text-coral'
            }
          >
            {up ? (
              <TrendingUp size={12} strokeWidth={2} />
            ) : (
              <TrendingDown size={12} strokeWidth={2} />
            )}
            {up ? '+ ' : ''}
            {formatEuro(monthDelta)}
          </span>
          <span className="text-paper-mute">ce mois</span>
        </div>
      )}

      {slices.length > 0 && (
        <>
          <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-line-2">
            {slices.map((s) => (
              <span
                key={s.classId ?? '__none__'}
                style={{ width: `${String(Math.max(0, s.pct) * 100)}%`, background: s.color }}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 font-sans text-[11px]">
            {slices.map((s) => (
              <span key={s.classId ?? '__none__'} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                <span className="text-paper-soft">{s.name}</span>
                <Money value={s.value} className="text-[11px] text-paper" />
                <span className="font-mono tabular-nums text-paper-mute">
                  {formatPercent(s.pct)}
                </span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
