import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import type { BalancePoint, ChartRange } from '@shared/types/dashboard';
import { Overline } from '../ui/overline';
import { Chip } from '../ui/chip';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '../ui/chart';
import { chartPeriodLabelFr } from '../../lib/dashboardCharts';
import { formatEuro } from '../../lib/euro';

const RANGES: { value: ChartRange; label: string; title: string }[] = [
  { value: '3m', label: '3M', title: 'Solde sur 3 mois' },
  { value: '6m', label: '6M', title: 'Solde sur 6 mois' },
  { value: '1y', label: '1A', title: 'Solde sur 12 mois' },
  { value: 'max', label: 'MAX', title: 'Solde — historique complet' },
];

const chartConfig = {
  balance: { label: 'Solde', color: 'var(--brass)' },
} satisfies ChartConfig;

export interface ChartCardProps {
  /** Balance series to plot, chronological. Empty → empty state. */
  points: BalancePoint[];
  /** Caption shown bottom-right, e.g. `"mai 2026 · 1 compte"`. */
  caption?: string;
  /** Selected time window — controls the chip highlight and the title. */
  range: ChartRange;
  onRangeChange: (range: ChartRange) => void;
}

export function ChartCard({ points, caption, range, onRangeChange }: ChartCardProps) {
  const hasData = points.length > 0;
  const title = RANGES.find((r) => r.value === range)?.title ?? '';

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-y-2">
        <div className="flex min-w-0 items-center gap-3.5">
          <Overline>— II</Overline>
          <span className="truncate font-sans text-sm font-medium tracking-[-0.012em]">
            {title}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {RANGES.map((r) => (
            <Chip
              key={r.value}
              active={r.value === range}
              onClick={() => {
                onRangeChange(r.value);
              }}
            >
              {r.label}
            </Chip>
          ))}
        </div>
      </div>
      {hasData ? (
        <ChartContainer
          config={chartConfig}
          className="aspect-[600/220] min-h-[160px] w-full xl:h-[220px]"
        >
          <AreaChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="chartBalanceFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--brass)" stopOpacity={0.22} />
                <stop offset="100%" stopColor="var(--brass)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--line-1)" />
            <XAxis dataKey="period" hide />
            {/* Min–max domain mirrors the old hand-rolled scaling: a balance
                hovering around a high value still reads as a curve, not a flat
                line squashed by a zero baseline. */}
            <YAxis hide domain={['dataMin', 'dataMax']} />
            <ChartTooltip
              cursor={{ stroke: 'var(--line-2)' }}
              content={
                <ChartTooltipContent
                  className="border-line-2 bg-ink-2"
                  labelFormatter={(value) => chartPeriodLabelFr(String(value))}
                  formatter={(value) => (
                    <div className="flex w-full items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-[2px] bg-brass" />
                      <span className="text-paper-mute">Solde</span>
                      <span className="ml-auto font-mono tabular-nums text-paper">
                        {formatEuro(Number(value))}
                      </span>
                    </div>
                  )}
                />
              }
            />
            <Area
              dataKey="balance"
              type="linear"
              stroke="var(--brass)"
              strokeWidth={1.5}
              fill="url(#chartBalanceFill)"
              dot={false}
              activeDot={{ r: 3, fill: 'var(--brass)', stroke: 'var(--ink-2)' }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>
      ) : (
        <div className="flex aspect-[600/220] min-h-[160px] w-full items-center justify-center text-sm text-paper-mute xl:h-[220px]">
          Pas encore de données — importez un relevé.
        </div>
      )}
      <div className="flex gap-[18px] border-t border-line-2 pt-1.5">
        <div className="flex items-center gap-1.5 font-sans text-[11px] text-paper-mute">
          <span className="h-0.5 w-3.5 bg-brass" />
          Solde réel
        </div>
        {caption !== undefined && (
          <div className="ml-auto flex items-center font-sans text-[11px] text-paper-dim">
            {caption}
          </div>
        )}
      </div>
    </div>
  );
}
