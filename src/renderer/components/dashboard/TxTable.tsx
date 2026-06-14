import { useState } from 'react';
import { Pencil, Trash2, Check, X, Landmark, Unlink2 } from 'lucide-react';
import type { CategoryDTO, CreateCategoryInput } from '@shared/types/category';
import { cn } from '@renderer/lib/utils';
import { CategoryIcon } from '@renderer/lib/categoryIcon';
import { formatBalance, parseAmount } from '@renderer/lib/dashboardMap';
import { formatAmount } from '@renderer/lib/euro';
import { Money, type MoneyKind } from '../ui/money';
import { CategoryPicker } from './CategoryPicker';

export interface TxRow {
  id: string;
  date: string;
  icon: string;
  main: string;
  sub: string;
  catColor: string;
  catName: string;
  amount: number;
  amountKind: MoneyKind;
  /** True when the row was edited by hand (shows the "modifié" marker). */
  edited: boolean;
  /** Tooltip text with the original extracted figures, or null. */
  originalHint: string | null;
  /** Raw values that seed the inline editor. */
  editDate: string; // ISO yyyy-mm-dd
  editAmount: number;
  editLabel: string;
  /** When set, this row is matched to a loan installment and carries its split. */
  loanSplit: { interestInsurance: number; capital: number } | null;
}

export interface TxTableProps {
  rows: TxRow[];
  /** When all three are provided, the category cell becomes an inline picker. */
  categories?: CategoryDTO[];
  onReassign?: (transactionId: string, categoryId: string) => void;
  onCreateCategory?: (input: CreateCategoryInput) => Promise<CategoryDTO>;
  onStartEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onUnlinkLoan?: (transactionId: string) => void;
}

const HEAD =
  'font-sans text-[9px] font-semibold uppercase tracking-[0.18em] text-paper-mute pb-2.5';
const CELL = 'py-[11px]';

/** Shared column template. Fixed widths (description is the only flexible 1fr) so each row is
 *  an independent grid that still aligns with the header and the other rows — which lets the
 *  Transactions page virtualize rows as positionable boxes. */
export const TX_GRID =
  'grid items-center gap-x-3 xl:gap-x-3.5 ' +
  'grid-cols-[72px_24px_1fr_140px_96px_52px] ' +
  'xl:grid-cols-[84px_28px_1fr_180px_110px_56px]';

export function TxTableHeader() {
  return (
    <div className={cn(TX_GRID, 'border-b border-line-2')}>
      <span className={HEAD}>Date</span>
      <span className={HEAD} />
      <span className={HEAD}>Description</span>
      <span className={HEAD}>Catégorie</span>
      <span className={cn(HEAD, 'text-right')}>Montant</span>
      <span className={HEAD} />
    </div>
  );
}

export interface TxTableRowProps {
  row: TxRow;
  categories?: CategoryDTO[];
  onReassign?: (transactionId: string, categoryId: string) => void;
  onCreateCategory?: (input: CreateCategoryInput) => Promise<CategoryDTO>;
  editing?: boolean;
  onStartEdit?: (transactionId: string) => void;
  onSaveEdit?: (
    transactionId: string,
    fields: { date: string; label: string; amount: number },
  ) => void;
  onCancelEdit?: () => void;
  onDelete?: (transactionId: string) => void;
  onUnlinkLoan?: (transactionId: string) => void;
}

const INPUT =
  'w-full rounded border border-line-2 bg-ink-2 px-1.5 py-1 font-sans text-[12px] text-paper outline-none focus:border-paper-mute';
const ICON_BTN = 'rounded p-1 text-paper-dim hover:text-paper hover:bg-ink-2';

