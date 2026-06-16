import { Donut } from '../reports/DonutCard';
import { Tile } from './Bento';
import { formatCompact, formatEuro } from '../../lib/euro';
import { Overline } from '../ui/overline';

export interface SpendingSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

export interface SpendingDonutTileProps {
  /** Spending by category, descending. */
  segments: SpendingSegment[];
  /** Total sorties for the period. */
  total: number;
  /** e.g. "mai 2026" */
  periodLabel: string;
}

const MAX_LEGEND_ITEMS = 5;

/** Bento tile (span 5): spending breakdown donut with top-5 legend. */
export function SpendingDonutTile({ segments, total, periodLabel }: SpendingDonutTileProps) {
  const topSegments = segments.slice(0, MAX_LEGEND_ITEMS);

  return (
    <Tile span={5} className="flex flex-col gap-3.5">
      {/* Section head */}
      <div className="flex items-center gap-3.5">
        <Overline>Ce mois</Overline>
        <span className="font-sans text-sm font-medium tracking-[-0.012em]">Où part l'argent</span>
      </div>

      {/* Content */}
      {topSegments.length === 0 ? (
        <div className="flex min-h-[120px] items-center justify-center text-center text-sm text-paper-mute">
          Pas encore de dépenses ce mois.
        </div>
      ) : (
        <div className="flex items-center gap-[22px]">
          <Donut
            segments={topSegments}
            centerTop="Sorties"
            centerMain={total > 0 ? formatCompact(total) : '—'}
            centerSub={periodLabel}
          />
          <ul className="flex min-w-0 flex-1 flex-col gap-[9px]">
            {topSegments.map((s) => (
              <li key={s.key} className="flex items-center gap-2.5 font-sans text-[12px]">
                <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: s.color }} />
                <span className="flex-1 truncate text-paper-soft">{s.label}</span>
                <span className="font-mono tabular-nums text-paper-mute">
                  {formatEuro(s.value)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Tile>
  );
}
