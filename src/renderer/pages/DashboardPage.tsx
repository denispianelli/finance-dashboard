import { useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import type { ChartRange } from '@shared/types/dashboard';
import { Button } from '../components/ui/button';
import { Overline } from '../components/ui/overline';
import { Bento, Tile } from '../components/dashboard/Bento';
import { HeroBalanceTile } from '../components/dashboard/HeroBalanceTile';
import { SpendingDonutTile } from '../components/dashboard/SpendingDonutTile';
import { AccountsMiniTile } from '../components/dashboard/AccountsMiniTile';
import { Kpi } from '../components/dashboard/Kpi';
import { ChartCard } from '../components/dashboard/ChartCard';
import { Insight, Quote, QuoteNum } from '../components/dashboard/Insight';
import { TxTable } from '../components/dashboard/TxTable';
import { RuleDialog, type RuleProposal } from '../components/categories/RuleDialog';
import { useDashboard } from '../hooks/useDashboard';
import { useBalanceSeries } from '../hooks/useBalanceSeries';
import { toAccount, toTxRow } from '../lib/dashboardMap';
import { formatEuro } from '../lib/euro';
import {
  kpiDelta,
  latestMonth,
  monthLabelFr,
  sparkPoints,
  splitEuro,
  topSpendingCategories,
} from '../lib/dashboardCharts';
import type { AppOutletContext } from '../lib/outletContext';

/** How many of the latest transactions the dashboard card previews. */
const RECENT_LIMIT = 10;

/** Neutral dot color for uncategorized spending. */
const NEUTRAL_COLOR = '#6E6E78';

export function DashboardPage() {
  const { refreshToken } = useOutletContext<AppOutletContext>();
  const navigate = useNavigate();
  const [ruleProposal, setRuleProposal] = useState<RuleProposal | null>(null);
  const {
    accounts,
    transactions,
    metrics,
    categories,
    selectedAccountId,
    reassign,
    refresh,
    createCategory,
  } = useDashboard(refreshToken, { onProposeRule: setRuleProposal });

  const { series, balance } = metrics;
  const last = series.at(-1);
  const prev = series.length >= 2 ? series[series.length - 2] : undefined;
  const month = latestMonth(series);
  const monthName = month !== null ? monthLabelFr(month) : '';
  const ctxVsPrev = prev ? `vs ${monthLabelFr(prev.month)}` : '';

  const depenses = splitEuro(last ? Math.abs(last.expense) : 0);
  const revenus = splitEuro(last ? last.income : 0);

  const balanceDelta = last && prev ? kpiDelta(last.balance, prev.balance, true) : undefined;
  const expenseDelta =
    last && prev ? kpiDelta(Math.abs(last.expense), Math.abs(prev.expense), false) : undefined;
  const incomeDelta = last && prev ? kpiDelta(last.income, prev.income, true) : undefined;

  const [chartRange, setChartRange] = useState<ChartRange>('1y');
  const { points } = useBalanceSeries(selectedAccountId, chartRange, refreshToken);
  const accountCount = accounts.length;
  const chartCaption =
    month !== null
      ? `${monthName} ${month.slice(0, 4)} · ${String(accountCount)} compte${accountCount > 1 ? 's' : ''}`
      : undefined;

  const topSpending = month !== null ? topSpendingCategories(transactions, month) : [];
  const [topCat, ...restCats] = topSpending;

  // Build a name→color map from transactions so we can colour the donut segments.
  const catColorByName = new Map<string, string>();
  for (const tx of transactions) {
    if (tx.categoryName !== null && tx.categoryColor !== null) {
      catColorByName.set(tx.categoryName, tx.categoryColor);
    }
  }

  const spendingSegments = topSpending.map((c) => ({
    key: c.name,
    label: c.name,
    value: c.total,
    color: catColorByName.get(c.name) ?? NEUTRAL_COLOR,
  }));
  const spendingTotal = topSpending.reduce((s, c) => s + c.total, 0);
  const periodLabel = month !== null ? `${monthName} ${month.slice(0, 4)}` : '';

  return (
    <>
      <Bento>
        {/* Row 1–2: Hero (span 4, rowSpan 2) + ChartCard (span 8) */}
        <HeroBalanceTile
          balance={balance}
          series={series.map((s) => s.balance)}
          accounts={accounts.map(toAccount)}
          monthDelta={
            balanceDelta ? { delta: balanceDelta.delta, dir: balanceDelta.deltaDir } : undefined
          }
          monthAmount={last?.net}
        />

        <Tile span={8}>
          <ChartCard
            points={points}
            caption={chartCaption}
            range={chartRange}
            onRangeChange={setChartRange}
          />
        </Tile>

        {/* Row 2 cont: Revenus KPI (span 4) + Dépenses KPI (span 4) */}
        <Tile span={4}>
          <Kpi
            label={`Revenus · ${monthName}`}
            value={revenus.value}
            sub={revenus.sub}
            delta={incomeDelta?.delta}
            deltaDir={incomeDelta?.deltaDir}
            ctx={ctxVsPrev}
            spark={sparkPoints(series.map((s) => s.income))}
            sparkColor="var(--brass)"
          />
        </Tile>

        <Tile span={4}>
          <Kpi
            label={`Dépenses · ${monthName}`}
            value={depenses.value}
            sub={depenses.sub}
            delta={expenseDelta?.delta}
            deltaDir={expenseDelta?.deltaDir}
            ctx={ctxVsPrev}
            spark={sparkPoints(series.map((s) => Math.abs(s.expense)))}
            sparkColor="var(--color-expense)"
          />
        </Tile>

        {/* Row 3: SpendingDonut (span 5) + Insight (span 3) + AccountsMini (span 4) */}
        <SpendingDonutTile
          segments={spendingSegments}
          total={spendingTotal}
          periodLabel={periodLabel}
        />

        <Tile span={3}>
          <Insight>
            {topCat ? (
              <>
                <Quote>
                  Ce mois, ta plus grosse dépense est <QuoteNum>{topCat.name}</QuoteNum> à{' '}
                  <QuoteNum>{formatEuro(topCat.total)}</QuoteNum>.
                </Quote>
                {restCats.length > 0 && (
                  <>
                    <span className="h-px bg-line-2" />
                    <Quote size={15}>Suivie de {restCats.map((c) => c.name).join(', ')}.</Quote>
                  </>
                )}
              </>
            ) : (
              <Quote size={15}>Importez un relevé pour voir où part votre argent ce mois.</Quote>
            )}
          </Insight>
        </Tile>

        <AccountsMiniTile
          accounts={accounts.map(toAccount)}
          onManage={() => {
            void navigate('/accounts');
          }}
        />

        {/* Row 4: Recent transactions (span 12) */}
        <Tile span={12} className="flex flex-col gap-3">
          <div className="flex items-center gap-3.5">
            <Overline>— III</Overline>
            <span className="font-sans text-sm font-semibold text-paper">
              Dernières transactions
            </span>
            <Button asChild variant="ghost" size="sm" className="ml-auto">
              <Link to="/transactions">Tout voir →</Link>
            </Button>
          </div>
          {transactions.length > 0 ? (
            <TxTable
              rows={transactions.slice(0, RECENT_LIMIT).map(toTxRow)}
              categories={categories}
              onReassign={(txId, catId) => {
                const t = transactions.find((tx) => tx.id === txId);
                void reassign(txId, catId, t?.labelClean);
              }}
              onCreateCategory={createCategory}
            />
          ) : (
            <p className="py-8 text-center text-sm text-paper-mute">
              Aucune transaction — importez un relevé pour commencer.
            </p>
          )}
        </Tile>
      </Bento>

      <RuleDialog
        proposal={ruleProposal}
        categories={categories}
        onClose={() => {
          setRuleProposal(null);
        }}
        onCreated={() => {
          refresh();
        }}
      />
    </>
  );
}
