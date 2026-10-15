import type { ReactNode } from 'react';
import type { DashboardTransaction } from '@shared/types/dashboard';
import type { RecurringReport } from '@shared/types/recurring';
import { Overline } from '../ui/overline';
import { Money } from '../ui/money';
import { formatEuro } from '../../lib/euro';
import { monthLabelFr } from '../../lib/dashboardCharts';

function Section({
  mark,
  title,
  right,
  children,
}: {
  mark: string;
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3.5 rounded-lg border border-line-2 bg-ink-2 px-[22px] py-5">
      <div className="flex flex-wrap items-center justify-between gap-y-2">
        <div className="flex min-w-0 items-center gap-3.5">
          <Overline>{mark}</Overline>
          <span className="font-sans text-sm font-medium tracking-[-0.012em]">{title}</span>
        </div>
        {right}
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

function dayLabel(date: string): string {
  return `${monthLabelFr(date.slice(0, 7))} ${date.slice(0, 4)}`;
}

export function RecurringCard({ recurring }: { recurring: RecurringReport | null }) {
  const subs = recurring?.subscriptions ?? [];
  const total = (
    <span className="font-mono text-[13px] font-medium text-paper">
      {formatEuro(recurring?.monthlyTotal ?? 0)} / mois
    </span>
  );
  return (
    <Section
      mark="Récurrents"
      title="Abonnements & récurrents"
      right={subs.length > 0 ? total : undefined}
    >
      {subs.length === 0 ? (
        <Empty>Aucun abonnement détecté.</Empty>
      ) : (
        <table className="w-full border-collapse font-sans text-[13px]">
          <tbody>
            {subs.map((s) => (
              <tr key={s.label} className="border-t border-line-2/70">
                <td className="py-2 text-paper-soft">{s.label}</td>
                <td className="py-2 text-paper-dim">
                  {s.cadence === 'monthly' ? 'mensuel' : 'annuel'}
                </td>
                <td className="py-2 font-mono text-[11px] text-paper-dim">
                  échéance {s.nextDueDate}
                </td>
                <td className="py-2 text-right font-mono tabular-nums text-paper-mute">
                  {formatEuro(s.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

export function BiggestMovementsCard({ movements }: { movements: DashboardTransaction[] }) {
  return (
    <Section mark="Faits marquants" title="Plus gros mouvements">
      {movements.length === 0 ? (
        <Empty>Aucun mouvement.</Empty>
      ) : (
        <table className="w-full table-fixed border-collapse font-sans text-[13px]">
          <tbody>
            {movements.map((t) => (
              <tr key={t.id} className="border-t border-line-2/70">
                <td className="w-[130px] py-[9px] font-mono text-[12px] text-paper-dim">
                  {dayLabel(t.date)}
                </td>
                <td className="truncate py-[9px] text-paper-soft">{t.labelClean}</td>
                <td className="w-[150px] py-[9px] text-right">
                  <Money
                    value={t.amount}
                    kind={t.amount >= 0 ? 'income' : 'expense'}
                    className="text-[13px]"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}
