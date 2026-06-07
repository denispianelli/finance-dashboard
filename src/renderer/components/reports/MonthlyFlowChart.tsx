import { Overline } from '../ui/overline';
import { formatEuro } from '../../lib/euro';
import type { MonthlyFlow } from '../../lib/reports';

export interface MonthlyFlowChartProps {
  data: MonthlyFlow[];
  title: string;
}

const HEIGHT = 200;
const PLOT = HEIGHT - 28; // room for the labels under each column

/** Paired income/expense bars per bucket (month or day) — the kit's centrepiece
 *  "Entrées et sorties" chart: sage in, coral out, scaled to a shared maximum. */
export function MonthlyFlowChart({ data, title }: MonthlyFlowChartProps) {
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.expense]));
  const hasData = data.some((d) => d.income > 0 || d.expense > 0);

  return (
    <div className="flex flex-col gap-3.5 rounded-lg border border-line-2 bg-ink-2 px-[22px] py-5">
      <div className="flex flex-wrap items-center justify-between gap-y-2">
        <div className="flex min-w-0 items-center gap-3.5">
          <Overline>— I</Overline>
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
        <div className="flex w-full items-end" style={{ height: HEIGHT }}>
          {data.map((d, i) => {
            const grow = {
              transformOrigin: 'bottom',
              animation: `bar-grow 0.6s cubic-bezier(0.4, 0, 0.2, 1) both`,
              animationDelay: `${String(i * 45)}ms`,
            } as const;
            return (
              <div key={i} className="flex h-full flex-1 flex-col items-center">
                <div className="flex w-full flex-1 items-end justify-center gap-[3px]">
                  <div
                    data-chart-bar
                    title={`Entrées ${formatEuro(d.income)}`}
                    className="w-[32%] max-w-[14px] rounded-t-[2px] bg-sage/85"
                    style={{ height: (d.income / max) * PLOT, ...grow }}
                  />
                  <div
                    data-chart-bar
                    title={`Sorties ${formatEuro(d.expense)}`}
                    className="w-[32%] max-w-[14px] rounded-t-[2px] bg-coral/85"
                    style={{ height: (d.expense / max) * PLOT, ...grow }}
                  />
                </div>
                <span className="mt-2 font-mono text-[10px] text-paper-dim">{d.label}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div
          className="flex w-full items-center justify-center text-sm text-paper-mute"
          style={{ height: HEIGHT }}
        >
          Pas de données sur cette période.
        </div>
      )}
    </div>
  );
}
