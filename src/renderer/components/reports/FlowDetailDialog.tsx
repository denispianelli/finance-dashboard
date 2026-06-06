import type { DashboardTransaction } from '@shared/types/dashboard';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { formatEuro, formatSignedEuro } from '../../lib/euro';

export interface FlowDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  transactions: DashboardTransaction[];
}

/** A debugging / drill-down list of the transactions behind a verdict figure. */
export function FlowDetailDialog({
  open,
  onOpenChange,
  title,
  transactions,
}: FlowDetailDialogProps) {
  const total = transactions.reduce((s, t) => s + t.amount, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-line-2 bg-ink-2">
        <DialogHeader>
          <DialogTitle className="font-sans text-sm font-medium text-paper">
            {title} · {transactions.length} transaction{transactions.length > 1 ? 's' : ''}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full border-collapse font-sans text-[12.5px]">
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} className="border-t border-line-2/70">
                  <td className="py-1.5 pr-3 font-mono text-[11px] tabular-nums text-paper-dim">
                    {t.date}
                  </td>
                  <td className="w-full py-1.5 pr-3 text-paper-soft break-words">{t.labelClean}</td>
                  <td
                    className="whitespace-nowrap py-1.5 pl-2 text-right tabular-nums"
                    style={{ color: t.amount >= 0 ? 'var(--sage)' : 'var(--coral)' }}
                  >
                    {formatSignedEuro(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-between border-t border-line-2 pt-2 font-sans text-[13px]">
          <span className="text-paper-mute">Total</span>
          <span className="font-medium tabular-nums text-paper">{formatEuro(total)}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
