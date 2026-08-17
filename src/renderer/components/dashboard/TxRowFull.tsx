import { useState } from 'react';
import { Check, Landmark, Pencil, Trash2, Unlink2, X } from 'lucide-react';
import type { CategoryDTO, CreateCategoryInput } from '@shared/types/category';
import { CategoryIconTile } from '@renderer/lib/categoryIcon';
import { formatBalance, parseAmount } from '@renderer/lib/dashboardMap';
import { cn } from '@renderer/lib/utils';
import { Money } from '../ui/money';
import { CategoryPicker } from './CategoryPicker';
import { formatAmount } from '@renderer/lib/euro';
import type { TxRow } from './TxTable';

export interface TxRowFullProps {
  row: TxRow;
  categories: CategoryDTO[];
  onReassign: (transactionId: string, categoryId: string) => void;
  onCreateCategory: (input: CreateCategoryInput) => Promise<CategoryDTO>;
  editing: boolean;
  onStartEdit: (transactionId: string) => void;
  onSaveEdit: (
    transactionId: string,
    fields: { date: string; label: string; amount: number },
  ) => void;
  onCancelEdit: () => void;
  onDelete: (transactionId: string) => void;
  onUnlinkLoan?: (transactionId: string) => void;
}

const INPUT =
  'w-full rounded border border-line-2 bg-ink-2 px-1.5 py-1 font-sans text-[12px] text-paper outline-none focus:border-paper-mute';
const ICON_BTN = 'rounded p-1 text-paper-dim hover:text-paper hover:bg-ink-2';

function TxRowFullEdit({
  row: t,
  onSaveEdit,
  onCancelEdit,
}: {
  row: TxRow;
  onSaveEdit: TxRowFullProps['onSaveEdit'];
  onCancelEdit: () => void;
}) {
  const [date, setDate] = useState(t.editDate);
  const [label, setLabel] = useState(t.editLabel);
  const [amount, setAmount] = useState(formatBalance(t.editAmount));
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const parsedAmount = parseAmount(amount);
    const trimmed = label.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Date invalide');
      return;
    }
    if (parsedAmount === null) {
      setError('Montant invalide');
      return;
    }
    if (trimmed === '') {
      setError('Libellé vide');
      return;
    }
    onSaveEdit(t.id, { date, label: trimmed, amount: parsedAmount });
  };

  return (
    <div className="flex items-start gap-3.5 -mx-3.5 rounded-md border-b border-line-2 bg-ink-2 px-3.5 py-[13px]">
      {/* Date */}
      <span className="w-[58px] shrink-0">
        <input
          aria-label="Date"
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
          }}
          className={cn(INPUT, 'w-full')}
        />
      </span>

      {/* Icon placeholder */}
      <span className="h-10 w-10 shrink-0 rounded-lg bg-ink-3" />

      {/* Label + sub */}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <input
          aria-label="Libellé"
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
          }}
          className={INPUT}
        />
        <input
          aria-label="Montant"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
          }}
          className={cn(INPUT, 'font-mono tabular-nums')}
        />
        {error !== null && <span className="text-[10px] text-flag">{error}</span>}
      </span>

      {/* Actions */}
      <span className="flex shrink-0 gap-0.5">
        <button type="button" aria-label="Enregistrer" className={ICON_BTN} onClick={save}>
          <Check size={14} strokeWidth={2} />
        </button>
        <button
          type="button"
          aria-label="Annuler"
          className={ICON_BTN}
          onClick={() => {
            onCancelEdit();
          }}
        >
          <X size={14} strokeWidth={2} />
        </button>
      </span>
    </div>
  );
}

export function TxRowFull({
  row: t,
  categories,
  onReassign,
  onCreateCategory,
  editing,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onUnlinkLoan,
}: TxRowFullProps) {
  if (editing) {
    return <TxRowFullEdit row={t} onSaveEdit={onSaveEdit} onCancelEdit={onCancelEdit} />;
  }

  return (
    <div className="group flex items-center gap-4 -mx-3.5 rounded-sm border-b border-line-2 px-3.5 py-[13px] hover:bg-surface transition-colors">
      {/* Date */}
      <span className="w-[58px] shrink-0 font-mono tabular-nums text-xs text-paper-mute">
        {t.date}
      </span>

      {/* Category icon */}
      <CategoryIconTile name={t.icon} color={t.catColor} size={40} />

      {/* Middle: label + sub */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-sans text-sm text-paper">{t.main}</span>
          {t.edited && (
            <span
              aria-label={t.originalHint ?? 'Modifié manuellement'}
              title={t.originalHint ?? 'Modifié manuellement'}
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-flag"
            />
          )}
        </span>
        <span className="truncate font-mono text-[11px] text-paper-dim">{t.sub}</span>
      </div>

      {/* Category picker or loan badge */}
      <span className="min-w-0 shrink-0">
        {t.loanSplit ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-line-2 bg-ink-2 px-2 py-0.5 font-sans text-[11px] text-paper-soft">
            <Landmark size={12} strokeWidth={1.8} className="text-brass" />
            Mensualité prêt · int. {formatAmount(t.loanSplit.interest)} · assu.{' '}
            {formatAmount(t.loanSplit.insurance)} · cap. {formatAmount(t.loanSplit.capital)}
            {onUnlinkLoan && (
              <button
                type="button"
                aria-label="Dissocier la mensualité"
                className="text-paper-dim hover:text-paper"
                onClick={() => {
                  onUnlinkLoan(t.id);
                }}
              >
                <Unlink2 size={12} />
              </button>
            )}
          </span>
        ) : (
          <CategoryPicker
            categories={categories}
            current={{ name: t.catName, color: t.catColor }}
            onSelect={(id) => {
              onReassign(t.id, id);
            }}
            onCreate={onCreateCategory}
          />
        )}
      </span>

      {/* Amount */}
      <span className="w-[116px] shrink-0 text-right">
        <Money value={t.amount} kind={t.amountKind} className="text-sm font-medium" />
      </span>

      {/* Hover actions */}
      <span className="flex w-[56px] shrink-0 justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          aria-label="Modifier"
          title="Modifier le libellé"
          className="flex rounded-xs p-1.5 text-paper-mute transition-colors hover:text-paper"
          onClick={() => {
            onStartEdit(t.id);
          }}
        >
          <Pencil size={14} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          aria-label="Supprimer"
          title="Supprimer"
          className="flex rounded-xs p-1.5 text-paper-mute transition-colors hover:text-expense"
          onClick={() => {
            onDelete(t.id);
          }}
        >
          <Trash2 size={14} strokeWidth={1.8} />
        </button>
      </span>
    </div>
  );
}
