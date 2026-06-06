import { CashflowCard } from '../components/dashboard/CashflowCard';
import { Kpi } from '../components/dashboard/Kpi';
import { KpiGrid } from '../components/dashboard/layout';
import {
  NetWorthCard,
  TopCategoriesCard,
  RecurringCard,
  YearComparisonCard,
  BiggestMovementsCard,
} from '../components/reports/ReportSections';
import { useCashflow } from '../hooks/useCashflow';
import { useReports } from '../hooks/useReports';
import { topCategories, savingsRate, yearOverYear, biggestMovements } from '../lib/reports';
import { formatBalance } from '../lib/dashboardMap';

/**
 * Reports — the retrospective surface (ADR-009). The seven analyses: gained/lost
 * (CashflowCard, US1), net worth, top categories, savings rate, subscriptions,
 * year-vs-N-1, biggest movements. Reads F1/F2/D1 channels via the hooks; no I/O.
 */
export function ReportsPage() {
  const { series, granularity, setGranularity } = useCashflow();
  const { netWorth, recurring, transactions, yearSeries } = useReports();

  const categories = topCategories(transactions);
  const movements = biggestMovements(transactions);
  const yoy = yearOverYear(yearSeries);
  const rate = savingsRate(yearSeries);

  return (
    <div className="flex flex-col gap-4">
      <KpiGrid>
        <Kpi
          label="Patrimoine net"
          value={netWorth === null ? '—' : `${formatBalance(netWorth.total)} €`}
          ctx="tous comptes"
        />
        <Kpi
          label="Taux d'épargne"
          value={rate === null ? '—' : `${rate.toFixed(0)} %`}
          ctx="revenus mis de côté"
        />
        <Kpi
          label="Abonnements"
          value={recurring === null ? '—' : `${formatBalance(recurring.monthlyTotal)} €`}
          ctx="par mois"
        />
      </KpiGrid>

      <CashflowCard
        series={series}
        granularity={granularity}
        onGranularityChange={setGranularity}
      />

      <NetWorthCard netWorth={netWorth} />
      <YearComparisonCard comparison={yoy} />
      <TopCategoriesCard categories={categories} />
      <RecurringCard recurring={recurring} />
      <BiggestMovementsCard movements={movements} />
    </div>
  );
}
