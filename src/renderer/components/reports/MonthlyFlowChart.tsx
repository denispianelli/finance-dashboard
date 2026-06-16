import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';
import { Overline } from '../ui/overline';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '../ui/chart';
import { formatEuro } from '../../lib/euro';
import type { MonthlyFlow } from '../../lib/reports';

export interface MonthlyFlowChartProps {
  data: MonthlyFlow[];
  title: string;
}

const SERIES = {
  income: { label: 'Entrées', color: 'hsl(var(--sage))' },
  expense: { label: 'Sorties', color: 'hsl(var(--coral))' },
} satisfies ChartConfig;

/** Paired income/expense bars per bucket (month or day) — the kit's centrepiece
 *  "Entrées et sorties" chart: sage in, coral out, scaled to a shared maximum.
 *  Same recharts + kit-tooltip pattern as the dashboard's ChartCard. */
export function MonthlyFlowChart({ data, title }: MonthlyFlowChartProps) {
  const hasData = data.some((d) => d.income > 0 || d.expense > 0);

  return (
    <div className="flex flex-col gap-3.5 rounded-lg border border-line-2 bg-ink-2 px-[22px] py-5">
      <div className="flex flex-wrap items-center justify-between gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <Overline>Flux</Overline>
          <span className="font-sans text-sm font-medium tracking-[-0.012em]">{title}</span>
        </div>
        <div className="flex gap-4 font-sans text-[11px] text-paper-mute">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[2px] bg-sage" />
            Entrées
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[2px] bg-coral" />
            Sorties
          </span>
        </div>
      </div>
      {hasData ? (
        <ChartContainer config={SERIES} className="h-[200px] w-full">
          <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barGap={3}>
            <CartesianGrid vertical={false} stroke="var(--line-1)" />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              interval={0}
              tickMargin={8}
              tick={{ fill: 'var(--paper-dim)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            />
            <ChartTooltip
              cursor={{ fill: 'var(--ink-3)', opacity: 0.5 }}
              content={
                <ChartTooltipContent
                  className="border-line-2 bg-ink-2"
                  formatter={(value, name) => {
                    const series = SERIES[name as keyof typeof SERIES];
                    return (
                      <div className="flex w-full items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                          style={{ background: series.color }}
                        />
                        <span className="text-paper-mute">{series.label}</span>
                        <span className="ml-auto font-mono tabular-nums text-paper">
                          {formatEuro(Number(value))}
                        </span>
                      </div>
                    );
                  }}
                />
              }
            />
            <Bar
              dataKey="income"
              fill="hsl(var(--sage) / 0.85)"
              barSize={14}
              radius={[2, 2, 0, 0]}
            />
            <Bar
              dataKey="expense"
              fill="hsl(var(--coral) / 0.85)"
              barSize={14}
              radius={[2, 2, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      ) : (
        <div className="flex h-[200px] w-full items-center justify-center text-sm text-paper-mute">
          Pas de données sur cette période.
        </div>
      )}
    </div>
  );
}
