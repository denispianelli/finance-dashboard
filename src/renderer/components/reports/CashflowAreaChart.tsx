import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '../ui/chart';
import { Overline } from '../ui/overline';
import type { NetPoint } from '../../lib/reports';

const config = { net: { label: 'Net', color: 'var(--sage)' } } satisfies ChartConfig;

export interface CashflowAreaChartProps {
  data: NetPoint[];
  title: string;
}

/** Gained/lost trend as a shadcn/Recharts area chart (net per sub-period). */
export function CashflowAreaChart({ data, title }: CashflowAreaChartProps) {
  const hasData = data.some((p) => p.net !== 0);

  return (
    <div className="flex flex-col gap-3.5 rounded-lg border border-line-2 bg-ink-2 px-[22px] pb-4 pt-5">
      <div className="flex items-center gap-3.5">
        <Overline>— I</Overline>
        <span className="font-sans text-sm font-medium tracking-[-0.012em]">{title}</span>
      </div>
      {hasData ? (
        <ChartContainer config={config} className="aspect-[600/220] w-full">
          <AreaChart accessibilityLayer data={data} margin={{ left: 12, right: 12 }}>
            <CartesianGrid vertical={false} stroke="var(--line-1)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
            <Area
              dataKey="net"
              type="natural"
              fill="var(--color-net)"
              fillOpacity={0.25}
              stroke="var(--color-net)"
              strokeWidth={1.5}
            />
          </AreaChart>
        </ChartContainer>
      ) : (
        <div className="flex aspect-[600/220] min-h-[160px] w-full items-center justify-center text-sm text-paper-mute">
          Pas de données sur cette période.
        </div>
      )}
    </div>
  );
}
