import { useEffect, useState } from 'react';
import { ipc } from '../../ipc/client';
import { formatAmount } from '../../lib/euro';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import type { LoanInstallmentDTO } from '@shared/types/patrimoine';

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
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-h-[80vh] max-w-3xl">
        <DialogHeader>
          <DialogTitle>Amortissement — {loanName}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[64vh] overflow-y-auto">
          <table className="w-full font-mono text-[12px] tabular-nums text-paper">
            <thead className="sticky top-0 bg-ink-1 text-paper-dim">
              <tr className="border-b border-line-2 text-left">
                <th className="px-2 py-1.5 font-sans text-[11px] font-medium">Date</th>
                <th className="px-2 py-1.5 text-right font-sans text-[11px] font-medium">
                  Capital
                </th>
                <th className="px-2 py-1.5 text-right font-sans text-[11px] font-medium">
                  Intérêts
                </th>
                <th className="px-2 py-1.5 text-right font-sans text-[11px] font-medium">
                  Assurance
                </th>
                <th className="px-2 py-1.5 text-right font-sans text-[11px] font-medium">
                  Échéance
                </th>
                <th className="px-2 py-1.5 text-right font-sans text-[11px] font-medium">CRD</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line-1">
                  <td className="px-2 py-1">{r.dueDate}</td>
                  <td className="px-2 py-1 text-right">{formatAmount(r.capital)}</td>
                  <td className="px-2 py-1 text-right">{formatAmount(r.interest)}</td>
                  <td className="px-2 py-1 text-right">{formatAmount(r.insurance)}</td>
                  <td className="px-2 py-1 text-right">{formatAmount(r.payment)}</td>
                  <td className="px-2 py-1 text-right">{formatAmount(r.balanceAfter)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
