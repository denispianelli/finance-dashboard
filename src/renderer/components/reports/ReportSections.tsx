import type { ReactNode } from 'react';
import type { DashboardTransaction, NetWorth } from '@shared/types/dashboard';
import type { RecurringReport } from '@shared/types/recurring';
import { Overline } from '../ui/overline';
import { formatBalance } from '../../lib/dashboardMap';
import { monthLabelFr } from '../../lib/dashboardCharts';
import type { CategoryShare, YearComparison } from '../../lib/reports';

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

export function NetWorthCard({ netWorth }: { netWorth: NetWorth | null }) {
  return (
    <Section mark="— IV" title="Patrimoine · tous comptes">
      {netWorth === null ? (
        <Empty>Aucune donnée.</Empty>
      ) : (
        <>
          <span
            className="font-serif text-[28px] italic leading-none tracking-[-0.02em] text-paper"
            style={{ color: netWorth.total >= 0 ? undefined : 'var(--coral)' }}
          >
            {euro(netWorth.total)}
          </span>
          <table className="w-full border-collapse font-sans text-[13px]">
            <tbody>
              {netWorth.accounts.map((a) => (
                <tr key={a.accountId} className="border-t border-line-2/70">
                  <td className="py-1.5 text-paper-soft">{a.name}</td>
                  <td className="py-1.5 text-right tabular-nums text-paper-mute">
                    {a.balance === null ? '—' : euro(a.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Section>
  );
}

export function TopCategoriesCard({ categories }: { categories: CategoryShare[] }) {
  return (
    <Section mark="— V" title="Où part l'argent">
      {categories.length === 0 ? (
        <Empty>Pas encore de dépenses catégorisées.</Empty>
      ) : (
        <table className="w-full border-collapse font-sans text-[13px]">
          <tbody>
            {categories.map((c) => (
              <tr key={c.name} className="border-t border-line-2/70">
                <td className="py-1.5 text-paper-soft">{c.name}</td>
                <td className="py-1.5 text-right tabular-nums text-paper-mute">{euro(c.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

export function RecurringCard({ recurring }: { recurring: RecurringReport | null }) {
  const subs = recurring?.subscriptions ?? [];
  return (
    <Section mark="— VI" title="Abonnements & récurrents">
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

export function YearComparisonCard({ comparison }: { comparison: YearComparison | null }) {
  return (
    <Section mark="— VII" title="Cette année vs l'an dernier">
      {comparison === null ? (
        <Empty>Pas encore de données annuelles.</Empty>
      ) : (
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 font-sans text-[13px]">
          <span className="text-paper-soft">
            {comparison.current.period} ·{' '}
            <span
              className="font-medium tabular-nums"
              style={{ color: comparison.current.net >= 0 ? 'var(--sage)' : 'var(--coral)' }}
            >
              {signedEuro(comparison.current.net)}
            </span>
          </span>
          {comparison.previous && (
            <span className="text-paper-dim">
              {comparison.previous.period} · {signedEuro(comparison.previous.net)}
            </span>
          )}
          {comparison.netDelta !== null && (
            <span
              className="ml-auto font-medium tabular-nums"
              style={{ color: comparison.netDelta >= 0 ? 'var(--sage)' : 'var(--coral)' }}
            >
              {signedEuro(comparison.netDelta)} vs N-1
            </span>
          )}
        </div>
      )}
    </Section>
  );
}

export function BiggestMovementsCard({ movements }: { movements: DashboardTransaction[] }) {
  return (
    <Section mark="— VIII" title="Plus gros mouvements">
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
