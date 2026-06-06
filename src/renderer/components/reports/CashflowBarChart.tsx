import { Bar, BarChart, CartesianGrid, Cell, XAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '../ui/chart';
import { Overline } from '../ui/overline';
import type { NetPoint } from '../../lib/reports';

const config = { net: { label: 'Net' } } satisfies ChartConfig;

export interface CashflowBarChartProps {
  data: NetPoint[];
  title: string;
}

/** Gained/lost per sub-period as bars — green when that period's net ≥ 0, coral when < 0. */
export function CashflowBarChart({ data, title }: CashflowBarChartProps) {
  const hasData = data.some((p) => p.net !== 0);

  return (
    <div className="flex flex-col gap-3.5 rounded-lg border border-line-2 bg-ink-2 px-[22px] pb-4 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-y-2">
        <div className="flex items-center gap-3.5">
          <Overline>— I</Overline>
          <span className="font-sans text-sm font-medium tracking-[-0.012em]">{title}</span>
        </div>
        <span className="font-sans text-[11px] text-paper-mute">
          vert = positif · corail = négatif
        </span>
      </div>
      {hasData ? (
        <ChartContainer config={config} className="aspect-[600/200] w-full">
          <BarChart accessibilityLayer data={data} margin={{ left: 12, right: 12 }}>
            <CartesianGrid vertical={false} stroke="var(--line-1)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Bar dataKey="net" radius={3}>
              {data.map((p) => (
                <Cell key={p.label} fill={p.net >= 0 ? 'var(--sage)' : 'var(--coral)'} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      ) : (
        <div className="flex aspect-[600/200] min-h-[150px] w-full items-center justify-center text-sm text-paper-mute">
          Pas de données sur cette période.
        </div>
      )}
    </div>
  );
}
