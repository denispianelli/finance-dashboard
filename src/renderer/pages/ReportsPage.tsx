import { useMemo, useState } from 'react';
import type { CashflowPoint, DashboardTransaction } from '@shared/types/dashboard';
import { Kpi } from '../components/dashboard/Kpi';
import { KpiGrid } from '../components/dashboard/layout';
import { PeriodPicker } from '../components/reports/PeriodPicker';
import { CashflowAreaChart } from '../components/reports/CashflowAreaChart';
import {
  NetWorthCard,
  TopCategoriesCard,
  RecurringCard,
  YearComparisonCard,
  BiggestMovementsCard,
} from '../components/reports/ReportSections';
import { useCashflow } from '../hooks/useCashflow';
import { useReports } from '../hooks/useReports';
import {
  topCategories,
  biggestMovements,
  availablePeriods,
  monthlyNetForYear,
  dailyCumulativeNet,
  txInPeriod,
  periodTotals,
  previousPeriod,
  type ReportPeriod,
} from '../lib/reports';
import { formatBalance } from '../lib/dashboardMap';
import { monthLabelFr } from '../lib/dashboardCharts';

function totalsAsPoint(txns: DashboardTransaction[], period: ReportPeriod): CashflowPoint {
  const t = periodTotals(txInPeriod(txns, period));
  return { period: period.value, income: t.income, expense: t.expense, net: t.net };
}

function periodTitle(period: ReportPeriod): string {
  const label =
    period.granularity === 'year'
      ? period.value
      : `${monthLabelFr(period.value)} ${period.value.slice(0, 4)}`;
  return `Gains et pertes · ${label}`;
}

/**
 * Reports — the retrospective surface (ADR-009). A period selector (a specific
 * year or month) scopes the whole page; the gained/lost trend is a shadcn area
 * chart. Net worth stays "actuel" (point-in-time). Reads F1/F2/D1 channels.
 */
export function ReportsPage() {
  const { series } = useCashflow();
  const { netWorth, recurring, transactions } = useReports();

  const available = useMemo(() => availablePeriods(series), [series]);
  // Derived current period: the user's pick, else the latest available year.
  // (Derived rather than an effect, so no setState-in-effect cascade.)
  const [picked, setPicked] = useState<ReportPeriod | null>(null);
  const firstYear = available.years[0];
  const period: ReportPeriod | null =
    picked ?? (firstYear !== undefined ? { granularity: 'year', value: firstYear } : null);

  if (period === null) {
    return <p className="py-8 text-center text-sm text-paper-mute">Chargement des rapports…</p>;
  }

  const chartData =
    period.granularity === 'year'
      ? monthlyNetForYear(series, period.value)
      : dailyCumulativeNet(transactions, period.value);

  const scoped = txInPeriod(transactions, period);
  const totals = periodTotals(scoped);
  const rate = totals.income > 0 ? (totals.net / totals.income) * 100 : null;

  const prev = previousPeriod(period);
  const hasPrev = txInPeriod(transactions, prev).length > 0;
  const current = totalsAsPoint(transactions, period);
  const previous = hasPrev ? totalsAsPoint(transactions, prev) : null;
  const comparison = {
    current,
    previous,
    netDelta: previous ? current.net - previous.net : null,
  };

  return (
    <div className="flex flex-col gap-4">
      <PeriodPicker period={period} available={available} onChange={setPicked} />

      <KpiGrid>
        <Kpi
          label="Patrimoine net"
          value={netWorth === null ? '—' : `${formatBalance(netWorth.total)} €`}
          ctx="actuel · tous comptes"
        />
        <Kpi
          label="Taux d'épargne"
          value={rate === null ? '—' : `${rate.toFixed(0)} %`}
          ctx="sur la période"
        />
        <Kpi
          label="Abonnements"
          value={recurring === null ? '—' : `${formatBalance(recurring.monthlyTotal)} €`}
          ctx="par mois"
        />
      </KpiGrid>

      <CashflowAreaChart data={chartData} title={periodTitle(period)} />

      <NetWorthCard netWorth={netWorth} />
      <YearComparisonCard comparison={comparison} />
      <TopCategoriesCard categories={topCategories(scoped)} />
      <RecurringCard recurring={recurring} />
      <BiggestMovementsCard movements={biggestMovements(scoped)} />
    </div>
  );
}
