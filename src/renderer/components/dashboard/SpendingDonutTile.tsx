import { DonutCard } from '../reports/DonutCard';
import { Tile } from './Bento';
import { formatCompact } from '../../lib/euro';

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
    <Tile span={5}>
      <DonutCard
        overline="Ce mois"
        title="Où part l'argent"
        segments={topSegments}
        centerTop="Sorties"
        centerMain={total > 0 ? formatCompact(total) : undefined}
        centerSub={periodLabel}
        emptyHint="Pas encore de dépenses ce mois."
      />
    </Tile>
  );
}
