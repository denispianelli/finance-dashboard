import { Sparkles } from 'lucide-react';
import type { ReviewTransaction } from '@shared/types/import';
import type { CategoryDTO, CreateCategoryInput } from '@shared/types/category';
import { CategoryPicker } from './dashboard/CategoryPicker';
import { Checkbox } from './ui/checkbox';

/** Neutral category shown for a residual (uncategorized) row in Review. */
const UNCATEGORIZED = { name: 'Non catégorisé', color: 'hsl(var(--muted-foreground))' };

interface ReviewCategory {
  categoryId: string | null;
  userModified: boolean;
}

interface TransactionReviewTableProps {
  transactions: ReviewTransaction[];
  selected: Set<string>;
  onToggleTx: (txHash: string) => void;
  onToggleAll: () => void;
  categories: CategoryDTO[];
  reviewCategories: Map<string, ReviewCategory>;
  pending: Set<string>;
  suggested: Set<string>;
  onPickCategory: (txHash: string, categoryId: string | null) => void;
  onCreateCategory: (input: CreateCategoryInput) => Promise<CategoryDTO>;
}

export function TransactionReviewTable({
  transactions,
  selected,
  onToggleTx,
  onToggleAll,
  categories,
  reviewCategories,
  pending,
  suggested,
  onPickCategory,
  onCreateCategory,
}: TransactionReviewTableProps) {
  const nonDuplicates = transactions.filter((tx) => !tx.isDuplicate);
  const allSelected =
    nonDuplicates.length > 0 && nonDuplicates.every((tx) => selected.has(tx.tx_hash));

  function resolveCurrent(categoryId: string | null): { name: string; color: string } {
    if (categoryId === null) return UNCATEGORIZED;
    const cat = categories.find((c) => c.id === categoryId);
    if (cat === undefined) return UNCATEGORIZED;
    return { name: cat.name, color: cat.color ?? UNCATEGORIZED.color };
  }

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
            <th className="px-3 py-2 text-left font-medium">Catégorie</th>
            <th className="px-3 py-2 text-right font-medium">Montant</th>
            <th className="px-3 py-2 text-center font-medium">Statut</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => {
            const reviewCat = reviewCategories.get(tx.tx_hash);
            const isPending = pending.has(tx.tx_hash);
            const isSuggested = suggested.has(tx.tx_hash);
            return (
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
                <td className="px-3 py-2">
                  {tx.isDuplicate ? null : (
                    <span className="inline-flex items-center gap-2">
                      <CategoryPicker
                        categories={categories}
                        current={resolveCurrent(reviewCat?.categoryId ?? null)}
                        onSelect={(id) => {
                          onPickCategory(tx.tx_hash, id);
                        }}
                        onCreate={onCreateCategory}
                      />
                      {isPending ? (
                        <span
                          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground"
                          aria-label="Catégorisation IA en cours"
                        >
                          <Sparkles size={11} strokeWidth={1.6} />
                          IA…
                        </span>
                      ) : isSuggested ? (
                        <span
                          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium"
                          style={{ background: 'hsl(var(--flag-soft))', color: 'hsl(var(--flag))' }}
                          aria-label="Catégorie suggérée par l'IA"
                        >
                          <Sparkles size={11} strokeWidth={1.6} />
                          IA
                        </span>
                      ) : null}
                    </span>
                  )}
                </td>
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
