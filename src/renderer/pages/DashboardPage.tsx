import { useOutletContext } from 'react-router-dom';
import { Card, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Overline } from '../components/ui/overline';
import { AccountTabs } from '../components/dashboard/AccountTabs';
import { KpiGrid, Row2 } from '../components/dashboard/layout';
import { Kpi } from '../components/dashboard/Kpi';
import { ChartCard } from '../components/dashboard/ChartCard';
import { Insight, Quote, QuoteNum } from '../components/dashboard/Insight';
import { TxTable } from '../components/dashboard/TxTable';
import { useDashboard } from '../hooks/useDashboard';
import { toAccount, toTxRow, formatBalance } from '../lib/dashboardMap';
import {
  chartGeometry,
  kpiDelta,
  latestMonth,
  monthLabelFr,
  sparkPoints,
  splitEuro,
  topSpendingCategories,
} from '../lib/dashboardCharts';
import type { AppOutletContext } from '../lib/outletContext';

export function DashboardPage() {
  const { refreshToken } = useOutletContext<AppOutletContext>();
  const { accounts, transactions, metrics, selectedAccountId, selectAccount } =
    useDashboard(refreshToken);

  const { series, balance } = metrics;
  const last = series.at(-1);
  const prev = series.length >= 2 ? series[series.length - 2] : undefined;
  const month = latestMonth(series);
  const monthName = month !== null ? monthLabelFr(month) : '';
  const ctxVsPrev = prev ? `vs ${monthLabelFr(prev.month)}` : '';

  const soldeNet = splitEuro(balance);
  const depenses = splitEuro(last ? Math.abs(last.expense) : 0);
  const revenus = splitEuro(last ? last.income : 0);
  const netMois = splitEuro(last ? last.net : 0);

  const balanceDelta = last && prev ? kpiDelta(last.balance, prev.balance, true) : undefined;
  const expenseDelta =
    last && prev ? kpiDelta(Math.abs(last.expense), Math.abs(prev.expense), false) : undefined;
  const incomeDelta = last && prev ? kpiDelta(last.income, prev.income, true) : undefined;

  const geom = chartGeometry(series.map((s) => s.balance));
  const accountCount = accounts.length;
  const chartCaption =
    month !== null
      ? `${monthName} ${month.slice(0, 4)} · ${String(accountCount)} compte${accountCount > 1 ? 's' : ''}`
      : undefined;

  const [topCat, ...restCats] = month !== null ? topSpendingCategories(transactions, month) : [];

  return (
    <>
      <AccountTabs
        accounts={accounts.map(toAccount)}
        activeId={selectedAccountId ?? ''}
        onSelect={selectAccount}
      />

      <KpiGrid>
        <Kpi
          label="Solde net"
          value={soldeNet.value}
          sub={soldeNet.sub}
          delta={balanceDelta?.delta}
          deltaDir={balanceDelta?.deltaDir}
          ctx={ctxVsPrev}
          spark={sparkPoints(series.map((s) => s.balance))}
          sparkColor="var(--sage)"
        />
        <Kpi
          label={`Dépenses · ${monthName}`}
          value={depenses.value}
          sub={depenses.sub}
          delta={expenseDelta?.delta}
          deltaDir={expenseDelta?.deltaDir}
          ctx={ctxVsPrev}
          spark={sparkPoints(series.map((s) => Math.abs(s.expense)))}
          sparkColor="var(--coral)"
        />
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
        <Kpi
          label={`Net · ${monthName}`}
          value={netMois.value}
          sub={netMois.sub}
          ctx="revenus − dépenses"
          spark={sparkPoints(series.map((s) => s.net))}
          sparkColor="#8D7DC4"
        />
      </KpiGrid>

      <Row2>
        <ChartCard line={geom.line} area={geom.area} caption={chartCaption} />
        <Insight>
          {topCat ? (
            <>
              <Quote>
                Ce mois, ta plus grosse dépense est <QuoteNum>{topCat.name}</QuoteNum> à{' '}
                <QuoteNum>{formatBalance(topCat.total)} €</QuoteNum>.
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
      </Row2>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3.5">
            <Overline>— III</Overline>
            <CardTitle>Dernières transactions</CardTitle>
          </div>
          <Button variant="ghost" size="sm">
            Tout voir →
          </Button>
        </CardHeader>
        {transactions.length > 0 ? (
          <TxTable rows={transactions.map(toTxRow)} />
        ) : (
          <p className="py-8 text-center text-sm text-paper-mute">
            Aucune transaction — importez un relevé pour commencer.
          </p>
        )}
      </Card>
    </>
  );
}