export function TxTableRow({
  row: t,
  categories,
  onReassign,
  onCreateCategory,
  editing = false,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onUnlinkLoan,
}: TxTableRowProps) {
  if (editing) {
    return <TxTableRowEdit row={t} onSaveEdit={onSaveEdit} onCancelEdit={onCancelEdit} />;
  }
  return (
    <div className={cn(TX_GRID, 'group border-b border-line-1 hover:bg-ink-3')}>
      <span
        className={cn(
          CELL,
          'flex items-center gap-1 font-mono text-xs tabular-nums text-paper-mute',
        )}
      >
        {t.date}
        {t.edited && (
          <span
            aria-label={t.originalHint ?? 'Modifié manuellement'}
            title={t.originalHint ?? 'Modifié manuellement'}
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-flag"
          />
        )}
      </span>
      <span className={CELL}>
        <CategoryIcon name={t.icon} />
      </span>
      <span className={cn(CELL, 'flex min-w-0 flex-col gap-0.5')}>
        <span className="truncate font-sans text-[13px] font-medium leading-tight text-paper">
          {t.main}
        </span>
        <span className="truncate font-mono text-[11px] tracking-[0.02em] text-paper-dim">
          {t.sub}
        </span>
      </span>
      <span className={cn(CELL, 'min-w-0')}>
        {t.loanSplit ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-line-2 bg-ink-2 px-2 py-0.5 font-sans text-[11px] text-paper-soft">
            <Landmark size={12} strokeWidth={1.8} className="text-brass" />
            Mensualité prêt · int. {formatAmount(t.loanSplit.interestInsurance)} · cap.{' '}
            {formatAmount(t.loanSplit.capital)}
            <button
              type="button"
              aria-label="Dissocier la mensualité"
              className="text-paper-dim hover:text-paper"
              onClick={() => {
                onUnlinkLoan?.(t.id);
              }}
            >
              <Unlink2 size={12} />
            </button>
          </span>
        ) : categories && onReassign && onCreateCategory ? (
          <CategoryPicker
            categories={categories}
            current={{ name: t.catName, color: t.catColor }}
            onSelect={(id) => {
              onReassign(t.id, id);
            }}
            onCreate={onCreateCategory}
          />
        ) : (
          <span className="inline-flex min-w-0 items-center gap-1.5 font-sans text-[11px] font-medium text-paper-soft">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: t.catColor }}
            />
            <span className="truncate">{t.catName}</span>
          </span>
        )}
      </span>
      <span className={cn(CELL, 'text-right')}>
        <Money value={t.amount} kind={t.amountKind} className="text-[13px] font-medium" />
      </span>
      {onStartEdit && onDelete ? (
        <span className={cn(CELL, 'flex justify-end gap-0.5 opacity-0 group-hover:opacity-100')}>
          <button
            type="button"
            aria-label="Modifier"
            className={ICON_BTN}
            onClick={() => {
              onStartEdit(t.id);
            }}
          >
            <Pencil size={13} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            aria-label="Supprimer"
            className={ICON_BTN}
            onClick={() => {
              onDelete(t.id);
            }}
          >
            <Trash2 size={13} strokeWidth={1.8} />
          </button>
        </span>
      ) : (
        <span className={CELL} />
      )}
    </div>
  );
}

function TxTableRowEdit({
  row: t,
  onSaveEdit,
  onCancelEdit,
}: {
  row: TxRow;
  onSaveEdit?: (id: string, f: { date: string; label: string; amount: number }) => void;
  onCancelEdit?: () => void;
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
    onSaveEdit?.(t.id, { date, label: trimmed, amount: parsedAmount });
  };

  return (
    <div className={cn(TX_GRID, 'border-b border-line-1 bg-ink-2')}>
      <span className={CELL}>
        <input
          aria-label="Date"
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
          }}
          className={INPUT}
        />
      </span>
      <span className={CELL} />
      <span className={cn(CELL, 'min-w-0')}>
        <input
          aria-label="Libellé"
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
          }}
          className={INPUT}
        />
        {error !== null && <span className="mt-0.5 block text-[10px] text-flag">{error}</span>}
      </span>
      <span className={CELL} />
      <span className={CELL}>
        <input
          aria-label="Montant"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
          }}
          className={cn(INPUT, 'text-right font-mono tabular-nums')}
        />
      </span>
      <span className={cn(CELL, 'flex justify-end gap-0.5')}>
        <button type="button" aria-label="Enregistrer" className={ICON_BTN} onClick={save}>
          <Check size={14} strokeWidth={2} />
        </button>
        <button
          type="button"
          aria-label="Annuler"
          className={ICON_BTN}
          onClick={() => onCancelEdit?.()}
        >
          <X size={14} strokeWidth={2} />
        </button>
      </span>
    </div>
  );
}

export function TxTable({
  rows,
  categories,
  onReassign,
  onCreateCategory,
  onStartEdit,
  onDelete,
  onUnlinkLoan,
}: TxTableProps) {
  return (
    <div>
      <TxTableHeader />
      {rows.map((t) => (
        <TxTableRow
          key={t.id}
          row={t}
          categories={categories}
          onReassign={onReassign}
          onCreateCategory={onCreateCategory}
          onStartEdit={onStartEdit}
          onDelete={onDelete}
          onUnlinkLoan={onUnlinkLoan}
        />
      ))}
    </div>
  );
}
