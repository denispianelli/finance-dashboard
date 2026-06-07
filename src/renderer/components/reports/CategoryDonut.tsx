import type { DonutSlice } from '../../lib/reports';
import { DonutCard } from './DonutCard';

export interface CategoryDonutProps {
  overline: string;
  title: string;
  slices: DonutSlice[];
  /** Caption inside the ring — "Entrées" for income, "Sorties" for expenses. */
  centerTop: string;
  emptyHint: string;
}

/** A category-composition donut (income or expenses) with its total and legend. */
export function CategoryDonut({
  overline,
  title,
  slices,
  centerTop,
  emptyHint,
}: CategoryDonutProps) {
  return (
    <DonutCard
      overline={overline}
      title={title}
      centerTop={centerTop}
      emptyHint={emptyHint}
      segments={slices.map((s) => ({ key: s.name, label: s.name, value: s.value, color: s.color }))}
    />
  );
}
