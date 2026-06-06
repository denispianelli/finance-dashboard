import { CashflowCard } from '../components/dashboard/CashflowCard';
import { useCashflow } from '../hooks/useCashflow';

/**
 * Reports — the retrospective surface (ADR-009). A1 ships the consolidated
 * gained/lost section; A2 adds the remaining analyses (net worth, top
 * categories, savings rate, recurring, year-vs-N-1, biggest movements).
 */
export function ReportsPage() {
  const { series, granularity, setGranularity } = useCashflow();
  return (
    <div className="flex flex-col gap-4">
      <CashflowCard
        series={series}
        granularity={granularity}
        onGranularityChange={setGranularity}
      />
    </div>
  );
}
