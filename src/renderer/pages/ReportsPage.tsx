import { useMemo, useState } from 'react';
import { PeriodPicker } from '../components/reports/PeriodPicker';
import { VerdictRow, type VerdictKind } from '../components/reports/VerdictRow';
import { CashflowBarChart } from '../components/reports/CashflowBarChart';
import { NetWorthDonut } from '../components/reports/NetWorthDonut';
import { CategoryDonut } from '../components/reports/CategoryDonut';
import { FlowDetailDialog } from '../components/reports/FlowDetailDialog';
import { RecurringCard, BiggestMovementsCard } from '../components/reports/ReportSections';
import { useCashflow } from '../hooks/useCashflow';
import { useReports } from '../hooks/useReports';
import {
  biggestMovements,
  categoryBreakdown,
  availablePeriods,
  monthlyNetForYear,
  dailyCumulativeNet,
  txInPeriod,
  previousPeriod,
  periodVerdict,
  countableTransactions,
  type ReportPeriod,
} from '../lib/reports';
import { monthLabelFr } from '../lib/dashboardCharts';

function periodLabel(period: ReportPeriod): string {
  return period.granularity === 'year'
    ? period.value
    : `${monthLabelFr(period.value)} ${period.value.slice(0, 4)}`;
}

/**
 * Reports — verdict-first. The header carries the period; the hero is three
 * pastilles (Entrées / Sorties / Résultat) answering "did I gain or lose?" for
 * the selected period; then the month-by-month bars and the supporting cards.
 */
export function ReportsPage() {
  const { series } = useCashflow();
  const { netWorth, recurring, transactions } = useReports();

  const available = useMemo(() => availablePeriods(series), [series]);
  const [picked, setPicked] = useState<ReportPeriod | null>(null);
  const [detail, setDetail] = useState<VerdictKind | null>(null);
  const firstYear = available.years[0];
  const period: ReportPeriod | null =
    picked ?? (firstYear !== undefined ? { granularity: 'year', value: firstYear } : null);

  if (period === null) {
    return <p className="py-8 text-center text-sm text-paper-mute">Chargement des rapports…</p>;
  }

  const scoped = txInPeriod(transactions, period);
  const prev = txInPeriod(transactions, previousPeriod(period));
  const verdict = periodVerdict(scoped, prev);

  const chartData =
    period.granularity === 'year'
      ? monthlyNetForYear(series, period.value)
      : dailyCumulativeNet(transactions, period.value);
  const chartTitle = period.granularity === 'year' ? 'Mois par mois' : 'Jour par jour';

  const detailSign = detail === 'income' ? 'in' : detail === 'expense' ? 'out' : undefined;
  const detailTxns = detail !== null ? countableTransactions(scoped, detailSign) : [];
  const detailTitle =
    detail === 'income'
      ? `Entrées · ${periodLabel(period)}`
      : detail === 'expense'
        ? `Sorties · ${periodLabel(period)}`
        : `Flux réels · ${periodLabel(period)}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-sans text-base font-semibold tracking-[-0.015em] text-paper">
          Rapports
        </h1>
        <div className="ml-auto">
          <PeriodPicker period={period} available={available} onChange={setPicked} />
        </div>
      </div>

      <VerdictRow verdict={verdict} periodLabel={periodLabel(period)} onSelect={setDetail} />

      <FlowDetailDialog
        open={detail !== null}
        onOpenChange={(o) => {
          if (!o) setDetail(null);
        }}
        title={detailTitle}
        transactions={detailTxns}
      />

      <CashflowBarChart data={chartData} title={chartTitle} />

      <div className="grid gap-4 lg:grid-cols-2">
        <CategoryDonut
          overline="— II"
          title="Entrées par catégorie"
          slices={categoryBreakdown(scoped, 'in')}
          totalColor="var(--sage)"
          emptyHint="Aucune entrée sur la période."
        />
        <CategoryDonut
          overline="— III"
          title="Sorties par catégorie"
          slices={categoryBreakdown(scoped, 'out')}
          totalColor="var(--coral)"
          emptyHint="Aucune dépense sur la période."
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <NetWorthDonut netWorth={netWorth} />
        <RecurringCard recurring={recurring} />
      </div>

      <BiggestMovementsCard movements={biggestMovements(scoped)} />
    </div>
  );
}
