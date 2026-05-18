import { useState } from 'react';
import { Card, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Overline } from '../components/ui/overline';
import { AccountTabs } from '../components/dashboard/AccountTabs';
import { KpiGrid, Row2 } from '../components/dashboard/layout';
import { Kpi } from '../components/dashboard/Kpi';
import { ChartCard } from '../components/dashboard/ChartCard';
import { Insight, Quote, QuoteNum } from '../components/dashboard/Insight';
import { TxTable } from '../components/dashboard/TxTable';
import { MOCK_ACCOUNTS, MOCK_TX } from '../components/dashboard/mockDashboard';

export function DashboardPage() {
  const [account, setAccount] = useState('joint');

  return (
    <>
      <AccountTabs accounts={MOCK_ACCOUNTS} activeId={account} onSelect={setAccount} />

      <KpiGrid>
        <Kpi
          label="Solde net"
          value="12 847"
          sub=",32 €"
          delta="+ 4,2 %"
          deltaDir="up"
          ctx="vs. avril"
          spark="0,28 12,22 24,24 36,18 48,16 60,20 72,12 84,8"
          sparkColor="var(--sage, #7AB890)"
        />
        <Kpi
          label="Dépenses · mai"
          value="3 412"
          sub=",18 €"
          delta="+ 8,1 %"
          deltaDir="down"
          ctx="restaurants + 34 %"
          spark="0,24 12,20 24,22 36,16 48,18 60,10 72,14 84,6"
          sparkColor="var(--coral, #E07365)"
        />
        <Kpi
          label="Revenus · mai"
          value="3 240"
          sub=",00 €"
          delta="stable"
          ctx="1 virement"
          spark="0,22 12,22 24,22 36,21 48,22 60,21 72,22 84,22"
          sparkColor="var(--brass)"
        />
        <Kpi
          label="Épargne projetée"
          value="14 280"
          sub=",00 €"
          delta="fin 2026"
          ctx="à ce rythme"
          spark="0,28 12,26 24,22 36,20 48,16 60,12 72,8 84,4"
          sparkColor="#8D7DC4"
        />
      </KpiGrid>

      <Row2>
        <ChartCard />
        <Insight>
          <Quote>
            Tes <QuoteNum>restaurants</QuoteNum> sont à <QuoteNum>+34 %</QuoteNum> ce mois — porté
            surtout par les sorties du week-end.
          </Quote>
          <span className="h-px bg-line-2" />
          <Quote size={15}>
            3 abonnements similaires détectés : <QuoteNum>Netflix</QuoteNum>,{' '}
            <QuoteNum>Disney+</QuoteNum>, <QuoteNum>Apple TV+</QuoteNum>.
          </Quote>
          <span className="h-px bg-line-2" />
          <Quote size={15}>
            À ce rythme, ton épargne atteindra <QuoteNum>14 280 €</QuoteNum> fin 2026.
          </Quote>
          <div className="flex gap-2 pt-1">
            <Button variant="secondary" size="sm">
              Voir le détail
            </Button>
            <Button variant="ghost" size="sm">
              Masquer
            </Button>
          </div>
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
        <TxTable rows={MOCK_TX} />
      </Card>
    </>
  );
}
