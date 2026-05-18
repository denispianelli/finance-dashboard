import type { ReviewTransaction } from '@shared/types/import';
import { Checkbox } from './ui/checkbox';

interface TransactionReviewTableProps {
  transactions: ReviewTransaction[];
  selected: Set<string>;
  onToggleTx: (txHash: string) => void;
  onToggleAll: () => void;
}

export function TransactionReviewTable({
  transactions,
  selected,
  onToggleTx,
  onToggleAll,
}: TransactionReviewTableProps) {
  const nonDuplicates = transactions.filter((tx) => !tx.isDuplicate);
  const allSelected =
    nonDuplicates.length > 0 && nonDuplicates.every((tx) => selected.has(tx.tx_hash));

  return (
    <div className="max-h-96 overflow-y-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-muted/80">
          <tr>
            <th className="w-10 px-3 py-2 text-left">
              <Checkbox
                checked={allSelected}
                onCheckedChange={() => {
                  onToggleAll();
                }}
                aria-label="Tout sélectionner"
              />
            </th>
            <th className="px-3 py-2 text-left font-medium">Date</th>
            <th className="px-3 py-2 text-left font-medium">Libellé</th>
            <th className="px-3 py-2 text-right font-medium">Montant</th>
            <th className="px-3 py-2 text-center font-medium">Statut</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => (
            <tr
              key={tx.tx_hash}
              aria-label={tx.tx_hash}
              className={tx.isDuplicate ? 'opacity-40 italic' : ''}
            >
              <td className="px-3 py-2">
                <Checkbox
                  checked={selected.has(tx.tx_hash)}
                  onCheckedChange={() => {
                    onToggleTx(tx.tx_hash);
                  }}
                  disabled={tx.isDuplicate}
                  aria-label={tx.tx_hash}
                />
              </td>
              <td className="px-3 py-2 tabular-nums">{tx.date}</td>
              <td className="px-3 py-2">{tx.label}</td>
              <td
                className="px-3 py-2 text-right tabular-nums"
                style={{ color: tx.amount < 0 ? 'hsl(var(--coral))' : 'hsl(var(--sage))' }}
              >
                {tx.amount.toLocaleString('fr-FR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </td>
              <td className="px-3 py-2 text-center">
                {tx.isDuplicate ? (
                  <span
                    className="rounded px-1.5 py-0.5 text-xs text-muted-foreground"
                    style={{ background: 'hsl(var(--muted))' }}
                  >
                    Doublon
                  </span>
                ) : (
                  <span
                    className="rounded px-1.5 py-0.5 text-xs font-medium"
                    style={{ background: 'hsl(var(--sage-soft))', color: 'hsl(var(--sage))' }}
                  >
                    Nouveau
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
