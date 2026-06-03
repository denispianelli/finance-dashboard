import { MoreHorizontal } from 'lucide-react';
import type { CategoryDTO, CreateCategoryInput } from '@shared/types/category';
import { cn } from '@renderer/lib/utils';
import { CategoryIcon } from '@renderer/lib/categoryIcon';
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
}

export interface TxTableProps {
  rows: TxRow[];
  /** When all three are provided, the category cell becomes an inline picker. */
  categories?: CategoryDTO[];
  onReassign?: (transactionId: string, categoryId: string) => void;
  onCreateCategory?: (input: CreateCategoryInput) => Promise<CategoryDTO>;
}

const HEAD =
  'font-sans text-[9px] font-semibold uppercase tracking-[0.18em] text-paper-mute pb-2.5 border-b border-line-2';
const CELL = 'py-[11px]';

/** Shared column template. Fixed widths (description is the only flexible 1fr) so each row is
 *  an independent grid that still aligns with the header and the other rows — which lets the
 *  Transactions page virtualize rows as positionable boxes. */
export const TX_GRID =
  'grid items-center gap-x-3 xl:gap-x-3.5 ' +
  'grid-cols-[72px_24px_1fr_160px_96px] ' +
  'xl:grid-cols-[84px_28px_1fr_180px_110px_24px]';

export function TxTableHeader() {
  return (
    <div className={TX_GRID}>
      <span className={HEAD} />
      <span className={HEAD} />
      <span className={HEAD}>Description</span>
      <span className={HEAD}>Catégorie</span>
      <span className={cn(HEAD, 'text-right')}>Montant</span>
      <span className={cn(HEAD, 'hidden xl:block')} />
    </div>
  );
}

export interface TxTableRowProps {
  row: TxRow;
  categories?: CategoryDTO[];
  onReassign?: (transactionId: string, categoryId: string) => void;
  onCreateCategory?: (input: CreateCategoryInput) => Promise<CategoryDTO>;
}

export function TxTableRow({ row: t, categories, onReassign, onCreateCategory }: TxTableRowProps) {
  return (
    <div className={cn(TX_GRID, 'border-b border-line-1 hover:bg-ink-3')}>
      <span className={cn(CELL, 'font-mono text-xs tabular-nums text-paper-mute')}>{t.date}</span>
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
        {categories && onReassign && onCreateCategory ? (
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
      <span className={cn(CELL, 'hidden justify-center text-paper-dim xl:flex')}>
        <MoreHorizontal size={14} strokeWidth={1.6} />
      </span>
    </div>
  );
}

export function TxTable({ rows, categories, onReassign, onCreateCategory }: TxTableProps) {
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
        />
      ))}
    </div>
  );
}
