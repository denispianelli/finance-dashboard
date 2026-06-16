import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Overline } from '../components/ui/overline';
import { PeriodPicker } from '../components/reports/PeriodPicker';
import { VerdictRow, type VerdictKind } from '../components/reports/VerdictRow';
import { MonthlyFlowChart } from '../components/reports/MonthlyFlowChart';
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
  monthlyFlowForYear,
  dailyFlow,
  txInPeriod,
  previousPeriod,
  periodVerdict,
  countableTransactions,
  type ReportPeriod,
} from '../lib/reports';
import { monthLabelFr } from '../lib/dashboardCharts';
import type { AppOutletContext } from '../lib/outletContext';

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
  const { refreshToken, openImport } = useOutletContext<AppOutletContext>();
  const { series, loading } = useCashflow(refreshToken);
  const { netWorth, recurring, transactions } = useReports(refreshToken);

  const available = useMemo(() => availablePeriods(series), [series]);
  const [picked, setPicked] = useState<ReportPeriod | null>(null);
  const [detail, setDetail] = useState<VerdictKind | null>(null);
  const firstYear = available.years[0];
  const period: ReportPeriod | null =
    picked ?? (firstYear !== undefined ? { granularity: 'year', value: firstYear } : null);

  if (period === null) {
    // Distinguish "still loading" from "loaded but empty" — a fresh user used to
    // get a perpetual "Chargement…" instead of an invitation to import.
    return loading ? (
      <p className="py-8 text-center text-sm text-paper-mute">Chargement des rapports…</p>
    ) : (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-sm text-paper-mute">
          Aucune donnée à analyser — importez un relevé pour commencer.
        </p>
        <button
          type="button"
          onClick={openImport}
          className="rounded-sm border border-line-2 bg-ink-3 px-3 py-1.5 font-sans text-[13px] font-medium text-paper-soft transition-colors hover:bg-ink-4"
        >
          Importer un relevé
        </button>
      </div>
    );
  }

  const scoped = txInPeriod(transactions, period);
  const prev = txInPeriod(transactions, previousPeriod(period));
  const verdict = periodVerdict(scoped, prev);

  const chartData =
    period.granularity === 'year'
      ? monthlyFlowForYear(series, period.value)
      : dailyFlow(transactions, period.value);
  const chartTitle =
    period.granularity === 'year'
      ? 'Entrées et sorties · par mois'
      : 'Entrées et sorties · par jour';

  const detailSign = detail === 'income' ? 'in' : detail === 'expense' ? 'out' : undefined;
  const detailTxns = detail !== null ? countableTransactions(scoped, detailSign) : [];
  const detailTitle =
    detail === 'income'
      ? `Entrées · ${periodLabel(period)}`
      : detail === 'expense'
        ? `Sorties · ${periodLabel(period)}`
        : `Flux réels · ${periodLabel(period)}`;

  // The serif page title lives in the Topbar; this header carries the editorial
  // section overline + the selected-period label, per the design-system kit.
  const headerLabel =
    period.granularity === 'year'
      ? `Année ${period.value}`
      : `${monthLabelFr(period.value).replace(/^./, (c) => c.toUpperCase())} ${period.value.slice(0, 4)}`;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3.5">
          <Overline>
            {period.granularity === 'year' ? 'Rapport annuel' : 'Rapport mensuel'}
          </Overline>
          <span className="font-sans font-semibold text-[20px] leading-none text-paper">
            {headerLabel}
          </span>
        </div>
        <PeriodPicker period={period} available={available} onChange={setPicked} />
      </div>

      <VerdictRow verdict={verdict} onSelect={setDetail} />

      <FlowDetailDialog
        open={detail !== null}
        onOpenChange={(o) => {
          if (!o) setDetail(null);
        }}
        title={detailTitle}
        transactions={detailTxns}
      />

      <MonthlyFlowChart data={chartData} title={chartTitle} />

      <div className="grid gap-3.5 lg:grid-cols-2">
        <CategoryDonut
          overline={period.granularity === 'year' ? "Sur l'année" : 'Sur le mois'}
          title="D'où vient l'argent"
          slices={categoryBreakdown(scoped, 'in')}
          centerTop="Entrées"
          emptyHint="Aucune entrée sur la période."
        />
        <CategoryDonut
          overline={period.granularity === 'year' ? "Sur l'année" : 'Sur le mois'}
          title="Où part l'argent"
          slices={categoryBreakdown(scoped, 'out')}
          centerTop="Sorties"
          emptyHint="Aucune dépense sur la période."
        />
      </div>

      <div className="grid gap-3.5 lg:grid-cols-[1fr_1.25fr]">
        <NetWorthDonut netWorth={netWorth} />
        <RecurringCard recurring={recurring} />
      </div>

      <BiggestMovementsCard movements={biggestMovements(scoped)} />
    </>
  );
}
