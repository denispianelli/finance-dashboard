import { useState } from 'react';
import { Eye, Trash2 } from 'lucide-react';
import type { LoanWithStats } from '@shared/types/patrimoine';
import { Card, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { formatEuro } from '../../lib/euro';

const eur = formatEuro;

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-sans text-[11px] text-paper-dim">{label}</span>
      <span className="font-mono text-[13px] text-paper">{value}</span>
      {sub && <span className="font-sans text-[10px] text-paper-dim">{sub}</span>}
    </div>
  );
}

export function LoanCard({
  loan,
  onView,
  onDelete,
}: {
  loan: LoanWithStats;
  onView: (loan: LoanWithStats) => void;
  onDelete: (id: string) => void;
}) {
  const next = loan.nextInstallment;
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{loan.name}</CardTitle>
        {!confirmingDelete && (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onView(loan);
              }}
              aria-label="Voir le tableau"
            >
              <Eye size={14} strokeWidth={1.8} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setConfirmingDelete(true);
              }}
              aria-label="Supprimer le prêt"
            >
              <Trash2 size={14} strokeWidth={1.8} />
            </Button>
          </div>
        )}
      </CardHeader>
      {confirmingDelete ? (
        <div className="flex items-center gap-3">
          <span className="flex-1 font-sans text-[13px] text-paper-soft">
            Supprimer « {loan.name} » ? Le tableau d&apos;amortissement importé sera perdu.
          </span>
          <button
            type="button"
            onClick={() => {
              onDelete(loan.id);
              setConfirmingDelete(false);
            }}
            className="rounded-md px-2 py-1 font-sans text-[12px] font-medium text-coral hover:bg-ink-3"
          >
            Supprimer
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirmingDelete(false);
            }}
            className="rounded-md px-2 py-1 font-sans text-[12px] text-paper-dim hover:bg-ink-3"
          >
            Annuler
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Capital restant dû" value={eur(loan.crd)} />
          <Stat label="Quote-part" value={`${String(Math.round(loan.share * 100))} %`} />
          <Stat label="Fin du prêt" value={loan.endDate} />
          <Stat
            label="Prochaine échéance"
            value={next ? `${eur(next.payment)} · ${next.dueDate}` : '—'}
          />
          <Stat
            label="Coût cette année"
            value={eur(loan.interestThisYear + loan.insuranceThisYear)}
            sub={`dont assurance ${eur(loan.insuranceThisYear)}`}
          />
          <Stat
            label="Coût restant"
            value={eur(loan.remainingCost + loan.remainingInsurance)}
            sub={`dont assurance ${eur(loan.remainingInsurance)}`}
          />
        </div>
      )}
    </Card>
  );
}
