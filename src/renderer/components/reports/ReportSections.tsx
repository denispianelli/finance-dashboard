import type { ReactNode } from 'react';
import type { DashboardTransaction } from '@shared/types/dashboard';
import type { RecurringReport } from '@shared/types/recurring';
import { Overline } from '../ui/overline';
import { formatBalance } from '../../lib/dashboardMap';
import { monthLabelFr } from '../../lib/dashboardCharts';
import type { CategoryShare } from '../../lib/reports';

function Section({ mark, title, children }: { mark: string; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3.5 rounded-lg border border-line-2 bg-ink-2 px-[22px] pb-4 pt-5">
      <div className="flex items-center gap-3.5">
        <Overline>{mark}</Overline>
        <span className="font-sans text-sm font-medium tracking-[-0.012em]">{title}</span>
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[80px] items-center justify-center text-sm text-paper-mute">
      {children}
    </div>
  );
}

function euro(n: number): string {
  return `${formatBalance(n)} €`;
}

function signedEuro(n: number): string {
  return `${n >= 0 ? '+ ' : '− '}${formatBalance(Math.abs(n))} €`;
}

function dayLabel(date: string): string {
  return `${monthLabelFr(date.slice(0, 7))} ${date.slice(0, 4)}`;
}

/** Top spending categories as ranked horizontal bars. */
export function TopCategoriesCard({ categories }: { categories: CategoryShare[] }) {
  const max = categories.reduce((m, c) => Math.max(m, c.total), 0);
  return (
    <Section mark="— III" title="Où part l'argent">
      {categories.length === 0 ? (
        <Empty>Pas encore de dépenses catégorisées.</Empty>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {categories.map((c) => (
            <li key={c.name} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between font-sans text-[12.5px]">
                <span className="text-paper-soft">{c.name}</span>
                <span className="tabular-nums text-paper-mute">{euro(c.total)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-line-2/60">
                <div
                  className="h-full rounded-full bg-brass"
                  style={{ width: `${String(max > 0 ? (c.total / max) * 100 : 0)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function RecurringCard({ recurring }: { recurring: RecurringReport | null }) {
  const subs = recurring?.subscriptions ?? [];
  return (
    <Section mark="— IV" title="Abonnements & récurrents">
      {subs.length === 0 ? (
        <Empty>Aucun abonnement détecté.</Empty>
      ) : (
        <>
          <table className="w-full border-collapse font-sans text-[13px]">
            <tbody>
              {subs.map((s) => (
                <tr key={s.label} className="border-t border-line-2/70">
                  <td className="py-1.5 text-paper-soft">{s.label}</td>
                  <td className="py-1.5 text-paper-dim">
                    {s.cadence === 'monthly' ? 'mensuel' : 'annuel'}
                  </td>
                  <td className="py-1.5 text-paper-dim">échéance {s.nextDueDate}</td>
                  <td className="py-1.5 text-right tabular-nums text-paper-mute">
                    {euro(s.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-between border-t border-line-2 pt-2 font-sans text-[13px]">
            <span className="text-paper-mute">Coût mensuel</span>
            <span className="font-medium tabular-nums text-paper">
              {euro(recurring?.monthlyTotal ?? 0)} / mois
            </span>
          </div>
        </>
      )}
    </Section>
  );
}

export function BiggestMovementsCard({ movements }: { movements: DashboardTransaction[] }) {
  return (
    <Section mark="— V" title="Plus gros mouvements">
      {movements.length === 0 ? (
        <Empty>Aucun mouvement.</Empty>
      ) : (
        <table className="w-full border-collapse font-sans text-[13px]">
          <tbody>
            {movements.map((t) => (
              <tr key={t.id} className="border-t border-line-2/70">
                <td className="py-1.5 text-paper-dim">{dayLabel(t.date)}</td>
                <td className="max-w-0 truncate py-1.5 text-paper-soft">{t.labelClean}</td>
                <td
                  className="py-1.5 text-right tabular-nums"
                  style={{ color: t.amount >= 0 ? 'var(--sage)' : 'var(--coral)' }}
                >
                  {signedEuro(t.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}
