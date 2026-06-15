import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import type { AppOutletContext } from '../lib/outletContext';
import type { LoanWithStats } from '@shared/types/patrimoine';
import { usePatrimoine } from '../hooks/usePatrimoine';
import { Card, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Overline } from '../components/ui/overline';
import { LoanCard } from '../components/patrimoine/LoanCard';
import { AssetsCard } from '../components/patrimoine/AssetsCard';
import { AllocationCard } from '../components/patrimoine/AllocationCard';
import { ClassManagerDialog } from '../components/patrimoine/ClassManagerDialog';
import { AmortizationTableDialog } from '../components/patrimoine/AmortizationTableDialog';
import { AddLoanDialog } from '../components/patrimoine/AddLoanDialog';

export function PatrimoinePage() {
  const { refreshToken, notifyDataChanged } = useOutletContext<AppOutletContext>();
  const {
    loans,
    assets,
    allocation,
    classes,
    holdings,
    reload,
    deleteLoan,
    upsertAsset,
    deleteAsset,
    detectPayments,
    upsertClass,
    deleteClass,
    assignClass,
  } = usePatrimoine(refreshToken);
  const [viewing, setViewing] = useState<LoanWithStats | null>(null);
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState(false);

  const onChanged = () => {
    reload();
    notifyDataChanged();
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3.5">
            <Overline>— I</Overline>
            <CardTitle>Prêts</CardTitle>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setAdding(true);
            }}
          >
            <Plus size={14} strokeWidth={1.8} /> Ajouter un prêt
          </Button>
        </CardHeader>
        {loans.length === 0 ? (
          <p className="py-6 text-center text-sm text-paper-mute">
            Aucun prêt — importe ton tableau d&apos;amortissement pour commencer.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {loans.map((l) => (
              <LoanCard
                key={l.id}
                loan={l}
                onView={setViewing}
                onDelete={(id) => {
                  void deleteLoan(id).then(notifyDataChanged);
                }}
                onDetect={(id) => {
                  void detectPayments(id).then((n) => {
                    toast.success(
                      `${String(n)} mensualité${n === 1 ? '' : 's'} appariée${n === 1 ? '' : 's'}`,
                    );
                    notifyDataChanged();
                  });
                }}
              />
            ))}
          </div>
        )}
      </Card>

      <AllocationCard
        allocation={allocation}
        onManage={() => {
          setManaging(true);
        }}
      />

      <AssetsCard
        assets={assets}
        classes={classes}
        onSave={(input) => {
          void upsertAsset(input).then(notifyDataChanged);
        }}
        onDelete={(id) => {
          void deleteAsset(id).then(notifyDataChanged);
        }}
      />

      {viewing && (
        <AmortizationTableDialog
          loanId={viewing.id}
          loanName={viewing.name}
          onClose={() => {
            setViewing(null);
          }}
        />
      )}
      {adding && (
        <AddLoanDialog
          onClose={() => {
            setAdding(false);
          }}
          onCreated={onChanged}
        />
      )}
      <ClassManagerDialog
        open={managing}
        onOpenChange={setManaging}
        classes={classes}
        holdings={holdings}
        onUpsertClass={(i) => {
          void upsertClass(i).then(notifyDataChanged);
        }}
        onDeleteClass={(id) => {
          void deleteClass(id).then(notifyDataChanged);
        }}
        onAssignClass={(k, id, cid) => {
          void assignClass(k, id, cid).then(notifyDataChanged);
        }}
      />
    </div>
  );
}
