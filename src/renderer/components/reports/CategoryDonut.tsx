import { Cell, Pie, PieChart } from 'recharts';
import type { DonutSlice } from '../../lib/reports';
import { ChartContainer, type ChartConfig } from '../ui/chart';
import { Overline } from '../ui/overline';
import { formatEuro } from '../../lib/euro';

const config = {} satisfies ChartConfig;

export interface CategoryDonutProps {
  overline: string;
  title: string;
  slices: DonutSlice[];
  /** Colour of the centre total — sage for income, coral for expenses. */
  totalColor: string;
  emptyHint: string;
}

/** A category-composition donut (income or expenses) with its total and legend. */
export function CategoryDonut({
  overline,
  title,
  slices,
  totalColor,
  emptyHint,
}: CategoryDonutProps) {
  const total = slices.reduce((s, x) => s + x.value, 0);

  return (
    <div className="flex flex-col gap-3.5 rounded-lg border border-line-2 bg-ink-2 px-[22px] pb-4 pt-5">
      <div className="flex items-center gap-3.5">
        <Overline>{overline}</Overline>
        <span className="font-sans text-sm font-medium tracking-[-0.012em]">{title}</span>
      </div>
      {slices.length === 0 ? (
        <div className="flex min-h-[120px] items-center justify-center text-center text-sm text-paper-mute">
          {emptyHint}
        </div>
      ) : (
        <div className="flex items-center gap-5">
          <ChartContainer config={config} className="aspect-square h-[124px]">
            <PieChart>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="name"
                innerRadius={38}
                outerRadius={58}
                strokeWidth={0}
              >
                {slices.map((s) => (
                  <Cell key={s.name} fill={s.color} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
          <div className="min-w-0 flex-1">
            <div
              className="font-serif text-[22px] italic leading-none tracking-[-0.02em]"
              style={{ color: totalColor }}
            >
              {formatEuro(total)}
            </div>
            <ul className="mt-3 flex flex-col gap-1.5">
              {slices.map((s) => (
                <li key={s.name} className="flex items-center gap-2 font-sans text-[12px]">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
                  <span className="truncate text-paper-soft">{s.name}</span>
                  <span className="ml-auto tabular-nums text-paper-mute">
                    {formatEuro(s.value)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
