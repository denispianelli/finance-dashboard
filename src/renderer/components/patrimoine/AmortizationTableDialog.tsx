import { useEffect, useState } from 'react';
import { ipc } from '../../ipc/client';
import type { LoanInstallmentDTO } from '@shared/types/patrimoine';

const eur = (n: number): string =>
  new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(n);

export function AmortizationTableDialog({
  loanId,
  loanName,
  onClose,
}: {
  loanId: string;
  loanName: string;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<LoanInstallmentDTO[]>([]);
  useEffect(() => {
    let alive = true;
    void ipc.invoke('patrimoine:listInstallments', { loanId }).then((r) => {
      if (alive) setRows(r.installments);
    });
    return () => {
      alive = false;
    };
  }, [loanId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-8"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-3xl flex-col rounded-lg border border-line-2 bg-ink-2 p-5"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="flex items-center justify-between pb-3">
          <h2 className="font-sans text-sm font-medium text-paper">Amortissement — {loanName}</h2>
          <button type="button" onClick={onClose} className="text-paper-dim hover:text-paper">
            Fermer
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full font-mono text-[12px] text-paper">
            <thead className="sticky top-0 bg-ink-2 text-paper-dim">
              <tr>
                <th className="px-2 py-1 text-left">Date</th>
                <th className="px-2 py-1 text-right">Capital</th>
                <th className="px-2 py-1 text-right">Intérêts</th>
                <th className="px-2 py-1 text-right">Assurance</th>
                <th className="px-2 py-1 text-right">Échéance</th>
                <th className="px-2 py-1 text-right">CRD</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line-1">
                  <td className="px-2 py-1">{r.dueDate}</td>
                  <td className="px-2 py-1 text-right">{eur(r.capital)}</td>
                  <td className="px-2 py-1 text-right">{eur(r.interest)}</td>
                  <td className="px-2 py-1 text-right">{eur(r.insurance)}</td>
                  <td className="px-2 py-1 text-right">{eur(r.payment)}</td>
                  <td className="px-2 py-1 text-right">{eur(r.balanceAfter)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
