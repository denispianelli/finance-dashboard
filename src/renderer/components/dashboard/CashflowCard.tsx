import type { CashflowGranularity, CashflowPoint } from '@shared/types/dashboard';
import { Overline } from '../ui/overline';
import { Chip } from '../ui/chip';
import { formatBalance } from '../../lib/dashboardMap';
import { monthLabelFr } from '../../lib/dashboardCharts';

export interface CashflowCardProps {
  series: CashflowPoint[];
  granularity: CashflowGranularity;
  onGranularityChange: (g: CashflowGranularity) => void;
}

function periodLabel(period: string, granularity: CashflowGranularity): string {
  if (granularity === 'year') return period;
  return `${monthLabelFr(period)} ${period.slice(0, 4)}`;
}

/** Signed euro with an explicit + / − sign for the net column. */
function signedEuro(n: number): string {
  const sign = n >= 0 ? '+ ' : '− ';
  return `${sign}${formatBalance(Math.abs(n))} €`;
}

export function CashflowCard({ series, granularity, onGranularityChange }: CashflowCardProps) {
  const rows = [...series].reverse(); // most recent first

  return (
    <div className="flex flex-col gap-3.5 rounded-lg border border-line-2 bg-ink-2 px-[22px] pb-4 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-y-2">
        <div className="flex min-w-0 items-center gap-3.5">
          <Overline>— I</Overline>
          <span className="truncate font-sans text-sm font-medium tracking-[-0.012em]">
            Gains et pertes · tous comptes
          </span>
        </div>
        <div className="flex gap-1.5">
          <Chip
            active={granularity === 'month'}
            onClick={() => {
              onGranularityChange('month');
            }}
          >
            Mois
          </Chip>
          <Chip
            active={granularity === 'year'}
            onClick={() => {
              onGranularityChange('year');
            }}
          >
            Année
          </Chip>
        </div>
      </div>

      {rows.length > 0 ? (
        <table className="w-full border-collapse font-sans text-[13px]">
          <tbody>
            {rows.map((r) => (
              <tr key={r.period} className="border-t border-line-2/70">
                <td className="py-2 text-paper-soft">{periodLabel(r.period, granularity)}</td>
                <td className="py-2 text-right tabular-nums text-paper-mute">
                  {formatBalance(r.income)} €
                </td>
                <td className="py-2 text-right tabular-nums text-paper-mute">
                  {formatBalance(r.expense)} €
                </td>
                <td
                  className="py-2 text-right font-medium tabular-nums"
                  style={{ color: r.net >= 0 ? 'var(--sage)' : 'var(--coral)' }}
                >
                  {signedEuro(r.net)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="flex min-h-[120px] w-full items-center justify-center text-sm text-paper-mute">
          Pas encore de données — importez un relevé.
        </div>
      )}
    </div>
  );
}
