import { Cell, Pie, PieChart } from 'recharts';
import type { NetWorth } from '@shared/types/dashboard';
import { ChartContainer, type ChartConfig } from '../ui/chart';
import { Overline } from '../ui/overline';
import { accountComposition } from '../../lib/reports';
import { formatEuro } from '../../lib/euro';

const PALETTE = ['var(--sage)', 'var(--brass)', '#8D7DC4', 'var(--coral)', '#6FA8C7'];
const config = {} satisfies ChartConfig;

export interface NetWorthDonutProps {
  netWorth: NetWorth | null;
}

/** Net worth as a donut of account composition + the total ("actuel"). */
export function NetWorthDonut({ netWorth }: NetWorthDonutProps) {
  const slices = accountComposition(netWorth);

  return (
    <div className="flex flex-col gap-3.5 rounded-lg border border-line-2 bg-ink-2 px-[22px] pb-4 pt-5">
      <div className="flex items-center gap-3.5">
        <Overline>— II</Overline>
        <span className="font-sans text-sm font-medium tracking-[-0.012em]">Patrimoine</span>
        <span className="ml-auto font-sans text-[11px] text-paper-mute">actuel</span>
      </div>
      {slices.length === 0 ? (
        <div className="flex min-h-[120px] items-center justify-center text-sm text-paper-mute">
          Aucun solde connu — importez un relevé ou déclarez un solde.
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
                {slices.map((s, i) => (
                  <Cell key={s.name} fill={PALETTE[i % PALETTE.length] ?? 'var(--brass)'} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
          <div className="min-w-0 flex-1">
            <div className="font-serif text-[22px] italic leading-none tracking-[-0.02em] text-paper">
              {formatEuro(netWorth?.total ?? 0)}
            </div>
            <ul className="mt-3 flex flex-col gap-1.5">
              {slices.map((s, i) => (
                <li key={s.name} className="flex items-center gap-2 font-sans text-[12px]">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: PALETTE[i % PALETTE.length] ?? 'var(--brass)' }}
                  />
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
